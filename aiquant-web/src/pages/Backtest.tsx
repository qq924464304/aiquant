import { useState, useEffect } from "react";
import dayjs from "dayjs";
import {
  Card,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Table,
  Spin,
  Tag,
  Row,
  Col,
  Statistic,
  message,
  Divider,
  Empty,
} from "antd";
import {
  LineChart,
  Line,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { api } from "../services/api";
import type {
  BacktestResult,
  TradeRecord,
  NavPoint,
  PricePoint,
  PriceSeries,
} from "../services/api";

const { RangePicker } = DatePicker;

/* ── 类型定义 ── */

interface BacktestParams {
  buyPercentile: number; // 买入百分位 0-1
  sellPercentile: number; // 卖出百分位 0-1
  lookbackYears: number; // 回溯年数
  initialCapital: number; // 初始资金
}

// TradeSummary 不在 api.ts 导出，本地定义
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

/* ── 策略定义（可扩展） ── */
const STRATEGIES = [
  {
    key: "percentile",
    label: "策略1: 价格百分位买卖",
    desc: "等分资金，低于P%买入，高于P%卖出，按日交易",
  },
  {
    key: "pe_percentile",
    label: "策略2: PE百分位买卖",
    desc: "以PE历史百分位判断估值，低于P%买入、高于P%卖出，按月交易",
  },
];

/* ── 主要组件 ── */

export default function Backtest() {
  // 股票列表
  const [stocks, setStocks] = useState<{ code: string; name: string }[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);

  // 表单状态
  const [strategy, setStrategy] = useState("percentile");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[string, string]>([
    "2020-01-01",
    "2026-05-23",
  ]);
  const [params, setParams] = useState<BacktestParams>({
    buyPercentile: 0.2,
    sellPercentile: 0.8,
    lookbackYears: 5,
    initialCapital: 1000000,
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载股票列表
  useEffect(() => {
    api.getStocks().then((list) => {
      setStocks(list);
      setLoadingStocks(false);
      setSelectedCodes(list.slice(0, 4).map((s) => s.code));
    });
  }, []);

  const handleRun = async () => {
    if (selectedCodes.length === 0) {
      message.warning("请选择至少一只股票");
      return;
    }
    if (!dateRange) {
      message.warning("请选择回测时间范围");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.runBacktest({
        strategy,
        codes: selectedCodes,
        startDate: dateRange[0],
        endDate: dateRange[1],
        params,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || "回测运行失败");
    } finally {
      setRunning(false);
    }
  };

  /* ── 交易记录列 ── */
  const tradeColumns = [
    {
      title: "日期",
      dataIndex: "date",
      key: "date",
      width: 110,
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      width: 60,
      render: (v: string) =>
        v === "buy" ? (
          <Tag color="green">买入</Tag>
        ) : (
          <Tag color="red">卖出</Tag>
        ),
    },
    {
      title: "股票",
      key: "stock",
      width: 120,
      render: (_: any, r: TradeRecord) => `${r.stockName} (${r.stockCode})`,
    },
    {
      title: "价格",
      dataIndex: "price",
      key: "price",
      width: 80,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: "金额",
      dataIndex: "amount",
      key: "amount",
      width: 120,
      render: (v: number) =>
        `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
    },
    {
      title: "盈亏",
      dataIndex: "pnl",
      key: "pnl",
      width: 80,
      render: (v: number | undefined | null) =>
        v !== undefined && v !== null ? (
          <span style={{ color: v >= 0 ? "#52c41a" : "#ff4d4f" }}>
            {v >= 0 ? "+" : ""}
            {v}%
          </span>
        ) : (
          "--"
        ),
    },
  ];

  return (
    <div>
      {/* ── 策略配置卡片 ── */}
      <Card title="⚙️ 策略配置" style={{ borderRadius: 8, marginBottom: 16 }}>
        <Row gutter={[16, 12]}>
          <Col span={8}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>策略选择</div>
            <Select
              value={strategy}
              onChange={setStrategy}
              style={{ width: "100%" }}
              options={STRATEGIES.map((s) => ({
                label: s.label,
                value: s.key,
              }))}
            />
            <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              {STRATEGIES.find((s) => s.key === strategy)?.desc}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>股票选择</div>
            <Select
              mode="multiple"
              value={selectedCodes}
              onChange={setSelectedCodes}
              style={{ width: "100%" }}
              loading={loadingStocks}
              placeholder="搜索并选择股票..."
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)
                  ?.toLowerCase()
                  .includes(input.toLowerCase()) ?? true
              }
              options={stocks.map((s) => ({
                label: `${s.name} (${s.code})`,
                value: s.code,
              }))}
            />
          </Col>
          <Col span={8}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>回测时间</div>
            <RangePicker
              style={{ width: "100%" }}
              placeholder={["开始日期", "结束日期"]}
              picker="month"
              // defaultValue={[dayjs("2020-01-01"), dayjs("2026-05-23")]}
              onChange={(_, dateStrings) => {
                if (dateStrings[0] && dateStrings[1]) {
                  setDateRange([dateStrings[0], dateStrings[1]]);
                } else {
                  setDateRange(null);
                }
              }}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>买入百分位</div>
            <InputNumber
              value={params.buyPercentile}
              onChange={(v) =>
                setParams({ ...params, buyPercentile: v ?? 0.2 })
              }
              min={0.01}
              max={0.5}
              step={0.05}
              style={{ width: "100%" }}
              formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
              parser={(v) => Number(v?.replace("%", "")) / 100}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>卖出百分位</div>
            <InputNumber
              value={params.sellPercentile}
              onChange={(v) =>
                setParams({ ...params, sellPercentile: v ?? 0.8 })
              }
              min={0.5}
              max={0.99}
              step={0.05}
              style={{ width: "100%" }}
              formatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
              parser={(v) => Number(v?.replace("%", "")) / 100}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>回溯窗口</div>
            <Select
              value={params.lookbackYears}
              onChange={(v) => setParams({ ...params, lookbackYears: v })}
              style={{ width: "100%" }}
              options={[
                { label: "3年", value: 3 },
                { label: "5年", value: 5 },
                { label: "10年", value: 10 },
              ]}
            />
          </Col>
          <Col span={6}>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>初始资金</div>
            <InputNumber
              value={params.initialCapital}
              onChange={(v) =>
                setParams({ ...params, initialCapital: v ?? 1000000 })
              }
              min={10000}
              max={100000000}
              step={100000}
              style={{ width: "100%" }}
              formatter={(v) => `¥ ${Number(v).toLocaleString("zh-CN")}`}
              parser={(v) => Number(v?.replace(/[¥,\s]/g, ""))}
            />
          </Col>
          <Col span={24} style={{ textAlign: "center", marginTop: 8 }}>
            <Button
              type="primary"
              size="large"
              loading={running}
              onClick={handleRun}
              style={{ minWidth: 180 }}
            >
              {running ? "回测计算中..." : "▶ 运行回测"}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── 加载中 ── */}
      {running && (
        <Card style={{ borderRadius: 8, textAlign: "center", padding: 48 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: "#999" }}>
            正在计算回测结果...
          </div>
        </Card>
      )}

      {/* ── 错误提示 ── */}
      {error && (
        <Card style={{ borderRadius: 8 }}>
          <div style={{ color: "#ff4d4f", textAlign: "center" }}>
            ❌ {error}
          </div>
        </Card>
      )}

      {/* ── 回测结果 ── */}
      {result && (
        <>
          {/* 绩效指标 */}
          <Card
            title="📊 绩效指标"
            style={{ borderRadius: 8, marginBottom: 16 }}
          >
            <Row gutter={[16, 16]}>
              <Col span={4}>
                <Statistic
                  title="总收益率"
                  value={result.totalReturn}
                  suffix="%"
                  precision={2}
                  valueStyle={{
                    color: result.totalReturn >= 0 ? "#52c41a" : "#ff4d4f",
                  }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="年化收益率"
                  value={result.annualizedReturn}
                  suffix="%"
                  precision={2}
                  valueStyle={{
                    color: result.annualizedReturn >= 0 ? "#52c41a" : "#ff4d4f",
                  }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="最大回撤"
                  value={result.maxDrawdown}
                  suffix="%"
                  precision={2}
                  valueStyle={{ color: "#faad14" }}
                />
              </Col>

              <Col span={4}>
                <Statistic
                  title="年化波动率"
                  value={result.annualizedVolatility}
                  suffix="%"
                  precision={2}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="交易次数"
                  value={result.totalTrades}
                  suffix={`次${result.winRate !== null ? ` (胜率${result.winRate}%)` : ""}`}
                />
              </Col>
            </Row>
            <Divider />
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Statistic
                  title="初始资金"
                  value={result.initialCapital}
                  prefix="¥"
                  precision={0}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="最终价值"
                  value={result.finalCapital}
                  prefix="¥"
                  precision={0}
                  valueStyle={{
                    color:
                      result.finalCapital >= result.initialCapital
                        ? "#52c41a"
                        : "#ff4d4f",
                  }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="总盈亏"
                  value={result.finalCapital - result.initialCapital}
                  prefix={
                    result.finalCapital >= result.initialCapital ? "+¥" : "-¥"
                  }
                  precision={0}
                  valueStyle={{
                    color:
                      result.finalCapital >= result.initialCapital
                        ? "#52c41a"
                        : "#ff4d4f",
                  }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="胜率"
                  value={result.winRate ?? "--"}
                  suffix={result.winRate !== null ? "%" : ""}
                  precision={1}
                />
              </Col>
            </Row>
          </Card>

          {/* 净值曲线 */}
          <Card
            title="📈 净值曲线"
            style={{ borderRadius: 8, marginBottom: 16 }}
          >
            {result.navCurve.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={result.navCurve}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    fontSize={11}
                    tickFormatter={(v: string) => v.slice(2)} // 显示 YY-MM-DD
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    fontSize={12}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${(value * 100).toFixed(2)}%`,
                      "净值",
                    ]}
                    labelFormatter={(label: string) => `日期: ${label}`}
                  />
                  <ReferenceLine y={1} stroke="#d9d9d9" strokeDasharray="5 5" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#1890ff"
                    strokeWidth={2}
                    dot={false}
                    name="组合净值"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="无净值数据" />
            )}
          </Card>

          {/* 个股行情图（嵌入买卖标记） */}
          {result.priceSeries &&
            Object.entries(result.priceSeries).map(([code, series]) => {
              const buyData = series.buySignals.map((p: PricePoint) => ({
                date: p.date,
                price: p.price,
              }));
              const sellData = series.sellSignals.map((p: PricePoint) => ({
                date: p.date,
                price: p.price,
              }));
              return (
                <Card
                  key={code}
                  title={`📈 ${series.name} (${code}) 行情与买卖点`}
                  style={{ borderRadius: 8, marginBottom: 16 }}
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={series.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        fontSize={11}
                        tickFormatter={(v: string) => v.slice(2)}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        fontSize={12}
                        tickFormatter={(v: number) => `¥${v.toFixed(0)}`}
                      />
                      <Tooltip
                        formatter={(value: unknown, name: string) => [
                          typeof value === "number"
                            ? `¥${value.toFixed(2)}`
                            : String(value),
                          name === "price" ? "价格" : name,
                        ]}
                      />
                      {/* 价格走势线 */}
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#1890ff"
                        strokeWidth={1.5}
                        dot={false}
                        name="价格"
                      />
                      {/* 买入标记 */}
                      {buyData.length > 0 && (
                        <Scatter
                          data={buyData}
                          dataKey="price"
                          fill="#52c41a"
                          shape="triangle"
                          name={`买入 (${buyData.length}次)`}
                        />
                      )}
                      {/* 卖出标记 */}
                      {sellData.length > 0 && (
                        <Scatter
                          data={sellData}
                          dataKey="price"
                          fill="#ff4d4f"
                          shape="triangle"
                          name={`卖出 (${sellData.length}次)`}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                  {buyData.length === 0 && sellData.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        color: "#999",
                        padding: 16,
                      }}
                    >
                      策略期间未触发任何买卖信号
                    </div>
                  )}
                </Card>
              );
            })}

          {/* 配对交易摘要 */}
          <Card
            title="📋 配对交易明细"
            style={{ borderRadius: 8, marginBottom: 16 }}
          >
            {result.tradeSummary.length > 0 ? (
              <Table
                dataSource={result.tradeSummary}
                rowKey={(r) => `${r.stockCode}-${r.buyDate}`}
                pagination={false}
                size="small"
                columns={[
                  {
                    title: "股票",
                    key: "stock",
                    width: 100,
                    render: (_, r) => r.stockName,
                  },
                  {
                    title: "状态",
                    dataIndex: "status",
                    width: 70,
                    render: (v: string) =>
                      v === "closed" ? (
                        <Tag color="green">已平仓</Tag>
                      ) : (
                        <Tag color="blue">持仓</Tag>
                      ),
                  },
                  {
                    title: "买入日",
                    dataIndex: "buyDate",
                    width: 100,
                  },
                  {
                    title: "买入价",
                    dataIndex: "buyPrice",
                    width: 80,
                    render: (v: number) => `¥${v.toFixed(2)}`,
                  },
                  {
                    title: "买入金额",
                    dataIndex: "buyAmount",
                    width: 110,
                    render: (v: number) =>
                      `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
                  },
                  {
                    title: "卖出日",
                    dataIndex: "sellDate",
                    width: 100,
                    render: (v: string | null) => v || "-",
                  },
                  {
                    title: "卖出价",
                    dataIndex: "sellPrice",
                    width: 80,
                    render: (v: number | null) =>
                      v !== null ? `¥${v.toFixed(2)}` : "-",
                  },
                  {
                    title: "盈亏金额",
                    dataIndex: "profit",
                    width: 120,
                    render: (v: number) => (
                      <span
                        style={{
                          color: v >= 0 ? "#52c41a" : "#ff4d4f",
                          fontWeight: 600,
                        }}
                      >
                        {v >= 0 ? "+" : ""}¥
                        {v.toLocaleString("zh-CN", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    ),
                  },
                  {
                    title: "收益率",
                    dataIndex: "profitPercent",
                    width: 80,
                    render: (v: number) => (
                      <span
                        style={{
                          color: v >= 0 ? "#52c41a" : "#ff4d4f",
                          fontWeight: 600,
                        }}
                      >
                        {v >= 0 ? "+" : ""}
                        {v.toFixed(2)}%
                      </span>
                    ),
                  },
                ]}
              />
            ) : (
              <Empty description="无交易记录" />
            )}
          </Card>

          {/* 交易记录 */}
          <Card title="📋 交易记录" style={{ borderRadius: 8 }}>
            {result.trades.length > 0 ? (
              <Table
                dataSource={result.trades}
                columns={tradeColumns}
                rowKey={(r, i) => `${r.date}-${r.action}-${r.stockCode}-${i}`}
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description="无交易记录（未触发任何买卖信号）" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
