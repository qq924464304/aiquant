"""定时任务调度"""
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger
from ..analyzer.watchlist import WatchlistMonitor
import logging

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def job():
    logger.info("开始执行监控任务")
    monitor = WatchlistMonitor()
    alerts = monitor.check_and_alert()
    if alerts:
        # 这里可以扩展发送通知（钉钉/企业微信/Server酱）
        for alert in alerts:
            print(alert)  # 临时打印
    logger.info("监控任务结束")


def start_scheduler(interval_minutes: int = 5):
    """启动调度器，每 interval_minutes 分钟执行一次"""
    scheduler = BlockingScheduler()
    trigger = IntervalTrigger(minutes=interval_minutes)
    scheduler.add_job(job, trigger=trigger, id="price_monitor")
    logger.info(f"调度器已启动，每 {interval_minutes} 分钟检查一次")
    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("调度器已停止")


if __name__ == "__main__":
    # 可单独测试：立即执行一次
    # job()
    start_scheduler(interval_minutes=5)
