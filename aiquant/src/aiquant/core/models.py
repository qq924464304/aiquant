"""数据模型定义"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class StockConfig(BaseModel):
    """股票监控配置"""
    code: str = Field(..., description="股票代码，如 000001")
    name: str = Field(..., description="股票名称")
    buy_below: float = Field(..., description="买入触发价，低于此价提示买入")


class PriceTick(BaseModel):
    """单次价格快照"""
    code: str
    name: str
    price: float
    timestamp: datetime = Field(default_factory=datetime.now)


class BuyAlert(BaseModel):
    """买入警报"""
    code: str
    name: str
    current_price: float
    trigger_price: float
    timestamp: datetime = Field(default_factory=datetime.now)
    message: str = ""

    def __init__(self, **data):
        super().__init__(**data)
        if not self.message:
            self.message = (
                f"🔔 买入信号：{self.name}({self.code}) "
                f"现价 {self.current_price:.2f} ≤ 触发价 {self.trigger_price:.2f}，建议买入"
            )


class MonitorResult(BaseModel):
    """监控结果"""
    checked_at: datetime = Field(default_factory=datetime.now)
    total_stocks: int = 0
    alerts: list[BuyAlert] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
