"""
历史日K线数据导入脚本
数据源:
  1. baostock (证券宝) — 免费、无注册、无限流
  2. 东方财富(akshare) — 备用

用法:
    uv run python scripts/import_history.py                                               # 导入 stocks.yaml 中所有股票
    uv run python scripts/import_history.py --code 000001 --name 平安银行               # 只导入平安银行
    uv run python scripts/import_history.py --code 000001 --start-date 2016-01-01       # 指定起始日期
"""
from aiquant.db.database import init_db, SessionLocal, PriceRecord
from aiquant.core.config import load_stocks_config
import sys
import argparse
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


def import_stock_history(code: str, name: str, start_date: str = None, end_date: str = None) -> int:
    """导入单只股票的历史日线数据（baostock 数据源）"""
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=5 * 366)
                      ).strftime("%Y-%m-%d")

    print(f"📥 正在获取 {name}({code})  {start_date} → {end_date}")

    # baostock 代码格式: sz.000001 / sh.600519
    bs_code = f"sz.{code}" if not code.startswith("6") else f"sh.{code}"

    import baostock as bs
    bs.login()

    try:
        rs = bs.query_history_k_data_plus(
            bs_code,
            "date,close,peTTM,pbMRQ",
            start_date=start_date,
            end_date=end_date,
            frequency="d",
            adjustflag="2",  # 前复权
        )
        if rs.error_code != "0":
            print(f"  ❌ baostock 查询失败: {rs.error_msg}")
            return 0

        # 收集数据
        records = []
        while rs.next():
            row = rs.get_row_data()
            if row[1] and row[1] != "":  # 有收盘价
                close_price = round(float(row[1]), 2)
                pe = float(row[2]) if row[2] and row[2] != "" else None
                pb = float(row[3]) if row[3] and row[3] != "" else None
                records.append((row[0], close_price, pe, pb))

        print(f"  📊 API 返回 {len(records)} 条记录")

        # 去重写入数据库
        count = 0
        session = SessionLocal()
        try:
            for trade_date_str, close_price, pe, pb in records:
                trade_date = datetime.strptime(trade_date_str, "%Y-%m-%d")

                existing = session.query(PriceRecord).filter(
                    PriceRecord.code == code,
                    PriceRecord.recorded_at == trade_date,
                ).first()
                if existing:
                    # 已有记录但缺少 PE/PB 时更新
                    if existing.pe_ttm is None and pe is not None:
                        existing.pe_ttm = pe
                    if existing.pb_mrq is None and pb is not None:
                        existing.pb_mrq = pb
                    continue

                session.add(PriceRecord(
                    code=code, name=name,
                    price=close_price, recorded_at=trade_date,
                    pe_ttm=pe, pb_mrq=pb,
                ))
                count += 1

            session.commit()
            print(f"  ✅ 新增 {count} 条记录")
        except Exception as e:
            session.rollback()
            print(f"  ❌ 写入失败: {e}")
            raise
        finally:
            session.close()

        return count

    finally:
        bs.logout()


def main():
    parser = argparse.ArgumentParser(description="导入历史日K线数据(baostock)")
    parser.add_argument("--code", help="股票代码，如 000001")
    parser.add_argument("--name", help="股票名称")
    parser.add_argument("--start-date", help="起始日期，如 2016-01-01（默认5年前）")
    parser.add_argument("--end-date", help="结束日期，如 2026-05-23（默认今天）")
    args = parser.parse_args()

    init_db()

    if args.code:
        name = args.name or args.code
        import_stock_history(args.code, name, args.start_date, args.end_date)
    else:
        stocks = load_stocks_config()
        if not stocks:
            print("❌ 未找到股票配置")
            return
        total = 0
        for s in stocks:
            total += import_stock_history(s.code,
                                          s.name, args.start_date, args.end_date)
        print(f"\n📊 共导入 {total} 条历史记录")


if __name__ == "__main__":
    main()
