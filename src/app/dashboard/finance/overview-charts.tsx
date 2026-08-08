"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { safeNumber } from "@/lib/utils";

interface OverviewChartsProps {
  revenueData: { month: string; revenue: number; expenses: number }[];
  expenseData: { name: string; value: number; color: string }[];
}

function resolveCssVar(cssVar: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const match = cssVar.match(/var\((--[\w-]+)\)/);
  if (!match) return cssVar;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || fallback;
}

const OverviewCharts = React.memo(function OverviewCharts({ revenueData, expenseData }: OverviewChartsProps) {
  const theme = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        chart1: "oklch(0.52 0.13 160)",
        muted: "oklch(0.88 0.012 210)",
        fg: "oklch(0.48 0.02 250)",
      };
    }
    const styles = getComputedStyle(document.documentElement);
    return {
      chart1: styles.getPropertyValue("--chart-1").trim() || "oklch(0.52 0.13 160)",
      muted: styles.getPropertyValue("--border").trim() || "oklch(0.88 0.012 210)",
      fg: styles.getPropertyValue("--muted-foreground").trim() || "oklch(0.48 0.02 250)",
    };
  }, []);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="liquid-glass-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Revenue Trend</CardTitle>
          <CardDescription>Last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            {revenueData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No revenue data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.muted} opacity={0.6} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: theme.fg }} axisLine={{ stroke: theme.muted }} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: theme.fg }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: number) => [
                      `£${safeNumber(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
                      "Revenue",
                    ]}
                  />
                  <Bar dataKey="revenue" fill={theme.chart1} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="liquid-glass-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Financial Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            {expenseData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No financial data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    {expenseData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.color.startsWith("var(") ? resolveCssVar(entry.color, theme.chart1) : entry.color}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      color: "var(--foreground)",
                    }}
                    formatter={(value: number) => [
                      `£${safeNumber(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

export default OverviewCharts;
