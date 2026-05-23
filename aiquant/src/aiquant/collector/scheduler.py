"""定时任务调度 - 周期性执行股价监控"""
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger
import logging

from ..analyzer.watchlist import WatchlistMonitor
from ..core.market_hours import is_trading_time, format_trading_status, get_next_trading_start
from ..core.logger import setup_logger
from ..core.config import get_monitor_interval
from ..db.database import init_db

logger = logging.getLogger(__name__)


def run_once():
    """
    执行一次监控检查

    自动判断是否在交易时段，休盘时跳过并给出提示。
    """
    status = format_trading_status()

    if not is_trading_time():
        logger.info(f"⏸  休盘中（{status}），跳过本次数据采集")
        return

    logger.info(f"🟢 交易时段中，开始监控检查")

    monitor = WatchlistMonitor()
    result = monitor.check_and_alert()

    # 打印警报信息到控制台
    if result.alerts:
        print("\n" + "=" * 60)
        print(f"📊 监控完成 - {len(result.alerts)} 条买入信号")
        print("=" * 60)
        for alert in result.alerts:
            print(alert.message)
        print("=" * 60 + "\n")
    else:
        print(f"\n📊 监控完成 - 未触发买入信号 ({result.checked_at})\n")


def start_scheduler(interval_minutes: int = 5):
    """
    启动定时调度器，每隔 interval_minutes 分钟执行一次监控

    Args:
        interval_minutes: 执行间隔（分钟）
    """
    # 配置日志
    setup_logger()

    # 初始化数据库
    init_db()

    scheduler = BlockingScheduler()
    trigger = IntervalTrigger(minutes=interval_minutes)

    scheduler.add_job(
        run_once,
        trigger=trigger,
        id="price_monitor",
        name="股价监控任务",
        next_run_time=None,  # 不立即执行，等待下一个间隔
    )

    logger.info(f"调度器已启动，每 {interval_minutes} 分钟执行一次监控")

    # 首次启动时，提示当前交易状态
    status = format_trading_status()
    next_start = get_next_trading_start()
    logger.info(f"当前状态: {status}")
    if not is_trading_time():
        logger.info(f"下一个交易时段预计: {next_start.strftime('%Y-%m-%d %H:%M')}")

    try:
        # 启动后立即执行一次
        logger.info("首次执行...")
        run_once()
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("调度器已手动停止")
    except Exception as e:
        logger.error(f"调度器异常退出: {e}")
