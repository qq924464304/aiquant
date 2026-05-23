import { useEffect, useState, useMemo } from "react";
import { Card, Select, Spin, Progress, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { api } from "../services/api";
import type { PriceRecord, StockInfo } from "../services/api";

export default function Analysis() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);

  // 月度综合分析 - 独立数据
  const [monthCode, setMonthCode] = useState<string>();
  const [monthRecords, setMonthRecords] = useState<PriceRecord[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [monthYears, setMonthYears] = useState<string[]>([]);

  // 年度综合分析 - 独立数据
  const [yearCode, setYearCode] = useState<string>();
  const [yearRecords, setYearRecords] = useState<PriceRecord[]>([]);
  const [yearLoading, setYearLoading] = useState(false);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);

  // 加载股票列表
  useEffect(() => {
    api.getStocks().then((res) => {
      setStocks(res);
      if (res.length > 0) {
        if (!monthCode) setMonthCode(res[0].code);
        if (!yearCode) setYearCode(res[0].code);
      }
    });
  }, []);

  // 月度综合分析 - 独立拉取
  useEffect(() => {
    if (!monthCode) return;
    setMonthLoading(true);
    api.getPriceRecords(monthCode, 1000).then((res) => {
      setMonthRecords(res.reverse());
      setMonthLoading(false);
    });
  }, [monthCode]);

  // 年度综合分析 - 独立拉取
  useEffect(() => {
    if (!yearCode) return;
    setYearLoading(true);
    api.getPriceRecords(yearCode, 1000).then((res) => {
      setYearRecords(res.reverse());
      setYearLoading(false);
    });
  }, [yearCode]);

  // 月份选项（1-12月）
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1}月`,
    value: String(i + 1).padStart(2, "0"),
  }));

  // 月度分析的年份选项
  const monthYearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of monthRecords) {
      set.add(new Date(r.recordedAt).getFullYear().toString());
    }
    return Array.from(set)
      .sort()
      .reverse()
      .map((y) => ({ label: `${y}年`, value: y }));
  }, [monthRecords]);

  // 默认全选所有年份
  useEffect(() => {
    if (monthYearOptions.length > 0 && monthYears.length === 0) {
      setMonthYears(monthYearOptions.map((o) => o.value));
    }
  }, [monthYearOptions]);

  // 默认选中一月
  useEffect(() => {
    if (!selectedMonth) setSelectedMonth("01");
  }, []);

  // 月度数据按年份+月份过滤
  const filteredMonthRecords = useMemo(() => {
    if (!selectedMonth) return [];
    return monthRecords.filter((r) => {
      const d = new Date(r.recordedAt);
      const y = d.getFullYear().toString();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return monthYears.includes(y) && m === selectedMonth;
    });
  }, [monthRecords, monthYears, selectedMonth]);

  // 年度年份选项
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of yearRecords) {
      set.add(new Date(r.recordedAt).getFullYear().toString());
    }
    return Array.from(set)
      .sort()
      .reverse()
      .map((y) => ({ label: `${y}年`, value: y }));
  }, [yearRecords]);

  // 默认全选所有年份
  useEffect(() => {
    if (yearOptions.length > 0 && selectedYears.length === 0) {
      setSelectedYears(yearOptions.map((o) => o.value));
    }
  }, [yearOptions]);

  // 按选中年份过滤年度数据
  const filteredYearRecords = useMemo(() => {
    if (selectedYears.length === 0) return yearRecords;
    return yearRecords.filter((r) => {
      const y = new Date(r.recordedAt).getFullYear().toString();
      return selectedYears.includes(y);
    });
  }, [yearRecords, selectedYears]);

  const stockSelectOpts = stocks.map((s) => ({
    label: `${s.code} ${s.name}`,
    value: s.code,
  }));

  return (
    <div>
      <Card
        title="📅 月度综合分析"
        style={{ marginBottom: 24, borderRadius: 8 }}
      >
        <Select
          style={{ width: 240, marginBottom: 16, marginRight: 12 }}
          placeholder="选择股票"
          value={monthCode}
          onChange={setMonthCode}
          options={stockSelectOpts}
        />
        <Select
          mode="multiple"
          style={{ width: 200, marginBottom: 16, marginRight: 12 }}
          placeholder="选择年份"
          value={monthYears}
          onChange={setMonthYears}
          options={monthYearOptions}
        />
        <Select
          style={{ width: 80, marginBottom: 16 }}
          placeholder="选择月份"
          value={selectedMonth}
          onChange={setSelectedMonth}
          options={monthOptions}
        />
        {monthLoading ? (
          <Spin style={{ display: "block", marginTop: 40 }} />
        ) : filteredMonthRecords.length > 0 ? (
          <WeeklyAnalysis records={filteredMonthRecords} />
        ) : null}
      </Card>

      <Card title="📅 年度综合分析" style={{ borderRadius: 8 }}>
        <Select
          style={{ width: 240, marginBottom: 16, marginRight: 12 }}
          placeholder="选择股票"
          value={yearCode}
          onChange={setYearCode}
          options={stockSelectOpts}
        />
        <Select
          mode="multiple"
          style={{ width: 300, marginBottom: 16 }}
          placeholder="选择年份"
          value={selectedYears}
          onChange={setSelectedYears}
          options={yearOptions}
        />
        {yearLoading ? (
          <Spin style={{ display: "block", marginTop: 40 }} />
        ) : (
          <MonthlyAnalysis records={filteredYearRecords} />
        )}
      </Card>
    </div>
  );
}

function MonthlyAnalysis({ records: all }: { records: PriceRecord[] }) {
  // 按月份分组（跨年）
  const byMonth: Record<string, number[]> = {};
  for (let i = 1; i <= 12; i++) byMonth[i.toString()] = [];
  for (const r of all) {
    const m = (new Date(r.recordedAt).getMonth() + 1).toString();
    byMonth[m].push(r.price);
  }

  // 按年-月分组（用于排名统计）
  const byYearMonth: Record<string, Record<string, number[]>> = {};
  for (const r of all) {
    const d = new Date(r.recordedAt);
    const year = d.getFullYear().toString();
    const month = (d.getMonth() + 1).toString();
    if (!byYearMonth[year]) byYearMonth[year] = {};
    if (!byYearMonth[year][month]) byYearMonth[year][month] = [];
    byYearMonth[year][month].push(r.price);
  }

  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ];

  const years = Object.keys(byYearMonth).sort();
  const totalYears = years.length;

  // 每年找出最高/最低价月份（按均价）
  const yearHighWins: Record<string, number> = {};
  const yearLowWins: Record<string, number> = {};
  for (let i = 1; i <= 12; i++) {
    yearHighWins[i] = 0;
    yearLowWins[i] = 0;
  }

  for (const year of years) {
    const months = byYearMonth[year];
    let highMonth = "1",
      lowMonth = "1";
    let highAvg = 0,
      lowAvg = Infinity;
    for (const [m, prices] of Object.entries(months)) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg > highAvg) {
        highAvg = avg;
        highMonth = m;
      }
      if (avg < lowAvg) {
        lowAvg = avg;
        lowMonth = m;
      }
    }
    yearHighWins[parseInt(highMonth)]++;
    yearLowWins[parseInt(lowMonth)]++;
  }

  // 构建表格数据: 每月一行
  const tableData: any[] = [];
  let buyMonth = "",
    buyProb = 0;
  let sellMonth = "",
    sellProb = 0;

  for (const [month, prices] of Object.entries(byMonth)) {
    const idx = parseInt(month);
    const avg = parseFloat(
      (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2),
    );
    const max = parseFloat(Math.max(...prices).toFixed(2));
    const min = parseFloat(Math.min(...prices).toFixed(2));
    const highProb =
      totalYears > 0 ? Math.round((yearHighWins[idx] / totalYears) * 100) : 0;
    const lowProb =
      totalYears > 0 ? Math.round((yearLowWins[idx] / totalYears) * 100) : 0;

    if (lowProb > buyProb) {
      buyProb = lowProb;
      buyMonth = monthNames[idx - 1];
    }
    if (highProb > sellProb) {
      sellProb = highProb;
      sellMonth = monthNames[idx - 1];
    }

    tableData.push({
      key: month,
      month: monthNames[idx - 1],
      avg,
      max,
      min,
      highProb,
      lowProb,
    });
  }

  const maxAvg = Math.max(...tableData.map((r: any) => r.avg));
  const minAvg = Math.min(...tableData.map((r: any) => r.avg));
  const maxMax = Math.max(...tableData.map((r: any) => r.max));
  const minMin = Math.min(...tableData.map((r: any) => r.min));

  const columns: ColumnsType<any> = [
    { title: "月份", dataIndex: "month", key: "month", width: 56 },
    {
      title: "月均价",
      dataIndex: "avg",
      key: "avg",
      width: 72,
      align: "center" as const,
      sorter: (a: any, b: any) => a.avg - b.avg,
      render: (v: number) => (
        <span
          style={{
            fontWeight: 600,
            color:
              v >= maxAvg * 0.95
                ? "#cf1322"
                : v <= minAvg * 1.05
                  ? "#389e0d"
                  : "#333",
          }}
        >
          ¥{v}
        </span>
      ),
    },
    {
      title: "月中最高",
      dataIndex: "max",
      key: "max",
      width: 76,
      align: "center" as const,
      sorter: (a: any, b: any) => a.max - b.max,
      render: (v: number) => (
        <span
          style={{
            fontWeight: 600,
            color: v >= maxMax * 0.95 ? "#cf1322" : "#333",
          }}
        >
          ¥{v}
        </span>
      ),
    },
    {
      title: "月中最低",
      dataIndex: "min",
      key: "min",
      width: 76,
      align: "center" as const,
      sorter: (a: any, b: any) => a.min - b.min,
      render: (v: number) => (
        <span
          style={{
            fontWeight: 600,
            color: v <= minMin * 1.05 ? "#389e0d" : "#333",
          }}
        >
          ¥{v}
        </span>
      ),
    },
    {
      title: "📈 最高价概率",
      dataIndex: "highProb",
      key: "highProb",
      width: 124,
      sorter: (a: any, b: any) => a.highProb - b.highProb,
      render: (v: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Progress
            percent={v}
            strokeColor={v >= 30 ? "#ff4d4f" : v >= 15 ? "#fa8c16" : "#1890ff"}
            size="small"
            style={{ width: 60, margin: 0 }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: "#cf1322",
              minWidth: 30,
            }}
          >
            {v}%
          </span>
        </div>
      ),
    },
    {
      title: "📉 最低价概率",
      dataIndex: "lowProb",
      key: "lowProb",
      width: 124,
      sorter: (a: any, b: any) => a.lowProb - b.lowProb,
      render: (v: number) => (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Progress
            percent={v}
            strokeColor={v >= 30 ? "#389e0d" : v >= 15 ? "#73d13d" : "#1890ff"}
            size="small"
            style={{ width: 60, margin: 0 }}
          />
          <span
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: "#389e0d",
              minWidth: 30,
            }}
          >
            {v}%
          </span>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: 12,
          color: "#666",
          lineHeight: 1.8,
          fontSize: 13,
        }}
      >
        🟢 最适合<b style={{ color: "#389e0d" }}>加仓</b>月份：
        <Tag color="green">{buyMonth}</Tag>（{buyProb}%概率为年度最低价月份）
        &nbsp;&nbsp;|&nbsp;&nbsp; 🔴 最适合
        <b style={{ color: "#cf1322" }}>减仓</b>月份：
        <Tag color="red">{sellMonth}</Tag>（{sellProb}%概率为年度最高价月份）
        &nbsp;&nbsp;|&nbsp;&nbsp; 基于近{totalYears}年数据
      </div>
      <Table
        dataSource={tableData}
        columns={columns}
        pagination={false}
        size="small"
      />
    </div>
  );
}

function WeeklyAnalysis({ records }: { records: PriceRecord[] }) {
  if (records.length === 0) {
    return (
      <div style={{ color: "#999", padding: 24, textAlign: "center" }}>
        该条件下无数据
      </div>
    );
  }

  // 提取年份列表
  const yearSet = new Set<string>();
  for (const r of records) {
    yearSet.add(new Date(r.recordedAt).getFullYear().toString());
  }
  const years = Array.from(yearSet).sort();
  const totalYears = years.length;

  // 显示信息
  const sampleDate = new Date(records[0].recordedAt);
  const displayMonth = `${sampleDate.getMonth() + 1}月`;

  // 月内整体范围（跨年）
  const allPrices = records.map((r) => r.price);
  const monthMin = Math.min(...allPrices);
  const monthMax = Math.max(...allPrices);
  const monthRange = monthMax - monthMin;

  // 按年份 → 按周分组
  const yearWeekMap: Record<string, Record<string, number[]>> = {};
  for (const r of records) {
    const d = new Date(r.recordedAt);
    const year = d.getFullYear().toString();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    const weekKey = `${monday.getMonth() + 1}/${String(monday.getDate()).padStart(2, "0")}`;
    if (!yearWeekMap[year]) yearWeekMap[year] = {};
    if (!yearWeekMap[year][weekKey]) yearWeekMap[year][weekKey] = [];
    yearWeekMap[year][weekKey].push(r.price);
  }

  // 跨年周统计
  const weekStats: Record<
    number,
    { avgs: number[]; highCount: number; lowCount: number }
  > = {};

  // 构建表格数据
  const data: any[] = [];
  for (const year of years) {
    const weekMap = yearWeekMap[year] || {};
    const sortedWeeks = Object.entries(weekMap).sort(([a], [b]) => {
      const [am, ad] = a.split("/").map(Number);
      const [bm, bd] = b.split("/").map(Number);
      return am - bm || ad - bd;
    });

    // 找出该年月中最高/最低周
    let yearHighWeek = 0,
      yearLowWeek = 0;
    let yearHighAvg = 0,
      yearLowAvg = Infinity;
    sortedWeeks.forEach(([, prices], idx) => {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      if (avg > yearHighAvg) {
        yearHighAvg = avg;
        yearHighWeek = idx + 1;
      }
      if (avg < yearLowAvg) {
        yearLowAvg = avg;
        yearLowWeek = idx + 1;
      }
    });

    sortedWeeks.forEach(([week, prices], idx) => {
      const weekIdx = idx + 1;
      const avg = parseFloat(
        (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2),
      );
      const max = parseFloat(Math.max(...prices).toFixed(2));
      const min = parseFloat(Math.min(...prices).toFixed(2));
      const position =
        monthRange > 0 ? Math.round(((avg - monthMin) / monthRange) * 100) : 50;

      let trend = "→";
      let trendPct = 0;
      if (idx > 0) {
        const prevPrices = sortedWeeks[idx - 1][1];
        const prevAvg =
          prevPrices.reduce((a, b) => a + b, 0) / prevPrices.length;
        trendPct = parseFloat((((avg - prevAvg) / prevAvg) * 100).toFixed(1));
        trend = trendPct > 1 ? "↑" : trendPct < -1 ? "↓" : "→";
      }

      let signal: { label: string; color: string } = {
        label: "⚪ 观望",
        color: "#999",
      };
      if (position <= 35) signal = { label: "🟢 加仓", color: "#389e0d" };
      else if (position >= 65) signal = { label: "🔴 减仓", color: "#cf1322" };

      if (!weekStats[weekIdx])
        weekStats[weekIdx] = { avgs: [], highCount: 0, lowCount: 0 };
      weekStats[weekIdx].avgs.push(avg);

      data.push({
        key: `${year}-${week}`,
        year: `${year}年`,
        week: `第${weekIdx}周`,
        dateRange: `${week}起`,
        avg,
        max,
        min,
        position,
        trend,
        trendPct,
        signal,
      });
    });

    if (weekStats[yearHighWeek]) weekStats[yearHighWeek].highCount++;
    if (weekStats[yearLowWeek]) weekStats[yearLowWeek].lowCount++;
  }

  // 跨年汇总数据
  const summaryData = Object.entries(weekStats)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([wk, stats]) => {
      const n = parseInt(wk);
      const crossAvg = parseFloat(
        (stats.avgs.reduce((a, b) => a + b, 0) / stats.avgs.length).toFixed(2),
      );
      const highProb = Math.round((stats.highCount / totalYears) * 100);
      const lowProb = Math.round((stats.lowCount / totalYears) * 100);
      return {
        week: `第${n}周`,
        crossAvg,
        highProb,
        lowProb,
        highCount: stats.highCount,
        lowCount: stats.lowCount,
      };
    });

  // 最佳加仓/减仓周
  let bestBuyWk = { week: "", prob: 0 };
  let bestSellWk = { week: "", prob: 0 };
  for (const s of summaryData) {
    if (s.lowProb > bestBuyWk.prob)
      bestBuyWk = { week: s.week, prob: s.lowProb };
    if (s.highProb > bestSellWk.prob)
      bestSellWk = { week: s.week, prob: s.highProb };
  }

  const columns: ColumnsType<any> = [
    {
      title: "年份",
      dataIndex: "year",
      key: "year",
      width: 56,
    },
    {
      title: "周次",
      dataIndex: "week",
      key: "week",
      width: 50,
    },
    {
      title: "起始日",
      dataIndex: "dateRange",
      key: "dateRange",
      width: 60,
    },
    {
      title: "趋势",
      dataIndex: "trend",
      key: "trend",
      width: 50,
      align: "center" as const,
      render: (_: string, row: any) => (
        <span
          style={{
            color:
              row.trendPct > 1
                ? "#cf1322"
                : row.trendPct < -1
                  ? "#389e0d"
                  : "#999",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {row.trend}
          {row.trendPct !== 0 && (
            <span style={{ fontSize: 11, marginLeft: 2 }}>
              {row.trendPct > 0 ? "+" : ""}
              {row.trendPct}%
            </span>
          )}
        </span>
      ),
    },
    {
      title: "周均价",
      dataIndex: "avg",
      key: "avg",
      width: 64,
      align: "center" as const,
      sorter: (a: any, b: any) => a.avg - b.avg,
      render: (v: number) => <span style={{ fontWeight: 600 }}>¥{v}</span>,
    },
    {
      title: "周中最高",
      dataIndex: "max",
      key: "max",
      width: 68,
      align: "center" as const,
      sorter: (a: any, b: any) => a.max - b.max,
    },
    {
      title: "周中最低",
      dataIndex: "min",
      key: "min",
      width: 68,
      align: "center" as const,
      sorter: (a: any, b: any) => a.min - b.min,
    },
    {
      title: "月内位置",
      dataIndex: "position",
      key: "position",
      width: 68,
      align: "center" as const,
      sorter: (a: any, b: any) => a.position - b.position,
      render: (v: number) => (
        <Tag
          color={v <= 35 ? "green" : v >= 65 ? "red" : "default"}
          style={{ fontSize: 11 }}
        >
          {v}%
        </Tag>
      ),
    },
    {
      title: "操作建议(根据历史价格判断)",
      dataIndex: "signal",
      key: "signal",
      width: 72,
      render: (v: { label: string; color: string }) => (
        <span style={{ fontWeight: 700, color: v.color }}>{v.label}</span>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: 8,
          color: "#666",
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        {displayMonth} · {years.join("、")}年 · 共{totalYears}年 ·{" "}
        {records.length}个交易日 &nbsp;&nbsp;|&nbsp;&nbsp; 区间：¥{monthMin} ~ ¥
        {monthMax}
      </div>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Tag color="green" style={{ fontSize: 13, padding: "2px 10px" }}>
          🟢 最佳加仓周：{bestBuyWk.week}（{bestBuyWk.prob}
          %概率为月中最低）
        </Tag>
        <Tag color="red" style={{ fontSize: 13, padding: "2px 10px" }}>
          🔴 最佳减仓周：{bestSellWk.week}（{bestSellWk.prob}
          %概率为月中最高）
        </Tag>
      </div>
      <Table
        dataSource={data}
        columns={columns}
        pagination={false}
        size="small"
      />

      {/* 跨年周统计汇总 */}
      <div
        style={{
          marginTop: 16,
          color: "#666",
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        📊 跨年统计（{totalYears}年）
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {summaryData.map((s) => (
          <Tag
            key={s.week}
            color={
              s.highProb >= 50 ? "red" : s.lowProb >= 50 ? "green" : "default"
            }
            style={{ fontSize: 13, padding: "4px 12px" }}
          >
            {s.week} &nbsp;均价¥{s.crossAvg} &nbsp;| &nbsp;📈最高{s.highCount}/
            {totalYears}（{s.highProb}
            %）&nbsp;📉最低{s.lowCount}/{totalYears}（{s.lowProb}%）
          </Tag>
        ))}
      </div>
    </div>
  );
}
