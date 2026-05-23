import { useEffect, useState, useMemo } from "react";
import { Card, Select, Spin, Row, Col, Progress, Tag } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api } from "../services/api";
import type { PriceRecord, StockInfo } from "../services/api";

export default function StockList() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<string>("1y");
  const [loading, setLoading] = useState(true);

  const rangeMap: Record<string, number> = {
    "1m": 22,
    "3m": 66,
    "6m": 125,
    "1y": 250,
    "3y": 750,
    "5y": 1000,
  };

  const rangeOptions = [
    { label: "1 个月", value: "1m" },
    { label: "3 个月", value: "3m" },
    { label: "半年", value: "6m" },
    { label: "1 年", value: "1y" },
    { label: "3 年", value: "3y" },
    { label: "5 年", value: "5y" },
  ];

  useEffect(() => {
    api.getStocks().then((res) => {
      setStocks(res);
      if (res.length > 0) setSelectedCode(res[0].code);
    });
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    setLoading(true);
    const limit = rangeMap[dateRange] || 250;
    api.getPriceRecords(selectedCode, limit).then((res) => {
      setRecords(res.reverse());
      setLoading(false);
    });
  }, [selectedCode, dateRange]);

  const chartData = useMemo(() => {
    if (records.length === 0) return [];
    const prices = records.map((r) => r.price);

    const ma = (period: number) => {
      const result: (number | null)[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
          result.push(null);
        } else {
          let sum = 0;
          for (let j = i - period + 1; j <= i; j++) sum += prices[j];
          result.push(parseFloat((sum / period).toFixed(2)));
        }
      }
      return result;
    };

    const ma5 = ma(5);
    const ma20 = ma(20);
    const ma60 = ma(60);

    return records.map((r, i) => ({
      time: new Date(r.recordedAt).toLocaleDateString(),
      price: r.price,
      MA5: ma5[i],
      MA20: ma20[i],
      MA60: ma60[i],
    }));
  }, [records]);

  const latest = records[records.length - 1];
  const latestMA5 = chartData[chartData.length - 1]?.MA5;
  const latestMA20 = chartData[chartData.length - 1]?.MA20;
  const latestMA60 = chartData[chartData.length - 1]?.MA60;

  const signal = (() => {
    if (!latest || !latestMA5 || !latestMA20) return null;
    const p = latest.price;
    if (p > latestMA5 && p > latestMA20)
      return { label: "多头趋势", color: "green" };
    if (p < latestMA5 && p < latestMA20)
      return { label: "空头趋势", color: "red" };
    return { label: "震荡整理", color: "orange" };
  })();

  return (
    <div>
      <Card title="📈 股价走势" style={{ marginBottom: 24, borderRadius: 8 }}>
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Select
            style={{ width: 240 }}
            placeholder="选择股票"
            value={selectedCode}
            onChange={setSelectedCode}
            options={stocks.map((s) => ({
              label: `${s.code} ${s.name}`,
              value: s.code,
            }))}
          />
          <Select
            style={{ width: 150 }}
            placeholder="选择日期"
            value={dateRange}
            onChange={setDateRange}
            options={rangeOptions}
          />
          {signal && (
            <Tag
              color={signal.color}
              style={{ fontSize: 13, padding: "2px 12px" }}
            >
              {signal.label}
            </Tag>
          )}
        </div>
        <div style={{ marginBottom: 8, color: "#999", fontSize: 12 }}>
          🟠 MA5 &nbsp;🟣 MA20 &nbsp;🔵 MA60 &nbsp;&nbsp;|&nbsp;&nbsp; 多头排列
          = 价格 &gt; MA5 &gt; MA20 &gt; MA60
        </div>

        {loading ? (
          <Spin style={{ display: "block", marginTop: 40 }} />
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" fontSize={12} />
              <YAxis domain={["auto", "auto"]} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#1890ff"
                strokeWidth={2}
                dot={false}
                name="收盘价"
              />
              <Line
                type="monotone"
                dataKey="MA5"
                stroke="#fa8c16"
                strokeWidth={1.5}
                dot={false}
                name="MA5"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="MA20"
                stroke="#722ed1"
                strokeWidth={1.5}
                dot={false}
                name="MA20"
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="MA60"
                stroke="#13c2c2"
                strokeWidth={1.5}
                dot={false}
                name="MA60"
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="📊 价格分布" style={{ borderRadius: 8, marginBottom: 24 }}>
        {loading ? (
          <Spin style={{ display: "block", marginTop: 40 }} />
        ) : (
          <PriceDistribution records={records} />
        )}
      </Card>
    </div>
  );
}

function calcBuckets(prices: number[]) {
  if (prices.length === 0) return [];
  const min = Math.floor(Math.min(...prices) * 10) / 10;
  const max = Math.ceil(Math.max(...prices) * 10) / 10;
  const range = max - min;
  const bucketCount = Math.min(6, Math.max(4, Math.round(range / 0.8)));
  const step = Math.ceil((range / bucketCount) * 20) / 20;

  const buckets: { label: string; lo: number; hi: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = min + i * step;
    const hi = lo + step;
    buckets.push({ label: `${lo.toFixed(1)}-${hi.toFixed(1)}`, lo, hi });
  }
  return buckets;
}

function countInBucket(
  prices: number[],
  lo: number,
  hi: number,
  isLast: boolean,
) {
  return prices.filter((p) => p >= lo && (isLast ? p <= hi : p < hi)).length;
}

function PriceDistribution({ records: all }: { records: PriceRecord[] }) {
  const prices = all.map((r) => r.price);
  const buckets = calcBuckets(prices);

  const colors = [
    "#1890ff",
    "#52c41a",
    "#faad14",
    "#ff4d4f",
    "#722ed1",
    "#13c2c2",
  ];

  return (
    <Row gutter={[16, 16]}>
      {buckets.map((b, i) => {
        const cnt = countInBucket(prices, b.lo, b.hi, i === buckets.length - 1);
        const pct = Math.round((cnt / prices.length) * 100);
        return (
          <Col
            key={i}
            xs={12}
            sm={8}
            md={6}
            lg={4}
            style={{ textAlign: "center" }}
          >
            <Progress
              type="circle"
              percent={pct}
              size={100}
              strokeColor={colors[i % colors.length]}
              format={() => `${pct}%`}
            />
            <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
              {b.label}
            </div>
            <div style={{ fontSize: 11, color: "#999" }}>{cnt} 个交易日</div>
          </Col>
        );
      })}
    </Row>
  );
}
