"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useUrlState } from "@/hooks/use-url-state";
import { CollapsibleStatStrip } from "@/components/collapsible-stat-strip";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";

// Dynamic import with ssr:false prevents Recharts hydration/render issues (#310)
const OverviewCharts = dynamic(() => import("./overview-charts"), { ssr: false });

import { handleFetchError } from "@/lib/fetch-utils";
import { deepSanitize, safeText, safeNumber } from "@/lib/utils";
import { formatCurrency, formatDate, CATEGORY_BADGE_COLORS, CURRENCY_SYMBOLS } from "@/lib/format";
import { DEFAULT_EXCHANGE_RATES } from "@/lib/currency";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  formatExpenseCategoryLabel,
} from "@/lib/expense-categories";
import {
  DollarSign, TrendingUp, TrendingDown, FileText, Clock,
  AlertCircle, Search, Plus, Trash2, Pause, Play, Edit3, CreditCard,
  Receipt, FolderOpen, Tag, ChevronDown, ChevronUp, Pencil,
  FileDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { emitFinanceChanged, useFinanceLiveRefresh } from "@/lib/finance-events";
import { PageHeader } from "@/components/page-header";
import { EditExpenseDialog } from "@/components/dashboard/finance/edit-expense-dialog";
import { ExpenseDetailSheet } from "@/components/dashboard/finance/expense-detail-sheet";
import { FinanceReportSection } from "@/components/dashboard/finance/finance-report-section";
import type { ExpenseDetail } from "@/components/dashboard/finance/expense-detail-sheet";
import { SubscriptionExpiryBadge } from "@/components/dashboard/finance/subscription-expiry-badge";
import { SubscriptionExpiryChecker } from "@/components/dashboard/finance/subscription-expiry-checker";

// ─── Types ───────────────────────────────────────────────────────────
interface MonthlyAggregate {
  month: string;
  revenue: number;
  expenses: number;
}

interface DashboardData {
  stats: {
    totalRevenue: number;
    pendingAmount: number;
    overdueAmount: number;
    totalExpenses: number;
    monthlyBudget: number;
    subscriptionMonthlyCost?: number;
  };
  invoices: {
    id: string; invoiceNumber: string; status: string; total: number;
    client: { name: string }; dueDate: string; paidAt?: string; createdAt?: string;
  }[];
  expenses: { id: string; category: string; description: string; amount: number; date: string; project?: { id: string; name: string } }[];
  // Phase 7c: Server-computed monthly aggregates for accurate Overview charts.
  monthlyAggregates?: MonthlyAggregate[];
  subscriptionMonthlyCost?: number;
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
// Safety limit for client-side expense aggregation
const MAX_EXPENSE_FETCH = 10000;

// Task 12: Max records to load into the visible "All Expenses" table. Higher than
// the API's default (50) so admins see a meaningful slice; lower than MAX_EXPENSE_FETCH
// to avoid overloading the table DOM. The total count + amount come from the stats API.
const EXPENSE_TABLE_LIMIT = 500;

const CATEGORY_COLORS: Record<string, string> = {
  HOSTING: "border-l-primary bg-primary/5",
  DOMAINS: "border-l-primary/70 bg-muted/40",
  API_COSTS: "border-l-destructive/70 bg-muted/40",
  TOOLS: "border-l-primary/50 bg-muted/40",
  MARKETING: "border-l-warning bg-muted/40",
  SALARY: "border-l-success bg-muted/40",
  SOFTWARE: "border-l-primary/80 bg-primary/5",
  OTHER: "border-l-muted-foreground/40 bg-muted/40",
};

// CATEGORY_BADGE_COLORS imported from @/lib/format

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

const EXPENSE_CATEGORIES_FALLBACK = [...DEFAULT_EXPENSE_CATEGORIES];
const FINANCE_TABS = new Set(["overview", "subscriptions", "expenses", "category", "project", "reports"]);

function isExpenseDetail(obj: unknown): obj is ExpenseDetail {
  return typeof obj === "object" && obj !== null && "id" in obj && "amount" in obj;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function FinancePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading finance…</div>}>
      <FinancePageInner />
    </Suspense>
  );
}

