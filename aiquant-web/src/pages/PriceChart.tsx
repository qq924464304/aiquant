import { useEffect, useState } from "react";
import { Card, Select, Spin, Row, Col } from "antd";
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

export default function PriceChart() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [records, setRecords] = useState<PriceRecord[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStocks().then((res) => {
      setStocks(res);
      if (res.length > 0) setSelectedCode(res[0].code);
    });
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    setLoading(true);
    api.getPriceRecords(selectedCode, 5000).then((res) => {
      setRecords(res.reverse());
      setLoading(false);
    });
  }, [selectedCode]);

  const chartData = records.map((r) => ({
    time: new Date(r.recordedAt).toLocaleDateString(),
    price: r.price,
  }));

  const prices = records.map((r) => r.price);
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const avgPrice =
    prices.length > 0
      ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
      : "--";

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card size="small" title="最高价">
            {maxPrice.toFixed(2)}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="最低价">
            {minPrice.toFixed(2)}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="均价">
            {avgPrice}
          </Card>
        </Col>
      </Row>

      <Card title="📈 价格走势图" style={{ borderRadius: 8 }}>
        <Select
          style={{ width: 240, marginBottom: 16 }}
          placeholder="选择股票"
          value={selectedCode}
          onChange={setSelectedCode}
          options={stocks.map((s) => ({
            label: `${s.code} ${s.name}`,
            value: s.code,
          }))}
        />

        {loading ? (
          <Spin style={{ display: "block", marginTop: 60 }} />
        ) : (
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" fontSize={11} />
              <YAxis domain={["auto", "auto"]} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#1890ff"
                strokeWidth={2}
                dot={false}
                name={
                  stocks.find((s) => s.code === selectedCode)?.name || "价格"
                }
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
