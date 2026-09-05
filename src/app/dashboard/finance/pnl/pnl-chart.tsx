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
  const moneyNames = [
    "Recorded revenue",
    "Recorded costs",
    "Salaries",
    "Recorded result",
    "Negative result",
  ];
  if (moneyNames.includes(name)) {
    return `£${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n)}`;
  }
  return String(Math.round(n));
}

export default function PnLChart({ data, selected, hasMoneySeries }: Props) {
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
            name="Recorded revenue"
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
            name="Recorded costs"
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
            name="Salaries"
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
            name="Recorded result"
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
            name="Negative result"
            dot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
