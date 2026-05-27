"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { handleFetchError } from "@/lib/fetch-utils";
import { deepSanitize, safeText, safeNumber } from "@/lib/utils";
import {
  DollarSign, TrendingUp, TrendingDown, ArrowRight, FileText, Clock,
  AlertCircle, Search, Plus, Trash2, Pause, Play, Edit3, CreditCard,
  Receipt, FolderOpen, Tag, ChevronDown, ChevronUp,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
  amount: number;
  currency: string;
  exchangeRate: number;
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
  employee?: { id: string; name: string } | null;
  paymentRef?: string | null;
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

interface EmployeeOption {
  id: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", GBP: "£" };

// Default exchange rates to INR (used as defaults when adding subscriptions)
const DEFAULT_EXCHANGE_RATES: Record<string, number> = { INR: 1, USD: 83.5, GBP: 105.5 };

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

const SUB_FREQUENCY_COLORS: Record<string, string> = {
  MONTHLY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  YEARLY: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ONE_TIME: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
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
  const { data: session, status } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const [data, setData] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [subTotalMonthly, setSubTotalMonthly] = useState(0);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Subscription form state
  const [subForm, setSubForm] = useState({
    service: "",
    amount: "",
    currency: "INR",
    exchangeRate: "1",
    frequency: "MONTHLY",
    status: "ACTIVE",
    category: "",
    projectId: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  // Expenses (for tab)
  const [expenses, setExpenses] = useState<ExpenseWithProject[]>([]);
  // Bug B: allExpenses for category/project detail views (unfiltered by search/category)
  const [allExpenses, setAllExpenses] = useState<ExpenseWithProject[]>([]);
  const [expLoading, setExpLoading] = useState(true);
  const [expSearch, setExpSearch] = useState("");
  const [expSearchDebounced, setExpSearchDebounced] = useState("");
  const [expStartDate, setExpStartDate] = useState("");
  const [expEndDate, setExpEndDate] = useState("");
  const [expCategory, setExpCategory] = useState("");

  // Fix 6: Search debounce timer ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stats
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [projectStats, setProjectStats] = useState<ProjectStat[]>([]);
  const [statsTotal, setStatsTotal] = useState(0);

  // Projects (for dropdown)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Fix 7: Employees (for expense form dropdown)
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Fix 4: Interactive detail expansion for category/project tabs
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Expense add dialog
  const [expDialogOpen, setExpDialogOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category: "",
    description: "",
    amount: "",
    date: "",
    projectId: "",
    employeeId: "",
    paymentRef: "",
    receiptUrl: "",
  });

  const [pendingDelete, setPendingDelete] = useState<{ type: "subscription" | "expense"; id: string } | null>(null);

  // ─── Fetch dashboard data (deferred — only for Overview tab charts) ────
  const [activeTab, setActiveTab] = useState("subscriptions");
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setDashLoading(true);
      setDashError(null);
      const res = await fetch("/api/dashboard", { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json().catch(() => null);
        setData(deepSanitize<DashboardData | null>(raw));
      } else {
        setDashError("Failed to load dashboard data. Please refresh the page.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setDashError("Network error. Please check your connection and refresh.");
    } finally {
      setDashLoading(false);
    }
  }, [router]);

  // ─── Fetch subscriptions ────
  const fetchSubscriptions = useCallback(async (signal?: AbortSignal) => {
    try {
      setSubLoading(true);
      const res = await fetch("/api/subscriptions", { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json();
        const json = deepSanitize<{ subscriptions?: Subscription[]; totalMonthlyCost?: number }>(raw);
        setSubscriptions(json.subscriptions || []);
        setSubTotalMonthly(json.totalMonthlyCost || 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load subscriptions");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    } finally {
      setSubLoading(false);
    }
  }, [router]);

  // ─── Fetch ALL expenses with only date filters (Bug B: for category/project detail views) ────
  const fetchAllExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      params.set("limit", "10000");
      const res = await fetch(`/api/expenses?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json();
        const arr = Array.isArray(raw) ? raw : (raw.data || raw.expenses || []);
        setAllExpenses(deepSanitize<ExpenseWithProject[]>(arr));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [expStartDate, expEndDate, router]);

  // ─── Fetch expenses with filters (Fix 5: proper response parsing) ────
  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      setExpLoading(true);
      const params = new URLSearchParams();
      if (expSearchDebounced) params.set("search", expSearchDebounced);
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      if (expCategory && expCategory !== "ALL") params.set("category", expCategory);
      const res = await fetch(`/api/expenses?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json();
        // Fix 5: API returns { data: [...], total, ... }, not a raw array
        const arr = Array.isArray(raw) ? raw : (raw.data || raw.expenses || []);
        setExpenses(deepSanitize<ExpenseWithProject[]>(arr));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    } finally {
      setExpLoading(false);
    }
  }, [expSearchDebounced, expStartDate, expEndDate, expCategory, router]);

  // ─── Fetch expense stats ────
  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      const res = await fetch(`/api/expenses/stats?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
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
  }, [expStartDate, expEndDate, router]);

  // ─── Fetch projects for dropdowns ────
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.projects || json.data || []);
        setProjects(arr.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [router]);

  // ─── Fetch employees for expense form dropdown (Fix 7) ────
  const fetchEmployees = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/users", { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.users || json.data || []);
        // Filter to non-admin users only (exclude SUPER_ADMIN and ADMIN)
        const filtered = arr.filter(
          (u: { role?: string; id?: string; name?: string }) =>
            u.role && u.role !== "SUPER_ADMIN" && u.role !== "ADMIN"
        );
        setEmployees(filtered.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [router]);

  // Fix 6: Debounced search (300ms)
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setExpSearchDebounced(expSearch);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [expSearch]);

  // PERF: Lazy-load dashboard data only when Overview tab is opened
  const dashLoadedRef = useRef(false);
  useEffect(() => {
    if (activeTab === "overview" && !dashLoadedRef.current && !data) {
      dashLoadedRef.current = true;
      fetchData();
    }
  }, [activeTab, data, fetchData]);

  // Initial data load (runs once) — fetch all finance data in parallel
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetchSubscriptions(signal);
    fetchProjects(signal);
    fetchEmployees(signal);
    fetchAllExpenses(signal);
    fetchExpenses(signal);
    fetchStats(signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch expenses and stats when date/category filters change (not search — that uses debounce)
  useEffect(() => {
    const controller = new AbortController();
    fetchAllExpenses(controller.signal);
    fetchExpenses(controller.signal);
    fetchStats(controller.signal);
    return () => controller.abort();
  }, [expStartDate, expEndDate, expCategory, fetchAllExpenses, fetchExpenses, fetchStats]);

  // ─── Subscription form helpers ────
  const resetSubForm = useCallback(() => {
    setSubForm({
      service: "",
      amount: "",
      currency: "INR",
      exchangeRate: "1",
      frequency: "MONTHLY",
      status: "ACTIVE",
      category: "",
      projectId: "",
      startDate: "",
      endDate: "",
      notes: "",
    });
  }, []);

  const openSubDialog = useCallback((sub?: Subscription | null) => {
    if (sub) {
      setEditingSub(sub);
      setSubForm({
        service: sub.service || "",
        amount: String(sub.amount) || "",
        currency: sub.currency || "INR",
        exchangeRate: String(sub.exchangeRate || DEFAULT_EXCHANGE_RATES[sub.currency || "INR"] || 1),
        frequency: sub.frequency || "MONTHLY",
        status: sub.status || "ACTIVE",
        category: sub.category || "",
        projectId: sub.projectId || "",
        startDate: sub.startDate ? new Date(sub.startDate).toISOString().split("T")[0] : "",
        endDate: sub.endDate ? new Date(sub.endDate).toISOString().split("T")[0] : "",
        notes: sub.notes || "",
      });
    } else {
      setEditingSub(null);
      resetSubForm();
    }
    setSubDialogOpen(true);
  }, [resetSubForm]);

  // handleSaveSubscription with amount + exchangeRate
  const handleSaveSubscription = async () => {
    if (!subForm.service.trim() || !subForm.amount) {
      toast.error("Service name and amount are required");
      return;
    }
    const payload: Record<string, unknown> = {
      service: subForm.service,
      amount: parseFloat(subForm.amount) || 0,
      currency: subForm.currency || "INR",
      exchangeRate: parseFloat(subForm.exchangeRate) || DEFAULT_EXCHANGE_RATES[subForm.currency] || 1,
      frequency: subForm.frequency || "MONTHLY",
      status: subForm.status,
      category: subForm.category || undefined,
      projectId: (subForm.projectId && subForm.projectId !== "NONE") ? subForm.projectId : undefined,
      startDate: subForm.startDate || undefined,
      endDate: subForm.endDate || undefined,
      notes: subForm.notes || undefined,
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

  // ─── Expense add handler (Fix 7: includes employeeId + paymentRef) ────
  const handleAddExpense = async () => {
    const payload: Record<string, unknown> = {
      category: expForm.category,
      description: expForm.description,
      amount: parseFloat(expForm.amount) || 0,
      date: expForm.date || new Date().toISOString().split("T")[0],
      projectId: (expForm.projectId && expForm.projectId !== "NONE") ? expForm.projectId : undefined,
      employeeId: (expForm.employeeId && expForm.employeeId !== "NONE") ? expForm.employeeId : undefined,
      paymentRef: expForm.paymentRef || undefined,
      receiptUrl: expForm.receiptUrl || undefined,
    };

    if (!payload.category || !payload.description || !payload.amount) {
      toast.error("Category, description, and amount are required");
      return;
    }

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Expense added");
        setExpDialogOpen(false);
        setExpForm({ category: "", description: "", amount: "", date: "", projectId: "", employeeId: "", paymentRef: "", receiptUrl: "" });
        fetchExpenses();
        fetchStats();
        fetchAllExpenses();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add expense");
      }
    } catch {
      toast.error("Something went wrong");
    }
  };

  const handleToggleSubscription = async (sub: Subscription) => {
    if (sub.status === "COMPLETED") return; // Cannot resume a completed subscription
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
    setPendingDelete({ type: "subscription", id });
  };

  const handleDeleteExpense = async (id: string) => {
    setPendingDelete({ type: "expense", id });
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "subscription") {
      try {
        const res = await fetch(`/api/subscriptions/${pendingDelete.id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) { toast.success("Subscription deleted"); fetchSubscriptions(); }
        else { const d = await res.json().catch(() => ({})); toast.error(d.error || "Failed to delete subscription"); }
      } catch { toast.error("Failed to delete subscription"); }
    } else if (pendingDelete.type === "expense") {
      try {
        const res = await fetch(`/api/expenses`, { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: pendingDelete.id }) });
        if (res.ok) { toast.success("Expense deleted"); fetchExpenses(); fetchStats(); fetchAllExpenses(); }
        else { const d = await res.json().catch(() => ({})); toast.error(d.error || "Failed to delete expense"); }
      } catch { toast.error("Failed to delete expense"); }
    }
    setPendingDelete(null);
  };

  // ─── Role guard ────
  useEffect(() => {
    if (status === "authenticated" && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, router, userRole]);

  // ─── Fix 3: Sorted subscriptions (active first, then stopped/completed) ────
  const sortedSubscriptions = useMemo(() => {
    const active = subscriptions
      .filter((s) => s.status === "ACTIVE")
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const inactive = subscriptions
      .filter((s) => s.status !== "ACTIVE")
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return [...active, ...inactive];
  }, [subscriptions]);

  // ─── Bug B: Filtered expenses for category/project detail views (use allExpenses, not filtered) ────
  const expensesForCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return allExpenses.filter((e) => e.category === selectedCategory);
  }, [allExpenses, selectedCategory]);

  const expensesForProject = useMemo(() => {
    if (!selectedProject) return [];
    if (selectedProject === "unassigned") return allExpenses.filter((e) => !e.project?.id);
    return allExpenses.filter((e) => e.project?.id === selectedProject);
  }, [allExpenses, selectedProject]);

  // ─── Session loading guard ────
  if (status === "loading") {
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

  if (status !== "authenticated" || (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN")) return null;

  // PERF: Don't block entire page on dashboard data — it loads lazily for Overview tab
  // Summary cards now compute from subscription/expense data directly

  // ─── Computed summary values (from actual subscription + expense data, no heavy /api/dashboard call) ────
  const stats = data?.stats || { totalRevenue: 0, pendingAmount: 0, overdueAmount: 0, totalExpenses: 0, totalApiSpend: 0, monthlyBudget: 0 };
  const invoices = data?.invoices || [];
  const totalManualExpenses = statsTotal; // From expense stats API — already computed
  const totalSubscriptionMonthly = subTotalMonthly;
  const totalCosts = totalManualExpenses + totalSubscriptionMonthly;
  const hasDashData = !!data?.stats;
  const netProfit = hasDashData ? (stats.totalRevenue || 0) - totalCosts : null;

  // Use statsTotal (from stats API) for accurate total, not just paginated expenses
  const displayedExpTotal = statsTotal;

  // ─── Chart data for Overview tab (memoized, only recomputes when dashboard data loads) ────
  const { recentInvoices, revenueData, expenseData } = useMemo(() => {
    if (!data) return { recentInvoices: [] as typeof invoices, revenueData: [] as { month: string; revenue: number; expenses: number }[], expenseData: [] as { name: string; value: number; color: string }[] };
    const inv = invoices.slice(0, 5);
    const now = new Date();
    const months: string[] = [];
    const revenueByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push(d.toLocaleString("default", { month: "short" }));
      revenueByMonth[key] = 0;
      expenseByMonth[key] = 0;
    }
    for (const invoice of invoices) {
      const invDate = new Date(invoice.paidAt || invoice.createdAt || invoice.dueDate);
      const key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
      if (key in revenueByMonth && invoice.status === "PAID") revenueByMonth[key] += invoice.total;
    }
    const expItems = data.expenses || [];
    for (const exp of expItems) {
      const expDate = new Date(exp.date);
      const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
      if (key in expenseByMonth) expenseByMonth[key] += exp.amount;
    }
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (revenueByMonth[currentKey] === 0 && stats.totalRevenue > 0) revenueByMonth[currentKey] = stats.totalRevenue;
    if (expenseByMonth[currentKey] === 0 && stats.totalExpenses > 0) expenseByMonth[currentKey] = stats.totalExpenses;
    const revData = months.map((month, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { month, revenue: revenueByMonth[k] || 0, expenses: expenseByMonth[k] || 0 };
    });
    const expData = [
      { name: "API Costs", value: stats.totalApiSpend, color: "#ef4444" },
      { name: "Expenses", value: stats.totalExpenses, color: "#f59e0b" },
      { name: "Profit", value: Math.max(0, stats.totalRevenue - stats.totalApiSpend - stats.totalExpenses), color: "#22c55e" },
    ].filter((d) => d.value > 0);
    return { recentInvoices: inv, revenueData: revData, expenseData: expData };
  }, [data, invoices, stats.totalRevenue, stats.totalExpenses, stats.totalApiSpend]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Finance Dashboard" description="Track revenue, invoices, expenses & subscriptions">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
            <FileText className="h-4 w-4 mr-1" /> Invoices
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/expenses")}>
            <Receipt className="h-4 w-4 mr-1" /> Full CRUD
          </Button>
        </div>
      </PageHeader>

      {/* ─── Summary Cards with gradient backgrounds ──── */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0 }}>
        <Card className="border-l-4 border-l-green-500 transition-shadow hover:shadow-lg bg-gradient-to-br from-green-50 to-emerald-50/50 dark:from-green-950/20 dark:to-emerald-950/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(safeNumber(stats.totalRevenue))}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
        <Card className="border-l-4 border-l-red-500 transition-shadow hover:shadow-lg bg-gradient-to-br from-red-50 to-orange-50/50 dark:from-red-950/20 dark:to-orange-950/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Manual Expenses</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(safeNumber(totalManualExpenses))}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-l-4 border-l-orange-500 transition-shadow hover:shadow-lg bg-gradient-to-br from-orange-50 to-amber-50/50 dark:from-orange-950/20 dark:to-amber-950/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Auto Subscriptions</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(safeNumber(totalSubscriptionMonthly))}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              </div>
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <Card className={`border-l-4 ${netProfit === null ? "border-l-gray-400" : netProfit >= 0 ? "border-l-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/10" : "border-l-red-600 bg-gradient-to-br from-red-50 to-pink-50/50 dark:from-red-950/20 dark:to-pink-950/10"} transition-shadow hover:shadow-lg`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit (est.)</p>
                {netProfit === null ? (
                  <Skeleton className="h-8 w-28 mt-1" />
                ) : (
                  <p className={`text-2xl font-bold ${netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(safeNumber(netProfit))}
                  </p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${netProfit === null ? "bg-gray-100 dark:bg-gray-900/30" : netProfit >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                {netProfit === null ? <DollarSign className="h-5 w-5 text-gray-400" /> : netProfit >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>

      {/* ─── Fix 8: Reordered Tabs ──── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="expenses">All Expenses</TabsTrigger>
          <TabsTrigger value="category">By Category</TabsTrigger>
          <TabsTrigger value="project">By Project</TabsTrigger>
        </TabsList>

        {/* ─── Overview Tab ──── */}
        <TabsContent value="overview" className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {dashLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
              <Skeleton className="h-64 rounded-lg md:col-span-2" />
            </div>
          ) : dashError ? (
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                  <div>
                    <p className="font-medium text-red-600">Failed to load overview data</p>
                    <p className="text-sm text-muted-foreground">{dashError}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setDashError(null); dashLoadedRef.current = false; fetchData(); }}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Quick Stats Row */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Payments</p>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(safeNumber(stats.pendingAmount))}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(safeNumber(stats.overdueAmount))}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">API Spend <span className="text-xs">(this month)</span></p>
                    <p className="text-2xl font-bold">{formatCurrency(safeNumber(stats.totalApiSpend))}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
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
                        <Pie data={expenseData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}>
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
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{safeText(inv.invoiceNumber, "")}</p>
                          <p className="text-xs text-muted-foreground">{inv.client ? safeText(inv.client.name, "") : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(safeNumber(inv.total))}</span>
                        <Badge className={`text-[10px] ${INVOICE_STATUS_COLORS[inv.status] || ""}`}>{safeText(inv.status, "")}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
          </>
          )}
        </motion.div>
        </TabsContent>
        <TabsContent value="subscriptions" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {subscriptions.filter((s) => s.status === "ACTIVE").length} active of {subscriptions.length} total
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => openSubDialog(null)}
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
              ) : sortedSubscriptions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No subscriptions yet</p>
                  <p className="text-xs">Add your first recurring subscription to track monthly costs</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="hidden sm:table-cell">Rate (to INR)</TableHead>
                        <TableHead>Frequency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">INR</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSubscriptions.map((sub) => {
                        const monthlyInr = sub.monthlyINR;
                        return (
                        <TableRow key={sub.id} className={`${sub.status !== "ACTIVE" ? "opacity-60" : ""} transition-colors hover:bg-muted/50`}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{safeText(sub.service, "")}</p>
                              {sub.category && (
                                <Badge className={`text-[10px] mr-1 ${CATEGORY_BADGE_COLORS[sub.category] || ""}`}>
                                  {safeText(sub.category, "").replace("_", " ")}
                                </Badge>
                              )}
                              {sub.project && <p className="text-xs text-muted-foreground mt-0.5">{safeText(sub.project.name, "")}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="font-medium">{CURRENCY_SYMBOLS[sub.currency] || ""}</span>
                            <span className="ml-0.5">{sub.amount.toLocaleString("en-IN", { minimumFractionDigits: sub.currency === "INR" ? 0 : 2, maximumFractionDigits: sub.currency === "INR" ? 0 : 2 })}</span>
                            <span className="text-[10px] text-muted-foreground block">{sub.currency}</span>
                          </TableCell>
                          <TableCell className="text-sm hidden sm:table-cell">
                            <span className="font-medium">1 {sub.currency} = ₹{(sub.exchangeRate || DEFAULT_EXCHANGE_RATES[sub.currency] || 1).toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${SUB_FREQUENCY_COLORS[sub.frequency] || ""}`}>
                              {safeText(sub.frequency, "")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${SUB_STATUS_COLORS[sub.status] || ""}`}>{safeText(sub.status, "")}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">{formatCurrency(safeNumber(monthlyInr))}</span>
                            {sub.frequency !== "ONE_TIME" && <span className="text-[10px] text-muted-foreground block">/mo</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openSubDialog(sub)}
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total Monthly Cost Card */}
          {subscriptions.length > 0 && (
            <Card className="border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50 to-amber-50/30 dark:from-orange-950/10 dark:to-amber-950/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Total Active Monthly Cost</p>
                    <p className="text-xs text-muted-foreground">Based on {subscriptions.filter((s) => s.status === "ACTIVE").length} active subscriptions</p>
                  </div>
                  <p className="text-xl font-bold text-orange-600">{formatCurrency(safeNumber(subTotalMonthly))}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── All Expenses Tab ──── */}
        <TabsContent value="expenses" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <Label className="text-xs mb-1 block">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by description, employee, project, ref..."
                      className="pl-8"
                      value={expSearch}
                      onChange={(e) => setExpSearch(e.target.value)}
                      aria-label="Search expenses"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Start Date</Label>
                  <Input type="date" value={expStartDate} onChange={(e) => setExpStartDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">End Date</Label>
                  <Input type="date" value={expEndDate} onChange={(e) => setExpEndDate(e.target.value)} />
                </div>
                <div>
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
                <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setExpSearch(""); setExpStartDate(""); setExpEndDate(""); setExpCategory(""); }}
                  >
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setExpDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Expense
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Expenses Summary */}
          {!expLoading && expenses.length > 0 && (
            <Card className="border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-orange-50/30 dark:from-red-950/10 dark:to-orange-950/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Total Displayed Expenses</p>
                    <p className="text-xs text-muted-foreground">{expenses.length} expense(s) found</p>
                  </div>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(safeNumber(displayedExpTotal))}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expenses Table */}
          <Card>
            <CardContent className="p-0">
              {expLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : expenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>{expSearchDebounced ? "No expenses match your search" : "No expenses recorded yet"}</p>
                  <p className="text-xs mt-1">{expSearchDebounced ? "Try different keywords or clear filters" : "Click \"Add Expense\" to create your first record"}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount (INR)</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((exp, idx) => (
                        <TableRow key={exp.id} className={`${idx % 2 === 1 ? "bg-muted/30" : ""} transition-colors hover:bg-muted/50`}>
                          <TableCell className="text-xs">{formatDate(safeText(exp.date, ""))}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${CATEGORY_BADGE_COLORS[exp.category] || ""}`}>
                              {safeText(exp.category, "").replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{exp.project ? safeText(exp.project.name, "—") : "—"}</TableCell>
                          <TableCell className="text-sm">
                            {exp.employee?.name ? (
                              <div className="flex items-center gap-1.5">
                                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                                  {safeText(exp.employee.name, "").charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate">{safeText(exp.employee.name, "")}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <span className="truncate block">{safeText(exp.description, "")}</span>
                            {exp.paymentRef && (
                              <Badge variant="outline" className="text-[9px] mt-0.5 font-normal gap-0.5">
                                <CreditCard className="h-2.5 w-2.5" />
                                {safeText(exp.paymentRef, "")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(safeNumber(exp.amount))}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteExpense(exp.id)} aria-label="Delete expense">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── By Category Tab (Fix 4: interactive detail expansion, Fix 8: progress + percentage) ──── */}
        <TabsContent value="category" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{categoryStats.length} categories &bull; Total: {formatCurrency(safeNumber(statsTotal))}</p>
            {selectedCategory && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
                Collapse All
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryStats.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No expense categories yet</p>
                <p className="text-xs mt-1">Add expenses to see category breakdowns</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
              {categoryStats.map((cat, catIdx) => {
                const pct = statsTotal > 0 ? ((cat.total / statsTotal) * 100) : 0;
                const isExpanded = selectedCategory === cat.category;
                const catExpenses = isExpanded ? expensesForCategory : [];
                return (
                  <motion.div
                    key={cat.category}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: catIdx * 0.04 }}
                    className="space-y-0"
                  >
                    <Card
                      className={`border-l-4 cursor-pointer transition-shadow hover:shadow-md ${CATEGORY_COLORS[cat.category] || "border-l-gray-500"}`}
                      onClick={() => setSelectedCategory(isExpanded ? null : cat.category)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm">{safeText(cat.category, "").replace(/_/g, " ")}</h3>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <Badge variant="outline" className="text-[10px] rounded-full px-2">{safeNumber(cat.count)}</Badge>
                        </div>
                        <p className="text-2xl font-bold">{formatCurrency(safeNumber(cat.total))}</p>
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>% of total</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                          <Progress value={pct} className="mt-1 h-1.5" />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Fix 4: Expandable detail section */}
                    {isExpanded && catExpenses.length > 0 && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {catExpenses.length} expense(s) &bull; Total: {formatCurrency(safeNumber(catExpenses.reduce((s, e) => s + (e.amount || 0), 0)))}
                            </p>
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedCategory(null); }}>
                              Collapse
                            </Button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {catExpenses.map((exp) => (
                              <div key={exp.id} className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted/50">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{safeText(exp.description, "")}</p>
                                  <p className="text-muted-foreground">{formatDate(safeText(exp.date, ""))}{exp.project ? ` • ${safeText(exp.project.name, "")}` : ""}</p>
                                </div>
                                <span className="font-medium ml-2 shrink-0">{formatCurrency(safeNumber(exp.amount))}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {isExpanded && catExpenses.length === 0 && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground text-center py-2">No individual expense records in this view. Try adjusting date filters.</p>
                        </CardContent>
                      </Card>
                    )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            )}
          </div>
        </TabsContent>

        {/* ─── By Project Tab ──── */}
        <TabsContent value="project" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{projectStats.length} project(s) &bull; Total: {formatCurrency(safeNumber(statsTotal))}</p>
            {selectedProject && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)}>
                Collapse All
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectStats.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No project expenses yet</p>
                <p className="text-xs mt-1">Assign expenses to projects to see breakdowns</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
              {projectStats.map((proj, projIdx) => {
                const budgetPct = proj.budget && proj.budget > 0 ? Math.min((proj.total / proj.budget) * 100, 100) : 0;
                const isOverBudget = proj.budget ? proj.total > proj.budget : false;
                const projKey = proj.projectId || "unassigned";
                const isExpanded = selectedProject === projKey;
                const projExpenses = isExpanded ? expensesForProject : [];
                return (
                  <motion.div
                    key={projKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2, delay: projIdx * 0.04 }}
                    className="space-y-0"
                  >
                    <Card
                      className={`border-l-4 cursor-pointer transition-shadow hover:shadow-md ${isOverBudget ? "border-l-red-500" : "border-l-emerald-500"}`}
                      onClick={() => setSelectedProject(isExpanded ? null : projKey)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm truncate max-w-[180px]">{safeText(proj.projectName, "")}</h3>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <Badge variant="outline" className="text-[10px] rounded-full px-2">{safeNumber(proj.count)} entries</Badge>
                        </div>
                        <p className="text-2xl font-bold">{formatCurrency(safeNumber(proj.total))}</p>
                        {proj.budget ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Budget: {formatCurrency(safeNumber(proj.budget))}</span>
                              <span className={isOverBudget ? "text-red-500 font-medium" : ""}>{budgetPct.toFixed(0)}%</span>
                            </div>
                            <Progress value={budgetPct} className={`mt-1 h-1.5 ${isOverBudget ? "[&>div]:bg-red-500" : ""}`} />
                            {isOverBudget && (
                              <p className="text-xs text-red-500 mt-1">Over budget by {formatCurrency(safeNumber(proj.total) - safeNumber(proj.budget))}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-2">No budget set</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Fix 4: Expandable detail section */}
                    {isExpanded && projExpenses.length > 0 && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {projExpenses.length} expense(s) &bull; Total: {formatCurrency(safeNumber(projExpenses.reduce((s, e) => s + (e.amount || 0), 0)))}
                            </p>
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedProject(null); }}>
                              Collapse
                            </Button>
                          </div>
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {projExpenses.map((exp) => (
                              <div key={exp.id} className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted/50">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate">{safeText(exp.description, "")}</p>
                                  <p className="text-muted-foreground">
                                    {formatDate(safeText(exp.date, ""))}
                                    <Badge className={`text-[9px] ml-1 ${CATEGORY_BADGE_COLORS[exp.category] || ""}`}>
                                      {safeText(exp.category, "").replace("_", " ")}
                                    </Badge>
                                  </p>
                                </div>
                                <span className="font-medium ml-2 shrink-0">{formatCurrency(safeNumber(exp.amount))}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {isExpanded && projExpenses.length === 0 && (
                      <Card className="rounded-t-none border-t-0">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground text-center py-2">No individual expense records in this view. Try adjusting date filters.</p>
                        </CardContent>
                      </Card>
                    )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── Subscription Dialog ──── */}
      <Dialog open={subDialogOpen} onOpenChange={(open) => { setSubDialogOpen(open); if (!open) setEditingSub(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
            <DialogDescription>{editingSub ? "Update subscription details." : "Add a new recurring subscription."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Service Name *</Label>
              <Input
                value={subForm.service}
                onChange={(e) => setSubForm((f) => ({ ...f, service: e.target.value }))}
                placeholder="e.g., ChatGPT Subscription"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={subForm.amount}
                  onChange={(e) => setSubForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g., 10"
                />
                <p className="text-[9px] text-muted-foreground mt-0.5">Actual cost in selected currency</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select
                  value={subForm.currency}
                  onValueChange={(v) => setSubForm((f) => ({ ...f, currency: v, exchangeRate: String(DEFAULT_EXCHANGE_RATES[v] || 1) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR ₹</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                    <SelectItem value="GBP">GBP £</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate (to INR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={subForm.exchangeRate}
                  onChange={(e) => setSubForm((f) => ({ ...f, exchangeRate: e.target.value }))}
                  placeholder="1"
                />
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  1 {subForm.currency} = ₹{parseFloat(subForm.exchangeRate) || DEFAULT_EXCHANGE_RATES[subForm.currency] || 1}
                  {subForm.currency !== "INR" && (
                    <button
                      type="button"
                      className="ml-1 text-primary underline hover:no-underline"
                      onClick={() => setSubForm((f) => ({ ...f, exchangeRate: String(DEFAULT_EXCHANGE_RATES[f.currency] || 1) }))}
                    >
                      Reset
                    </button>
                  )}
                </p>
              </div>
            </div>
            {/* Status + Frequency + Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={subForm.status} onValueChange={(v) => setSubForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="STOPPED">Stopped</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Frequency</Label>
                <Select value={subForm.frequency} onValueChange={(v) => setSubForm((f) => ({ ...f, frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="YEARLY">Yearly</SelectItem>
                    <SelectItem value="ONE_TIME">One Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={subForm.category} onValueChange={(v) => setSubForm((f) => ({ ...f, category: v }))}>
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={subForm.projectId} onValueChange={(v) => setSubForm((f) => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={subForm.startDate}
                  onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={subForm.endDate}
                  onChange={(e) => setSubForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={subForm.notes}
                onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => { setSubDialogOpen(false); setEditingSub(null); }}>Cancel</Button>
              <Button type="button" onClick={handleSaveSubscription}>{editingSub ? "Update" : "Add"} Subscription</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Expense Add Dialog ──── */}
      <Dialog open={expDialogOpen} onOpenChange={(open) => { setExpDialogOpen(open); if (!open) setExpForm({ category: "", description: "", amount: "", date: "", projectId: "", employeeId: "", paymentRef: "", receiptUrl: "" }); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Add a new expense record with optional employee and payment reference.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={expForm.category} onValueChange={(v) => setExpForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (INR) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input
                value={expForm.description}
                onChange={(e) => setExpForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What was this expense for?"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={expForm.date}
                  onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select value={expForm.projectId} onValueChange={(v) => setExpForm((f) => ({ ...f, projectId: v }))}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={expForm.employeeId} onValueChange={(v) => setExpForm((f) => ({ ...f, employeeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Ref</Label>
                <Input
                  value={expForm.paymentRef}
                  onChange={(e) => setExpForm((f) => ({ ...f, paymentRef: e.target.value }))}
                  placeholder="Transaction ID / reference"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Receipt URL</Label>
              <Input
                value={expForm.receiptUrl}
                onChange={(e) => setExpForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setExpDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleAddExpense}>Add Expense</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "subscription"
                ? "This subscription will be permanently deleted. This action cannot be undone."
                : "This expense record will be permanently deleted. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
