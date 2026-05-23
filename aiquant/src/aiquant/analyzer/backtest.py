import pandas as pd
import numpy as np
from typing import List, Optional, Tuple
from pathlib import Path
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import sys
import argparse
f"""
本地回测引擎

基于 baostock 数据，支持多种回测策略。

策略:
  1. 等权重 (equal_weight): 定期再平衡，各股票等权重持有
  2. 百分位 (percentile): 低于近N年百分位阈值买入，高于阈值卖出
  3. 智能全仓 (smart_percentile): 低于20%分位全仓买入，高于80%分位卖出；
     若买入时低于10%分位则60%就卖，卖出后立即买入另一只低位股
  4. 多份资金 (multi_share): 100万拆多份，每份独立选股；低于P20买入，高于P80卖出

用法:
    uv run python -m aiquant.analyzer.backtest                                  # 默认百分位策略：招商+平安+海尔+伊利
    uv run python -m aiquant.analyzer.backtest --strategy equal_weight           # 等权重策略
    uv run python -m aiquant.analyzer.backtest --strategy percentile --codes 000001,600036 --names 平安银行,招商银行
    uv run python -m aiquant.analyzer.backtest --start 2020-01-01 --end 2024-12-31
"""


# ── 数据源 ──────────────────────────────────────────────────────


def _bs_code(code: str) -> str:
    """转换为 baostock 代码格式"""
    if code.startswith("6"):  # 上海主板
        return f"sh.{code}"
    elif code.startswith("0") or code.startswith("3"):  # 深圳主板/创业板
        return f"sz.{code}"
    else:  # 指数等
        return f"sh.{code}"


def _fetch_bs(code: str, start_date: str, end_date: str, fields: str) -> pd.DataFrame:
    """baostock 通用查询"""
    import baostock as bs
    bs.login()
    try:
        bs_code = _bs_code(code)
        rs = bs.query_history_k_data_plus(
            bs_code, fields,
            start_date=start_date, end_date=end_date,
            frequency="d", adjustflag="2",  # 前复权
        )
        rows = []
        while rs.next():
            rows.append(rs.get_row_data())
        df = pd.DataFrame(rows, columns=fields.split(","))
        for col in df.columns:
            if col != "date":
                df[col] = pd.to_numeric(df[col], errors="coerce")
        df["date"] = pd.to_datetime(df["date"])
        return df.dropna(subset=["close"] if "close" in df.columns else None
                         ).sort_values("date").reset_index(drop=True)
    finally:
        bs.logout()


def fetch_stock(code: str, start: str, end: str) -> pd.Series:
    """获取单只股票日收盘价序列（前复权）"""
    df = _fetch_bs(code, start, end, "date,close")
    return df.set_index("date")["close"]


def fetch_benchmark(start: str, end: str) -> pd.Series:
    """获取沪深300指数收盘价序列（指数无复权参数）"""
    import baostock as bs
    bs.login()
    try:
        rs = bs.query_history_k_data_plus(
            "sh.000300", "date,close",
            start_date=start, end_date=end,
            frequency="d",
        )
        rows = []
        while rs.next():
            rows.append(rs.get_row_data())
        df = pd.DataFrame(rows, columns=["date", "close"])
        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df["date"] = pd.to_datetime(df["date"])
        return df.dropna(subset=["close"]).set_index("date")["close"]
    finally:
        bs.logout()


# ── 指标计算 ──────────────────────────────────────────────────────


def calc_period_metrics(daily_returns: pd.Series, rf_annual: float = 0.025
                        ) -> dict:
    """计算一组日收益率序列的绩效指标"""
    daily_returns = daily_returns.dropna()
    if len(daily_returns) < 2:
        return {"总收益率%": 0, "年化收益率%": 0, "年化波动率%": 0,
                "最大回撤%": 0, "夏普比率": 0, "收益回撤比": 0}

    total_ret = float((daily_returns + 1).prod() - 1)
    n_days = len(daily_returns)
    years = n_days / 252
    annual_ret = (1 + total_ret) ** (1 / years) - 1 if years > 0 else 0

    # 最大回撤
    cum = (1 + daily_returns).cumprod()
    peak = cum.cummax()
    dd = (peak - cum) / peak
    max_dd = float(dd.max())

    # 波动率 & 夏普
    vol = float(daily_returns.std() * np.sqrt(252))
    sharpe = (annual_ret - rf_annual) / vol if vol > 1e-8 else 0

    # 收益回撤比
    calmar = annual_ret / max_dd if max_dd > 1e-8 else 0

    return {
        "总收益率%": round(total_ret * 100, 2),
        "年化收益率%": round(annual_ret * 100, 2),
        "年化波动率%": round(vol * 100, 2),
        "最大回撤%": round(max_dd * 100, 2),
        "夏普比率": round(sharpe, 2),
        "收益回撤比": round(calmar, 2),
    }


