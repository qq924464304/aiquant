import { useEffect, useState } from "react";
import { Select } from "antd";
import { api } from "../services/api";
import type { StockInfo } from "../services/api";

interface StockSelectProps {
  /** 当前选中的股票代码 */
  value?: string;
  /** 选择变更回调 */
  onChange?: (code: string) => void;
  /** 占位文本，默认"选择股票" */
  placeholder?: string;
  /** 是否可搜索，默认 true */
  showSearch?: boolean;
  /** 宽度 */
  style?: React.CSSProperties;
  /** 是否允许清空 */
  allowClear?: boolean;
}

/**
 * 可复用的股票选择器组件
 * 内部自动加载股票列表，父组件只需传 value + onChange
 *
 * 用法:
 *   <StockSelect value={code} onChange={setCode} />
 */
export default function StockSelect({
  value,
  onChange,
  placeholder = "选择股票",
  showSearch = true,
  style = { width: 240 },
  allowClear = false,
}: StockSelectProps) {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStocks().then((list) => {
      setStocks(list);
      setLoading(false);
    });
  }, []);

  const options = stocks.map((s) => ({
    label: `${s.code} ${s.name}`,
    value: s.code,
  }));

  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      showSearch={showSearch}
      style={style}
      allowClear={allowClear}
      loading={loading}
      filterOption={(input, option) => {
        const label = (option?.label as string) || "";
        return label.toLowerCase().includes(input.toLowerCase());
      }}
      options={options}
    />
  );
}
