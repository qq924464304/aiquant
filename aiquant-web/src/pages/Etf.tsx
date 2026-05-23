import { useEffect, useState } from "react";
import { Card, Table, Spin, Tag } from "antd";
import { api } from "../services/api";
import type { EtfIndex } from "../services/api";

export default function Etf() {
  const [data, setData] = useState<EtfIndex[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getEtfIndices().then((res) => {
      setData(res);
      setLoading(false);
    });
  }, []);

  if (loading)
    return <Spin size="large" style={{ display: "block", marginTop: 120 }} />;

  const columns = [
    {
      title: "指数代码",
      dataIndex: "tsCode",
      key: "tsCode",
      width: 120,
      render: (v: string) => <Tag style={{ fontFamily: "monospace" }}>{v}</Tag>,
    },
    {
      title: "指数简称",
      dataIndex: "indxCsname",
      key: "indxCsname",
      width: 120,
    },
    {
      title: "指数全称",
      dataIndex: "indxName",
      key: "indxName",
      width: 280,
    },
    {
      title: "发布机构",
      dataIndex: "pubPartyName",
      key: "pubPartyName",
      width: 160,
    },
    {
      title: "发布日期",
      dataIndex: "pubDate",
      key: "pubDate",
      width: 120,
    },
    {
      title: "基日",
      dataIndex: "baseDate",
      key: "baseDate",
      width: 120,
    },
    {
      title: "基点(点)",
      dataIndex: "bp",
      key: "bp",
      width: 100,
      render: (v: number | null) => (v != null ? v.toLocaleString() : "--"),
    },
    {
      title: "调整周期",
      dataIndex: "adjCircle",
      key: "adjCircle",
      width: 160,
    },
  ];

  return (
    <div>
      <Card title="📈 ETF 指数概览" style={{ borderRadius: 8 }}>
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="middle"
        />
      </Card>
      {data.length === 0 && (
        <Card title="📝 说明" style={{ borderRadius: 8, marginTop: 16 }}>
          <p style={{ color: "#666" }}>
            牛市买指数不容易踏空，后续将在此页面展示指数估值分位、PE/PB 等指标。
          </p>
        </Card>
      )}
    </div>
  );
}
