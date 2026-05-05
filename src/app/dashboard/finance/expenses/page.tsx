"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const categoryColors: Record<string, string> = {
  HOSTING: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DOMAINS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  API_COSTS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  TOOLS: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  MARKETING: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
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

  if (status !== "authenticated" || !isAdminUser) return null;

  const [expenses, setExpenses] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const fetchExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/expenses", { credentials: 'include', signal });
      if (res.ok) setExpenses(await res.json());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchExpenses(controller.signal);
    return () => controller.abort();
  }, [fetchExpenses]);

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      category: form.get("category") as string,
      description: form.get("description") as string,
      amount: parseFloat(form.get("amount") as string),
      date: form.get("date") as string,
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Expense added");
        setAddOpen(false);
        fetchExpenses();
      }
    } catch {
      toast.error("Failed to add expense");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: "DELETE", credentials: 'include' });
      if (res.ok) {
        toast.success("Expense deleted");
        fetchExpenses();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete expense");
      }
    } catch {
      toast.error("Failed to delete expense");
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
        <Button variant="outline" onClick={() => { setError(null); fetchExpenses(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track business expenses and costs</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
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
              <Button type="submit" className="w-full">Add Expense</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                    <p className="text-xs text-muted-foreground">{new Date(expense.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{formatCurrency(expense.amount)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDelete(expense.id)} aria-label="Delete expense">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