# ── 回测主逻辑 ──────────────────────────────────────────────────


def run_backtest(
    stocks: List[Tuple[str, str]],       # [(code, name), ...]
    start_date: str = "2021-01-01",
    end_date: Optional[str] = None,
    rebalance_days: int = 252,           # 调仓间隔（交易日），252≈1年
    initial_capital: float = 200000,
) -> dict:
    """
    等权重多股票回测

    返回:
        {
            "组合": {...指标...},
            "沪深300": {...指标...},
            "个股": {name: {...指标...}, ...},
            "日收益率": DataFrame(date, 组合, 沪深300, 个股1, 个股2, ...),
            "净值曲线": DataFrame(date, 组合, 沪深300, ...),
        }
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f"  回测区间: {start_date} → {end_date}")
    print(f"  初始资金: {initial_capital:,.0f} 元")
    print(f"  持仓方式: 等权重")
    print(f"  调仓频率: 每 {rebalance_days} 个交易日")
    print(f"{'='*60}\n")

    # ── 获取数据 ──
    all_prices = {}
    for code, name in stocks:
        s = fetch_stock(code, start_date, end_date)
        all_prices[name] = s
        print(f"  📥 {name}({code})  → {len(s)} 个交易日")

    bm = fetch_benchmark(start_date, end_date)
    print(f"  📥 沪深300       → {len(bm)} 个交易日\n")

    # ── 对齐日期（取共同交易日） ──
    common = set(bm.index)
    for s in all_prices.values():
        common &= set(s.index)
    common = sorted(common)
    if len(common) < 20:
        raise ValueError(f"共同交易日不足 20 天，请检查数据")

    bm = bm.reindex(common)

    # ── 回测模拟 ──
    n = len(stocks)
    weight = 1.0 / n

    # 记录每日持仓与价值
    port_value = pd.Series(index=common, dtype=float)
    bm_value = pd.Series(index=common, dtype=float)

    # 记录每日持仓股数 {name: shares}
    shares: dict = {}

    for i, date in enumerate(common):
        prices_today = {name: s[date] for name, s in all_prices.items()}

        # 调仓判定：第一天 或 足够间隔
        is_rebalance = (i == 0) or (i % rebalance_days == 0)

        if i == 0:
            # 初始建仓
            for name in all_prices:
                shares[name] = (initial_capital * weight) / prices_today[name]
        elif is_rebalance:
            # 调仓：先算当前总值，再按目标权重重新分配
            total = sum(shares[name] * prices_today[name]
                        for name in all_prices)
            for name in all_prices:
                shares[name] = (total * weight) / prices_today[name]

        # 记录组合价值
        total = sum(shares[name] * prices_today[name] for name in all_prices)
        port_value[date] = total

        # 基准
        bm_value[date] = bm[date]

    # ── 日收益率 ──
    port_ret = port_value.pct_change().dropna()
    bm_ret = bm_value.pct_change().dropna()

    # ── 个股单独持有收益 ──
    single_results = {}
    for name, s in all_prices.items():
        s_aligned = s.reindex(common)
        s_ret = s_aligned.pct_change().dropna()
        single_results[name] = calc_period_metrics(s_ret)

    # ── 计算指标 ──
    combo_metrics = calc_period_metrics(port_ret)
    bm_metrics = calc_period_metrics(bm_ret)

    # ── 超额信息 ──
    n_days = len(port_ret)
    years = n_days / 252
    alpha = combo_metrics["年化收益率%"] - bm_metrics["年化收益率%"] if years > 0 else 0

    # Beta: Cov(P, B) / Var(B)
    cov = np.cov(port_ret, bm_ret)
    beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 1e-10 else 1

    result = {
        "组合": {**combo_metrics, "超额年化%": round(alpha, 2), "Beta": round(beta, 2)},
        "沪深300": bm_metrics,
        "个股": single_results,
        "日收益率": pd.DataFrame({
            "组合": port_ret, "沪深300": bm_ret,
            **{n: all_prices[n].reindex(common).pct_change() for n in all_prices},
        }),
        "净值曲线": pd.DataFrame({
            "组合": port_value / initial_capital,
            "沪深300": bm_value / bm_value.iloc[0],
            **{n: all_prices[n].reindex(common) / all_prices[n].reindex(common).iloc[0]
               for n in all_prices},
        }),
    }
    return result


# ── 百分位策略 ────────────────────────────────────────────────


def run_backtest_percentile(
    stocks: List[Tuple[str, str]],
    start_date: str = "2020-01-01",
    end_date: Optional[str] = None,
    lookback_years: int = 5,
    percentile_buy: float = 0.10,
    initial_capital: float = 200000,
) -> dict:
    """
    近 N 年百分位策略回测。

    对每只股票独立判断:
      - 当日价格 < 近 N 年第 P 百分位 → 买入（分配等权重仓位）
      - 否则 → 清仓该股

    会额外拉取 lookback_years 年的预热数据用于计算初始百分位。
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    # 数据拉取起始日需往前推 lookback_years
    data_start = (datetime.strptime(start_date, "%Y-%m-%d") -
                  timedelta(days=lookback_years * 366 + 30)).strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f"  策略: 近 {lookback_years} 年第 {percentile_buy*100:.0f}% 百分位")
    print(f"  回测区间: {start_date} → {end_date}")
    print(f"  预热数据: {data_start} → {start_date}")
    print(f"  初始资金: {initial_capital:,.0f} 元")
    print(
        f"  规则: 价格 < P{percentile_buy*100:.0f} → 买入，≥ P{percentile_buy*100:.0f} → 清仓")
    print(f"{'='*60}\n")

    # ── 获取全部历史数据（含预热期） ──
    all_prices = {}
    for code, name in stocks:
        s = fetch_stock(code, data_start, end_date)
        all_prices[name] = s
        print(f"  📥 {name}({code})  → {len(s)} 个交易日 (含预热)")

    bm = fetch_benchmark(data_start, end_date)
    print(f"  📥 沪深300       → {len(bm)} 个交易日 (含预热)\n")

    # ── 对齐日期 ──
    common = set(bm.index)
    for s in all_prices.values():
        common &= set(s.index)
    common = sorted(common)
    if len(common) < 252:
        raise ValueError(f"共同交易日不足 252 天，请检查数据")

    # 切分预热期和回测期
    backtest_start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    warmup = [d for d in common if d < backtest_start_dt]
    backtest_dates = [d for d in common if d >= backtest_start_dt]

    if len(warmup) < 60:
        print(f"  ⚠️  预热期仅 {len(warmup)} 个交易日，百分位计算可能不准确")

    # ── 计算每个回测日的百分位阈值 ──
    # 为加速计算，用滚动窗口方式：
    # 对于每个回测日 t，取 t-lookback_years 到 t-1 的价格计算 P10
    print(f"  🧮 计算百分位阈值中...")

    price_by_name = {name: s.reindex(common) for name, s in all_prices.items()}
    lookback_days = lookback_years * 252  # 近似交易日数

    thresholds = {}   # name -> {date: threshold}
    signals = {}      # name -> {date: "buy"/"sell"}
    for name in all_prices:
        p = price_by_name[name]
        thresh = {}
        sig = {}
        # 先用全部预热数据计算初始百分位
        warmup_prices = p.reindex(warmup).dropna().values
        initial_threshold = float(np.percentile(
            warmup_prices, percentile_buy * 100)) if len(warmup_prices) > 20 else None

        for dt in backtest_dates:
            # 取 dt 之前最多 lookback_days 天的价格
            idx = common.index(dt)
            start_idx = max(0, idx - lookback_days)
            window = p.iloc[start_idx:idx].dropna().values

            if len(window) > 20:
                threshold = float(np.percentile(window, percentile_buy * 100))
            elif initial_threshold is not None:
                threshold = initial_threshold
            else:
                threshold = None

            cur_price = p[dt]
            if threshold is not None and cur_price < threshold:
                sig[dt] = "buy"
            else:
                sig[dt] = "sell"
            thresh[dt] = threshold

        thresholds[name] = thresh
        signals[name] = sig

    # ── 回测模拟 ──
    n = len(stocks)

    port_value = pd.Series(index=backtest_dates, dtype=float)
    bm_value = pd.Series(index=backtest_dates, dtype=float)
    bm_aligned = bm.reindex(backtest_dates)

    # 现金 + 持仓股数
    cash = initial_capital
    shares: dict = {name: 0.0 for name in all_prices}

    trade_log = []  # 记录交易

    for dt in backtest_dates:
        prices_today = {name: price_by_name[name][dt] for name in all_prices}
        bm_today = bm_aligned[dt]

        # 1️⃣ 先卖出：清仓所有卖出信号的股票
        for name in all_prices:
            if signals[name][dt] == "sell" and shares[name] > 1e-6:
                proceeds = shares[name] * prices_today[name]
                cash += proceeds
                trade_log.append(
                    (dt, name, "卖出", prices_today[name], shares[name], proceeds))
                shares[name] = 0.0

        # 2️⃣ 再买入：将现金等权重分配给有买入信号的股票
        buy_names = [
            name for name in all_prices
            if signals[name][dt] == "buy" and shares[name] < 1e-6
        ]
        if buy_names and cash > 1:
            per_stock = cash / len(buy_names)
            for name in buy_names:
                shares[name] = per_stock / prices_today[name]
                trade_log.append(
                    (dt, name, "买入", prices_today[name], shares[name], per_stock))
            cash = 0.0

        # 记录组合价值
        total = sum(shares[name] * prices_today[name]
                    for name in all_prices) + cash
        port_value[dt] = total
        bm_value[dt] = bm_today

    # 交易统计
    print(f"  📝 共 {len(trade_log)} 笔交易")
    if trade_log:
        buy_trades = [t for t in trade_log if t[2] == "买入"]
        sell_trades = [t for t in trade_log if t[2] == "卖出"]
        print(f"     买入 {len(buy_trades)} 笔, 卖出 {len(sell_trades)} 笔")

    # ── 指标计算 ──
    # 过滤掉空仓日（价值=0）后再算收益率
    valid = port_value > 0
    port_ret = port_value[valid].pct_change().dropna()
    bm_ret = bm_value[valid].pct_change().dropna()

    # 对齐组合和基准的收益率序列
    common_ret = port_ret.index.intersection(bm_ret.index)
    port_ret = port_ret.reindex(common_ret).dropna()
    bm_ret = bm_ret.reindex(common_ret).dropna()

    # 仓位统计
    total_days = len(backtest_dates)
    position_days = {}
    for name in all_prices:
        days_in = sum(1 for dt in backtest_dates if shares.get(name, 0) > 0 or
                      any(signals[name][d] == "buy" for d in backtest_dates[:backtest_dates.index(dt)+1]
                          if d <= dt and s.get(name, 0) > 0
                          ))
        # 更简单的方法
        pos_days = sum(
            1 for dt in backtest_dates if signals[name][dt] == "buy")
        position_days[name] = pos_days

    # ── 个股持有收益 ──
    single_results = {}
    for name, s in price_by_name.items():
        s_aligned = s.reindex(backtest_dates)
        s_ret = s_aligned.pct_change().dropna()
        single_results[name] = calc_period_metrics(s_ret)
        # 加一个持仓天数占比
        buy_days = sum(
            1 for dt in backtest_dates if signals[name][dt] == "buy")
        single_results[name]["持仓占比%"] = round(
            buy_days / total_days * 100, 1) if total_days > 0 else 0

    # ── 组合指标 ──
    combo_metrics = calc_period_metrics(port_ret)
    bm_metrics = calc_period_metrics(bm_ret)

    n_days = len(port_ret)
    years = n_days / 252
    alpha = combo_metrics["年化收益率%"] - bm_metrics["年化收益率%"] if years > 0 else 0
    cov = np.cov(port_ret, bm_ret)
    beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 1e-10 else 1

    result = {
        "策略": "percentile",
        "组合": {**combo_metrics, "超额年化%": round(alpha, 2), "Beta": round(beta, 2)},
        "沪深300": bm_metrics,
        "个股": single_results,
        "日收益率": pd.DataFrame({
            "组合": port_ret, "沪深300": bm_ret,
            **{n: price_by_name[n].reindex(backtest_dates).pct_change()
               for n in all_prices},
        }),
        "净值曲线": pd.DataFrame({
            "组合": port_value / initial_capital,
            "沪深300": bm_value / bm_value.iloc[0],
            **{n: price_by_name[n].reindex(backtest_dates) /
               price_by_name[n].reindex(backtest_dates).iloc[0]
               for n in all_prices},
        }),
    }
    return result


