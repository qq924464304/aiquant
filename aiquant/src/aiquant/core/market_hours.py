"""A股交易时间判断 - 休盘期间跳过数据采集"""
from datetime import datetime, time, date
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# A股标准交易时段
MORNING_START = time(9, 30)   # 9:30 开盘
MORNING_END = time(11, 30)    # 11:30 上午收盘
AFTERNOON_START = time(13, 0)  # 13:00 下午开盘
AFTERNOON_END = time(15, 0)   # 15:00 收盘

# 法定节假日（每年需更新） — 2025/2026 主要节假日
# 也可通过 ak.tool_trade_date_hist_sina() 动态获取，但依赖网络
HOLIDAYS: set[str] = {
    # 2025年
    "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31",
    "2025-02-03", "2025-02-04", "2025-04-04", "2025-04-07",
    "2025-05-01", "2025-05-02", "2025-05-05",
    "2025-05-31", "2025-06-02",
    "2025-10-01", "2025-10-02", "2025-10-03", "2025-10-06", "2025-10-07", "2025-10-08",
    # 2026年
    "2026-01-01",
    "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
    "2026-04-06",
    "2026-05-01",
    "2026-06-22",
    "2026-09-28", "2026-09-29", "2026-09-30",
    "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08",
}


def is_today_holiday(check_date: Optional[date] = None) -> bool:
    """判断指定日期是否为法定节假日"""
    d = check_date or date.today()
    return d.isoformat() in HOLIDAYS


def is_weekend(check_date: Optional[date] = None) -> bool:
    """判断是否为周末"""
    d = check_date or date.today()
    return d.weekday() >= 5  # 5=周六, 6=周日


def is_trading_day(check_date: Optional[date] = None) -> bool:
    """判断是否为交易日（非周末、非节假日）"""
    if is_weekend(check_date):
        return False
    if is_today_holiday(check_date):
        return False
    return True


def is_trading_time(now: Optional[datetime] = None) -> bool:
    """
    判断当前时间是否在交易时段内

    A股交易时段：
      上午 09:30 - 11:30
      下午 13:00 - 15:00
    """
    now = now or datetime.now()
    current_time = now.time()

    # 先判断是否为交易日
    if not is_trading_day(now.date()):
        return False

    # 判断是否在交易时段
    in_morning = MORNING_START <= current_time <= MORNING_END
    in_afternoon = AFTERNOON_START <= current_time <= AFTERNOON_END

    return in_morning or in_afternoon


def get_next_trading_start(from_time: Optional[datetime] = None) -> datetime:
    """
    计算下一个交易时段开始时间

    如果当前在交易时段内，返回当前时间。
    如果当前在休盘时段，返回下一个交易时段的开盘时间。

    Returns:
        datetime 对象
    """
    now = from_time or datetime.now()
    current_time = now.time()

    # 如果在交易时段中，直接返回当前时间
    if is_trading_time(now):
        return now

    candidates = []

    # 今天下午还没到 → 下午开盘
    if current_time < AFTERNOON_END and is_trading_day(now.date()):
        if current_time < MORNING_START:
            candidates.append(now.replace(
                hour=9, minute=30, second=0, microsecond=0))
        elif MORNING_END < current_time < AFTERNOON_START:
            candidates.append(now.replace(
                hour=13, minute=0, second=0, microsecond=0))

    # 明天或下一个交易日
    next_day = now.date()
    for _ in range(7):  # 最多找7天
        next_day = date.fromordinal(next_day.toordinal() + 1)
        if is_trading_day(next_day):
            candidates.append(datetime.combine(next_day, MORNING_START))
            break

    return min(candidates) if candidates else now


def format_trading_status(now: Optional[datetime] = None) -> str:
    """返回可读的交易状态描述"""
    now = now or datetime.now()
    if is_trading_time(now):
        return "交易时段中"
    if is_weekend(now):
        return "周末休市"
    if is_today_holiday(now):
        return f"节假日休市 ({now.date().isoformat()})"
    return "非交易时段（午休/盘前/盘后）"
