"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { handleFetchError } from "@/lib/fetch-utils";
import { Plus, Trash2, AlertCircle, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const categoryColors: Record<string, string> = {
  HOSTING: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DOMAINS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  API_COSTS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  TOOLS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  MARKETING: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  SALARY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  SOFTWARE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // Redirect non-admin users away from this page
  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const { data: expensesData = [], isLoading: expensesLoading, error: expensesError } = useQuery({
    queryKey: ["expenses-page"],
    queryFn: async () => {
      const res = await fetch("/api/expenses", { credentials: 'include' });
      if (handleFetchError(res, router)) throw new Error("Unauthorized");
      if (!res.ok) throw new Error("Failed to load expenses");
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
  const expenses = expensesData;
  const loading = expensesLoading;
  const error = expensesError ? (expensesError instanceof Error ? expensesError.message : "Failed to load expenses") : null;

  const { data: projectsData = [] } = useQuery({
    queryKey: ["expenses-projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.projects || data.data || []);
      return arr.map((p: any) => ({ id: p.id, name: p.name }));
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
  const projects = projectsData;

  // Edit expense state
  const [editOpen, setEditOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<{
    id: string; category: string; description: string;
    amount: number; date: string; projectId?: string | null;
  } | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editProjectId, setEditProjectId] = useState("");

  if (status !== "authenticated" || !isAdminUser) return null;



  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      category: form.get("category") as string,
      description: form.get("description") as string,
      amount: parseFloat(form.get("amount") as string),
      date: form.get("date") as string,
      projectId: (form.get("projectId") as string) === "NONE" ? undefined : (form.get("projectId") as string) || undefined,
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Expense added");
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add expense");
      }
    } catch {
      toast.error("Failed to add expense");
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDelete(id);
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch("/api/expenses", { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ id: pendingDelete }) });
      if (handleFetchError(res, router)) return;
      if (res.ok) { toast.success("Expense deleted"); queryClient.invalidateQueries({ queryKey: ["expenses-page"] }); }
      else { const data = await res.json().catch(() => ({})); toast.error(data.error || "Failed to delete expense"); }
    } catch { toast.error("Failed to delete expense"); }
    setPendingDelete(null);
  };

  // ━━ Open Edit Dialog ━━
  const openEditDialog = (expense: { id: string; category: string; description: string; amount: number; date: string; projectId?: string | null }) => {
    setEditCategory(expense.category);
    setEditDescription(expense.description);
    setEditAmount(String(expense.amount));
    setEditDate(expense.date ? expense.date.split("T")[0] : "");
    setEditProjectId(expense.projectId || "NONE");
    setEditExpense(expense);
    setEditOpen(true);
  };

  const handleEditExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editExpense) return;

    const data = {
      id: editExpense.id,
      category: editCategory,
      description: editDescription,
      amount: parseFloat(editAmount),
      date: editDate,
      projectId: editProjectId === "NONE" ? null : editProjectId || null,
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Expense updated");
        setEditOpen(false);
        setEditExpense(null);
        queryClient.invalidateQueries({ queryKey: ["expenses-page"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update expense");
      }
    } catch {
      toast.error("Failed to update expense");
    }
  };

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const totalExpenses = (expenses as { amount: number }[]).reduce((sum, e) => sum + e.amount, 0);

  // Group by category
  const byCategory = (expenses as { category: string; amount: number }[]).reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["expenses-page"] }); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Expenses" description="Track business expenses and costs">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Expense</DialogTitle><DialogDescription>Add a new expense record.</DialogDescription></DialogHeader>
            <form onSubmit={handleAddExpense} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Category *</Label>
                <Select name="category" required>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOSTING">Hosting</SelectItem>
                    <SelectItem value="DOMAINS">Domains</SelectItem>
                    <SelectItem value="API_COSTS">API Costs</SelectItem>
                    <SelectItem value="TOOLS">Tools</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="SALARY">Salary</SelectItem>
                    <SelectItem value="SOFTWARE">Software</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description *</Label>
                <Input name="description" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Amount (₹) *</Label>
                  <Input name="amount" type="number" step="0.01" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input name="date" type="date" required />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project (optional)</Label>
                <Select name="projectId">
                  <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Add Expense</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-xl font-bold">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        {Object.entries(byCategory).map(([cat, amount]) => (
          <Card key={cat}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{cat.replace("_", " ")}</p>
              <p className="text-xl font-bold">{formatCurrency(amount)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expense List */}
      <div className="space-y-2">
        {(expenses as { id: string; category: string; description: string; amount: number; date: string }[]).map((expense) => (
          <Card key={expense.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge className={`text-xs ${categoryColors[expense.category] || ""}`}>
                    {expense.category.replace("_", " ")}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(expense.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(expense as any)} aria-label="Edit expense">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(expense.id)} aria-label="Delete expense">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Expense Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditExpense(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle><DialogDescription>Edit an existing expense record.</DialogDescription></DialogHeader>
          <form onSubmit={handleEditExpense} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Category *</Label>
              <Select value={editCategory} onValueChange={setEditCategory} required>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOSTING">Hosting</SelectItem>
                  <SelectItem value="DOMAINS">Domains</SelectItem>
                  <SelectItem value="API_COSTS">API Costs</SelectItem>
                  <SelectItem value="TOOLS">Tools</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="SALARY">Salary</SelectItem>
                  <SelectItem value="SOFTWARE">Software</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description *</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount (₹) *</Label>
                <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project (optional)</Label>
              <Select value={editProjectId} onValueChange={setEditProjectId}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No Project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This expense record will be permanently deleted. This action cannot be undone.
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
