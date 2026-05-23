"""
ETF指数数据导入脚本（从 akshare 获取指数基本信息）
数据源: akshare.index_stock_info

用法:
    uv run python scripts/import_etf.py                              # 导入全部指数
    uv run python scripts/import_etf.py --code 000001                 # 只导入上证指数
"""
from aiquant.db.database import init_db, SessionLocal, EtfIndex
import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))


def get_publisher(code: str) -> str:
    """根据指数代码判断发布机构"""
    if code.startswith("000") or code.startswith("001"):
        return "上海证券交易所"
    elif code.startswith("399") or code.startswith("159"):
        return "深圳证券交易所"
    elif code.startswith(("930", "931", "932", "933", "950", "951", "952")):
        return "中证指数有限公司"
    return ""


def import_etf(target_code: str = None) -> int:
    """导入ETF指数数据"""
    print("📥 正在从 akshare 获取指数基本信息...")

    import akshare as ak
    import pandas as pd

    df = ak.index_stock_info()
    if target_code:
        df = df[df["index_code"] == target_code]
        if df.empty:
            print(f"⚠️ 未找到指数代码: {target_code}")
            return 0

    # 尝试获取更详细的 CSI 指数中文全称
    full_name_map = {}
    try:
        import baostock as bs
        bs.login()
        # 从 B站获取一些指数历史数据来推断全称，跳过直接使用 ak 数据
        bs.logout()
    except:
        pass

    count = 0
    session = SessionLocal()
    try:
        for _, row in df.iterrows():
            code = row["index_code"]
            display_name = row["display_name"]
            pub_date = row["publish_date"]

            # 检查是否已存在
            existing = session.query(EtfIndex).filter(
                EtfIndex.ts_code == code
            ).first()
            if existing:
                continue

            record = EtfIndex(
                ts_code=code,
                indx_name=display_name,       # 先用简称作为全称占位
                indx_csname=display_name,      # 简称
                pub_party_name=get_publisher(code),
                pub_date=pub_date,
                base_date=None,                # 可通过后续补充
                bp=None,                       # 可通过后续补充
                adj_circle=None,               # 可通过后续补充
            )
            session.add(record)
            count += 1
            print(f"  ✅ [{code}] {display_name}")

        session.commit()
    except Exception as e:
        session.rollback()
        print(f"❌ 导入失败: {e}")
        raise
    finally:
        session.close()

    return count


def main():
    parser = argparse.ArgumentParser(description="导入ETF指数数据")
    parser.add_argument("--code", type=str, default=None,
                        help="指定指数代码，不指定则导入全部")
    args = parser.parse_args()

    init_db()
    count = import_etf(target_code=args.code)
    print(f"\n🎉 导入完成，共导入 {count} 条指数记录")


if __name__ == "__main__":
    main()
