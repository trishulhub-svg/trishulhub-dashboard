"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: Array<Record<string, number | string>>;
  selected: string[];
  hasMoneySeries: boolean;
  hasCountSeries: boolean;
};

function moneyTick(v: number) {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `£${(v / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `£${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `£${Math.round(v)}`;
}

function formatTooltipValue(name: string, value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  const moneyNames = ["Revenue £", "Expenses £", "Salary £", "Profit £", "Loss £", "Employee perf £"];
  if (moneyNames.includes(name)) {
    return `£${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n)}`;
  }
  return String(Math.round(n));
}

export default function PnLChart({ data, selected, hasMoneySeries, hasCountSeries }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        {hasMoneySeries && (
          <YAxis
            yAxisId="money"
            tick={{ fontSize: 11 }}
            tickFormatter={moneyTick}
            width={56}
          />
        )}
        {hasCountSeries && (
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fontSize: 11 }}
            width={40}
            allowDecimals={false}
          />
        )}
        <Tooltip
          formatter={(value: number, name: string) => [formatTooltipValue(name, value), name]}
        />
        <Legend />
        {selected.includes("revenue") && (
          <Area
            yAxisId="money"
            type="monotone"
            dataKey="revenue"
            stroke="#059669"
            fill="#05966933"
            name="Revenue £"
            isAnimationActive={false}
          />
        )}
        {selected.includes("expenses") && (
          <Area
            yAxisId="money"
            type="monotone"
            dataKey="expenses"
            stroke="#dc2626"
            fill="#dc262622"
            name="Expenses £"
            isAnimationActive={false}
          />
        )}
        {selected.includes("salary") && (
          <Line
            yAxisId="money"
            type="monotone"
            dataKey="salary"
            stroke="#d97706"
            strokeWidth={2}
            name="Salary £"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("profit") && (
          <Line
            yAxisId="money"
            type="monotone"
            dataKey="profit"
            stroke="#2563eb"
            strokeWidth={2.5}
            name="Profit £"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("loss") && (
          <Line
            yAxisId="money"
            type="monotone"
            dataKey="loss"
            stroke="#be123c"
            strokeWidth={2}
            name="Loss £"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("performance") && (
          <Line
            yAxisId="money"
            type="monotone"
            dataKey="performance"
            stroke="#db2777"
            strokeWidth={2}
            name="Employee perf £"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("projects") && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="projects"
            stroke="#7c3aed"
            strokeWidth={1.5}
            name="Projects"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("clients") && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="clients"
            stroke="#0f766e"
            strokeWidth={1.5}
            name="Clients"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("crm") && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="crmWon"
            stroke="#ea580c"
            strokeWidth={1.5}
            name="CRM won"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("time") && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="timeEntries"
            stroke="#64748b"
            strokeWidth={1.5}
            name="Time entries"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {selected.includes("audit") && (
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="audit"
            stroke="#475569"
            strokeWidth={1.5}
            name="Audit events"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
