"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { handleFetchError } from "@/lib/fetch-utils";
import {
  Plus, Trash2, AlertCircle, Search, DollarSign, Receipt,
  Tag, FolderOpen, User, Hash, Calendar, Pencil, Eye, CreditCard,
  TrendingUp, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { CollapsibleStatStrip } from "@/components/collapsible-stat-strip";
import { cn, safeText, safeNumber } from "@/lib/utils";
import { formatCurrency, formatDate, CATEGORY_BADGE_COLORS, safeUrl } from "@/lib/format";
import { EditExpenseDialog } from "@/components/dashboard/finance/edit-expense-dialog";
import type { ExpenseDetail } from "@/components/dashboard/finance/expense-detail-sheet";

// Safety limit for client-side expense aggregation
const MAX_EXPENSE_FETCH = 10000;

// ━━ Types ━━
interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt?: string;
  project?: { id: string; name: string } | null;
  employee?: { id: string; name: string } | null;
  paymentRef?: string | null;
  receiptUrl?: string | null;
}

// ━━ Constants ━━
const EXPENSE_CATEGORIES = [
  "HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING",
  "SALARY", "SOFTWARE", "OTHER",
];

// categoryBadgeColors imported from @/lib/format as CATEGORY_BADGE_COLORS

const categoryBorderColors: Record<string, string> = {
  HOSTING: "border-l-purple-500",
  DOMAINS: "border-l-blue-500",
  API_COSTS: "border-l-red-500",
  TOOLS: "border-l-cyan-500",
  MARKETING: "border-l-orange-500",
  SALARY: "border-l-emerald-500",
  SOFTWARE: "border-l-indigo-500",
  OTHER: "border-l-gray-500",
};

// ━━ Helpers ━━
function isExpenseDetail(obj: unknown): obj is ExpenseDetail {
  return typeof obj === "object" && obj !== null && "id" in obj && "amount" in obj;
}

