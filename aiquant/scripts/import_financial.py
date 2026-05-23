"""
财务数据导入脚本（利润表 + 成长能力）
数据源: baostock (证券宝)

用法:
    uv run python scripts/import_financial.py                          # 导入全部股票
    uv run python scripts/import_financial.py --code 600036             # 只导入招商银行
    uv run python scripts/import_financial.py --code 600036 --years 3   # 近3年
"""
from aiquant.db.database import init_db, SessionLocal, FinancialRecord
import sys
import argparse
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


def import_financial(code: str, years: int = 5) -> int:
    """导入单只股票的财务数据"""
    print(f"📥 正在获取 {code} 近{years}年财务数据...")

    import baostock as bs
    bs.login()

    count = 0
    session = SessionLocal()
    try:
        current_year = datetime.now().year
        bs_code = f"sz.{code}" if not code.startswith("6") else f"sh.{code}"

        for yr in range(current_year - years + 1, current_year + 1):
            for q in [1, 2, 3, 4]:
                # 检查是否已存在
                existing = session.query(FinancialRecord).filter(
                    FinancialRecord.code == code,
                    FinancialRecord.year == yr,
                    FinancialRecord.quarter == q,
                ).first()
                if existing:
                    # 已有记录，补充缺失字段
                    need_update = False
                    if existing.current_ratio is None:
                        need_update = True
                    if need_update:
                        pass  # 下面统一处理
                    else:
                        continue

                # 拉取利润表
                rs1 = bs.query_profit_data(bs_code, year=yr, quarter=q)
                profit_row = None
                if rs1.error_code == "0" and rs1.next():
                    profit_row = rs1.get_row_data()

                # 拉取成长能力
                rs2 = bs.query_growth_data(bs_code, year=yr, quarter=q)
                growth_row = None
                if rs2.error_code == "0" and rs2.next():
                    growth_row = rs2.get_row_data()

                if not profit_row and not growth_row:
                    continue

                # 构建记录（字段索引从 .fields 确认）
                record = FinancialRecord(code=code, year=yr, quarter=q)

                if profit_row:
                    # fields: code,pubDate,statDate,roeAvg,npMargin,gpMargin,netProfit,epsTTM,MBRevenue,totalShare,liqaShare
                    if profit_row[3]:
                        record.roe_avg = round(float(profit_row[3]), 6)
                    if profit_row[4]:
                        record.np_margin = round(float(profit_row[4]), 6)
                    if profit_row[5]:
                        record.gp_margin = round(float(profit_row[5]), 6)
                    if profit_row[6]:
                        record.net_profit = round(float(profit_row[6]), 2)
                    if profit_row[7]:
                        record.eps_ttm = round(float(profit_row[7]), 4)
                    if profit_row[8]:
                        record.mb_revenue = round(float(profit_row[8]), 2)

                if growth_row:
                    # fields: code,pubDate,statDate,YOYEquity,YOYAsset,YOYNI,YOYEPSBasic,YOYPNI
                    if growth_row[3]:
                        record.yoy_equity = round(float(growth_row[3]), 6)
                    if growth_row[4]:
                        record.yoy_asset = round(float(growth_row[4]), 6)
                    if growth_row[5]:
                        record.yoy_ni = round(float(growth_row[5]), 6)
                    if growth_row[6]:
                        record.yoy_eps_basic = round(float(growth_row[6]), 6)
                    if growth_row[7]:
                        record.yoy_pni = round(float(growth_row[7]), 6)

                # 拉取资产负债表
                rs3 = bs.query_balance_data(bs_code, year=yr, quarter=q)
                if rs3.error_code == "0" and rs3.next():
                    bal_row = rs3.get_row_data()
                    if bal_row[3]:
                        record.current_ratio = round(float(bal_row[3]), 4)
                    if bal_row[4]:
                        record.quick_ratio = round(float(bal_row[4]), 4)
                    if bal_row[5]:
                        record.cash_ratio = round(float(bal_row[5]), 4)
                    if bal_row[8]:
                        record.asset_to_equity = round(float(bal_row[8]), 4)

                # 拉取现金流量表
                rs4 = bs.query_cash_flow_data(bs_code, year=yr, quarter=q)
                if rs4.error_code == "0" and rs4.next():
                    cf_row = rs4.get_row_data()
                    if cf_row[7]:
                        record.cfo_to_or = round(float(cf_row[7]), 4)
                    if cf_row[8]:
                        record.cfo_to_np = round(float(cf_row[8]), 4)
                    if cf_row[6]:
                        record.ebit_to_interest = round(float(cf_row[6]), 4)

                if existing:
                    # 更新已有记录
                    for col in ["roe_avg", "np_margin", "gp_margin", "net_profit",
                                "eps_ttm", "mb_revenue", "yoy_equity", "yoy_asset",
                                "yoy_ni", "yoy_eps_basic", "yoy_pni",
                                "current_ratio", "quick_ratio", "cash_ratio",
                                "asset_to_equity", "cfo_to_or", "cfo_to_np",
                                "ebit_to_interest"]:
                        new_val = getattr(record, col, None)
                        if new_val is not None:
                            setattr(existing, col, new_val)
                    session.add(existing)
                    count += 1
                    print(f"  🔄 {code} {yr}年 Q{q} (更新)")
                else:
                    session.add(record)
                    count += 1
                    print(f"  ✅ {code} {yr}年 Q{q}")

        session.commit()
        print(f"  ✅ {code} 共新增 {count} 条财务记录")

    except Exception as e:
        session.rollback()
        print(f"  ❌ {code} 导入失败: {e}")
        raise
    finally:
        session.close()
        bs.logout()

    return count


def main():
    parser = argparse.ArgumentParser(description="导入财务数据(baostock)")
    parser.add_argument("--code", help="股票代码，如 000001")
    parser.add_argument("--years", type=int, default=5, help="获取多少年数据")
    args = parser.parse_args()

    init_db()

    if args.code:
        import_financial(args.code, args.years)
    else:
        from aiquant.db.database import PriceRecord
        session = SessionLocal()
        codes = session.query(PriceRecord.code).distinct().all()
        session.close()
        total = 0
        for (code,) in codes:
            total += import_financial(code, args.years)
        print(f"\n📊 共导入 {total} 条财务记录")


if __name__ == "__main__":
    main()
