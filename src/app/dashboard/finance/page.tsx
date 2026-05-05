"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowRight, FileText, Clock,
  AlertCircle, Search, Plus, Trash2, Pause, Play, Edit3, CreditCard,
  CalendarDays, Filter, Receipt, FolderOpen, Tag,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─── Types ───────────────────────────────────────────────────────────
interface DashboardData {
  stats: {
    totalRevenue: number;
    pendingAmount: number;
    overdueAmount: number;
    totalExpenses: number;
    totalApiSpend: number;
    monthlyBudget: number;
  };
  invoices: {
    id: string; invoiceNumber: string; status: string; total: number;
    client: { name: string }; dueDate: string; paidAt?: string; createdAt?: string;
  }[];
  expenses: { id: string; category: string; description: string; amount: number; date: string; project?: { id: string; name: string } }[];
}

interface Subscription {
  id: string;
  service: string;
  rate: number;
  currency: string;
  frequency: string;
  status: string;
  category: string | null;
  projectId: string | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  monthlyINR: number;
  project: { id: string; name: string } | null;
}

interface ExpenseWithProject {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  project?: { id: string; name: string } | null;
}

interface CategoryStat {
  category: string;
  total: number;
  count: number;
}

interface ProjectStat {
  projectId: string | null;
  projectName: string;
  total: number;
  count: number;
  budget: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", GBP: "£" };

const CURRENCY_TO_INR: Record<string, number> = { INR: 1, USD: 83.5, GBP: 105.5 };

const CATEGORY_COLORS: Record<string, string> = {
  HOSTING: "border-l-purple-500 bg-purple-50 dark:bg-purple-950/20",
  DOMAINS: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/20",
  API_COSTS: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  TOOLS: "border-l-cyan-500 bg-cyan-50 dark:bg-cyan-950/20",
  MARKETING: "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20",
  SALARY: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20",
  SOFTWARE: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/20",
  OTHER: "border-l-gray-500 bg-gray-50 dark:bg-gray-950/20",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  HOSTING: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DOMAINS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  API_COSTS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  TOOLS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  MARKETING: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  SALARY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  SOFTWARE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  STOPPED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  COMPLETED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const EXPENSE_CATEGORIES = ["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"];

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const formatCurrency = (n: number, currency = "INR") => {
  if (currency === "INR") return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  if (currency === "USD") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (currency === "GBP") return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
  return `${currency} ${n.toLocaleString()}`;
};

const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// ─── Main Component ──────────────────────────────────────────────────
export default function FinancePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [subTotalMonthly, setSubTotalMonthly] = useState(0);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Expenses (for tab)
  const [expenses, setExpenses] = useState<ExpenseWithProject[]>([]);
  const [expLoading, setExpLoading] = useState(true);
  const [expSearch, setExpSearch] = useState("");
  const [expStartDate, setExpStartDate] = useState("");
  const [expEndDate, setExpEndDate] = useState("");
  const [expCategory, setExpCategory] = useState("");

  // Stats
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStat[]>([]);
  const [statsTotal, setStatsTotal] = useState(0);

  // Projects (for dropdown)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [error, setError] = useState<string | null>(null);

  // ─── Fetch dashboard data (existing) ────
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/dashboard", { credentials: "include", signal });
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load dashboard data. Please refresh the page.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError("Network error. Please check your connection and refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch subscriptions ────
  const fetchSubscriptions = useCallback(async (signal?: AbortSignal) => {
    try {
      setSubLoading(true);
      const res = await fetch("/api/subscriptions", { credentials: "include", signal });
      if (res.ok) {
        const json = await res.json();
        setSubscriptions(json.subscriptions || []);
        setSubTotalMonthly(json.totalMonthlyCost || 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    } finally {
      setSubLoading(false);
    }
  }, []);

  // ─── Fetch expenses with filters ────
  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      setExpLoading(true);
      const params = new URLSearchParams();
      if (expSearch) params.set("search", expSearch);
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      if (expCategory && expCategory !== "ALL") params.set("category", expCategory);
      const res = await fetch(`/api/expenses?${params.toString()}`, { credentials: "include", signal });
      if (res.ok) {
        const expData = await res.json();
        setExpenses(Array.isArray(expData) ? expData : []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    } finally {
      setExpLoading(false);
    }
  }, [expSearch, expStartDate, expEndDate, expCategory]);

  // ─── Fetch expense stats ────
  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      const res = await fetch(`/api/expenses/stats?${params.toString()}`, { credentials: "include", signal });
      if (res.ok) {
        const json = await res.json();
        setCategoryStats(json.byCategory || []);
        setProjectStats(json.byProject || []);
        setStatsTotal(json.totalExpenses || 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [expStartDate, expEndDate]);

  // ─── Fetch projects for dropdowns ────
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { credentials: "include", signal });
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.projects || json.data || []);
        setProjects(arr.map((p: any) => ({ id: p.id, name: p.name })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, []);

  // Re-fetch expenses and stats when filters change (separate from initial load)
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetchExpenses(signal);
    fetchStats(signal);
    return () => controller.abort();
  }, [fetchExpenses, fetchStats]);

  // Initial data load (runs once)
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetchData(signal);
    fetchSubscriptions(signal);
    fetchProjects(signal);
    fetchExpenses(signal);
    fetchStats(signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Subscription handlers ────
  const handleSaveSubscription = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      service: form.get("service") as string,
      rate: parseFloat(form.get("rate") as string) || 0,
      currency: form.get("currency") as string || "INR",
      frequency: form.get("frequency") as string || "MONTHLY",
      status: editingSub ? undefined : "ACTIVE",
      category: (form.get("category") as string) || undefined,
      projectId: (form.get("projectId") as string) === "NONE" ? undefined : (form.get("projectId") as string) || undefined,
      startDate: (form.get("startDate") as string) || undefined,
      endDate: (form.get("endDate") as string) || undefined,
      notes: (form.get("notes") as string) || undefined,
    };

    try {
      if (editingSub) {
        const res = await fetch(`/api/subscriptions/${editingSub.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Subscription updated");
        } else {
          toast.error("Failed to update subscription");
          return;
        }
      } else {
        const res = await fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Subscription added");
        } else {
          toast.error("Failed to add subscription");
          return;
        }
      }
      setSubDialogOpen(false);
      setEditingSub(null);
      fetchSubscriptions();
    } catch {
      toast.error("Something went wrong");
    }
  };

  const handleToggleSubscription = async (sub: Subscription) => {
    const newStatus = sub.status === "ACTIVE" ? "STOPPED" : "ACTIVE";
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Subscription ${newStatus === "ACTIVE" ? "resumed" : "paused"}`);
        fetchSubscriptions();
      }
    } catch {
      toast.error("Failed to update subscription");
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subscription? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Subscription deleted");
        fetchSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete subscription");
      }
    } catch {
      toast.error("Failed to delete subscription");
    }
  };

  // ─── Expense delete handler ────
  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("Expense deleted");
        fetchExpenses();
        fetchStats();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete expense");
      }
    } catch {
      toast.error("Failed to delete expense");
    }
  };

  // ─── Role guard ────
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") { router.push("/dashboard"); return null; }

  // ─── Loading skeleton ────
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  // ─── Error state ────
  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-muted-foreground text-sm">Track revenue, invoices, expenses & subscriptions</p>
        </div>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <div>
                <p className="font-medium text-red-600">Failed to load finance data</p>
                <p className="text-sm text-muted-foreground">{error || "No data received from the server."}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setError(null); setLoading(true); fetchData(); }}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = data.stats;
  const invoices = data.invoices || [];
  const recentInvoices = invoices.slice(0, 5);

  // ─── Revenue chart data (preserved from original) ────
  const expenseData = [
    { name: "API Costs", value: stats.totalApiSpend, color: "#ef4444" },
    { name: "Expenses", value: stats.totalExpenses, color: "#f59e0b" },
    { name: "Profit", value: Math.max(0, stats.totalRevenue - stats.totalApiSpend - stats.totalExpenses), color: "#22c55e" },
  ].filter(d => d.value > 0);

  const expenseItems = data.expenses || [];
  const now = new Date();
  const months: string[] = [];
  const revenueByMonth: Record<string, number> = {};
  const expenseByMonth: Record<string, number> = {};

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short" });
    months.push(label);
    revenueByMonth[key] = 0;
    expenseByMonth[key] = 0;
  }

  for (const inv of invoices) {
    const invDate = new Date(inv.paidAt || inv.createdAt || inv.dueDate);
    const key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
    if (key in revenueByMonth && inv.status === "PAID") {
      revenueByMonth[key] += inv.total;
    }
  }

  for (const exp of expenseItems) {
    const expDate = new Date(exp.date);
    const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
    if (key in expenseByMonth) {
      expenseByMonth[key] += exp.amount;
    }
  }

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
    return { month, revenue: revenueByMonth[key] || 0, expenses: expenseByMonth[key] || 0 };
  });

  // ─── Computed summary values ────
  const totalRevenue = stats.totalRevenue;
  const totalManualExpenses = stats.totalExpenses;
  const totalSubscriptionMonthly = subTotalMonthly;
  const totalCosts = totalManualExpenses + totalSubscriptionMonthly;
  const netProfit = totalRevenue - totalCosts;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Finance Dashboard</h1>
          <p className="text-muted-foreground text-sm">Track revenue, invoices, expenses & subscriptions</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
            <FileText className="h-4 w-4 mr-1" /> Invoices
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/expenses")}>
            <Receipt className="h-4 w-4 mr-1" /> Full CRUD
          </Button>
        </div>
      </div>

      {/* ─── Top Summary Cards ──── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Manual Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalManualExpenses)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Auto Subscriptions</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalSubscriptionMonthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${netProfit >= 0 ? "border-l-emerald-500" : "border-l-red-600"}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit (est.)</p>
                <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(netProfit)}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${netProfit >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                {netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Tab Navigation ──── */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="expenses">All Expenses</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="project">By Project</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab (preserved from original) ──── */}
        <TabsContent value="overview" className="space-y-4">
          {/* Quick Stats Row */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Payments</p>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.pendingAmount)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600" />
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
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">API Spend</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.totalApiSpend)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
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
                  {expenseData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No financial data yet</p>
                  ) : (
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
                  )}
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
                        <Badge className={`text-[10px] ${INVOICE_STATUS_COLORS[inv.status] || ""}`}>{inv.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── All Expenses Tab ──── */}
        <TabsContent value="expenses" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs mb-1 block">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by description, project, category..."
                      className="pl-8"
                      value={expSearch}
                      onChange={(e) => setExpSearch(e.target.value)}
                      aria-label="Search expenses"
                    />
                  </div>
                </div>
                <div className="min-w-[140px]">
                  <Label className="text-xs mb-1 block">Start Date</Label>
                  <Input type="date" value={expStartDate} onChange={(e) => setExpStartDate(e.target.value)} />
                </div>
                <div className="min-w-[140px]">
                  <Label className="text-xs mb-1 block">End Date</Label>
                  <Input type="date" value={expEndDate} onChange={(e) => setExpEndDate(e.target.value)} />
                </div>
                <div className="min-w-[160px]">
                  <Label className="text-xs mb-1 block">Category</Label>
                  <Select value={expCategory} onValueChange={setExpCategory}>
                    <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Categories</SelectItem>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setExpSearch(""); setExpStartDate(""); setExpEndDate(""); setExpCategory(""); }}
                >
                  Clear
                </Button>
                <Button size="sm" onClick={() => router.push("/dashboard/finance/expenses")}>
                  <Plus className="h-4 w-4 mr-1" /> Add Expense
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Table */}
          <Card>
            <CardContent className="p-0">
              {expLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : expenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No expenses found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount (INR)</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="text-xs">{formatDate(exp.date)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${CATEGORY_BADGE_COLORS[exp.category] || ""}`}>
                            {exp.category.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{exp.project?.name || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{exp.description}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(exp.amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteExpense(exp.id)} aria-label="Delete expense">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Subscriptions Tab ──── */}
        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {subscriptions.filter((s) => s.status === "ACTIVE").length} active subscription(s)
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => { setEditingSub(null); setSubDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Subscription
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {subLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No subscriptions yet</p>
                  <p className="text-xs">Add your first recurring subscription to track monthly costs</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Monthly INR</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{sub.service}</p>
                            {sub.category && <p className="text-xs text-muted-foreground">{sub.category}</p>}
                            {sub.project && <p className="text-xs text-muted-foreground">{sub.project.name}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {CURRENCY_SYMBOLS[sub.currency] || sub.currency}{sub.rate.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{sub.frequency}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${SUB_STATUS_COLORS[sub.status] || ""}`}>{sub.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(sub.monthlyINR)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => { setEditingSub(sub); setSubDialogOpen(true); }}
                              aria-label="Edit subscription"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleToggleSubscription(sub)}
                              title={sub.status === "ACTIVE" ? "Pause" : "Resume"}
                              aria-label={sub.status === "ACTIVE" ? "Pause subscription" : "Resume subscription"}
                            >
                              {sub.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500"
                              onClick={() => handleDeleteSubscription(sub.id)}
                              aria-label="Delete subscription"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Total Monthly Cost */}
          {subscriptions.length > 0 && (
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Total Active Monthly Cost</p>
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(subTotalMonthly)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── By Category Tab ──── */}
        <TabsContent value="category" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{categoryStats.length} categories • Total: {formatCurrency(statsTotal)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryStats.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No expense categories yet</p>
              </div>
            ) : (
              categoryStats.map((cat) => (
                <Card key={cat.category} className={`border-l-4 ${CATEGORY_COLORS[cat.category] || "border-l-gray-500"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-sm">{cat.category.replace(/_/g, " ")}</h3>
                      <Badge className={`text-[10px] ${CATEGORY_BADGE_COLORS[cat.category] || ""}`}>{cat.count}</Badge>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(cat.total)}</p>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>% of total</span>
                        <span>{statsTotal > 0 ? ((cat.total / statsTotal) * 100).toFixed(1) : 0}%</span>
                      </div>
                      <Progress value={statsTotal > 0 ? (cat.total / statsTotal) * 100 : 0} className="mt-1 h-1.5" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ─── By Project Tab ──── */}
        <TabsContent value="project" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{projectStats.length} project(s) • Total: {formatCurrency(statsTotal)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectStats.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No project expenses yet</p>
              </div>
            ) : (
              projectStats.map((proj) => {
                const budgetPct = proj.budget && proj.budget > 0 ? Math.min((proj.total / proj.budget) * 100, 100) : 0;
                const isOverBudget = proj.budget ? proj.total > proj.budget : false;
                return (
                  <Card key={proj.projectId || "unassigned"} className={`border-l-4 ${isOverBudget ? "border-l-red-500" : "border-l-emerald-500"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm truncate max-w-[180px]">{proj.projectName}</h3>
                        <Badge variant="outline" className="text-[10px]">{proj.count} entries</Badge>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(proj.total)}</p>
                      {proj.budget ? (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Budget: {formatCurrency(proj.budget)}</span>
                            <span className={isOverBudget ? "text-red-500 font-medium" : ""}>{budgetPct.toFixed(0)}%</span>
                          </div>
                          <Progress value={budgetPct} className={`mt-1 h-1.5 ${isOverBudget ? "[&>div]:bg-red-500" : ""}`} />
                          {isOverBudget && (
                            <p className="text-xs text-red-500 mt-1">Over budget by {formatCurrency(proj.total - (proj.budget || 0))}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-2">No budget set</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Subscription Dialog ──── */}
      <Dialog open={subDialogOpen} onOpenChange={(open) => { setSubDialogOpen(open); if (!open) setEditingSub(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSubscription} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Service Name *</Label>
              <Input name="service" required defaultValue={editingSub?.service || ""} placeholder="e.g., Google One UK" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Rate *</Label>
                <Input name="rate" type="number" step="0.01" required defaultValue={editingSub?.rate || ""} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select name="currency" defaultValue={editingSub?.currency || "INR"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR ₹</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                    <SelectItem value="GBP">GBP £</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Select name="frequency" defaultValue={editingSub?.frequency || "MONTHLY"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                    <SelectItem value="ONE_TIME">One Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select name="category" defaultValue={editingSub?.category || ""}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOFTWARE">Software</SelectItem>
                    <SelectItem value="HOSTING">Hosting</SelectItem>
                    <SelectItem value="DOMAINS">Domains</SelectItem>
                    <SelectItem value="API_COSTS">API Costs</SelectItem>
                    <SelectItem value="TOOLS">Tools</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="SALARY">Salary</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select name="projectId" defaultValue={editingSub?.projectId || ""}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input name="startDate" type="date" defaultValue={editingSub?.startDate ? new Date(editingSub.startDate).toISOString().split("T")[0] : ""} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input name="endDate" type="date" defaultValue={editingSub?.endDate ? new Date(editingSub.endDate).toISOString().split("T")[0] : ""} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input name="notes" defaultValue={editingSub?.notes || ""} placeholder="Optional notes" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => { setSubDialogOpen(false); setEditingSub(null); }}>Cancel</Button>
              <Button type="submit">{editingSub ? "Update" : "Add"} Subscription</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
