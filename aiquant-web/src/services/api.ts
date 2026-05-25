const BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

export interface StockInfo {
  code: string;
  name: string;
}

export interface PriceRecord {
  id: number;
  code: string;
  name: string;
  price: number;
  recordedAt: string;
}

export interface AlertRecord {
  id: number;
  code: string;
  name: string;
  currentPrice: number;
  triggerPrice: number;
  message: string;
  createdAt: string;
}

export interface LatestPrice {
  code: string;
  name: string;
  price: number;
  recordedAt: string;
  buyRef: number;
  sellRef: number;
  peTtm: number | null;
  pbMrq: number | null;
  pePercentile: number | null;
  pbPercentile: number | null;
}

export interface FinancialRecord {
  code: string;
  year: number;
  quarter: number;
  // 利润表
  roeAvg: number | null;
  npMargin: number | null;
  gpMargin: number | null;
  netProfit: number | null;
  epsTtm: number | null;
  mbRevenue: number | null;
  // 成长能力
  yoyEquity: number | null;
  yoyAsset: number | null;
  yoyNi: number | null;
  yoyEpsBasic: number | null;
  yoyPni: number | null;
  // 资产负债表
  currentRatio: number | null;
  quickRatio: number | null;
  cashRatio: number | null;
  assetToEquity: number | null;
  // 现金流量表
  cfoToOr: number | null;
  cfoToNp: number | null;
  ebitToInterest: number | null;
}

export interface DashboardData {
  prices: LatestPrice[];
  financialRecords: Record<string, FinancialRecord[]>;
}

export interface EtfIndex {
  id: number;
  tsCode: string;
  indxName: string | null;
  indxCsname: string | null;
  pubPartyName: string | null;
  pubDate: string | null;
  baseDate: string | null;
  bp: number | null;
  adjCircle: string | null;
}

/* ── 回测类型 ── */

export interface BacktestRequest {
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

export interface TradeRecord {
  date: string;
  action: "buy" | "sell";
  stockCode: string;
  stockName: string;
  price: number;
  shares: number;
  amount: number;
  pnl?: number;
}

export interface NavPoint {
  date: string;
  value: number;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface PriceSeries {
  name: string;
  data: PricePoint[];
  buySignals: PricePoint[];
  sellSignals: PricePoint[];
}

export interface BacktestResult {
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
  tradeSummary: {
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
  }[];
  priceSeries: Record<string, PriceSeries>;
}

export const api = {
  /** 健康检查 */
  health: () => fetchJSON<{ name: string; version: string }>("/"),

  /** 获取股票列表 */
  getStocks: () => fetchJSON<StockInfo[]>("/stocks"),

  /** 获取价格记录 */
  getPriceRecords: (code?: string, limit = 100) =>
    fetchJSON<PriceRecord[]>(
      `/price-records?limit=${limit}${code ? `&code=${code}` : ""}`,
    ),

  /** 获取警报记录 */
  getAlertRecords: (code?: string, limit = 100) =>
    fetchJSON<AlertRecord[]>(
      `/alert-records?limit=${limit}${code ? `&code=${code}` : ""}`,
    ),

  /** 获取最新价格 */
  getLatestPrices: () => fetchJSON<LatestPrice[]>("/latest-prices"),

  /** 获取 Dashboard 聚合数据 */
  getDashboard: (years = 5) =>
    fetchJSON<DashboardData>(`/dashboard?years=${years}`),

  /** 获取财务数据 */
  getFinancialRecords: (code: string) =>
    fetchJSON<FinancialRecord[]>(`/financial-records?code=${code}`),

  /** 获取 ETF 指数列表 */
  getEtfIndices: () => fetchJSON<EtfIndex[]>("/etf-indices"),

  /** 运行回测 */
  runBacktest: async (req: BacktestRequest) => {
    const res = await fetch(`${BASE}/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<BacktestResult>;
  },

  /** 导入股票 */
  importStock: async (code: string) => {
    const res = await fetch(`${BASE}/import-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{
      exists: boolean;
      message: string;
      count: number;
      output?: string[];
    }>;
  },

  /** 获取个人股票列表 */
  getUserStocks: () => fetchJSON<StockInfo[]>("/user-stocks"),

  /** 加入个人股票 */
  addUserStock: async (code: string, name?: string) => {
    const res = await fetch(`${BASE}/user-stocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  /** 删除个人股票 */
  removeUserStock: async (code: string) => {
    const res = await fetch(`${BASE}/user-stocks/${code}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};
