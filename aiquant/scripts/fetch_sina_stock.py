"""
新浪股票实时数据爬取脚本

爬取来源：
  - 新浪财经页面: https://finance.sina.com.cn/realstock/company/{code}/nc.shtml
  - 新浪实时行情API: https://hq.sinajs.cn/list={code}

用法:
  python scripts/fetch_sina_stock.py sz000001
  python scripts/fetch_sina_stock.py sh600036
"""

import re
import sys
import httpx
from datetime import datetime

# 围圈数字 ①~⑤ = U+2460~U+2464


def circled(n): return chr(9311 + n)


# ─── 常量 ───────────────────────────────────────────────────────
HQ_API = "https://hq.sinajs.cn/list={code}"
PAGE_URL = "https://finance.sina.com.cn/realstock/company/{code}/nc.shtml"

# 股票代码段 → 市场名称
MARKET_MAP = {
    "sh": "沪市",
    "sz": "深市",
    "bj": "北交所",
}

# ─── 实时行情API ────────────────────────────────────────────────
# 返回格式: var hq_str_sz000001="name,open,preClose,price,high,low,bid,ask,
#            volume(股),amount, bid1_vol,bid1_price,...ask5_vol,ask5_price,
#            date,time,status"
# 字段索引映射 (0-based):
SINA_INDEX = {
    "name": 0,
    "open": 1,
    "preClose": 2,
    "price": 3,
    "high": 4,
    "low": 5,
    "bid": 6,
    "ask": 7,
    "volume": 8,  # 股数，需 /100 转手
    "amount": 9,   # 元
    "date": 30,
    "time": 31,
}


def parse_hq_api(text: str) -> dict:
    """解析新浪实时行情API返回的JS数据"""
    match = re.search(r'"(.*)"', text)
    if not match:
        return {}
    parts = match.group(1).split(",")
    if len(parts) < 33:
        return {}

    data = {}
    for key, idx in SINA_INDEX.items():
        data[key] = parts[idx]

    # 提取买卖五档
    # 原始格式: [bid1_vol, bid1_price, bid2_vol, bid2_price, ...] (从 idx 10 开始)
    #            [ask1_vol, ask1_price, ask2_vol, ask2_price, ...] (从 idx 20 开始)
    bids = []
    asks = []
    for i in range(5):
        bv = parts[10 + i * 2]   # 买(i+1)量(手)
        bp = parts[11 + i * 2]   # 买(i+1)价
        if bp:
            bids.append((float(bp), int(bv)))
        av = parts[20 + i * 2]   # 卖(i+1)量(手)
        ap = parts[21 + i * 2]   # 卖(i+1)价
        if ap:
            asks.append((float(ap), int(av)))

    data["bids"] = bids
    data["asks"] = asks

    # 计算涨跌额、涨跌幅
    price = float(data["price"])
    pre_close = float(data["preClose"])
    data["change"] = round(price - pre_close, 2)
    data["change_pct"] = round((price - pre_close) / pre_close * 100, 2)

    # 成交量转为手 (1手=100股)
    data["volume"] = int(int(parts[8]) / 100)
    data["amount"] = float(parts[9])
    for k in ("open", "high", "low", "preClose", "price", "bid", "ask"):
        data[k] = float(data[k])

    return data


# ─── 页面解析 ───────────────────────────────────────────────────
def parse_stock_page(html: str, code: str) -> dict:
    """解析新浪股票页面，提取页面中的额外信息"""
    info = {}

    # 提取标题中的股票名称
    title_m = re.search(r"<title>(.+?)\((\d+).*?\).*?</title>", html)
    if title_m:
        info["stock_name"] = title_m.group(1).strip()
        info["stock_code"] = title_m.group(2)

    # 提取市盈率 PE ── 页面中有 @pe@ 占位符，但也可能有内嵌数值
    pe_m = re.search(r"@pe@", html)
    if not pe_m:
        pe_v = re.search(r"市盈率[：:]\s*([\d.]+)", html)
        if pe_v:
            info["pe"] = float(pe_v.group(1))

    pb_m = re.search(r"@pb@", html)
    if not pb_m:
        pb_v = re.search(r"市净率[：:]\s*([\d.]+)", html)
        if pb_v:
            info["pb"] = float(pb_v.group(1))

    return info


# ─── 格式输出 ─── 涨跌颜色 ──────────────────────────────────────
def color(value: float) -> str:
    """涨→红, 跌→绿"""
    if value > 0:
        return "\033[91m"  # 红
    elif value < 0:
        return "\033[92m"  # 绿
    return "\033[0m"


def reset() -> str:
    return "\033[0m"


def fmt_yuan(v: float) -> str:
    return f"{v:>8.2f}"


def fmt_wan(v: float) -> str:
    """将大额数值转为万/亿显示"""
    if v >= 1e8:
        return f"{v / 1e8:.2f}亿"
    elif v >= 1e4:
        return f"{v / 1e4:.2f}万"
    return f"{v:.0f}"


def fmt_volume(v: float) -> str:
    """成交量（手）转为万手"""
    if v >= 1e4:
        return f"{v / 1e4:.2f}万手"
    return f"{v:.0f}手"


