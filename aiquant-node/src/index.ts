import Koa from "koa";
import Router from "@koa/router";
import cors from "@koa/cors";
import bodyParser from "koa-bodyparser";
import { PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const app = new Koa();
const router = new Router();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser());

// 健康检查
router.get("/", (ctx) => {
  ctx.body = { name: "aiquant-web API", version: "0.1.0" };
});

// 获取价格记录
router.get("/api/price-records", async (ctx) => {
  const code = ctx.query.code as string | undefined;
  const limit = Math.min(Number(ctx.query.limit) || 5000, 10000);
  const where = code ? { code } : {};
  const records = await prisma.priceRecord.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
  ctx.body = records.map((r) => ({
    ...r,
    price: parseFloat(r.price.toFixed(2)),
  }));
});

// 获取警报记录
router.get("/api/alert-records", async (ctx) => {
  const code = ctx.query.code as string | undefined;
  const limit = Math.min(Number(ctx.query.limit) || 100, 1000);
  const where = code ? { code } : {};
  const records = await prisma.alertRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  ctx.body = records;
});

// 获取所有有记录的股票列表
router.get("/api/stocks", async (ctx) => {
  const records = await prisma.priceRecord.findMany({
    select: { code: true, name: true },
    distinct: ["code"],
  });
  ctx.body = records;
});

// 百分位计算
function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[Math.max(0, idx)];
}

// 获取每只股票的最新价格 + 参考价
router.get("/api/latest-prices", async (ctx) => {
  const records = await prisma.priceRecord.findMany({
    orderBy: { recordedAt: "desc" },
  });

  // 按 code 去重取最新
  const latestMap = new Map<string, (typeof records)[0]>();
  // 按 code 收集所有价格（用于百分位计算）
  const priceMap = new Map<string, number[]>();
  const peMap = new Map<string, number[]>();
  const pbMap = new Map<string, number[]>();
  for (const r of records) {
    if (!latestMap.has(r.code)) {
      latestMap.set(r.code, r);
    }
    if (!priceMap.has(r.code)) priceMap.set(r.code, []);
    priceMap.get(r.code)!.push(r.price);
    if (r.peTtm != null) {
      if (!peMap.has(r.code)) peMap.set(r.code, []);
      peMap.get(r.code)!.push(r.peTtm);
    }
    if (r.pbMrq != null) {
      if (!pbMap.has(r.code)) pbMap.set(r.code, []);
      pbMap.get(r.code)!.push(r.pbMrq);
    }
  }

  const result = Array.from(latestMap.values()).map((r) => {
    const prices = priceMap.get(r.code) || [];
    const sortedPrices = prices.sort((a, b) => a - b);
    const pePrices = peMap.get(r.code) || [];
    const sortedPe = pePrices.sort((a, b) => a - b);
    const pbPrices = pbMap.get(r.code) || [];
    const sortedPb = pbPrices.sort((a, b) => a - b);
    // 计算当前 PE/PB 在历史中的分位
    const currentPe = r.peTtm;
    const currentPb = r.pbMrq;
    const pePercentile =
      currentPe != null && sortedPe.length > 0
        ? parseFloat(
            (
              (sortedPe.filter((v) => v < currentPe).length / sortedPe.length) *
              100
            ).toFixed(1),
          )
        : null;
    const pbPercentile =
      currentPb != null && sortedPb.length > 0
        ? parseFloat(
            (
              (sortedPb.filter((v) => v < currentPb).length / sortedPb.length) *
              100
            ).toFixed(1),
          )
        : null;
    return {
      code: r.code,
      name: r.name,
      price: parseFloat(r.price.toFixed(2)),
      recordedAt: r.recordedAt,
      peTtm: currentPe ? parseFloat(currentPe.toFixed(2)) : null,
      pbMrq: currentPb ? parseFloat(currentPb.toFixed(2)) : null,
      pePercentile,
      pbPercentile,
      buyRef: parseFloat(percentile(sortedPrices, 0.1).toFixed(2)),
      sellRef: parseFloat(percentile(sortedPrices, 0.9).toFixed(2)),
    };
  });

  ctx.body = result;
});

// ── 用户股票管理 ──────────────────────────────────────
router.get("/api/user-stocks", async (ctx) => {
  const stocks = await prisma.userStock.findMany({
    orderBy: { createdAt: "asc" },
  });
  ctx.body = stocks.map((s) => ({ code: s.code, name: s.name }));
});

router.post("/api/user-stocks", async (ctx) => {
  const { code, name } = ctx.request.body as { code: string; name?: string };
  if (!code || !/^\d{6}$/.test(code)) {
    ctx.status = 400;
    ctx.body = { error: "请输入有效的6位股票代码" };
    return;
  }
  await prisma.userStock.upsert({
    where: { code },
    update: { name: name || null },
    create: { code, name: name || null },
  });
  ctx.body = { success: true, code, name };
});

router.delete("/api/user-stocks/:code", async (ctx) => {
  const { code } = ctx.params;
  try {
    await prisma.userStock.delete({ where: { code } });
    ctx.body = { success: true, code };
  } catch (e: any) {
    if (e.code === "P2025") {
      ctx.body = { success: true, code, note: "not found" };
      return;
    }
    throw e;
  }
});

