"use client";

import React, { useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

type TrendPoint = { month: string; invoiced: number; collected: number; costs: number };

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const OverviewCharts = React.memo(function OverviewCharts({ data }: { data: TrendPoint[] }) {
  const colors = useMemo(() => {
    if (typeof window === "undefined") {
      return { invoiced: "#2563eb", collected: "#059669", costs: "#dc2626", grid: "#d1d5db", text: "#64748b" };
    }
    const style = getComputedStyle(document.documentElement);
    return {
      invoiced: style.getPropertyValue("--chart-1").trim() || "#2563eb",
      collected: style.getPropertyValue("--chart-2").trim() || "#059669",
      costs: style.getPropertyValue("--chart-5").trim() || "#dc2626",
      grid: style.getPropertyValue("--border").trim() || "#d1d5db",
      text: style.getPropertyValue("--muted-foreground").trim() || "#64748b",
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Six-month cash journey</CardTitle>
        <CardDescription>Compare work billed, cash collected and recorded business costs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full" aria-label="Six-month invoiced, collected and costs chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} opacity={0.55} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: colors.text }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: colors.text }} tickFormatter={compactMoney}
                axisLine={false} tickLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--foreground)",
                }}
                formatter={(value: number, name: string) => [
                  formatCurrency(Number(value || 0)),
                  name === "invoiced" ? "Invoiced" : name === "collected" ? "Collected" : "Recorded costs",
                ]}
              />
              <Bar dataKey="invoiced" fill={colors.invoiced} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Line dataKey="collected" stroke={colors.collected} strokeWidth={2.5} dot={{ r: 3 }} />
              <Line dataKey="costs" stroke={colors.costs} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.invoiced }} /> Invoiced</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: colors.collected }} /> Collected</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: colors.costs }} /> Recorded costs</span>
        </div>
      </CardContent>
    </Card>
  );
});

export default OverviewCharts;
