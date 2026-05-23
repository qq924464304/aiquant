"""东方财富行情数据采集 - 通过系统 curl 获取 A 股实时行情"""
import json
import subprocess
import logging
from typing import Optional, Dict, Any

import pandas as pd
import akshare as ak

logger = logging.getLogger(__name__)

# 东方财富行情 API 地址
EASTMONEY_URL = (
    "https://82.push2.eastmoney.com/api/qt/clist/get"
    "?pn=1&pz=5000&po=1&np=1"
    "&ut=bd1d9ddb04089700cf9c27f6f7426281"
    "&fltt=2&invt=2&fid=f12"
    "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
    "&fields=f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18"
)

# 字段映射：AKShare 风格字段名 → 东方财富 API 字段键
_FIELD_MAP = {
    "price": "f2",
    "change_pct": "f3",
    "change": "f4",
    "volume": "f5",
    "amount": "f6",
    "code": "f12",
    "name": "f14",
    "high": "f15",
    "low": "f16",
    "open": "f17",
    "prev_close": "f18",
}


class AKShareClient:
    """A 股实时行情获取器

    注意：macOS 上 Python 的 requests/urllib3 因 LibreSSL 兼容性问题，
    会被东方财富 CDN 断连。因此底层通过 subprocess 调用系统 curl 来获取数据。
    """

    @staticmethod
    def _curl_get(url: str, timeout: int = 15) -> Optional[dict]:
        """通过系统 curl 发起 GET 请求，返回解析后的 JSON dict"""
        try:
            result = subprocess.run(
                ["curl", "-s", "--max-time", str(timeout), url],
                capture_output=True,
                text=True,
                timeout=timeout + 5,
            )
            if result.returncode != 0:
                logger.error(
                    f"curl 请求失败 (exit {result.returncode}): {result.stderr[:200]}")
                return None

            data = json.loads(result.stdout)
            if data.get("rc") != 0:
                logger.error(f"东方财富 API 返回异常: {data}")
                return None
            return data
        except json.JSONDecodeError as e:
            logger.error(f"解析 JSON 失败: {e}")
            return None
        except subprocess.TimeoutExpired:
            logger.error("curl 请求超时")
            return None
        except Exception as e:
            logger.error(f"curl 请求异常: {e}")
            return None

    @staticmethod
    def _raw_stocks() -> Optional[list[dict]]:
        """获取全市场股票原始列表（dict 格式）"""
        data = AKShareClient._curl_get(EASTMONEY_URL)
        if data is None:
            return None
        try:
            return data["data"]["diff"]
        except (KeyError, TypeError) as e:
            logger.error(f"解析股票列表失败: {e}")
            return None

    @staticmethod
    def _filter_stocks(codes: list[str]) -> Optional[list[dict]]:
        """获取指定股票代码的行情数据列表"""
        all_stocks = AKShareClient._raw_stocks()
        if all_stocks is None:
            return None
        code_set = set(codes)
        return [s for s in all_stocks if s.get("f12") in code_set]

    @staticmethod
    def _to_detail(stock: dict) -> Dict[str, Any]:
        """将原始 dict 转为统一的详情格式"""
        return {
            "code": stock.get("f12", ""),
            "name": stock.get("f14", ""),
            "price": float(stock.get("f2", 0)),
            "change_pct": float(stock.get("f3", 0)),
            "change": float(stock.get("f4", 0)),
            "open": float(stock.get("f17", 0)),
            "high": float(stock.get("f15", 0)),
            "low": float(stock.get("f16", 0)),
            "prev_close": float(stock.get("f18", 0)),
            "volume": stock.get("f5", 0),
            "amount": stock.get("f6", 0),
        }

    # ==================== 对外接口 ====================

    @staticmethod
    def get_realtime_price(code: str) -> Optional[float]:
        """
        根据股票代码获取当前最新价

        Args:
            code: 6位数字股票代码，如 "000001"

        Returns:
            最新价，失败返回 None
        """
        filtered = AKShareClient._filter_stocks([code])
        if not filtered:
            logger.warning(f"未找到股票代码 {code}")
            return None
        try:
            return float(filtered[0]["f2"])
        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"解析 {code} 价格失败: {e}")
            return None

    @staticmethod
    def get_realtime_batch(codes: list) -> Dict[str, float]:
        """
        批量获取实时价格

        Args:
            codes: 股票代码列表

        Returns:
            {code: price} 字典
        """
        filtered = AKShareClient._filter_stocks(codes)
        if filtered is None:
            return {}
        return {s["f12"]: float(s["f2"]) for s in filtered if "f12" in s and "f2" in s}

    @staticmethod
    def get_realtime_detail(codes: list) -> Dict[str, Dict[str, Any]]:
        """
        批量获取实时详情（包含名称、价格、涨跌幅等）

        Args:
            codes: 股票代码列表

        Returns:
            {code: {name, price, change_pct, ...}} 字典
        """
        filtered = AKShareClient._filter_stocks(codes)
        if filtered is None:
            return {}
        return {s["f12"]: AKShareClient._to_detail(s) for s in filtered}

    @staticmethod
    def get_history_daily(code: str, days: int = 60) -> Optional[pd.DataFrame]:
        """
        获取历史日线数据（用于后续技术分析）

        Args:
            code: 股票代码
            days: 获取最近多少天的数据

        Returns:
            DataFrame，包含日期、开盘、收盘、最高、最低、成交量等
        """
        try:
            df = ak.stock_zh_a_hist(
                symbol=code,
                period="daily",
                start_date="",
                adjust="qfq",
            )
            if df is None or df.empty:
                logger.warning(f"未获取到 {code} 历史数据")
                return None
            return df.tail(days)
        except Exception as e:
            logger.error(f"获取 {code} 历史数据失败: {e}")
            return None
