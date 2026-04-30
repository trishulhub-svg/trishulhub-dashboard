"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, TrendingUp, ArrowRight, FileText, Clock, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function FinancePage() {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const stats = data.stats as {
    totalRevenue: number;
    pendingAmount: number;
    overdueAmount: number;
    totalExpenses: number;
    totalApiSpend: number;
    monthlyBudget: number;
  };

  const invoices = (data.invoices as { id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string; paidAt?: string; createdAt?: string }[]) || [];
  const recentInvoices = invoices.slice(0, 5);

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const invoiceStatusColors: Record<string, string> = {
    DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
    SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  // Financial breakdown for pie chart
  const expenseData = [
    { name: "API Costs", value: stats.totalApiSpend, color: "#ef4444" },
    { name: "Expenses", value: stats.totalExpenses, color: "#f59e0b" },
    { name: "Profit", value: Math.max(0, stats.totalRevenue - stats.totalApiSpend - stats.totalExpenses), color: "#22c55e" },
  ];

  // Monthly revenue data for chart - use actual data, no random values
  const expenseItems = (data.expenses as { category: string; amount: number; date: string }[]) || [];
  const now = new Date();
  const months: string[] = [];
  const revenueByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};

  // Build last 6 months dynamically based on current date
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short" });
    months.push(label);
    revenueByMonth[key] = 0;
    expenseByMonth[key] = 0;
  }

  // Aggregate invoice revenue by month
  for (const inv of invoices) {
    const invDate = new Date(inv.paidAt || inv.createdAt || inv.dueDate);
    const key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
    if (key in revenueByMonth && inv.status === "PAID") {
      revenueByMonth[key] += inv.total;
    }
  }

  // Aggregate expenses by month
  for (const exp of expenseItems) {
    const expDate = new Date(exp.date);
    const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
    if (key in expenseByMonth) {
      expenseByMonth[key] += exp.amount;
    }
  }

  // Current month gets the live totals if no paid invoices this month yet
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (revenueByMonth[currentKey] === 0 && stats.totalRevenue > 0) {
    revenueByMonth[currentKey] = stats.totalRevenue;
  }
  if (expenseByMonth[currentKey] === 0 && stats.totalExpenses > 0) {
    expenseByMonth[currentKey] = stats.totalExpenses;
  }

  const revenueData = months.map((month, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month,
      revenue: revenueByMonth[key] || 0,
      expenses: expenseByMonth[key] || 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-muted-foreground text-sm">Track revenue, invoices, and expenses</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
            <FileText className="h-4 w-4 mr-1" /> Invoices
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/expenses")}>
            Expenses
          </Button>
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue This Month</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalRevenue)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.pendingAmount)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.overdueAmount)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Revenue Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill="hsl(25, 80%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ₹${(value / 1000).toFixed(0)}k`}>
                    {expenseData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Invoices</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/finance/invoices")}>
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No invoices</p>
            ) : (
              recentInvoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{inv.client?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(inv.total)}</span>
                    <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>{inv.status}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