// Dashboard 聚合接口（一次性返回所有数据）
router.get("/api/dashboard", async (ctx) => {
  // 年份范围参数（默认5年）
  const years = Math.max(1, Math.min(20, Number(ctx.query.years) || 5));
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);

  // 1. 最新价格 + 百分位（仅取近N年数据计算）
  const priceRecords = await prisma.priceRecord.findMany({
    orderBy: { recordedAt: "desc" },
  });

  // 只显示用户个人股票列表中的
  const userCodes = new Set(
    (await prisma.userStock.findMany({ select: { code: true } })).map(
      (s) => s.code,
    ),
  );

  const latestMap = new Map<string, (typeof priceRecords)[0]>();
  const priceMap = new Map<string, number[]>();
  const peMap = new Map<string, number[]>();
  const pbMap = new Map<string, number[]>();
  for (const r of priceRecords) {
    // 跳过不在用户个人列表的股票
    if (!userCodes.has(r.code)) continue;
    if (!latestMap.has(r.code)) latestMap.set(r.code, r);
    // 只在指定年份范围内计算百分位
    if (r.recordedAt >= cutoff) {
      if (!priceMap.has(r.code)) priceMap.set(r.code, []);
      priceMap.get(r.code)!.push(r.price);
      if (r.peTtm != null) {
        if (!peMap.has(r.code)) peMap.set(r.code, []);
        peMap.get(r.code)!.push(r.peTtm);
      }
      if (r.pbMrq != null) {
        if (!pbMap.has(r.code)) pbMap.set(r.code, []);
        pbMap.get(r.code)!.push(r.pbMrq);
      }
    }
  }

  const prices = Array.from(latestMap.values()).map((r) => {
    const sortedPrices = (priceMap.get(r.code) || []).sort((a, b) => a - b);
    const sortedPe = (peMap.get(r.code) || []).sort((a, b) => a - b);
    const sortedPb = (pbMap.get(r.code) || []).sort((a, b) => a - b);
    const currentPe = r.peTtm;
    const currentPb = r.pbMrq;
    const pePercentile =
      currentPe != null && sortedPe.length > 0
        ? parseFloat(
            (
              (sortedPe.filter((v) => v < currentPe).length / sortedPe.length) *
              100
            ).toFixed(1),
          )
        : null;
    const pbPercentile =
      currentPb != null && sortedPb.length > 0
        ? parseFloat(
            (
              (sortedPb.filter((v) => v < currentPb).length / sortedPb.length) *
              100
            ).toFixed(1),
          )
        : null;
    return {
      code: r.code,
      name: r.name,
      price: parseFloat(r.price.toFixed(2)),
      recordedAt: r.recordedAt,
      peTtm: currentPe ? parseFloat(currentPe.toFixed(2)) : null,
      pbMrq: currentPb ? parseFloat(currentPb.toFixed(2)) : null,
      pePercentile,
      pbPercentile,
      buyRef: parseFloat(percentile(sortedPrices, 0.1).toFixed(2)),
      sellRef: parseFloat(percentile(sortedPrices, 0.9).toFixed(2)),
    };
  });

  // 2. 所有股票的财务数据，按 code 分组
  const finRecords = await prisma.financialRecord.findMany({
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  const financialMap = new Map<string, any[]>();
  for (const r of finRecords) {
    if (!financialMap.has(r.code)) financialMap.set(r.code, []);
    financialMap.get(r.code)!.push({
      code: r.code,
      year: r.year,
      quarter: r.quarter,
      roeAvg: r.roeAvg ? parseFloat(r.roeAvg.toFixed(4)) : null,
      npMargin: r.npMargin ? parseFloat(r.npMargin.toFixed(4)) : null,
      gpMargin: r.gpMargin ? parseFloat(r.gpMargin.toFixed(4)) : null,
      netProfit: r.netProfit ? parseFloat(r.netProfit.toFixed(2)) : null,
      epsTtm: r.epsTtm ? parseFloat(r.epsTtm.toFixed(4)) : null,
      mbRevenue: r.mbRevenue ? parseFloat(r.mbRevenue.toFixed(2)) : null,
      yoyEquity: r.yoyEquity ? parseFloat(r.yoyEquity.toFixed(4)) : null,
      yoyAsset: r.yoyAsset ? parseFloat(r.yoyAsset.toFixed(4)) : null,
      yoyNi: r.yoyNi ? parseFloat(r.yoyNi.toFixed(4)) : null,
      yoyEpsBasic: r.yoyEpsBasic ? parseFloat(r.yoyEpsBasic.toFixed(4)) : null,
      yoyPni: r.yoyPni ? parseFloat(r.yoyPni.toFixed(4)) : null,
      currentRatio: r.currentRatio
        ? parseFloat(r.currentRatio.toFixed(4))
        : null,
      quickRatio: r.quickRatio ? parseFloat(r.quickRatio.toFixed(4)) : null,
      cashRatio: r.cashRatio ? parseFloat(r.cashRatio.toFixed(4)) : null,
      assetToEquity: r.assetToEquity
        ? parseFloat(r.assetToEquity.toFixed(4))
        : null,
      cfoToOr: r.cfoToOr ? parseFloat(r.cfoToOr.toFixed(4)) : null,
      cfoToNp: r.cfoToNp ? parseFloat(r.cfoToNp.toFixed(4)) : null,
      ebitToInterest: r.ebitToInterest
        ? parseFloat(r.ebitToInterest.toFixed(2))
        : null,
    });
  }

  ctx.body = {
    prices,
    financialRecords: Object.fromEntries(financialMap),
  };
});

// 获取财务数据（利润表 + 成长能力）
router.get("/api/financial-records", async (ctx) => {
  const code = ctx.query.code as string;
  if (!code) {
    ctx.status = 400;
    ctx.body = { error: "code is required" };
    return;
  }
  const records = await prisma.financialRecord.findMany({
    where: { code },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  ctx.body = records.map((r) => ({
    code: r.code,
    year: r.year,
    quarter: r.quarter,
    // 利润表
    roeAvg: r.roeAvg ? parseFloat(r.roeAvg.toFixed(4)) : null,
    npMargin: r.npMargin ? parseFloat(r.npMargin.toFixed(4)) : null,
    gpMargin: r.gpMargin ? parseFloat(r.gpMargin.toFixed(4)) : null,
    netProfit: r.netProfit ? parseFloat(r.netProfit.toFixed(2)) : null,
    epsTtm: r.epsTtm ? parseFloat(r.epsTtm.toFixed(4)) : null,
    mbRevenue: r.mbRevenue ? parseFloat(r.mbRevenue.toFixed(2)) : null,
    // 成长能力
    yoyEquity: r.yoyEquity ? parseFloat(r.yoyEquity.toFixed(4)) : null,
    yoyAsset: r.yoyAsset ? parseFloat(r.yoyAsset.toFixed(4)) : null,
    yoyNi: r.yoyNi ? parseFloat(r.yoyNi.toFixed(4)) : null,
    yoyEpsBasic: r.yoyEpsBasic ? parseFloat(r.yoyEpsBasic.toFixed(4)) : null,
    yoyPni: r.yoyPni ? parseFloat(r.yoyPni.toFixed(4)) : null,
    // 资产负债表
    currentRatio: r.currentRatio ? parseFloat(r.currentRatio.toFixed(4)) : null,
    quickRatio: r.quickRatio ? parseFloat(r.quickRatio.toFixed(4)) : null,
    cashRatio: r.cashRatio ? parseFloat(r.cashRatio.toFixed(4)) : null,
    assetToEquity: r.assetToEquity
      ? parseFloat(r.assetToEquity.toFixed(4))
      : null,
    // 现金流量表
    cfoToOr: r.cfoToOr ? parseFloat(r.cfoToOr.toFixed(4)) : null,
    cfoToNp: r.cfoToNp ? parseFloat(r.cfoToNp.toFixed(4)) : null,
    ebitToInterest: r.ebitToInterest
      ? parseFloat(r.ebitToInterest.toFixed(2))
      : null,
  }));
});

// 获取 ETF 指数列表
router.get("/api/etf-indices", async (ctx) => {
  const records = await prisma.etfIndex.findMany({
    orderBy: { tsCode: "asc" },
  });
  ctx.body = records.map((r) => ({
    id: r.id,
    tsCode: r.tsCode,
    indxName: r.indxName,
    indxCsname: r.indxCsname,
    pubPartyName: r.pubPartyName,
    pubDate: r.pubDate,
    baseDate: r.baseDate,
    bp: r.bp,
    adjCircle: r.adjCircle,
  }));
});

// ── 回测引擎 ──────────────────────────────────────────

interface BacktestRequest {
  strategy: string;
  codes: string[];
  startDate: string;
  endDate: string;
  params: {
    buyPercentile: number;
    sellPercentile: number;
    lookbackYears: number;
    initialCapital: number;
  };
}

interface TradeRecord {
  date: string;
  action: "buy" | "sell";
  stockCode: string;
  stockName: string;
  price: number;
  shares: number;
  amount: number;
  pnl?: number;
}

/** 配对后的完整交易记录 */
interface TradeSummary {
  stockCode: string;
  stockName: string;
  buyDate: string;
  buyPrice: number;
  buyAmount: number;
  sellDate: string | null;
  sellPrice: number | null;
  sellAmount: number | null;
  profit: number;
  profitPercent: number;
  status: "holding" | "closed";
}

interface NavPoint {
  date: string;
  value: number;
}

interface PricePoint {
  date: string;
  price: number;
}

interface PriceSeries {
  name: string;
  data: PricePoint[]; // 策略期间的日/月价格序列
  buySignals: PricePoint[]; // 买入点
  sellSignals: PricePoint[]; // 卖出点
}

interface BacktestResult {
  strategy: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  totalTrades: number;
  winRate: number | null;
  navCurve: NavPoint[];
  trades: TradeRecord[];
  tradeSummary: TradeSummary[];
  priceSeries: Record<string, PriceSeries>; // 每只股票的价格序列（含买卖标记）
}

/** 策略1: 循环建仓 — 共享资金池，每份固定25万，卖出后资金可再买入 */
async function runPercentileStrategy(
  req: BacktestRequest,
  prisma: PrismaClient,
): Promise<BacktestResult> {
  const { codes, startDate, endDate, params } = req;
  const { buyPercentile, sellPercentile, lookbackYears, initialCapital } =
    params;

  const dataStart = new Date(startDate);
  dataStart.setFullYear(dataStart.getFullYear() - lookbackYears);
  const dataStartStr = dataStart.toISOString().split("T")[0];

  const records = await prisma.priceRecord.findMany({
    where: { code: { in: codes }, recordedAt: { gte: new Date(dataStartStr) } },
    orderBy: [{ code: "asc" }, { recordedAt: "asc" }],
  });

  // ── 数据准备 ──
  const raw: Record<string, { date: Date; price: number }[]> = {};
  const nameMap: Record<string, string> = {};
  for (const r of records) {
    if (!raw[r.code]) raw[r.code] = [];
    raw[r.code].push({ date: r.recordedAt, price: r.price });
    nameMap[r.code] = r.name || r.code;
  }
  for (const code of codes) {
    if (!raw[code]) throw new Error(`股票 ${code} 没有价格数据`);
  }

  // ── 数据索引构建 ──
  const stockDates: Record<string, string[]> = {};
  const stockPrices: Record<string, number[]> = {};
  const dateIdx: Record<string, Record<string, number>> = {};
  for (const code of codes) {
    const data = raw[code];
    const dates: string[] = [];
    const prices: number[] = [];
    const idx: Record<string, number> = {};
    for (let i = 0; i < data.length; i++) {
      const ds = data[i].date.toISOString().split("T")[0];
      idx[ds] = i;
      dates.push(ds);
      prices.push(data[i].price);
    }
    stockDates[code] = dates;
    stockPrices[code] = prices;
    dateIdx[code] = idx;
  }

  // ── 交易日构建 ──
  const allDates = new Set<string>();
  for (const code of codes) {
    for (const ds of stockDates[code]) {
      if (ds >= startDate && ds <= endDate) allDates.add(ds);
    }
  }
  const tradingDays = Array.from(allDates).sort();
  if (tradingDays.length === 0) throw new Error("所选时间范围内没有交易日数据");

  // ── lowerBound ──
  function lowerBound(arr: string[], target: string): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ⭐️ 核心改动：共享资金池，4份×25万，循环建仓
  const maxPositions = 4;
  const positionSize = initialCapital / maxPositions; // 25万
  let cash = initialCapital;
  let activeCount = 0;

  const shares: Record<string, number> = {};
  const openPositions: {
    code: string;
    date: string;
    price: number;
    amount: number;
  }[] = [];
  for (const code of codes) shares[code] = 0;

  const trades: TradeRecord[] = [];
  const navCurve: NavPoint[] = [];

  for (let ti = 0; ti < tradingDays.length; ti++) {
    const dateStr = tradingDays[ti];
    const currentDate = new Date(dateStr);
    const lookbackStart = new Date(currentDate);
    lookbackStart.setFullYear(lookbackStart.getFullYear() - lookbackYears);
    const ls = lookbackStart.toISOString().split("T")[0];

    // ── 计算百分位 ──
    const percentiles: Record<string, number> = {};
    const pricesToday: Record<string, number> = {};
    for (const code of codes) {
      const todayIdx = dateIdx[code][dateStr];
      if (todayIdx === undefined) continue;
      pricesToday[code] = stockPrices[code][todayIdx];
      let startIdx = dateIdx[code][ls];
      if (startIdx === undefined) startIdx = lowerBound(stockDates[code], ls);
      if (todayIdx - startIdx + 1 > 5) {
        const w = stockPrices[code].slice(startIdx, todayIdx + 1);
        w.sort((a, b) => a - b);
        percentiles[code] =
          w.filter((p) => p < pricesToday[code]).length / w.length;
      }
    }

    // ── 1. 卖出：高于sellThreshold → 资金回池 ──
    for (const code of codes) {
      if (
        shares[code] > 0.001 &&
        percentiles[code] !== undefined &&
        percentiles[code] > sellPercentile
      ) {
        const price = pricesToday[code];
        const sellAmount = shares[code] * price;
        cash += sellAmount;
        activeCount--;

        const buyInfo = openPositions.find((p) => p.code === code);
        const buyPrice = buyInfo?.price || 0;
        const pnl = buyPrice > 0 ? ((price - buyPrice) / buyPrice) * 100 : 0;

        trades.push({
          date: dateStr,
          action: "sell",
          stockCode: code,
          stockName: nameMap[code],
          price: parseFloat(price.toFixed(2)),
          shares: shares[code],
          amount: parseFloat(sellAmount.toFixed(2)),
          pnl: parseFloat(pnl.toFixed(2)),
        });
        shares[code] = 0;
        const idx = openPositions.findIndex((p) => p.code === code);
        if (idx >= 0) openPositions.splice(idx, 1);
      }
    }

    // ── 2. 买入：低于buyThreshold + 有可用资金 → 按百分位排序优先买最低的 ──
    const buyCandidates = codes
      .filter(
        (c) =>
          shares[c] < 0.001 &&
          percentiles[c] !== undefined &&
          percentiles[c] < buyPercentile,
      )
      .sort((a, b) => percentiles[a] - percentiles[b]);

    for (const code of buyCandidates) {
      if (activeCount >= maxPositions || cash < positionSize * 0.99) break;
      const price = pricesToday[code];
      const buyAmount = positionSize;
      shares[code] = buyAmount / price;
      cash -= buyAmount;
      activeCount++;
      openPositions.push({ code, date: dateStr, price, amount: buyAmount });
      trades.push({
        date: dateStr,
        action: "buy",
        stockCode: code,
        stockName: nameMap[code],
        price: parseFloat(price.toFixed(2)),
        shares: shares[code],
        amount: parseFloat(buyAmount.toFixed(2)),
      });
    }

    // ── 当日总资产 ──
    let totalValue = cash;
    for (const code of codes) {
      if (shares[code] > 0.001 && pricesToday[code])
        totalValue += shares[code] * pricesToday[code];
    }
    navCurve.push({
      date: dateStr,
      value: parseFloat((totalValue / initialCapital).toFixed(4)),
    });
  }

  // ── 最终资产 ──
  let finalCapital = cash;
  const lastPrice: Record<string, number | undefined> = {};
  for (const code of codes) {
    if (shares[code] > 0.001) {
      const lastTd = [...tradingDays]
        .reverse()
        .find((d) => dateIdx[code][d] !== undefined);
      if (lastTd) {
        const lp = stockPrices[code][dateIdx[code][lastTd]];
        lastPrice[code] = lp;
        finalCapital += shares[code] * lp;
      }
    }
  }

  // ── 配对交易摘要 ──
  const tradeSummary: TradeSummary[] = [];
  const grouped: Record<string, { buys: TradeRecord[]; sells: TradeRecord[] }> =
    {};
  for (const t of trades) {
    if (!grouped[t.stockCode]) grouped[t.stockCode] = { buys: [], sells: [] };
    grouped[t.stockCode][t.action === "buy" ? "buys" : "sells"].push(t);
  }
  for (const code of codes) {
    const g = grouped[code];
    if (!g) continue;
    for (const buy of g.buys) {
      const sellIdx = g.sells.findIndex((s) => s.date >= buy.date);
      if (sellIdx >= 0) {
        const sell = g.sells[sellIdx];
        g.sells[sellIdx] = g.sells[0];
        const profit = sell.amount - buy.amount;
        tradeSummary.push({
          stockCode: code,
          stockName: nameMap[code],
          buyDate: buy.date,
          buyPrice: buy.price,
          buyAmount: buy.amount,
          sellDate: sell.date,
          sellPrice: sell.price,
          sellAmount: sell.amount,
          profit: parseFloat(profit.toFixed(2)),
          profitPercent: parseFloat(((profit / buy.amount) * 100).toFixed(2)),
          status: "closed",
        });
      } else {
        const cp = lastPrice[code];
        const unrealized = cp ? (cp / buy.price - 1) * buy.amount : 0;
        tradeSummary.push({
          stockCode: code,
          stockName: nameMap[code],
          buyDate: buy.date,
          buyPrice: buy.price,
          buyAmount: buy.amount,
          sellDate: null,
          sellPrice: cp ? parseFloat(cp.toFixed(2)) : null,
          sellAmount: cp ? parseFloat((shares[code] * cp).toFixed(2)) : null,
          profit: parseFloat(unrealized.toFixed(2)),
          profitPercent: cp
            ? parseFloat((((cp - buy.price) / buy.price) * 100).toFixed(2))
            : 0,
          status: "holding",
        });
      }
    }
  }

  // ── 绩效指标 ──
  const totalReturn = (finalCapital - initialCapital) / initialCapital;
  const yearsDiff =
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  const annualizedReturn =
    yearsDiff > 0 ? Math.pow(1 + totalReturn, 1 / yearsDiff) - 1 : 0;
  const dailyReturns: number[] = [];
  for (let i = 1; i < navCurve.length; i++)
    dailyReturns.push(navCurve[i].value / navCurve[i - 1].value - 1);

  let maxDrawdown = 0,
    peak = navCurve[0]?.value || 1;
  for (const p of navCurve) {
    if (p.value > peak) peak = p.value;
    const dd = (peak - p.value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const mean =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;
  const variance =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
        dailyReturns.length
      : 0;
  const annualizedVolatility = Math.sqrt(variance) * Math.sqrt(252);
  const sharpeRatio =
    annualizedVolatility > 0
      ? (annualizedReturn - 0.02) / annualizedVolatility
      : 0;
  const sellTrades = trades.filter((t) => t.action === "sell");
  const winRate =
    sellTrades.length > 0
      ? parseFloat(
          (
            (sellTrades.filter((t) => t.pnl && t.pnl > 0).length /
              sellTrades.length) *
            100
          ).toFixed(1),
        )
      : null;

  // ── 股票价格序列（用于前端行情图）──
  const priceSeries: Record<string, PriceSeries> = {};
  for (const code of codes) {
    const data: PricePoint[] = [];
    for (const ds of tradingDays) {
      const idx = dateIdx[code][ds];
      if (idx !== undefined) {
        data.push({
          date: ds,
          price: parseFloat(stockPrices[code][idx].toFixed(2)),
        });
      }
    }
    const buySignals = trades
      .filter((t) => t.stockCode === code && t.action === "buy")
      .map((t) => ({ date: t.date, price: t.price }));
    const sellSignals = trades
      .filter((t) => t.stockCode === code && t.action === "sell")
      .map((t) => ({ date: t.date, price: t.price }));
    priceSeries[code] = { name: nameMap[code], data, buySignals, sellSignals };
  }

  return {
    strategy: req.strategy,
    initialCapital,
    finalCapital: parseFloat(finalCapital.toFixed(2)),
    totalReturn: parseFloat((totalReturn * 100).toFixed(2)),
    annualizedReturn: parseFloat((annualizedReturn * 100).toFixed(2)),
    maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
    annualizedVolatility: parseFloat((annualizedVolatility * 100).toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    totalTrades: trades.length,
    winRate,
    navCurve,
    trades,
    tradeSummary,
    priceSeries,
  };
}

// ── PE百分位月频策略 ────────────────────────────────

async function runPePercentileStrategy(
  req: BacktestRequest,
  prisma: PrismaClient,
): Promise<BacktestResult> {
  const { codes, startDate, endDate, params } = req;
  const { buyPercentile, sellPercentile, lookbackYears, initialCapital } =
    params;

  const dataStart = new Date(startDate);
  dataStart.setFullYear(dataStart.getFullYear() - lookbackYears);
  const dataStartStr = dataStart.toISOString().split("T")[0];

  // 获取PE + 价格数据
  const records = await prisma.priceRecord.findMany({
    where: { code: { in: codes }, recordedAt: { gte: new Date(dataStartStr) } },
    orderBy: [{ code: "asc" }, { recordedAt: "asc" }],
  });

  // 分组 + 构建加速结构
  const raw: Record<string, { date: Date; price: number; pe: number }[]> = {};
  const nameMap: Record<string, string> = {};
  for (const r of records) {
    if (r.peTtm == null) continue; // 跳过没有PE的日
    if (!raw[r.code]) raw[r.code] = [];
    raw[r.code].push({ date: r.recordedAt, price: r.price, pe: r.peTtm });
    nameMap[r.code] = r.name || r.code;
  }

  // 验证
  for (const code of codes) {
    if (!raw[code] || raw[code].length < 10) {
      throw new Error(`股票 ${code} 没有足够的PE数据`);
    }
  }

  // 构建排序后的日期和二分索引
  const stockDates: Record<string, string[]> = {};
  const stockPE: Record<string, number[]> = {};
  const stockPrices: Record<string, number[]> = {};
  const dateIdx: Record<string, Record<string, number>> = {};
  for (const code of codes) {
    const data = raw[code];
    const dates: string[] = [];
    const peVals: number[] = [];
    const prices: number[] = [];
    const idx: Record<string, number> = {};
    for (let i = 0; i < data.length; i++) {
      const ds = data[i].date.toISOString().split("T")[0];
      idx[ds] = i;
      dates.push(ds);
      peVals.push(data[i].pe);
      prices.push(data[i].price);
    }
    stockDates[code] = dates;
    stockPE[code] = peVals;
    stockPrices[code] = prices;
    dateIdx[code] = idx;
  }

  // 所有交易日
  const allDates = new Set<string>();
  for (const code of codes) {
    for (const ds of stockDates[code]) {
      if (ds >= startDate && ds <= endDate) allDates.add(ds);
    }
  }
  const allTradingDays = Array.from(allDates).sort();
  if (allTradingDays.length === 0)
    throw new Error("所选时间范围内没有交易日数据");

  // 按年月分组 → 取每月最后一个交易日
  const monthMap = new Map<string, string[]>();
  for (const ds of allTradingDays) {
    const ym = ds.slice(0, 7); // "2020-01"
    if (!monthMap.has(ym)) monthMap.set(ym, []);
    monthMap.get(ym)!.push(ds);
  }
  const monthlyDates: string[] = [];
  const sortedMonths = Array.from(monthMap.keys()).sort();
  for (const ym of sortedMonths) {
    const days = monthMap.get(ym)!;
    days.sort();
    monthlyDates.push(days[days.length - 1]); // 取最后一天
  }

  function lowerBound(arr: string[], target: string): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const numShares = codes.length;
  const shareCapital = initialCapital / numShares;
  const shares: Record<string, number> = {};
  const cashAccounts: Record<string, number> = {};
  for (const code of codes) {
    shares[code] = 0;
    cashAccounts[code] = shareCapital;
  }

  const openBuy: Record<
    string,
    { date: string; price: number; amount: number } | null
  > = {};
  for (const code of codes) openBuy[code] = null;

  const trades: TradeRecord[] = [];
  const navCurve: NavPoint[] = [];

  // 遍历每月最后一个交易日
  for (let ti = 0; ti < monthlyDates.length; ti++) {
    const dateStr = monthlyDates[ti];
    const currentDate = new Date(dateStr);
    const lookbackStart = new Date(currentDate);
    lookbackStart.setFullYear(lookbackStart.getFullYear() - lookbackYears);
    const ls = lookbackStart.toISOString().split("T")[0];

    // ── 计算PE百分位 ──
    const pePercentiles: Record<string, number> = {};
    const pricesToday: Record<string, number> = {};

    for (const code of codes) {
      const todayIdx = dateIdx[code][dateStr];
      if (todayIdx === undefined) continue;
      pricesToday[code] = stockPrices[code][todayIdx];

      let startIdx = dateIdx[code][ls];
      if (startIdx === undefined) startIdx = lowerBound(stockDates[code], ls);

      const sliceLen = todayIdx - startIdx + 1;
      if (sliceLen > 5) {
        const windowPE = stockPE[code].slice(startIdx, todayIdx + 1);
        windowPE.sort((a, b) => a - b);
        const currentPE = stockPE[code][todayIdx];
        const below = windowPE.filter((p) => p < currentPE).length;
        pePercentiles[code] = below / windowPE.length;
      }
    }

    // ── 按PE百分位卖出 ──
    for (const code of codes) {
      if (shares[code] > 0.001 && pePercentiles[code] !== undefined) {
        if (pePercentiles[code] > sellPercentile) {
          const price = pricesToday[code];
          const amount = shares[code] * price;
          cashAccounts[code] += amount;
          const buyInfo = openBuy[code];
          const buyPrice = buyInfo?.price || 0;
          trades.push({
            date: dateStr,
            action: "sell",
            stockCode: code,
            stockName: nameMap[code],
            price: parseFloat(price.toFixed(2)),
            shares: shares[code],
            amount: parseFloat(amount.toFixed(2)),
            pnl: parseFloat((((price - buyPrice) / buyPrice) * 100).toFixed(2)),
          });
          shares[code] = 0;
          openBuy[code] = null;
        }
      }
    }

    // ── 按PE百分位买入 ──
    for (const code of codes) {
      if (shares[code] < 0.001 && pePercentiles[code] !== undefined) {
        if (pePercentiles[code] < buyPercentile && cashAccounts[code] > 1) {
          const price = pricesToday[code];
          const buyAmount = cashAccounts[code];
          const shareCount = buyAmount / price;
          shares[code] = shareCount;
          cashAccounts[code] = 0;
          openBuy[code] = { date: dateStr, price, amount: buyAmount };
          trades.push({
            date: dateStr,
            action: "buy",
            stockCode: code,
            stockName: nameMap[code],
            price: parseFloat(price.toFixed(2)),
            shares: shareCount,
            amount: parseFloat(buyAmount.toFixed(2)),
          });
        }
      }
    }

    // ── 当日总资产 ──
    let totalValue = 0;
    for (const code of codes) {
      totalValue += cashAccounts[code];
      if (shares[code] > 0.001 && pricesToday[code]) {
        totalValue += shares[code] * pricesToday[code];
      }
    }
    navCurve.push({
      date: dateStr,
      value: parseFloat((totalValue / initialCapital).toFixed(4)),
    });
  }

  // ── 最终资产 ──
  let finalCapital = 0;
  const lastPrice: Record<string, number | undefined> = {};
  for (const code of codes) {
    finalCapital += cashAccounts[code];
    if (shares[code] > 0.001) {
      const lastTd = [...allTradingDays]
        .reverse()
        .find((d) => dateIdx[code][d] !== undefined);
      if (lastTd) {
        const lp = stockPrices[code][dateIdx[code][lastTd]];
        lastPrice[code] = lp;
        finalCapital += shares[code] * lp;
      }
    }
  }

  // ── 配对交易摘要 ──
  const tradeSummary: TradeSummary[] = [];
  const grouped: Record<string, { buys: TradeRecord[]; sells: TradeRecord[] }> =
    {};
  for (const t of trades) {
    if (!grouped[t.stockCode]) grouped[t.stockCode] = { buys: [], sells: [] };
    grouped[t.stockCode][t.action === "buy" ? "buys" : "sells"].push(t);
  }
  for (const code of codes) {
    const g = grouped[code];
    if (!g) continue;
    for (const buy of g.buys) {
      const sellIdx = g.sells.findIndex((s) => s.date >= buy.date);
      if (sellIdx >= 0) {
        const sell = g.sells[sellIdx];
        g.sells[sellIdx] = g.sells[0]; // mark used
        const profit = sell.amount - buy.amount;
        tradeSummary.push({
          stockCode: code,
          stockName: nameMap[code],
          buyDate: buy.date,
          buyPrice: buy.price,
          buyAmount: buy.amount,
          sellDate: sell.date,
          sellPrice: sell.price,
          sellAmount: sell.amount,
          profit: parseFloat(profit.toFixed(2)),
          profitPercent: parseFloat(((profit / buy.amount) * 100).toFixed(2)),
          status: "closed",
        });
      } else {
        const currentPrice = lastPrice[code];
        const unrealized = currentPrice
          ? (currentPrice / buy.price - 1) * buy.amount
          : 0;
        tradeSummary.push({
          stockCode: code,
          stockName: nameMap[code],
          buyDate: buy.date,
          buyPrice: buy.price,
          buyAmount: buy.amount,
          sellDate: null,
          sellPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
          sellAmount: currentPrice
            ? parseFloat((shares[code] * currentPrice).toFixed(2))
            : null,
          profit: parseFloat(unrealized.toFixed(2)),
          profitPercent: currentPrice
            ? parseFloat(
                (((currentPrice - buy.price) / buy.price) * 100).toFixed(2),
              )
            : 0,
          status: "holding",
        });
      }
    }
  }

  // ── 绩效指标 ──
  const totalReturn = (finalCapital - initialCapital) / initialCapital;
  const yearsDiff =
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  const annualizedReturn =
    yearsDiff > 0 ? Math.pow(1 + totalReturn, 1 / yearsDiff) - 1 : 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < navCurve.length; i++) {
    dailyReturns.push(navCurve[i].value / navCurve[i - 1].value - 1);
  }

  let maxDrawdown = 0;
  let peak = navCurve[0]?.value || 1;
  for (const p of navCurve) {
    if (p.value > peak) peak = p.value;
    const dd = (peak - p.value) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const mean =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;
  const variance =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) /
        dailyReturns.length
      : 0;
  const annualizedVolatility = Math.sqrt(variance) * Math.sqrt(12); // 月频用sqrt(12)
  const sharpeRatio =
    annualizedVolatility > 0
      ? (annualizedReturn - 0.02) / annualizedVolatility
      : 0;

  const sellTrades = trades.filter((t) => t.action === "sell");
  const winRate =
    sellTrades.length > 0
      ? parseFloat(
          (
            (sellTrades.filter((t) => t.pnl && t.pnl > 0).length /
              sellTrades.length) *
            100
          ).toFixed(1),
        )
      : null;

  // ── 股票价格序列（用于前端行情图）──
  const priceSeries: Record<string, PriceSeries> = {};
  for (const code of codes) {
    const data: PricePoint[] = [];
    for (const ds of allTradingDays) {
      const idx = dateIdx[code][ds];
      if (idx !== undefined) {
        data.push({
          date: ds,
          price: parseFloat(stockPrices[code][idx].toFixed(2)),
        });
      }
    }
    const buySignals = trades
      .filter((t) => t.stockCode === code && t.action === "buy")
      .map((t) => ({ date: t.date, price: t.price }));
    const sellSignals = trades
      .filter((t) => t.stockCode === code && t.action === "sell")
      .map((t) => ({ date: t.date, price: t.price }));
    priceSeries[code] = { name: nameMap[code], data, buySignals, sellSignals };
  }

  return {
    strategy: req.strategy,
    initialCapital,
    finalCapital: parseFloat(finalCapital.toFixed(2)),
    totalReturn: parseFloat((totalReturn * 100).toFixed(2)),
    annualizedReturn: parseFloat((annualizedReturn * 100).toFixed(2)),
    maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
    annualizedVolatility: parseFloat((annualizedVolatility * 100).toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    totalTrades: trades.length,
    winRate,
    navCurve,
    trades,
    tradeSummary,
    priceSeries,
  };
}

// ── 导入股票 ──────────────────────────────────────────
router.post("/api/import-stock", async (ctx) => {
  try {
    const { code } = ctx.request.body as { code: string };
    if (!code || !/^\d{6}$/.test(code)) {
      ctx.status = 400;
      ctx.body = { error: "请输入有效的6位股票代码" };
      return;
    }

    // 查数据库是否已有记录
    const count = await prisma.priceRecord.count({ where: { code } });
    if (count > 0) {
      // 自动加入个人股票列表（如果尚未加入）
      await prisma.userStock.upsert({
        where: { code },
        update: {},
        create: { code, name: code },
      });
      ctx.body = {
        exists: true,
        message: `股票 ${code} 已在数据库中（${count}条记录）`,
        count,
      };
      return;
    }

    // 调用 Python 获取近十年数据
    const scriptDir = "/Users/leo/Desktop/理财/股票管理系统/aiquant";
    const startYear = new Date().getFullYear() - 9;
    const startDate = `${startYear}-01-01`;
    const cmd = `uv run python scripts/import_history.py --code ${code} --name ${code} --start-date ${startDate}`;
    console.log(`[import] 执行: cd ${scriptDir} && ${cmd}`);

    const { stdout } = await execAsync(cmd, {
      cwd: scriptDir,
      timeout: 120000,
    });
    const output = stdout;
    console.log(`[import] 输出:\n${output}`);

    // 再次检查入库记录数
    const newCount = await prisma.priceRecord.count({ where: { code } });

    // 自动加入个人股票列表
    await prisma.userStock.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });

    ctx.body = {
      exists: false,
      message: `股票 ${code} 导入成功，共 ${newCount} 条记录`,
      count: newCount,
      output: output.split("\n").filter((l: string) => l.trim()),
    };
  } catch (e: any) {
    console.error("[import] 错误:", e.message || e);
    if (e.stderr)
      console.error("[import] stderr:", (e.stderr as string).slice(0, 500));
    if (e.stdout)
      console.error("[import] stdout:", (e.stdout as string).slice(0, 200));
    ctx.status = 500;
    ctx.body = { error: `导入失败: ${e.message || e}` };
  }
});

// 策略路由
router.post("/api/backtest", async (ctx) => {
  try {
    const body = ctx.request.body as BacktestRequest;
    if (!body.codes || body.codes.length === 0) {
      ctx.status = 400;
      ctx.body = { error: "请至少选择一只股票" };
      return;
    }
    if (!body.startDate || !body.endDate) {
      ctx.status = 400;
      ctx.body = { error: "请选择回测时间范围" };
      return;
    }

    let result: BacktestResult;
    switch (body.strategy) {
      case "percentile":
        result = await runPercentileStrategy(body, prisma);
        break;
      case "pe_percentile":
        result = await runPePercentileStrategy(body, prisma);
        break;
      default:
        result = await runPercentileStrategy(body, prisma);
        break;
    }

    ctx.body = result;
  } catch (e: any) {
    ctx.status = 400;
    ctx.body = { error: e.message || "回测运行失败" };
  }
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
