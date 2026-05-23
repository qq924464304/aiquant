"""股票池监控分析 - 核心模块：检测股价低于买入点位，触发买入提示"""
import logging
from typing import Optional

from ..collector.akshare_client import AKShareClient
from ..core.config import load_stocks_config
from ..core.models import StockConfig, BuyAlert, MonitorResult
from ..db.database import save_price_record, save_alert_record

logger = logging.getLogger(__name__)


class WatchlistMonitor:
    """
    股票池监控器

    核心功能：
    - 加载配置中的股票列表及买入触发价
    - 定时获取实时价格
    - 检测股价 ≤ 买入触发价 → 生成买入警报
    - 持久化价格和警报记录
    """

    def __init__(
        self,
        stocks: Optional[list[StockConfig]] = None,
        config_path: Optional[str] = None,
    ):
        """
        Args:
            stocks: 直接传入股票配置列表，优先级高于 config_path
            config_path: YAML 配置文件路径
        """
        if stocks is not None:
            self.stocks = stocks
        else:
            self.stocks = load_stocks_config(config_path)

        self.client = AKShareClient()
        logger.info(
            f"监控器已初始化，共 {len(self.stocks)} 只股票待监控"
        )

    def check_and_alert(self) -> MonitorResult:
        """
        执行一次完整监控检查

        流程：
        1. 批量获取所有监控股票的实时价格
        2. 逐一对比当前价 vs 触发价
        3. 价格 ≤ 触发价 → 生成 BuyAlert
        4. 保存价格记录和警报记录到数据库

        Returns:
            MonitorResult 包含所有警报和错误信息
        """
        result = MonitorResult(total_stocks=len(self.stocks))
        codes = [s.code for s in self.stocks]

        logger.info(f"开始监控检查，共 {len(codes)} 只股票")

        # Step 1: 批量获取实时行情详情（包含名称）
        details = self.client.get_realtime_detail(codes)

        # Step 2: 逐一分析
        for stock in self.stocks:
            code = stock.code
            detail = details.get(code)

            if detail is None:
                err_msg = f"未获取到 {stock.name}({code}) 的行情数据"
                logger.warning(err_msg)
                result.errors.append(err_msg)
                continue

            current_price = detail["price"]
            stock_name = detail.get("name") or stock.name

            # Step 2a: 保存价格记录
            try:
                save_price_record(code, stock_name, current_price)
            except Exception as e:
                logger.error(f"保存价格记录失败 {code}: {e}")

            # Step 2b: 判断是否触发买入信号
            if current_price <= stock.buy_below:
                alert = BuyAlert(
                    code=code,
                    name=stock_name,
                    current_price=current_price,
                    trigger_price=stock.buy_below,
                )
                result.alerts.append(alert)
                logger.info(alert.message)

                # Step 2c: 保存警报记录
                try:
                    save_alert_record(
                        code=code,
                        name=stock_name,
                        current_price=current_price,
                        trigger_price=stock.buy_below,
                        message=alert.message,
                    )
                except Exception as e:
                    logger.error(f"保存警报记录失败 {code}: {e}")
            else:
                logger.info(
                    f"{stock_name}({code}) 现价 {current_price:.2f} > "
                    f"触发价 {stock.buy_below:.2f}，暂不触发"
                )

        # Step 3: 汇总结果
        if result.alerts:
            logger.info(
                f"本次检查完成，触发 {len(result.alerts)} 条买入信号"
            )
        else:
            logger.info("本次检查完成，无买入信号")

        return result