function FinancePageInner() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const [data, setData] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState<string | null>(null);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subTotalMonthly, setSubTotalMonthly] = useState(0);
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  // Fix (Task 11): Subscription smart search + date filters — previously the
  // subscriptions tab had NO search and ignored the global date range, so users
  // couldn't find subscriptions by name and date filters didn't narrow them.
  const [subSearch, setSubSearch] = useState("");
  const [subSearchDebounced, setSubSearchDebounced] = useState("");
  const subSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live exchange rates (fetched from API, falls back to defaults)
  const [liveRates, setLiveRates] = useState<Record<string, number>>(DEFAULT_EXCHANGE_RATES);
  const [ratesLoaded, setRatesLoaded] = useState(false);

  // Subscription form state
  const [subForm, setSubForm] = useState({
    service: "",
    amount: "",
    currency: "GBP",
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
  // Task 12: Track total entries from stats API so the "N expense(s) found" count
  // stays accurate even when the visible table is capped by pagination.
  const [statsTotalEntries, setStatsTotalEntries] = useState(0);

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

  // Expense edit dialog
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDetail | null>(null);

  // Expense categories (admin-managed)
  const [expenseCategories, setExpenseCategories] = useState<string[]>(EXPENSE_CATEGORIES_FALLBACK);

  // Expense detail sheet
  const [expenseDetailOpen, setExpenseDetailOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseDetail | null>(null);

  // ─── Fetch overview stats (lightweight: 7 queries vs 19 in full dashboard) ────
  const [rawTab, setRawTab] = useUrlState("tab", "overview");
  const activeTab = (() => {
    // Legacy URL/localStorage values from earlier builds
    if (rawTab === "by-category") return "category";
    if (rawTab === "by-project") return "project";
    return FINANCE_TABS.has(rawTab) ? rawTab : "overview";
  })();
  const setActiveTab = useCallback(
    (next: string) => {
      const normalized =
        next === "by-category" ? "category" : next === "by-project" ? "project" : next;
      setRawTab(FINANCE_TABS.has(normalized) ? normalized : "overview");
    },
    [setRawTab]
  );

  // Rewrite legacy tab query/localStorage values so Tabs always match a real panel
  useEffect(() => {
    if (rawTab === "by-category" || rawTab === "by-project" || !FINANCE_TABS.has(rawTab)) {
      setActiveTab(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      setDashLoading(true);
      setDashError(null);
      const res = await fetch("/api/dashboard/stats", { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const raw = await res.json().catch(() => null);
        const sanitized = deepSanitize<DashboardData | null>(raw);
        setData(sanitized);
        const subCost =
          sanitized?.stats?.subscriptionMonthlyCost ??
          (raw as { subscriptionMonthlyCost?: number } | null)?.subscriptionMonthlyCost;
        if (typeof subCost === "number") {
          setSubTotalMonthly(subCost);
        }
        if (typeof sanitized?.stats?.totalExpenses === "number") {
          setStatsTotal(sanitized.stats.totalExpenses);
        }
      } else {
        setDashError("Failed to load overview data. Please refresh the page.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setDashError("Network error. Please check your connection and refresh.");
    } finally {
      setDashLoading(false);
    }
  }, [router]);

  // ─── Fetch subscriptions (Task 11: pass search + date filters) ────
  const fetchSubscriptions = useCallback(async (signal?: AbortSignal) => {
    try {
      setSubLoading(true);
      const params = new URLSearchParams();
      if (subSearchDebounced) params.set("search", subSearchDebounced);
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      // Request a larger page so the UI can display all matching subs in one shot.
      params.set("limit", "200");
      const res = await fetch(`/api/subscriptions?${params.toString()}`, { credentials: "include", signal });
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
  }, [router, subSearchDebounced, expStartDate, expEndDate]);

  // ─── Fetch ALL expenses with only date filters (Bug B: for category/project detail views) ────
  const fetchAllExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      // TODO: Implement server-side aggregation for expense stats to avoid fetching all records
      params.set("limit", String(MAX_EXPENSE_FETCH));
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
  // Task 12: Pass an explicit limit so the table can show more than the API's default
  // (50) without being silently capped by the previous 200-record ceiling.
  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      setExpLoading(true);
      const params = new URLSearchParams();
      if (expSearchDebounced) params.set("search", expSearchDebounced);
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      if (expCategory && expCategory !== "ALL") params.set("category", expCategory);
      params.set("limit", String(EXPENSE_TABLE_LIMIT));
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

  // ─── Fetch expense stats (Task 12: pass search + category filters so stats match the table) ────
  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (expSearchDebounced) params.set("search", expSearchDebounced);
      if (expStartDate) params.set("startDate", expStartDate);
      if (expEndDate) params.set("endDate", expEndDate);
      if (expCategory && expCategory !== "ALL") params.set("category", expCategory);
      const res = await fetch(`/api/expenses/stats?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const json = await res.json();
        setCategoryStats(json.byCategory || []);
        setProjectStats(json.byProject || []);
        setStatsTotal(json.totalExpenses || 0);
        setStatsTotalEntries(typeof json.totalEntries === "number" ? json.totalEntries : 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [expSearchDebounced, expStartDate, expEndDate, expCategory, router]);

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
      const res = await fetch("/api/team", { credentials: "include", signal });
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

  // Fix 6: Debounced expense search (300ms)
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

  // Task 11: Debounced subscription search (300ms) — independent timer from expense search
  useEffect(() => {
    if (subSearchTimerRef.current) {
      clearTimeout(subSearchTimerRef.current);
    }
    subSearchTimerRef.current = setTimeout(() => {
      setSubSearchDebounced(subSearch);
    }, 300);
    return () => {
      if (subSearchTimerRef.current) clearTimeout(subSearchTimerRef.current);
    };
  }, [subSearch]);

  // Overview: single lightweight /api/dashboard/stats call
  useEffect(() => {
    if (activeTab !== "overview") return;
    const controller = new AbortController();
    void (async () => {
      await fetchData(controller.signal);
      // Pull subscription monthly from the same stats payload when available
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Deferred: projects / employees / categories only when expense or subscription forms need them
  useEffect(() => {
    if (
      activeTab !== "expenses" &&
      activeTab !== "category" &&
      activeTab !== "project" &&
      activeTab !== "subscriptions"
    ) {
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    fetchProjects(signal);
    fetchEmployees(signal);
    void (async () => {
      try {
        const res = await fetch("/api/expense-categories", { credentials: "include", signal });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (Array.isArray(data) && data.length > 0) {
          setExpenseCategories(data.map((c: { name: string }) => c.name));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Expense tabs only — not overview (overview uses dashboard/stats)
  useEffect(() => {
    if (activeTab !== "expenses" && activeTab !== "category" && activeTab !== "project") {
      return;
    }
    const controller = new AbortController();
    fetchStats(controller.signal);
    fetchAllExpenses(controller.signal);
    fetchExpenses(controller.signal);
    return () => controller.abort();
  }, [activeTab, expStartDate, expEndDate, expCategory, expSearchDebounced, fetchAllExpenses, fetchExpenses, fetchStats]);

  // Subscriptions tab only
  useEffect(() => {
    if (activeTab !== "subscriptions") return;
    const controller = new AbortController();
    fetchSubscriptions(controller.signal);
    return () => controller.abort();
  }, [activeTab, subSearchDebounced, expStartDate, expEndDate, fetchSubscriptions]);

  useFinanceLiveRefresh(() => {
    void fetchData();
    void fetchSubscriptions();
    void fetchExpenses();
    void fetchStats();
    void fetchAllExpenses();
  });

  // Exchange rates only when subscription dialogs/tabs need them
  useEffect(() => {
    if (activeTab !== "subscriptions" && !subDialogOpen) return;
    const fetchRates = async () => {
      try {
        const res = await fetch("/api/exchange-rates", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.rates) {
            setLiveRates(data.rates);
          }
        }
      } catch (err) {
        console.error("Failed to fetch exchange rates:", err);
      } finally {
        setRatesLoaded(true);
      }
    };
    fetchRates();
  }, [activeTab, subDialogOpen]);

  // ─── Subscription form helpers ────
  const getRateForCurrency = useCallback((currency: string) => {
    return liveRates[currency] || DEFAULT_EXCHANGE_RATES[currency] || 1;
  }, [liveRates]);

  const resetSubForm = useCallback(() => {
    setSubForm({
      service: "",
      amount: "",
      currency: "GBP",
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
        exchangeRate: String(sub.exchangeRate || getRateForCurrency(sub.currency || "INR")),
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
  }, [resetSubForm, getRateForCurrency]);

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
      exchangeRate: parseFloat(subForm.exchangeRate) || getRateForCurrency(subForm.currency) || 1,
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
          emitFinanceChanged();
        } else {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.error || "Failed to update subscription");
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
          emitFinanceChanged();
        } else {
          const errData = await res.json().catch(() => ({}));
          toast.error(errData.error || "Failed to add subscription");
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
        emitFinanceChanged();
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
        emitFinanceChanged();
        fetchSubscriptions();
      } else {
        toast.error("Failed to update subscription status");
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

  // Refetch all expense data (used after edit)
  const refetchAllExpenseData = useCallback(() => {
    fetchExpenses();
    fetchStats();
    fetchAllExpenses();
  }, [fetchExpenses, fetchStats, fetchAllExpenses]);

  const executeDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "subscription") {
      try {
        const res = await fetch(`/api/subscriptions/${pendingDelete.id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) { toast.success("Subscription deleted"); emitFinanceChanged(); fetchSubscriptions(); }
        else { const d = await res.json().catch(() => ({})); toast.error(d.error || "Failed to delete subscription"); }
      } catch { toast.error("Failed to delete subscription"); }
    } else if (pendingDelete.type === "expense") {
      try {
        const res = await fetch(`/api/expenses`, { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: pendingDelete.id }) });
        if (res.ok) { toast.success("Expense deleted"); emitFinanceChanged(); fetchExpenses(); fetchStats(); fetchAllExpenses(); }
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

  // ─── Workspace loading animation (CSS-only — matches dashboard page pattern) ────
  // Layout renders <LoadingScreen /> during SSR, so server/client first-render match.
  // Only blocks during session loading; dashLoading (overview) is lazy per-tab.
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
          <div
            className="absolute inset-2 rounded-full border-[3px] border-muted border-b-primary/50"
            style={{ animation: 'spin 1.8s linear infinite reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <DollarSign className="h-7 w-7 text-primary" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Workspace is updating</h3>
          <p className="text-sm text-muted-foreground animate-pulse">Syncing your finance data...</p>
        </div>
        <div className="flex gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN")) return null;

  // PERF: Don't block entire page on dashboard data — it loads lazily for Overview tab
  // Summary cards now compute from subscription/expense data directly

  // ─── Computed summary values (from actual subscription + expense data, no heavy /api/dashboard call) ────
  const stats = data?.stats || { totalRevenue: 0, pendingAmount: 0, overdueAmount: 0, totalExpenses: 0, monthlyBudget: 0 };
  const invoices = data?.invoices || [];
  const totalManualExpenses = statsTotal; // From expense stats API — already computed
  const totalSubscriptionMonthly = subTotalMonthly;
  const totalCosts = totalManualExpenses + totalSubscriptionMonthly;

  // ─── Current month spend (manual expenses this month + subscriptions) ────
  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return allExpenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + safeNumber(e.amount), 0);
  }, [allExpenses]);
  const monthlySpend = currentMonthExpenses + totalSubscriptionMonthly;
  const hasDashData = !!data?.stats;
  const netProfit = hasDashData ? (stats.totalRevenue || 0) - totalCosts : null;

  // Use statsTotal (from stats API) for accurate total, not just paginated expenses
  const displayedExpTotal = statsTotal;

  // ─── Chart data for Overview tab (memoized, only recomputes when dashboard data loads) ────
  const { recentInvoices, revenueData, expenseData } = useMemo(() => {
    if (!data) return { recentInvoices: [] as typeof invoices, revenueData: [] as { month: string; revenue: number; expenses: number }[], expenseData: [] as { name: string; value: number; color: string }[] };
    const inv = invoices.slice(0, 5);

    // Phase 7c: Prefer server-computed monthlyAggregates (accurate — uses full-table aggregates).
    // Fall back to the legacy in-memory computation only if the API didn't return the field.
    let revData: { month: string; revenue: number; expenses: number }[];
    if (data.monthlyAggregates && data.monthlyAggregates.length > 0) {
      revData = data.monthlyAggregates.map((m) => ({
        month: m.month,
        revenue: safeNumber(m.revenue),
        expenses: safeNumber(m.expenses),
      }));
    } else {
      // Legacy fallback: derive from the limited recent-invoices + recent-expenses sample.
      // NOTE: This undercounts any month with more activity than the sample size.
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
      revData = months.map((month, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return { month, revenue: revenueByMonth[k] || 0, expenses: expenseByMonth[k] || 0 };
      });
    }

    const expData = [
      { name: "Subscriptions", value: totalSubscriptionMonthly, color: "var(--chart-1)" },
      { name: "Manual Expenses", value: stats.totalExpenses, color: "var(--chart-2)" },
      { name: "Profit", value: Math.max(0, stats.totalRevenue - totalCosts), color: "var(--chart-4)" },
    ].filter((d) => d.value > 0);
    return { recentInvoices: inv, revenueData: revData, expenseData: expData };
  }, [data, invoices, stats.totalRevenue, stats.totalExpenses, totalCosts, totalSubscriptionMonthly]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Finance" description="Revenue, invoices, expenses & subscriptions at a glance">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              document.getElementById("finance-report-generator")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }}
          >
            <FileDown className="h-4 w-4 mr-1" /> Generate Report
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/subscriptions")}>
            <CreditCard className="h-4 w-4 mr-1" /> Subscriptions
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/pnl")}>
            P &amp; L
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
            <FileText className="h-4 w-4 mr-1" /> Invoices
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/expenses")}>
            <Receipt className="h-4 w-4 mr-1" /> Expenses
          </Button>
        </div>
      </PageHeader>

      <div id="finance-report-generator" className="scroll-mt-4">
        <FinanceReportSection />
      </div>

      <CollapsibleStatStrip
        title="Finance summary"
        storageKey="finance-hub-stats-open"
        defaultOpen={true}
        items={[
          {
            key: "revenue",
            label: "Revenue",
            value: formatCurrency(safeNumber(stats.totalRevenue)),
            icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
          },
          {
            key: "expenses",
            label: "Manual expenses",
            value: formatCurrency(safeNumber(totalManualExpenses)),
            icon: <DollarSign className="h-4 w-4 text-rose-600" />,
          },
          {
            key: "subs",
            label: "Subscriptions",
            value: `${formatCurrency(safeNumber(totalSubscriptionMonthly))}/mo`,
            icon: <CreditCard className="h-4 w-4 text-sky-600" />,
          },
          {
            key: "profit",
            label: "Net profit (est.)",
            value: netProfit === null ? "…" : formatCurrency(safeNumber(netProfit)),
            icon: netProfit !== null && netProfit < 0
              ? <TrendingDown className="h-4 w-4 text-destructive" />
              : <TrendingUp className="h-4 w-4 text-primary" />,
          },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 scrollbar-none">
          <TabsList className="inline-flex h-auto w-max min-w-full sm:min-w-0 gap-0.5 bg-muted p-1 rounded-lg">
            <TabsTrigger value="overview" className="data-[state=active]:bg-card data-[state=active]:shadow-sm shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-card data-[state=active]:shadow-sm shrink-0">
              <FileDown className="h-3.5 w-3.5 mr-1" /> Reports
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Finance module quick-nav — dedicated pages for each area */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { href: "/dashboard/finance/invoices", icon: FileText, title: "Invoices", desc: "Create, send & track" },
            { href: "/dashboard/finance/subscriptions", icon: CreditCard, title: "Subscriptions", desc: "Recurring costs" },
            { href: "/dashboard/finance/expenses", icon: Receipt, title: "Expenses", desc: "Records & breakdowns" },
            { href: "/dashboard/finance/pnl", icon: TrendingUp, title: "P & L", desc: "Profit & loss view" },
          ].map((m) => (
            <button
              key={m.href}
              type="button"
              onClick={() => router.push(m.href)}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <m.icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{m.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{m.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ─── Overview Tab ──── */}
        <TabsContent value="overview" className="space-y-6">
          <div>
          {dashLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Loading overview data...</p>
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
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setDashError(null); fetchData(); }}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Quick Stats Row — overview-only metrics (not duplicated in top summary) */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="liquid-glass-card border-border transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Payments</p>
                    <p className="text-2xl font-bold tracking-tight">{formatCurrency(safeNumber(stats.pendingAmount))}</p>
                  </div>
                  <div className="th-stat-icon">
                    <Clock className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="liquid-glass-card border-border transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    <p className="text-2xl font-bold tracking-tight text-destructive">{formatCurrency(safeNumber(stats.overdueAmount))}</p>
                  </div>
                  <div className="th-stat-icon">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="liquid-glass-card border-border transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Spend</p>
                    <p className="text-2xl font-bold tracking-tight">{formatCurrency(safeNumber(monthlySpend))}</p>
                  </div>
                  <div className="th-stat-icon">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Only mount Recharts when overview tab is active AND data exists — prevents #310 from ResponsiveContainer in display:none */}
          {activeTab === "overview" && data && (
            <OverviewCharts revenueData={revenueData} expenseData={expenseData} />
          )}
          </>
          )}
          </div>
        </TabsContent>
        <TabsContent value="subscriptions" className="space-y-4">
          {/* Task 11: Subscription search + filter bar (previously missing — subscriptions
              couldn't be searched, and date filters in the expenses tab silently didn't apply here). */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-2 lg:col-span-2">
                  <Label className="text-xs mb-1 block">Search Subscriptions</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by service, category, project, notes..."
                      className="pl-8"
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      aria-label="Search subscriptions"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Start Date</Label>
                  <Input type="date" value={expStartDate} onChange={(e) => setExpStartDate(e.target.value)} aria-label="Subscription start date filter" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">End Date</Label>
                  <Input type="date" value={expEndDate} onChange={(e) => setExpEndDate(e.target.value)} aria-label="Subscription end date filter" />
                </div>
                <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSubSearch(""); setExpStartDate(""); setExpEndDate(""); setExpCategory(""); setExpSearch(""); }}
                  >
                    Clear All Filters
                  </Button>
                  <Button size="sm" onClick={() => openSubDialog(null)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Subscription
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {subscriptions.filter((s) => s.status === "ACTIVE").length} active of {subscriptions.length} shown
                {(subSearchDebounced || expStartDate || expEndDate) && (
                  <span className="ml-1 text-xs">(filtered)</span>
                )}
              </p>
            </div>
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
                  <p>{(subSearchDebounced || expStartDate || expEndDate) ? "No subscriptions match your filters" : "No subscriptions yet"}</p>
                  <p className="text-xs">{(subSearchDebounced || expStartDate || expEndDate) ? "Try different keywords or clear the date filters" : "Add your first recurring subscription to track monthly costs"}</p>
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
                            <span className="font-medium">1 {sub.currency} = ₹{(sub.exchangeRate || liveRates[sub.currency] || DEFAULT_EXCHANGE_RATES[sub.currency] || 1).toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${SUB_FREQUENCY_COLORS[sub.frequency] || ""}`}>
                              {safeText(sub.frequency, "")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <SubscriptionExpiryBadge endDate={sub.endDate} status={sub.status} startDate={sub.startDate} frequency={sub.frequency} />
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
          <SubscriptionExpiryChecker subscriptions={subscriptions} />
          {subscriptions.length > 0 && (
            <Card className="liquid-glass-card border-border border-l-4 border-l-primary">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Total Active Monthly Cost</p>
                    <p className="text-xs text-muted-foreground">Based on {subscriptions.filter((s) => s.status === "ACTIVE").length} active subscriptions</p>
                  </div>
                  <p className="text-xl font-bold tracking-tight">{formatCurrency(safeNumber(subTotalMonthly))}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
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
                    <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                      <SelectItem value="ALL">All Categories</SelectItem>
                      {expenseCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{formatExpenseCategoryLabel(cat)}</SelectItem>
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
            <Card className="liquid-glass-card border-border border-l-4 border-l-destructive/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Total Displayed Expenses</p>
                    <p className="text-xs text-muted-foreground">
                      {statsTotalEntries > expenses.length
                        ? `${expenses.length} shown of ${statsTotalEntries} matching`
                        : `${expenses.length} expense(s) found`}
                      {(expSearchDebounced || expStartDate || expEndDate || (expCategory && expCategory !== "ALL")) && (
                        <span className="ml-1 text-xs">(filtered)</span>
                      )}
                    </p>
                  </div>
                  <p className="text-xl font-bold tracking-tight">{formatCurrency(safeNumber(displayedExpTotal))}</p>
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
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((exp, idx) => (
                        <TableRow key={exp.id} className={`${idx % 2 === 1 ? "bg-muted/30" : ""} transition-colors hover:bg-muted/50 cursor-pointer`} onClick={() => { if (isExpenseDetail(exp)) { setSelectedExpense(exp); setExpenseDetailOpen(true); } }}>
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
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); if (isExpenseDetail(exp)) { setEditingExpense(exp); setEditExpenseOpen(true); } }} aria-label="Edit expense">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); handleDeleteExpense(exp.id); }} aria-label="Delete expense">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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
              <>
              {categoryStats.map((cat, catIdx) => {
                const pct = statsTotal > 0 ? ((cat.total / statsTotal) * 100) : 0;
                const isExpanded = selectedCategory === cat.category;
                const catExpenses = isExpanded ? expensesForCategory : [];
                return (
                  <div
                    key={cat.category}
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
                              <div key={exp.id} className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted/50 cursor-pointer" onClick={() => { if (isExpenseDetail(exp)) { setSelectedExpense(exp); setExpenseDetailOpen(true); } }}>
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
                  </div>
                );
              })}
              </>
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
              <>
              {projectStats.map((proj, projIdx) => {
                const budgetPct = proj.budget && proj.budget > 0 ? Math.min((proj.total / proj.budget) * 100, 100) : 0;
                const isOverBudget = proj.budget ? proj.total > proj.budget : false;
                const projKey = proj.projectId || "unassigned";
                const isExpanded = selectedProject === projKey;
                const projExpenses = isExpanded ? expensesForProject : [];
                return (
                  <div
                    key={projKey}
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
                              <div key={exp.id} className="flex items-center justify-between p-1.5 rounded text-xs hover:bg-muted/50 cursor-pointer" onClick={() => { if (isExpenseDetail(exp)) { setSelectedExpense(exp); setExpenseDetailOpen(true); } }}>
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
                  </div>
                );
              })}
              </>
            )}
          </div>
        </TabsContent>

        {/* ─── Reports Tab ──── */}
        <TabsContent value="reports" className="space-y-4">
          <FinanceReportSection defaultOpen />
        </TabsContent>
      </Tabs>

      {/* ─── Edit Expense Dialog ──── */}
      <EditExpenseDialog
        open={editExpenseOpen}
        onOpenChange={(open) => { setEditExpenseOpen(open); if (!open) setEditingExpense(null); }}
        expense={editingExpense as unknown as ExpenseWithProject | null}
        onSuccess={() => { setEditExpenseOpen(false); setEditingExpense(null); refetchAllExpenseData(); emitFinanceChanged(); toast.success("Expense updated"); }}
        projects={projects}
        employees={employees}
        categories={expenseCategories}
      />

      {/* ─── Expense Detail Sheet ──── */}
      <ExpenseDetailSheet
        open={expenseDetailOpen}
        onOpenChange={setExpenseDetailOpen}
        expense={selectedExpense}
        onEdit={(exp) => { setExpenseDetailOpen(false); setEditingExpense(exp); setEditExpenseOpen(true); }}
        onDelete={(exp) => { setExpenseDetailOpen(false); handleDeleteExpense(exp.id); }}
      />

      {/* ─── Subscription Dialog ──── */}
      <Dialog open={subDialogOpen} onOpenChange={(open) => { setSubDialogOpen(open); if (!open) setEditingSub(null); }}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-xl flex flex-col gap-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12">
            <DialogTitle>{editingSub ? "Edit Subscription" : "Add Subscription"}</DialogTitle>
            <DialogDescription>{editingSub ? "Update subscription details." : "Add a new recurring subscription."}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
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
                  onValueChange={(v) => setSubForm((f) => ({ ...f, currency: v, exchangeRate: String(getRateForCurrency(v)) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
                  1 {subForm.currency} = ₹{parseFloat(subForm.exchangeRate) || getRateForCurrency(subForm.currency)}
                  {subForm.currency !== "INR" && (
                    <button
                      type="button"
                      className="ml-1 text-primary underline hover:no-underline"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/exchange-rates", { credentials: "include" });
                          if (res.ok) {
                            const data = await res.json();
                            if (data?.rates?.[subForm.currency]) {
                              setLiveRates(data.rates);
                              setSubForm((f) => ({ ...f, exchangeRate: String(data.rates[f.currency]) }));
                              return;
                            }
                          }
                        } catch (e) {
                          console.error("Failed to fetch live rate:", e);
                        }
                        // Fallback to current liveRates state
                        setSubForm((f) => ({ ...f, exchangeRate: String(getRateForCurrency(f.currency)) }));
                      }}
                    >
                      {ratesLoaded ? "Reset to Today's Rate" : "Reset"}
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
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
                <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-xl flex flex-col gap-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12">
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Add a new expense record with optional employee and payment reference.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select value={expForm.category} onValueChange={(v) => setExpForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                    {expenseCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{formatExpenseCategoryLabel(cat)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (GBP) *</Label>
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
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
                  <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
