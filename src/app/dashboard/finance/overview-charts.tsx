"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { safeNumber } from "@/lib/utils";

interface OverviewChartsProps {
  revenueData: { month: string; revenue: number; expenses: number }[];
  expenseData: { name: string; value: number; color: string }[];
}

const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const OverviewCharts = React.memo(function OverviewCharts({ revenueData, expenseData }: OverviewChartsProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Revenue Chart */}
      <Card>
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
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`₹${safeNumber(value).toLocaleString("en-IN")}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(25, 80%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financial Breakdown */}
      <Card>
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
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`₹${safeNumber(value).toLocaleString("en-IN")}`]} />
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