def fmt_time(ts: str) -> str:
    """格式化时间"""
    return ts.strip()


# ─── 主流程 ─────────────────────────────────────────────────────
def fetch_stock(code: str):
    market = code[:2]
    market_name = MARKET_MAP.get(market, market.upper())
    page_url = PAGE_URL.format(code=code)
    api_url = HQ_API.format(code=code)
    stock_symbol = code

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Referer": "https://finance.sina.com.cn",
    }

    with httpx.Client(timeout=15, headers=headers) as client:
        # 1. 获取实时行情 API
        try:
            resp = client.get(api_url)
            resp.encoding = "gbk"
            if "Forbidden" in resp.text or not resp.text:
                print(f"⚠️  API 返回 Forbidden，尝试添加 Referer…")
                resp = client.get(
                    api_url,
                    headers={"Referer": "https://finance.sina.com.cn"},
                )
                resp.encoding = "gbk"
            hq_data = parse_hq_api(resp.text)
        except Exception as e:
            print(f"⚠️  实时行情API请求失败: {e}")
            hq_data = {}

        # 2. 获取页面 HTML
        page_info = {}
        try:
            resp2 = client.get(page_url)
            resp2.encoding = "gbk"
            page_info = parse_stock_page(resp2.text, code)
        except Exception as e:
            print(f"⚠️  页面请求失败: {e}")

    # ─── 合并数据 ────────────────────────────────────────────
    name = page_info.get("stock_name") or hq_data.get("name", "--")
    code_num = code[2:] if len(code) > 2 else code

    # ─── 打印输出 ────────────────────────────────────────────
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sep = "=" * 58

    print()
    print(f"  {sep}")
    print(
        f"    📊  {name} ({stock_symbol.upper()})   "
        f"{market_name}  [{now}]"
    )
    print(f"  {sep}")
    print()

    # ── 价格核心 ──
    if "price" in hq_data:
        p = hq_data["price"]
        chg = hq_data.get("change", 0)
        pct = hq_data.get("change_pct", 0)
        c = color(chg)
        arrow = "▲" if chg > 0 else ("▼" if chg < 0 else "─")
        print(
            f"    {'当前价':>6s}: {fmt_yuan(p):>8s}  "
            f"{c}{arrow} {chg:>+7.2f}  ({pct:>+6.2f}%){reset()}"
        )
        print(f"    {'今  开':>6s}: {fmt_yuan(hq_data.get('open', 0)):>8s}      "
              f"{'昨  收':>6s}: {fmt_yuan(hq_data.get('preClose', 0))}")
        print(f"    {'最  高':>6s}: {fmt_yuan(hq_data.get('high', 0)):>8s}      "
              f"{'最  低':>6s}: {fmt_yuan(hq_data.get('low', 0))}")
        print()

        # ── 成交量 ──
        vol = hq_data.get("volume", 0)
        amt = hq_data.get("amount", 0)
        print(f"    {'成交量':>6s}: {fmt_volume(float(vol)):>12s}    "
              f"{'成交额':>6s}: {fmt_wan(float(amt))}")
        print()

    # ── 买卖五档 ──
    bids = hq_data.get("bids", [])
    asks = hq_data.get("asks", [])
    if bids or asks:
        print(f"    ┌───────── 买卖五档 ─────────┐")
        # 卖盘从高到低: ask5 → ask1 (reversed)
        for i, (ap, av) in enumerate(reversed(asks)):
            print(
                f"    │ 卖{circled(5 - i)}  {ap:>8.2f}  {av:>8,d}手 │"
            )
        print(f"    │ {'─' * 28} │")
        for i, (bp, bv) in enumerate(bids):
            print(
                f"    │ 买{circled(i + 1)}  {bp:>8.2f}  {bv:>8,d}手 │"
            )
        print(f"    └{'─' * 30}┘")
        print()

    # ── 其他信息 ──
    extras = []
    if "pe" in page_info:
        extras.append(f"市盈率(PE): {page_info['pe']}")
    if "pb" in page_info:
        extras.append(f"市净率(PB): {page_info['pb']}")
    if "pe" in hq_data:
        extras.append(f"市盈率(PE): {hq_data['pe']}")
    if "pb" in hq_data:
        extras.append(f"市净率(PB): {hq_data['pb']}")

    trade_date = hq_data.get("date", "")
    trade_time = hq_data.get("time", "")
    if trade_date:
        print(f"    行情时间: {trade_date} {trade_time}")
    if extras:
        print(f"    参考指标: {'  |  '.join(extras)}")
    print()

    # ── 页面链接 ──
    print(f"  {sep}")
    print()


# ─── 入口 ───────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print("用法: python fetch_sina_stock.py <代码>")
        print("示例: python fetch_sina_stock.py sz000001")
        print("      python fetch_sina_stock.py sh600036")
        sys.exit(1)

    code = sys.argv[1].strip()
    if not re.match(r"^(sh|sz|bj)\d{6}$", code, re.I):
        print(f"❌ 代码格式错误: {code}")
        print("   应为市场前缀(2位) + 6位数字, 如 sz000001 / sh600036")
        sys.exit(1)

    fetch_stock(code.lower())


if __name__ == "__main__":
    main()
