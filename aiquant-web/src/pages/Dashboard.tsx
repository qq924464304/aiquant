import { useEffect, useState, useMemo } from "react";
import {
  Card,
  Table,
  Spin,
  Tag,
  Drawer,
  Tabs,
  Button,
  Switch,
  Select,
  Progress,
  Input,
  message,
} from "antd";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "../services/api";
import type { LatestPrice, FinancialRecord } from "../services/api";

function FinancialDrawer({ records }: { records: FinancialRecord[] }) {
  /**
   * useState(初始值) 相当于 class 中的 this.state = { showAllQuarters: false }
   * setShowAllQuarters(新值) 相当于 this.setState({ showAllQuarters: 新值 })
   * 区别：hooks 是函数式组件，没有 this，变量直接可用
   */
  const [showAllQuarters, setShowAllQuarters] = useState(false);

  // 默认只看年报(quarter=4)，可选查看全部季度
  const filtered = useMemo(() => {
    const list = showAllQuarters
      ? records
      : records.filter((r) => r.quarter === 4);
    return [...list].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  }, [records, showAllQuarters]);

  // 季度列定义
  const quarterLabels: Record<number, string> = {
    1: "Q1",
    2: "中报",
    3: "Q3",
    4: "年报",
  };

  // 利润表指标
  const profitColumns = [
    { title: "年份", dataIndex: "year", key: "year", width: 60 },
    {
      title: "季度",
      dataIndex: "quarter",
      key: "quarter",
      width: 60,
      render: (v: number) => quarterLabels[v] || `Q${v}`,
    },
    {
      title: "ROE(%) 净资产收益率",
      dataIndex: "roeAvg",
      key: "roeAvg",
      width: 140,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "净利率(%)",
      dataIndex: "npMargin",
      key: "npMargin",
      width: 100,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "毛利率(%)",
      dataIndex: "gpMargin",
      key: "gpMargin",
      width: 100,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "净利润(亿)",
      dataIndex: "netProfit",
      key: "netProfit",
      width: 110,
      render: (v: number | null) =>
        v !== null ? `${(v / 1e8).toFixed(2)}亿` : "--",
    },
    {
      title: "每股收益",
      dataIndex: "epsTtm",
      key: "epsTtm",
      width: 90,
      render: (v: number | null) => (v !== null ? v.toFixed(4) : "--"),
    },
    {
      title: "营收(亿)",
      dataIndex: "mbRevenue",
      key: "mbRevenue",
      width: 100,
      render: (v: number | null) =>
        v !== null ? `${(v / 1e8).toFixed(2)}亿` : "--",
    },
  ];

  // 成长能力指标
  const growthColumns = [
    { title: "年份", dataIndex: "year", key: "year", width: 60 },
    {
      title: "季度",
      dataIndex: "quarter",
      key: "quarter",
      width: 60,
      render: (v: number) => quarterLabels[v] || `Q${v}`,
    },

    {
      title: "净利润同比(%)",
      dataIndex: "yoyNi",
      key: "yoyNi",
      width: 130,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "扣非净利润同比(%)",
      dataIndex: "yoyPni",
      key: "yoyPni",
      width: 150,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "基本每股收益同比(%)",
      dataIndex: "yoyEpsBasic",
      key: "yoyEpsBasic",
      width: 160,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "净资产同比(%)",
      dataIndex: "yoyEquity",
      key: "yoyEquity",
      width: 130,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "总资产同比(%)",
      dataIndex: "yoyAsset",
      key: "yoyAsset",
      width: 130,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
  ];

  // 资产负债表指标
  const balanceColumns = [
    { title: "年份", dataIndex: "year", key: "year", width: 60 },
    {
      title: "季度",
      dataIndex: "quarter",
      key: "quarter",
      width: 60,
      render: (v: number) => quarterLabels[v] || `Q${v}`,
    },
    {
      title: "资产负债率(%)",
      key: "debtRatio",
      width: 130,
      render: (_: any, r: FinancialRecord) => {
        if (r.assetToEquity != null) {
          const ratio = (1 - 1 / r.assetToEquity) * 100;
          return `${ratio.toFixed(2)}%`;
        }
        return "--";
      },
    },
    {
      title: "流动比率",
      dataIndex: "currentRatio",
      key: "currentRatio",
      width: 100,
      render: (v: number | null) => (v !== null ? v.toFixed(2) : "--"),
    },
    {
      title: "速动比率",
      dataIndex: "quickRatio",
      key: "quickRatio",
      width: 100,
      render: (v: number | null) => (v !== null ? v.toFixed(2) : "--"),
    },
    {
      title: "现金比率",
      dataIndex: "cashRatio",
      key: "cashRatio",
      width: 100,
      render: (v: number | null) => (v !== null ? v.toFixed(2) : "--"),
    },
    {
      title: "权益乘数",
      dataIndex: "assetToEquity",
      key: "assetToEquity",
      width: 100,
      render: (v: number | null) => (v !== null ? v.toFixed(2) : "--"),
    },
  ];

  // 现金流量表指标
  const cashFlowColumns = [
    { title: "年份", dataIndex: "year", key: "year", width: 60 },
    {
      title: "季度",
      dataIndex: "quarter",
      key: "quarter",
      width: 60,
      render: (v: number) => quarterLabels[v] || `Q${v}`,
    },
    {
      title: "经营现金流/营收(%)",
      dataIndex: "cfoToOr",
      key: "cfoToOr",
      width: 150,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "经营现金流/净利润(%)",
      dataIndex: "cfoToNp",
      key: "cfoToNp",
      width: 170,
      render: (v: number | null) =>
        v !== null ? `${(v * 100).toFixed(2)}%` : "--",
    },
    {
      title: "利息保障倍数",
      dataIndex: "ebitToInterest",
      key: "ebitToInterest",
      width: 130,
      render: (v: number | null) => (v !== null ? v.toFixed(2) : "--"),
    },
  ];

  const items = [
    {
      key: "profit",
      label: "📋 利润表",
      children: (
        <Table
          dataSource={filtered}
          columns={profitColumns}
          rowKey={(r) => `${r.year}-${r.quarter}`}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
        />
      ),
    },
    {
      key: "growth",
      label: "📈 成长能力",
      children: (
        <Table
          dataSource={filtered}
          columns={growthColumns}
          rowKey={(r) => `${r.year}-${r.quarter}`}
          pagination={false}
          size="small"
          scroll={{ x: 750 }}
        />
      ),
    },
    {
      key: "balance",
      label: "🏦 资产负债表",
      children: (
        <Table
          dataSource={filtered}
          columns={balanceColumns}
          rowKey={(r) => `${r.year}-${r.quarter}`}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
        />
      ),
    },
    {
      key: "cashflow",
      label: "💵 现金流量表",
      children: (
        <Table
          dataSource={filtered}
          columns={cashFlowColumns}
          rowKey={(r) => `${r.year}-${r.quarter}`}
          pagination={false}
          size="small"
          scroll={{ x: 650 }}
        />
      ),
    },
  ];

  if (records.length === 0) {
    return <div style={{ padding: 24, color: "#999" }}>暂无财务数据</div>;
  }

  return (
    <div>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Switch
          checked={showAllQuarters}
          onChange={setShowAllQuarters}
          size="small"
        />
        <span style={{ fontSize: 13, color: "#666" }}>
          {showAllQuarters ? "显示全部季度" : "仅看年报"}
        </span>
      </div>
      <Tabs items={items} />
    </div>
  );
}

const COMPARE_COLORS = ["#1890ff", "#52c41a", "#fa8c16"];

function StockCompare({
  stocks,
  finRecordMap,
}: {
  stocks: LatestPrice[];
  finRecordMap: Record<string, FinancialRecord[]>;
}) {
  // class: this.state = { selectedCodes: [], metricKey: "roeAvg", chartData: [], loading: false }
  // 这里用 4 个独立的 useState，而不是 1 个对象，好处：更新某个值不会影响其他值，也更简洁
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]); // 多选选中的股票代码列表
  const [metricKey, setMetricKey] = useState<string>("roeAvg"); // 当前选择的对比指标
  const [chartData, setChartData] = useState<any[]>([]); // 对比图表渲染数据
  const [loading, setLoading] = useState(false); // 加载状态（Loading 按钮）

  const stockOptions = stocks.map((s) => ({
    label: `${s.code} ${s.name}`,
    value: s.code,
  }));

  const metricOptions = [
    { label: "ROE(%) 历史趋势", value: "roeAvg" },
    { label: "PE分位(%)", value: "pePercentile" },
    { label: "PB分位(%)", value: "pbPercentile" },
    { label: "价格分位(%)", value: "pricePercentile" },
  ];

  const selectedNames = selectedCodes.map(
    (c) => stocks.find((s) => s.code === c)?.name || c,
  );

  const loadCompare = async () => {
    if (selectedCodes.length < 2) return;
    setLoading(true);

    try {
      if (metricKey === "roeAvg") {
        const yearMap = new Map<string, any>();
        selectedCodes.forEach((code, idx) => {
          const name = selectedNames[idx];
          const records = finRecordMap[code] || [];
          records
            .filter((r) => r.quarter === 4 && r.roeAvg != null)
            .forEach((r) => {
              const year = String(r.year);
              if (!yearMap.has(year)) yearMap.set(year, { year });
              yearMap.get(year)![name] = parseFloat(
                (r.roeAvg! * 100).toFixed(2),
              );
            });
        });
        setChartData(
          Array.from(yearMap.values()).sort((a, b) =>
            a.year.localeCompare(b.year),
          ),
        );
      } else {
        const selected = stocks.filter((s) => selectedCodes.includes(s.code));
        const data = selected.map((s) => {
          let value: number | null = null;
          if (metricKey === "pePercentile") value = s.pePercentile;
          else if (metricKey === "pbPercentile") value = s.pbPercentile;
          else if (metricKey === "pricePercentile") {
            const range = s.sellRef - s.buyRef;
            value =
              range > 0
                ? Math.round(((s.price - s.buyRef) / range) * 100)
                : null;
          }
          return { name: s.name, value };
        });
        setChartData(data);
      }
    } catch (e) {
      console.error("对比加载失败", e);
    }
    setLoading(false);
  };

  return (
    <Card title="📊 个股对比" style={{ borderRadius: 8, marginTop: 16 }}>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Select
          mode="multiple"
          style={{ width: 320 }}
          placeholder="选择2-3只股票对比"
          value={selectedCodes}
          onChange={setSelectedCodes}
          options={stockOptions}
          maxCount={3}
        />
        <Select
          style={{ width: 170 }}
          value={metricKey}
          onChange={setMetricKey}
          options={metricOptions}
        />
        <Button
          type="primary"
          onClick={loadCompare}
          loading={loading}
          disabled={selectedCodes.length < 2}
        >
          {loading ? "加载中..." : "加载对比"}
        </Button>
      </div>

      {chartData.length > 0 && metricKey === "roeAvg" ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis />
            <Tooltip />
            <Legend />
            {selectedNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            {selectedNames.map((name, i) => (
              <Bar
                key={name}
                dataKey="value"
                name={name}
                fill={COMPARE_COLORS[i % COMPARE_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : selectedCodes.length >= 2 && !loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#999" }}>
          点击"加载对比"按钮查看图表
        </div>
      ) : null}
    </Card>
  );
}

export default function Dashboard() {
  /**
   * 以下所有 useState 等价于 class 组件中的：
   *   this.state = {
   *     data: [],          // 行情数据列表
   *     finRecordMap: {},  // 财务数据映射 { code: [...] }
   *     loading: true,     // 页面加载状态
   *     years: 5,          // 百分位计算年限
   *     drawerOpen: false, // 财务抽屉是否打开
   *     drawerStock: null, // 当前点击的股票
   *     finRecords: [],    // 当前展示的财务记录
   *     importCode: "",    // 导入输入框的代码
   *     importing: false,  // 导入中状态
   *   }
   * 区别：
   * 1. useState 把每个字段拆成独立的声明，而非一个大对象
   * 2. 调用 setXxx(新值) 即可更新，不需要写 this.setState(...)
   * 3. 组件重新渲染时，hooks 内部会自动记住上一次的状态值
   */
  const [data, setData] = useState<LatestPrice[]>([]);
  const [finRecordMap, setFinRecordMap] = useState<
    Record<string, FinancialRecord[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState(5);

  // 财务数据 Drawer 相关状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStock, setDrawerStock] = useState<LatestPrice | null>(null);
  const [finRecords, setFinRecords] = useState<FinancialRecord[]>([]);

  // 导入股票相关状态
  const [importCode, setImportCode] = useState("");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    const code = importCode.trim();
    if (!/^\d{6}$/.test(code)) {
      message.warning("请输入6位股票代码");
      return;
    }
    setImporting(true);
    try {
      const res = await api.importStock(code);
      if (res.exists) {
        message.info(res.message);
      } else {
        message.success(res.message);
        // 刷新数据
        const newData = await api.getDashboard(years);
        setData(newData.prices);
        setFinRecordMap(newData.financialRecords);
      }
    } catch (e: any) {
      message.error(e.message || "导入失败");
    }
    setImporting(false);
    setImportCode("");
  };

  useEffect(() => {
    setLoading(true);
    api.getDashboard(years).then((res) => {
      setData(res.prices);
      setFinRecordMap(res.financialRecords);
      setLoading(false);
    });
  }, [years]);

  const openFinancial = (stock: LatestPrice) => {
    setDrawerStock(stock);
    setDrawerOpen(true);
    setFinRecords(finRecordMap[stock.code] || []);
  };

  if (loading)
    return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  const avgPrice =
    data.length > 0
      ? (data.reduce((s, r) => s + r.price, 0) / data.length).toFixed(2)
      : "--";

  const columns = [
    {
      title: "代码",
      dataIndex: "code",
      key: "code",
      width: 80,
    },
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 100,
      render: (v: string, r: LatestPrice) => (
        <Button
          type="link"
          style={{ padding: 0 }}
          onClick={() => openFinancial(r)}
        >
          {v}
        </Button>
      ),
    },
    {
      title: "最新价",
      dataIndex: "price",
      key: "price",
      width: 110,
      render: (v: number, r: LatestPrice) => {
        const belowBuy = v <= r.buyRef;
        const aboveSell = v >= r.sellRef;
        return (
          <span
            style={{
              fontWeight: 700,
              color: belowBuy ? "#389e0d" : aboveSell ? "#cf1322" : "#333",
              fontSize: 15,
            }}
          >
            ¥{v.toFixed(2)}
            {belowBuy && (
              <Tag color="green" style={{ marginLeft: 4 }}>
                低于加仓价
              </Tag>
            )}
            {aboveSell && (
              <Tag color="red" style={{ marginLeft: 4 }}>
                高于减仓价
              </Tag>
            )}
          </span>
        );
      },
    },
    {
      title: "🟢 加仓参考(10%)",
      dataIndex: "buyRef",
      key: "buyRef",
      width: 130,
      render: (v: number) => (
        <span style={{ color: "#389e0d", fontWeight: 600 }}>¥{v}</span>
      ),
    },
    {
      title: "🔴 减仓参考(90%)",
      dataIndex: "sellRef",
      key: "sellRef",
      width: 130,
      render: (v: number) => (
        <span style={{ color: "#cf1322", fontWeight: 600 }}>¥{v}</span>
      ),
    },
    {
      title: "🌡️ 温度计",
      key: "thermometer",
      width: 130,
      render: (_: any, r: LatestPrice) => {
        const range = r.sellRef - r.buyRef;
        if (range <= 0) return <Tag>--</Tag>;
        const pos = Math.max(
          0,
          Math.min(100, ((r.price - r.buyRef) / range) * 100),
        );
        const score = Math.round(pos);
        let emoji: string, color: string, label: string;
        if (score <= 20) {
          emoji = "🥶";
          color = "green";
          label = "极度低估";
        } else if (score <= 40) {
          emoji = "🧊";
          color = "lime";
          label = "低估";
        } else if (score <= 60) {
          emoji = "😐";
          color = "default";
          label = "合理";
        } else if (score <= 80) {
          emoji = "🔥";
          color = "orange";
          label = "高估";
        } else {
          emoji = "♨️";
          color = "red";
          label = "极度高估";
        }
        return (
          <Tag color={color} style={{ fontSize: 13 }}>
            {score}
            {emoji} {label}
          </Tag>
        );
      },
    },
    {
      title: "日期",
      dataIndex: "recordedAt",
      key: "recordedAt",
      width: 110,
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "PE-TTM",
      dataIndex: "peTtm",
      key: "peTtm",
      width: 90,
      render: (v: number | null, r: LatestPrice) =>
        v != null ? (
          <span>
            {v.toFixed(1)}
            {r.pePercentile != null && (
              <Tag
                color={
                  r.pePercentile <= 20
                    ? "green"
                    : r.pePercentile >= 80
                      ? "red"
                      : "default"
                }
                style={{ marginLeft: 4, fontSize: 11 }}
              >
                {r.pePercentile}%
              </Tag>
            )}
          </span>
        ) : (
          "--"
        ),
    },
    {
      title: "PB",
      dataIndex: "pbMrq",
      key: "pbMrq",
      width: 90,
      render: (v: number | null, r: LatestPrice) =>
        v != null ? (
          <span>
            {v.toFixed(2)}
            {r.pbPercentile != null && (
              <Tag
                color={
                  r.pbPercentile <= 20
                    ? "green"
                    : r.pbPercentile >= 80
                      ? "red"
                      : "default"
                }
                style={{ marginLeft: 4, fontSize: 11 }}
              >
                {r.pbPercentile}%
              </Tag>
            )}
          </span>
        ) : (
          "--"
        ),
    },
  ];

  return (
    <div>
      <Card
        title="📊 实时行情"
        style={{ borderRadius: 8 }}
        extra={
          <span style={{ fontSize: 13 }}>
            百分位计算范围：
            <Select
              value={years}
              onChange={setYears}
              size="small"
              style={{ width: 80, marginLeft: 6 }}
              options={[
                { label: "1年", value: 1 },
                { label: "3年", value: 3 },
                { label: "5年", value: 5 },
                { label: "10年", value: 10 },
              ]}
            />
          </span>
        }
      >
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Input
            style={{ width: 160 }}
            placeholder="输入6位股票代码"
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            onPressEnter={handleImport}
            maxLength={6}
          />
          <Button type="primary" onClick={handleImport} loading={importing}>
            {importing ? "导入中..." : "导入股票"}
          </Button>
        </div>
        <div style={{ marginBottom: 8, color: "#999", fontSize: 12 }}>
          💡 加仓参考价 = 近{years}年价格10%分位数（价格低于此位置时适合买入）
          &nbsp;&nbsp;|&nbsp;&nbsp; 减仓参考价 = 近{years}
          年价格90%分位数（价格高于此位置时适合卖出） &nbsp;&nbsp;|&nbsp;&nbsp;
          PE/PB后的百分比 = 当前估值在近{years}
          年历史中的位置（≤20%🟢低估，≥80%🔴高估）
        </div>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="code"
          pagination={false}
          size="middle"
        />
      </Card>

      <StockCompare stocks={data} finRecordMap={finRecordMap} />

      <Drawer
        title={`📊 ${drawerStock?.name}（${drawerStock?.code}）财务数据`}
        placement="right"
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <FinancialDrawer records={finRecords} />
      </Drawer>
    </div>
  );
}