# ── 智能全仓策略 ────────────────────────────────────────────


def run_backtest_smart_percentile(
    stocks: List[Tuple[str, str]],
    start_date: str = "2020-01-01",
    end_date: Optional[str] = None,
    lookback_years: int = 5,
    buy_threshold: float = 0.20,
    sell_threshold: float = 0.80,
    early_sell_threshold: float = 0.60,
    deep_buy_mark: float = 0.10,
    initial_capital: float = 1000000,
) -> dict:
    """
    智能全仓百分位策略。

    规则:
      - 全仓只持有一只股票
      - 价格低于 buy_threshold 百分位 → 全仓买入（选百分位最低的股票）
      - 如果买入时百分位 < deep_buy_mark（深度低位），卖出条件降为 early_sell_threshold
      - 否则按 sell_threshold 卖出
      - 卖出后立即寻找下一只低位股票买入
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    data_start = (datetime.strptime(start_date, "%Y-%m-%d") -
                  timedelta(days=lookback_years * 366 + 30)).strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print(f"  策略: 智能全仓百分位")
    print(f"  回测区间: {start_date} → {end_date}")
    print(f"  预热数据: {data_start} → {start_date}")
    print(f"  初始资金: {initial_capital:,.0f} 元")
    print(f"  买入条件: 价格 < P{buy_threshold*100:.0f}（选百分位最低的）")
    print(f"  常规卖出: 价格 ≥ P{sell_threshold*100:.0f}")
    print(
        f"  深度买入(≤P{deep_buy_mark*100:.0f})提前卖: 价格 ≥ P{early_sell_threshold*100:.0f} 就卖")
    print(f"  持仓方式: 全仓单只")
    print(f"{'='*60}\n")

    # ── 获取数据 ──
    all_prices = {}
    for code, name in stocks:
        s = fetch_stock(code, data_start, end_date)
        all_prices[name] = s
        print(f"  📥 {name}({code})  → {len(s)} 个交易日")

    bm = fetch_benchmark(data_start, end_date)
    print(f"  📥 沪深300       → {len(bm)} 个交易日\n")

    # 对齐 + 切分预热期
    common = set(bm.index)
    for s in all_prices.values():
        common &= set(s.index)
    common = sorted(common)
    if len(common) < 252:
        raise ValueError(f"共同交易日不足 252 天")

    backtest_start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    warmup = [d for d in common if d < backtest_start_dt]
    backtest_dates = [d for d in common if d >= backtest_start_dt]

    # ── 计算每日百分位 ──
    print(f"  🧮 计算每日百分位阈值中...")
    price_by_name = {name: s.reindex(common) for name, s in all_prices.items()}
    lookback_days = lookback_years * 252

    # 预计算每只股票每天的百分位 {name: {date: percentile}}
    pct_by_name: dict = {}
    for name in all_prices:
        p = price_by_name[name]
        pct = {}
        warmup_prices = p.reindex(warmup).dropna().values
        for dt in backtest_dates:
            idx = common.index(dt)
            start_idx = max(0, idx - lookback_days)
            window = p.iloc[start_idx:idx].dropna().values
            if len(window) > 20:
                pct[dt] = float(
                    (window < p[dt]).sum() / len(window))
            else:
                pct[dt] = 0.5  # 数据不足时给中间值
        pct_by_name[name] = pct

    # ── 回测模拟 ──
    cash = initial_capital
    holding: Optional[str] = None       # 当前持仓股票名称
    shares = 0.0
    entry_pct = None                    # 买入时的百分位

    port_value = pd.Series(index=backtest_dates, dtype=float)
    bm_value = pd.Series(index=backtest_dates, dtype=float)
    bm_aligned = bm.reindex(backtest_dates)

    trade_log = []

    for dt in backtest_dates:
        prices_today = {name: price_by_name[name][dt] for name in all_prices}
        pct_today = {name: pct_by_name[name][dt] for name in all_prices}
        bm_today = bm_aligned[dt]

        # 1️⃣ 检查卖出
        if holding is not None:
            cur_pct = pct_today[holding]
            effective_sell = early_sell_threshold if (
                entry_pct is not None and entry_pct <= deep_buy_mark
            ) else sell_threshold

            if cur_pct >= effective_sell:
                # 卖出
                proceeds = shares * prices_today[holding]
                cash += proceeds
                sell_reason = "提前卖60%" if effective_sell == early_sell_threshold else "常规卖80%"
                trade_log.append(
                    (dt, holding, f"卖出({sell_reason})",
                     prices_today[holding], shares, proceeds, cur_pct))
                holding = None
                shares = 0.0
                entry_pct = None

        # 2️⃣ 检查买入（无持仓时）
        if holding is None:
            # 找低于 buy_threshold 的股票，选百分位最低的
            candidates = [
                (name, pct_today[name])
                for name in all_prices
                if pct_today[name] < buy_threshold
            ]
            if candidates:
                # 按百分位升序排序，取最低的
                candidates.sort(key=lambda x: x[1])
                buy_name = candidates[0][0]
                buy_pct = candidates[0][1]
                shares = cash / prices_today[buy_name]
                cash = 0.0
                holding = buy_name
                entry_pct = buy_pct
                trade_log.append(
                    (dt, buy_name, f"买入(P{buy_pct*100:.0f})",
                     prices_today[buy_name], shares, 0, buy_pct))

        # 记录组合价值
        total = (shares * prices_today[holding]
                 ) if holding is not None else cash
        port_value[dt] = total
        bm_value[dt] = bm_today

    # ── 交易统计 ──
    print(f"  📝 共 {len(trade_log)} 笔交易")
    buys = [t for t in trade_log if "买入" in t[2]]
    sells = [t for t in trade_log if "卖出" in t[2]]
    print(f"     买入 {len(buys)} 笔, 卖出 {len(sells)} 笔")

    # ── 指标 ──
    valid = port_value > 0
    port_ret = port_value[valid].pct_change().dropna()
    bm_ret = bm_value[valid].pct_change().dropna()
    common_ret = port_ret.index.intersection(bm_ret.index)
    port_ret = port_ret.reindex(common_ret).dropna()
    bm_ret = bm_ret.reindex(common_ret).dropna()

    single_results = {}
    for name, s in price_by_name.items():
        s_aligned = s.reindex(backtest_dates)
        s_ret = s_aligned.pct_change().dropna()
        single_results[name] = calc_period_metrics(s_ret)

    combo_metrics = calc_period_metrics(port_ret)
    bm_metrics = calc_period_metrics(bm_ret)

    n_days = len(port_ret)
    years = n_days / 252
    alpha = combo_metrics["年化收益率%"] - bm_metrics["年化收益率%"] if years > 0 else 0
    cov = np.cov(port_ret, bm_ret)
    beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 1e-10 else 1

    result = {
        "策略": "smart_percentile",
        "初始资金": initial_capital,
        "组合": {**combo_metrics, "超额年化%": round(alpha, 2), "Beta": round(beta, 2)},
        "沪深300": bm_metrics,
        "个股": single_results,
        "日收益率": pd.DataFrame({
            "组合": port_ret, "沪深300": bm_ret,
        }),
        "净值曲线": pd.DataFrame({
            "组合": port_value / initial_capital,
            "沪深300": bm_value / bm_value.iloc[0],
        }),
    }
    return result


# ── 多份资金独立选股策略 ──────────────────────────────────


def run_backtest_multi_share(
    stocks: List[Tuple[str, str]],
    start_date: str = "2020-01-01",
    end_date: Optional[str] = None,
    lookback_years: int = 5,
    buy_threshold: float = 0.20,
    sell_threshold: float = 0.80,
    num_shares: int = 3,
    initial_capital: float = 1000000,
) -> dict:
    """
    多份资金独立选股策略。

    资金等分成 num_shares 份，每份独立运作:
      - 监控所有股票，低于 buy_threshold 时用空闲资金买入（每份买一只）
      - 高于 sell_threshold 时卖出该份持仓
      - 最多同时持有 num_shares 只股票
    """
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    data_start = (datetime.strptime(start_date, "%Y-%m-%d") -
                  timedelta(days=lookback_years * 366 + 30)).strftime("%Y-%m-%d")

    share_capital = initial_capital / num_shares

    print(f"\n{'='*60}")
    print(f"  策略: 多份资金独立选股")
    print(f"  回测区间: {start_date} → {end_date}")
    print(
        f"  初始资金: {initial_capital:,.0f} 元 → {num_shares} 份 × {share_capital:,.0f} 元")
    print(f"  买入条件: 价格 < P{buy_threshold*100:.0f}")
    print(f"  卖出条件: 价格 ≥ P{sell_threshold*100:.0f}")
    print(f"  最大持仓: {num_shares} 只")
    print(f"{'='*60}\n")

    # ── 获取数据 ──
    all_prices = {}
    for code, name in stocks:
        s = fetch_stock(code, data_start, end_date)
        all_prices[name] = s
        print(f"  📥 {name}({code})  → {len(s)} 个交易日")

    bm = fetch_benchmark(data_start, end_date)
    print(f"  📥 沪深300       → {len(bm)} 个交易日\n")

    # 对齐 + 切分预热期
    common = set(bm.index)
    for s in all_prices.values():
        common &= set(s.index)
    common = sorted(common)
    if len(common) < 252:
        raise ValueError(f"共同交易日不足 252 天")

    backtest_start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    warmup = [d for d in common if d < backtest_start_dt]
    backtest_dates = [d for d in common if d >= backtest_start_dt]

    # ── 计算每日百分位 ──
    print(f"  🧮 计算每日百分位阈值中...")
    price_by_name = {name: s.reindex(common) for name, s in all_prices.items()}
    lookback_days = lookback_years * 252

    pct_by_name: dict = {}
    for name in all_prices:
        p = price_by_name[name]
        pct = {}
        for dt in backtest_dates:
            idx = common.index(dt)
            start_idx = max(0, idx - lookback_days)
            window = p.iloc[start_idx:idx].dropna().values
            if len(window) > 20:
                pct[dt] = float((window < p[dt]).sum() / len(window))
            else:
                pct_day = 0.5
            pct[dt] = pct.get(dt, 0.5)
        pct_by_name[name] = pct

    # ── 回测模拟 ──
    # 每份资金独立跟踪 {slot_id: {holding, shares, entry_pct}}
    slots = [
        {"holding": None, "shares": 0.0, "cash": share_capital}
        for _ in range(num_shares)
    ]

    port_value = pd.Series(index=backtest_dates, dtype=float)
    bm_value = pd.Series(index=backtest_dates, dtype=float)
    bm_aligned = bm.reindex(backtest_dates)
    trade_log = []

    for dt in backtest_dates:
        prices_today = {name: price_by_name[name][dt] for name in all_prices}
        pct_today = {name: pct_by_name[name][dt] for name in all_prices}
        bm_today = bm_aligned[dt]

        # 1️⃣ 每个仓位检查卖出
        for slot in slots:
            if slot["holding"] is not None:
                cur_pct = pct_today[slot["holding"]]
                if cur_pct >= sell_threshold:
                    proceeds = slot["shares"] * prices_today[slot["holding"]]
                    slot["cash"] += proceeds
                    trade_log.append(
                        (dt, slot["holding"], "卖出",
                         prices_today[slot["holding"]], slot["shares"], proceeds, cur_pct))
                    slot["holding"] = None
                    slot["shares"] = 0.0

        # 2️⃣ 找空闲资金 + 候选股票
        idle_slots = [s for s in slots if s["holding"]
                      is None and s["cash"] > 1]
        if idle_slots:
            # 当前已持仓的股票
            held_stocks = {s["holding"]
                           for s in slots if s["holding"] is not None}
            candidates = [
                (name, pct_today[name])
                for name in all_prices
                if name not in held_stocks and pct_today[name] < buy_threshold
            ]
            candidates.sort(key=lambda x: x[1])  # 按百分位升序，选最低的

            for slot in idle_slots:
                if not candidates:
                    break
                buy_name = candidates.pop(0)[0]
                slot["shares"] = slot["cash"] / prices_today[buy_name]
                slot["cash"] = 0.0
                slot["holding"] = buy_name
                trade_log.append(
                    (dt, buy_name, f"买入(P{pct_today[buy_name]*100:.0f})",
                     prices_today[buy_name], slot["shares"], 0, pct_today[buy_name]))

        # 记录总资产
        total = sum(
            (s["shares"] * prices_today[s["holding"]]
             if s["holding"] else s["cash"])
            for s in slots
        )
        port_value[dt] = total
        bm_value[dt] = bm_today

    # ── 交易统计 ──
    print(f"  📝 共 {len(trade_log)} 笔交易")
    buys = [t for t in trade_log if "买入" in t[2]]
    sells = [t for t in trade_log if t[2] == "卖出"]
    print(f"     买入 {len(buys)} 笔, 卖出 {len(sells)} 笔")

    # 各份资金最终统计
    print(f"  📦 各份资金终值:")
    for i, s in enumerate(slots):
        val = s["cash"] if s["holding"] is None else s["shares"] * (
            price_by_name[s["holding"]].reindex(backtest_dates).iloc[-1]
            if s["holding"] else s["cash"]
        )
        status = f"持仓{s['holding']}" if s["holding"] else "空仓"
        print(f"     第{i+1}份: ¥{val:>8,.0f} ({status})")

    # ── 指标 ──
    valid = port_value > 0
    port_ret = port_value[valid].pct_change().dropna()
    bm_ret = bm_value[valid].pct_change().dropna()
    common_ret = port_ret.index.intersection(bm_ret.index)
    port_ret = port_ret.reindex(common_ret).dropna()
    bm_ret = bm_ret.reindex(common_ret).dropna()

    single_results = {}
    for name, s in price_by_name.items():
        s_aligned = s.reindex(backtest_dates)
        s_ret = s_aligned.pct_change().dropna()
        single_results[name] = calc_period_metrics(s_ret)

    combo_metrics = calc_period_metrics(port_ret)
    bm_metrics = calc_period_metrics(bm_ret)

    n_days = len(port_ret)
    years = n_days / 252
    alpha = combo_metrics["年化收益率%"] - bm_metrics["年化收益率%"] if years > 0 else 0
    cov = np.cov(port_ret, bm_ret)
    beta = cov[0, 1] / cov[1, 1] if cov[1, 1] > 1e-10 else 1

    result = {
        "策略": "multi_share",
        "初始资金": initial_capital,
        "组合": {**combo_metrics, "超额年化%": round(alpha, 2), "Beta": round(beta, 2)},
        "沪深300": bm_metrics,
        "个股": single_results,
        "日收益率": pd.DataFrame({
            "组合": port_ret, "沪深300": bm_ret,
        }),
        "净值曲线": pd.DataFrame({
            "组合": port_value / initial_capital,
            "沪深300": bm_value / bm_value.iloc[0],
        }),
    }
    return result


# ── 报表输出 ──────────────────────────────────────────────────────


def print_report(result: dict, stocks: List[Tuple[str, str]]):
    """打印回测报告"""
    # 组合 vs 基准
    c = result["组合"]
    b = result["沪深300"]
    singles = result["个股"]

    print(f"{'='*60}")
    print(f"  📊 回测结果汇总")
    print(f"{'='*60}")
    print(f"  {'指标':<16} {'组合':>10} {'沪深300':>10} {'对比':>10}")
    print(f"  {'─'*48}")

    total_diff = c.get("总收益率%", 0) - b.get("总收益率%", 0)
    for key in ["总收益率%", "年化收益率%", "年化波动率%", "最大回撤%", "夏普比率", "收益回撤比"]:
        cv = c.get(key, "-")
        bv = b.get(key, "-")
        diff = ""
        if key == "总收益率%":
            diff = f"{total_diff:>+8.2f}"
        elif key == "年化收益率%":
            diff = f"{c.get('超额年化%', 0):>+8.2f}"
        print(f"  {key:<16} {cv:>10} {bv:>10} {diff:>10}")
    print(f"  {'Beta':<16} {c.get('Beta', '-'):>10}")
    print(f"{'='*60}\n")

    # 个股对比
    print(f"{'─'*60}")
    print(f"  个股对比")
    print(f"{'─'*60}")
    header = f"  {'指标':<16}"
    for _, sname in stocks:
        header += f" {sname:<12}"
    print(header)

    for key in ["总收益率%", "年化收益率%", "最大回撤%", "夏普比率"]:
        row = f"  {key:<16}"
        for _, sname in stocks:
            val = singles[sname].get(key, "-")
            row += f" {str(val):<12}"
        print(row)

    print(f"{'─'*60}\n")

    # 最终价值
    curve = result["净值曲线"]
    final_nav = curve["组合"].iloc[-1]
    initial = result.get("初始资金", 200000)
    print(f"  💰 初始资金: {initial:>10,.0f} 元")
    print(f"  💰 最终价值: {initial * final_nav:>10,.0f} 元")
    print(f"  💰 总收益:   {initial * (final_nav - 1):>+10,.0f} 元")
    print()


# ── CLI ──────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="本地回测引擎（baostock 数据源）")
    parser.add_argument("--strategy", default="multi_share",
                        choices=["equal_weight", "percentile",
                                 "smart_percentile", "multi_share"],
                        help="回测策略: equal_weight / percentile / smart_percentile / multi_share")
    parser.add_argument("--codes", default="000001,600036,600690,600887,600519",
                        help="股票代码，逗号分隔")
    parser.add_argument("--names", default="平安银行,招商银行,海尔智家,伊利股份,贵州茅台",
                        help="股票名称，逗号分隔")
    parser.add_argument("--start", default="2020-01-01",
                        help="回测开始日期（默认 2020-01-01）")
    parser.add_argument("--end", default=None,
                        help="回测结束日期（默认今日）")
    parser.add_argument("--rebalance", type=int, default=252,
                        help="调仓间隔(交易日)，仅等权重策略生效")
    parser.add_argument("--capital", type=float, default=1000000,
                        help="初始资金（默认 1000000）")
    parser.add_argument("--lookback", type=int, default=5,
                        help="百分位回看年数（默认 5）")
    parser.add_argument("--percentile", type=float, default=0.10,
                        help="百分位阈值，仅百分位策略生效（默认 0.10）")
    parser.add_argument("--buy-below", type=float, default=0.20,
                        help="买入百分位阈值（默认 0.20）")
    parser.add_argument("--sell-above", type=float, default=0.80,
                        help="卖出百分位阈值（默认 0.80）")
    parser.add_argument("--early-sell", type=float, default=0.60,
                        help="深度买入提前卖出阈值，仅 smart_percentile（默认 0.60）")
    parser.add_argument("--num-shares", type=int, default=3,
                        help="资金份数，仅 multi_share（默认 3）")
    args = parser.parse_args()

    codes = args.codes.split(",")
    names = args.names.split(",")
    if len(codes) != len(names):
        print("❌ --codes 和 --names 数量不一致")
        sys.exit(1)

    stocks = list(zip(codes, names))

    if args.strategy == "multi_share":
        result = run_backtest_multi_share(
            stocks=stocks,
            start_date=args.start,
            end_date=args.end,
            lookback_years=args.lookback,
            buy_threshold=args.buy_below,
            sell_threshold=args.sell_above,
            num_shares=args.num_shares,
            initial_capital=args.capital,
        )
    elif args.strategy == "smart_percentile":
        result = run_backtest_smart_percentile(
            stocks=stocks,
            start_date=args.start,
            end_date=args.end,
            lookback_years=args.lookback,
            buy_threshold=args.buy_below,
            sell_threshold=args.sell_above,
            early_sell_threshold=args.early_sell,
            initial_capital=args.capital,
        )
    elif args.strategy == "percentile":
        result = run_backtest_percentile(
            stocks=stocks,
            start_date=args.start,
            end_date=args.end,
            lookback_years=args.lookback,
            percentile_buy=args.percentile,
            initial_capital=args.capital,
        )
    else:
        result = run_backtest(
            stocks=stocks,
            start_date=args.start,
            end_date=args.end,
            rebalance_days=args.rebalance,
            initial_capital=args.capital,
        )

    print_report(result, stocks)

    # ── 生成净值曲线 CSV ──
    out_dir = Path(__file__).resolve().parent.parent.parent.parent / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "backtest_nav.csv"
    result["净值曲线"].to_csv(csv_path, float_format="%.6f")
    print(f"  📁 净值数据已保存: {csv_path}")


if __name__ == "__main__":
    main()
