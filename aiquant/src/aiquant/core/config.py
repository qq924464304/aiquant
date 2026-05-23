"""配置加载"""
import os
import yaml
from pathlib import Path
from typing import Optional
from .models import StockConfig


# 项目根目录
ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent

# 默认配置文件路径
DEFAULT_STOCKS_CONFIG = ROOT_DIR / "configs" / "stocks.yaml"
DEFAULT_APP_CONFIG = ROOT_DIR / "configs" / "development.yaml"


def load_stocks_config(path: Optional[str] = None) -> list[StockConfig]:
    """
    加载股票监控配置

    Args:
        path: YAML 配置文件路径，默认使用 configs/stocks.yaml

    Returns:
        StockConfig 列表
    """
    config_path = Path(path) if path else DEFAULT_STOCKS_CONFIG

    if not config_path.exists():
        raise FileNotFoundError(f"股票配置文件不存在: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    stocks = data.get("stocks", [])
    return [StockConfig(**s) for s in stocks]


def load_app_config(path: Optional[str] = None) -> dict:
    """
    加载应用配置

    Args:
        path: YAML 配置文件路径，默认使用 configs/development.yaml
    """
    config_path = Path(path) if path else DEFAULT_APP_CONFIG

    if not config_path.exists():
        return {}

    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get_monitor_interval() -> int:
    """获取监控间隔（分钟）"""
    app_config = load_app_config()
    return app_config.get("monitor", {}).get("interval_minutes", 5)
