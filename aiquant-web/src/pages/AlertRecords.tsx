import { useEffect, useState } from 'react';
import { Card, Table, Tag, Spin } from 'antd';
import { api } from '../services/api';
import type { AlertRecord } from '../services/api';

export default function AlertRecords() {
  const [data, setData] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAlertRecords().then((res) => {
      setData(res);
      setLoading(false);
    });
  }, []);

  const columns = [
    { title: '代码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
    {
      title: '现价', dataIndex: 'currentPrice', key: 'currentPrice', width: 120,
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>{v.toFixed(2)}</span>,
    },
    {
      title: '触发价', dataIndex: 'triggerPrice', key: 'triggerPrice', width: 120,
      render: (v: number) => <span style={{ color: '#3f8600', fontWeight: 600 }}>{v.toFixed(2)}</span>,
    },
    {
      title: '状态', key: 'status', width: 100,
      render: () => <Tag color="red">买入信号</Tag>,
    },
    { title: '说明', dataIndex: 'message', key: 'message' },
    { title: '日期', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (v: string) => new Date(v).toLocaleDateString() },
  ];

  if (loading) return <Spin size="large" style={{ display: 'block', marginTop: 120 }} />;

  return (
    <Card title="🚨 买入警报记录" style={{ borderRadius: 8 }}>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          暂无警报记录
        </div>
      ) : (
        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      )}
    </Card>
  );
}
