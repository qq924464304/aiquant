"""监控股票池，判断是否触发买入信号"""
import yaml
from pathlib import Path
from typing import List, Dict, Any
from ..collector.akshare_client import AKShareClient
import logging

logger = logging.getLogger(__name__)


class WatchlistMonitor:
    def __init__(self, config_path: str = "configs/stocks.yaml"):
        self.config_path = Path(config_path)
        self.stocks = self._load_config()
        self.client = AKShareClient()

    def _load_config(self) -> List[Dict]:
        with open(self.config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data.get("stocks", [])

    def check_and_alert(self):
        """检查所有股票，输出买入提示"""
        codes = [s["code"] for s in self.stocks]
        prices = self.client.get_realtime_batch(codes)

        alerts = []
        for stock in self.stocks:
            code = stock["code"]
            name = stock["name"]
            buy_below = stock["buy_below"]
            current_price = prices.get(code)

            if current_price is None:
                logger.warning(f"未获取到 {code} {name} 的价格")
                continue

            if current_price <= buy_below:
                msg = (f"🔔 买入信号：{name}({code}) 现价 {current_price:.2f} "
                       f"≤ 触发价 {buy_below:.2f}，建议买入")
                alerts.append(msg)
                logger.info(msg)
            else:
                logger.debug(
                    f"{name}({code}) 现价 {current_price:.2f} > {buy_below:.2f}，无信号")

        # 可扩展：将 alerts 写入 Redis/数据库，或通过 WebSocket 推送给 Node.js
        return alerts
