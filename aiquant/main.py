"""
aiquant - AI 量化股票分析系统

数据采集和分析核心入口
"""

import sys
from pathlib import Path

# 确保 src 目录在导入路径中
SRC_DIR = Path(__file__).parent / "src"
sys.path.insert(0, str(SRC_DIR))


def main():
    """主入口：启动股价监控调度器"""
    from aiquant.collector.scheduler import start_scheduler
    from aiquant.core.logger import setup_logger

    logger = setup_logger("aiquant")

    print("=" * 60)
    print("  aiquant - AI 量化股票分析系统")
    print("=" * 60)

    try:
        start_scheduler(interval_minutes=5)
    except KeyboardInterrupt:
        logger.info("用户中断，系统退出")
    except Exception as e:
        logger.error(f"系统异常: {e}", exc_info=True)
        sys.exit(1)


def run_once():
    """手动执行一次监控（用于测试）"""
    from aiquant.analyzer.watchlist import WatchlistMonitor
    from aiquant.core.logger import setup_logger
    from aiquant.db.database import init_db

    logger = setup_logger("aiquant")

    print("=" * 60)
    print("  aiquant - 执行一次监控检查")
    print("=" * 60)

    init_db()
    monitor = WatchlistMonitor()
    result = monitor.check_and_alert()

    if result.alerts:
        print(f"\n✅ 发现 {len(result.alerts)} 条买入信号：")
        for alert in result.alerts:
            print(f"   {alert.message}")
    else:
        print("\nℹ️  当前无买入信号")

    if result.errors:
        print(f"\n⚠️  有 {len(result.errors)} 个错误：")
        for err in result.errors:
            print(f"   {err}")


if __name__ == "__main__":
    # python main.py         → 启动定时调度器
    # python main.py --once  → 执行一次后退出
    if "--once" in sys.argv:
        run_once()
    else:
        main()
