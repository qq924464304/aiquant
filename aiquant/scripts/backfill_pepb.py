"""
反填已有 PriceRecord 的 PE/PB 数据
从 BaoStock 按日期范围查询，逐只股票补齐 pe_ttm 和 pb_mrq

用法:
    uv run python scripts/backfill_pepb.py                    # 反填所有股票
    uv run python scripts/backfill_pepb.py --code 600036       # 只反填招商银行
"""
from aiquant.db.database import init_db, SessionLocal, PriceRecord
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


def backfill_pepb(code: str) -> int:
    print(f"📥 反填 {code} PE/PB...")
    import baostock as bs
    bs.login()

    count = 0
    session = SessionLocal()
    try:
        # 查询缺失 PE/PB 的记录日期范围
        missing = session.query(PriceRecord).filter(
            PriceRecord.code == code,
            PriceRecord.pe_ttm.is_(None),
        ).order_by(PriceRecord.recorded_at).all()

        if not missing:
            print(f"  ✅ {code} 所有记录已有 PE/PB")
            return 0

        start = missing[0].recorded_at.strftime("%Y-%m-%d")
        end = missing[-1].recorded_at.strftime("%Y-%m-%d")
        print(f"  🔍 需反填 {len(missing)} 条 ({start} ~ {end})")

        bs_code = f"sz.{code}" if not code.startswith("6") else f"sh.{code}"
        rs = bs.query_history_k_data_plus(
            bs_code,
            "date,close,peTTM,pbMRQ",
            start_date=start,
            end_date=end,
            frequency="d",
            adjustflag="2",
        )
        if rs.error_code != "0":
            print(f"  ❌ 查询失败: {rs.error_msg}")
            return 0

        # 构建 {date: (pe, pb)} 映射
        pepb_map = {}
        while rs.next():
            row = rs.get_row_data()
            if row[0] and row[2] and row[2] != "":
                pepb_map[row[0]] = (
                    float(row[2]) if row[2] else None,
                    float(row[3]) if row[3] and row[3] != "" else None,
                )

        # 更新数据库
        updated = 0
        for rec in missing:
            date_str = rec.recorded_at.strftime("%Y-%m-%d")
            if date_str in pepb_map:
                pe, pb = pepb_map[date_str]
                rec.pe_ttm = pe
                rec.pb_mrq = pb
                updated += 1

        session.commit()
        print(f"  ✅ {code} 更新 {updated}/{len(missing)} 条")
        count = updated

    except Exception as e:
        session.rollback()
        print(f"  ❌ {code} 反填失败: {e}")
        raise
    finally:
        session.close()
        bs.logout()

    return count


def main():
    import argparse
    parser = argparse.ArgumentParser(description="反填 PE/PB 数据")
    parser.add_argument("--code", help="股票代码")
    args = parser.parse_args()

    init_db()

    if args.code:
        backfill_pepb(args.code)
    else:
        session = SessionLocal()
        codes = session.query(PriceRecord.code).distinct().all()
        session.close()
        total = 0
        for (code,) in codes:
            total += backfill_pepb(code)
        print(f"\n📊 共更新 {total} 条 PE/PB 数据")


if __name__ == "__main__":
    main()