// ━━ Main Page ━━
export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  // ━━ State ━━
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Edit expense dialog
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseDetail | null>(null);

  // Preview expense
  const [previewExpense, setPreviewExpense] = useState<Expense | null>(null);

  // ━━ Fetch data ━━
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [expRes, projRes, empRes] = await Promise.all([
        fetch("/api/expenses?limit=" + MAX_EXPENSE_FETCH, { credentials: "include", signal }),
        fetch("/api/projects", { credentials: "include", signal }),
        fetch("/api/team", { credentials: "include", signal }),
      ]);
      if (handleFetchError(expRes, router)) return;
      if (expRes.ok) {
        const raw = await expRes.json().catch(() => null);
        const arr = Array.isArray(raw) ? raw : (raw.data || raw.expenses || []);
        setExpenses(arr);
      }
      if (projRes.ok) {
        const projData = await projRes.json().catch(() => null);
        const projArr = Array.isArray(projData) ? projData : (projData.projects || projData.data || []);
        setProjects(projArr.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }
      if (empRes.ok) {
        const empData = await empRes.json().catch(() => null);
        const empArr = Array.isArray(empData) ? empData : (empData.users || empData.data || []);
        const filtered = empArr.filter(
          (u: { role?: string }) => u.role && u.role !== "SUPER_ADMIN" && u.role !== "ADMIN"
        );
        setEmployees(filtered.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // ━━ Add Expense ━━
  const [addForm, setAddForm] = useState({
    category: "", description: "", amount: "", date: "",
    projectId: "", employeeId: "", paymentRef: "", receiptUrl: "",
  });

  const resetAddForm = () => {
    setAddForm({ category: "", description: "", amount: "", date: "", projectId: "", employeeId: "", paymentRef: "", receiptUrl: "" });
  };

  const handleAddExpense = async () => {
    if (!addForm.category || !addForm.description || !addForm.amount) {
      toast.error("Category, description, and amount are required");
      return;
    }

    const payload = {
      category: addForm.category,
      description: addForm.description,
      amount: parseFloat(addForm.amount) || 0,
      date: addForm.date || new Date().toISOString().split("T")[0],
      projectId: (addForm.projectId && addForm.projectId !== "NONE") ? addForm.projectId : undefined,
      employeeId: (addForm.employeeId && addForm.employeeId !== "NONE") ? addForm.employeeId : undefined,
      paymentRef: addForm.paymentRef || undefined,
      receiptUrl: addForm.receiptUrl || undefined,
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Expense added");
        setAddOpen(false);
        resetAddForm();
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, "Failed to add expense"));
      }
    } catch {
      toast.error("Failed to add expense");
    }
  };

  // ━━ Delete ━━
  const executeDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch("/api/expenses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: pendingDelete }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) { toast.success("Expense deleted"); fetchData(); }
      else { const data = await res.json().catch(() => ({})); toast.error(safeText(data.error, "Failed to delete expense")); }
    } catch { toast.error("Failed to delete expense"); }
    setPendingDelete(null);
  };

  // ━━ Filter & Search ━━
  const filtered = useMemo(() => {
    let result = expenses;
    if (categoryFilter !== "ALL") {
      result = result.filter((e) => e.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (e) =>
          safeText(e.description).toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.category.replace(/_/g, " ").toLowerCase().includes(q) ||
          (e.project?.name || "").toLowerCase().includes(q) ||
          (e.employee?.name || "").toLowerCase().includes(q) ||
          (e.paymentRef || "").toLowerCase().includes(q) ||
          e.amount.toString().includes(q)
      );
    }
    return result;
  }, [expenses, categoryFilter, searchQuery]);

  // REMOVED: Empty useEffect that did nothing

  // ━━ Summary Stats ━━
  const summaryStats = useMemo(() => {
    const total = expenses.reduce((s, e) => s + safeNumber(e.amount), 0);
    const count = expenses.length;
    const avgPerExpense = count > 0 ? total / count : 0;

    // Count unique categories
    const catSet = new Set(expenses.map((e) => e.category));
    // Count unique employees
    const empSet = new Set(expenses.filter((e) => e.employee?.id).map((e) => e.employee!.id));

    return { total, count, avgPerExpense, categoryCount: catSet.size, employeeCount: empSet.size };
  }, [expenses]);

  // ━━ Auth guard ━━
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 animate-pulse">
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-44 rounded-xl" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 animate-pulse">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4 mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || !isAdminUser) return null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-red-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium text-red-600">Failed to load expenses</p>
          <p className="text-sm text-muted-foreground">{safeText(error)}</p>
        </div>
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━ Page Header ━━ */}
      <PageHeader title="Expenses" description="Track and manage all business expenses">
        <Dialog
          open={addOpen}
          onOpenChange={(open) => { setAddOpen(open); if (!open) resetAddForm(); }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
              <DialogTitle>Add Expense</DialogTitle>
              <DialogDescription>
                Create a new expense record. Assign to a project or employee as needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 min-h-0 px-5 pb-5">
              {/* Row 1: Category + Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Category *</Label>
                  <Select value={addForm.category} onValueChange={(v) => setAddForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Amount (INR) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.amount}
                    onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </div>

              {/* Row 2: Description */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Description *</Label>
                <Input
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What was this expense for?"
                  className="rounded-xl"
                />
              </div>

              {/* Row 3: Date + Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Date</Label>
                  <Input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Project</Label>
                  <Select value={addForm.projectId} onValueChange={(v) => setAddForm((f) => ({ ...f, projectId: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="No project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No Project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{safeText(p.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 4: Employee + Payment Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Employee</Label>
                  <Select value={addForm.employeeId} onValueChange={(v) => setAddForm((f) => ({ ...f, employeeId: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>{safeText(emp.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Payment Ref</Label>
                  <Input
                    value={addForm.paymentRef}
                    onChange={(e) => setAddForm((f) => ({ ...f, paymentRef: e.target.value }))}
                    placeholder="Transaction ID / reference"
                    className="rounded-xl"
                  />
                </div>
              </div>

              {/* Row 5: Receipt URL */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Receipt URL</Label>
                <Input
                  value={addForm.receiptUrl}
                  onChange={(e) => setAddForm((f) => ({ ...f, receiptUrl: e.target.value }))}
                  placeholder="https://..."
                  className="rounded-xl"
                />
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button type="button" onClick={handleAddExpense} className="rounded-xl">
                  <Plus className="h-4 w-4 mr-1" /> Add Expense
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <CollapsibleStatStrip
        title="Expense summary"
        storageKey="finance-expenses-stats-open"
        defaultOpen={false}
        items={[
          {
            key: "total",
            label: "Total expenses",
            value: formatCurrency(summaryStats.total),
            hint: `${summaryStats.count} expense(s)`,
            icon: <DollarSign className="h-4 w-4 text-primary" />,
          },
          {
            key: "avg",
            label: "Avg per expense",
            value: formatCurrency(Math.round(summaryStats.avgPerExpense)),
            icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
          },
          {
            key: "cats",
            label: "Categories",
            value: summaryStats.categoryCount,
            icon: <Tag className="h-4 w-4 text-sky-600" />,
          },
          {
            key: "emps",
            label: "Employees",
            value: summaryStats.employeeCount,
            hint: "With assigned expenses",
            icon: <User className="h-4 w-4 text-teal-700" />,
          },
        ]}
      />

      {/* ━━ 2. Filter Bar ━━ */}
      <div className={cn("bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4")}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by description, employee, project, ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44 rounded-xl">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ━━ 3. Expense Cards ━━ */}
      {filtered.length === 0 && !loading ? (
        <div className={cn(
          "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-12",
          "flex flex-col items-center justify-center gap-3"
        )}>
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <Receipt className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium text-muted-foreground">No expenses found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || categoryFilter !== "ALL"
                ? "Try adjusting your search or filters"
                : "Create your first expense to get started"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exp) => (
            <div
              key={safeText(exp.id)}
              className={cn(
                "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
                "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
                "cursor-pointer group",
                categoryBorderColors[exp.category] ? `border-l-4 ${categoryBorderColors[exp.category]}` : ""
              )}
              onClick={() => setPreviewExpense(exp)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewExpense(exp); }
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: Category badge + Details */}
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-muted/60">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-[10px] px-2 py-0.5", CATEGORY_BADGE_COLORS[exp.category] || "")}>
                        {safeText(exp.category, "").replace(/_/g, " ")}
                      </Badge>
                      {exp.employee && (
                        <Badge className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                          <User className="h-2.5 w-2.5 mr-0.5" />
                          {safeText(exp.employee.name)}
                        </Badge>
                      )}
                      {exp.project && (
                        <Badge className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          <FolderOpen className="h-2.5 w-2.5 mr-0.5" />
                          {safeText(exp.project.name)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium">{safeText(exp.description, "—")}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(exp.date)}
                      </span>
                      {exp.paymentRef && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />
                          {safeText(exp.paymentRef)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amount + Actions */}
                <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                  <div className="text-right sm:min-w-[100px]">
                    <p className="text-xl font-bold">{formatCurrency(safeNumber(exp.amount))}</p>
                  </div>
                  <div
                    className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewExpense(exp)} aria-label="View expense" title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (isExpenseDetail(exp)) { setEditingExpense(exp); setEditExpenseOpen(true); } }} aria-label="Edit expense" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setPendingDelete(exp.id)} aria-label="Delete expense" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ━━ Expense Preview Dialog ━━ */}
      <Dialog open={!!previewExpense} onOpenChange={(open) => { if (!open) setPreviewExpense(null); }}>
        {previewExpense && (
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Expense Details</DialogTitle>
              <DialogDescription>View full details of this expense record.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Category & Amount */}
              <div className="flex items-center justify-between">
                <Badge className={cn("text-xs px-3 py-1", CATEGORY_BADGE_COLORS[previewExpense.category] || "")}>
                  {safeText(previewExpense.category, "").replace(/_/g, " ")}
                </Badge>
                <p className="text-3xl font-bold">{formatCurrency(safeNumber(previewExpense.amount))}</p>
              </div>

              <Separator />

              {/* Details Grid */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Description</p>
                    <p className="text-sm font-medium">{safeText(previewExpense.description, "—")}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Date</p>
                    <p className="text-sm font-medium">{formatDate(previewExpense.date)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Project</p>
                    <p className="text-sm font-medium">{previewExpense.project ? safeText(previewExpense.project.name) : "No Project"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Employee</p>
                    <p className="text-sm font-medium">{previewExpense.employee ? safeText(previewExpense.employee.name) : "Unassigned"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Payment Reference</p>
                    <p className="text-sm font-medium">{previewExpense.paymentRef ? safeText(previewExpense.paymentRef) : "None"}</p>
                  </div>
                </div>

                {previewExpense.receiptUrl && (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">Receipt</p>
                      <a href={safeUrl(previewExpense.receiptUrl)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:text-primary/80">
                        View Receipt
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => { setPreviewExpense(null); if (isExpenseDetail(previewExpense)) { setEditingExpense(previewExpense); setEditExpenseOpen(true); } }}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/40" onClick={() => { setPreviewExpense(null); setPendingDelete(previewExpense.id); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ━━ Edit Expense Dialog (shared component) ━━ */}
      <EditExpenseDialog
        open={editExpenseOpen}
        onOpenChange={setEditExpenseOpen}
        expense={editingExpense as Parameters<typeof EditExpenseDialog>[0]["expense"]}
        projects={projects}
        employees={employees}
        onSuccess={() => { fetchData(); }}
      />

      {/* ━━ Delete Confirmation Dialog ━━ */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This expense record will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
