import { useState } from "react";
import { ConfigProvider, Layout, Menu } from "antd";
import {
  DashboardOutlined,
  StockOutlined,
  LineChartOutlined,
  AlertOutlined,
  FundOutlined,
  ExperimentOutlined,
  // ExclamationCircleFilled,
} from "@ant-design/icons";
import Dashboard from "./pages/Dashboard";
import StockList from "./pages/StockList";
import PriceChart from "./pages/PriceChart";
import AlertRecords from "./pages/AlertRecords";
import Analysis from "./pages/Analysis";
import Backtest from "./pages/Backtest";
// import Etf from "./pages/Etf";

const { Sider, Content } = Layout;

const menuItems = [
  {
    key: "/",
    icon: <DashboardOutlined />,
    label: "股票概览",
    element: <Dashboard />,
  },
  // {
  //   key: "/etf",
  //   icon: <ExclamationCircleFilled />,
  //   label: "etf概览",
  //   element: <Etf />,
  // },
  {
    key: "/stocks",
    icon: <StockOutlined />,
    label: "股票行情",
    element: <StockList />,
  },
  {
    key: "/chart",
    icon: <LineChartOutlined />,
    label: "股票走势图",
    element: <PriceChart />,
  },
  {
    key: "/analysis",
    icon: <FundOutlined />,
    label: "股票综合分析",
    element: <Analysis />,
  },
  {
    key: "/alerts",
    icon: <AlertOutlined />,
    label: "股票买入警报",
    element: <AlertRecords />,
  },
  {
    key: "/backtest",
    icon: <ExperimentOutlined />,
    label: "策略回测",
    element: <Backtest />,
  },
];

export default function App() {
  const [path, setPath] = useState(window.location.hash?.slice(1) || "/");

  const handleNav = (p: string) => {
    setPath(p);
    window.location.hash = p;
  };

  const current = menuItems.find((m) => m.key === path) || menuItems[0];

  return (
    <ConfigProvider
      theme={{
        token: { colorPrimary: "#1890ff" },
      }}
    >
      <Layout style={{ minHeight: "100vh" }}>
        <Sider width={200} theme="light">
          <div
            style={{
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: "bold",
              borderBottom: "1px solid #f0f0f0",
            }}
            onClick={() => handleNav("/")}
          >
            aiquant
          </div>
          <Menu
            mode="inline"
            selectedKeys={[path]}
            items={menuItems.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: item.label,
            }))}
            onClick={({ key }) => handleNav(key)}
          />
        </Sider>
        <Layout>
          <Content style={{ padding: 24, background: "#fff" }}>
            {current.element}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
