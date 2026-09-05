"use client";

import { useState, useEffect } from "react";
import { safeText } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { emitFinanceChanged } from "@/lib/finance-events";

import {
  DEFAULT_EXPENSE_CATEGORIES,
  formatExpenseCategoryLabel,
} from "@/lib/expense-categories";

export interface ExpenseWithProject {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  receiptUrl?: string | null;
  project?: { id: string; name: string } | null;
  employee?: { id: string; name: string } | null;
  paymentRef?: string | null;
}

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseWithProject | null;
  onSuccess?: () => void;
  projects?: { id: string; name: string }[];
  employees?: { id: string; name: string }[];
  categories?: string[];
  recordKind?: "expense" | "subscription";
}

export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
  projects = [],
  employees = [],
  categories,
  recordKind = "expense",
}: EditExpenseDialogProps) {
  const categoryOptions =
    categories && categories.length > 0
      ? categories
      : [...DEFAULT_EXPENSE_CATEGORIES];
  const [form, setForm] = useState({
    category: "",
    description: "",
    amount: "",
    date: "",
    projectId: "",
    employeeId: "",
    paymentRef: "",
    receiptUrl: "",
  });
  const [saving, setSaving] = useState(false);

  // Pre-populate form when expense changes
  useEffect(() => {
    if (expense && open) {
      const dateStr = expense.date
        ? expense.date.split("T")[0]
        : "";
      setForm({
        category: safeText(expense.category),
        description: safeText(expense.description),
        amount: String(expense.amount ?? ""),
        date: dateStr,
        projectId: expense.project?.id || "",
        employeeId: expense.employee?.id || "",
        paymentRef: safeText(expense.paymentRef),
        receiptUrl: safeText(expense.receiptUrl),
      });
    }
  }, [expense, open]);

  const handleUpdate = async () => {
    if (!expense) return;

    if (!form.category || !form.description || !form.amount) {
      toast.error("Category, description, and amount are required");
      return;
    }

    if (parseFloat(form.amount) < 0) {
      toast.error("Amount cannot be negative");
      return;
    }

    setSaving(true);
    try {
      if (recordKind === "subscription") {
        const subCategory = [
          "HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER",
        ].includes(form.category)
          ? form.category
          : "OTHER";
        const res = await fetch(`/api/subscriptions/${expense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            id: expense.id,
            service: form.description,
            amount: parseFloat(form.amount) || 0,
            category: subCategory,
            projectId:
              form.projectId && form.projectId !== "NONE" ? form.projectId : null,
            startDate: form.date || undefined,
            notes: form.paymentRef || undefined,
          }),
        });
        if (res.ok) {
          toast.success("Subscription updated");
          emitFinanceChanged();
          onOpenChange(false);
          onSuccess?.();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to update subscription");
        }
        return;
      }

      const payload = {
        id: expense.id,
        category: form.category,
        description: form.description,
        amount: parseFloat(form.amount) || 0,
        date: form.date || new Date().toISOString().split("T")[0],
        projectId:
          form.projectId && form.projectId !== "NONE"
            ? form.projectId
            : undefined,
        employeeId:
          form.employeeId && form.employeeId !== "NONE"
            ? form.employeeId
            : undefined,
        paymentRef: form.paymentRef || undefined,
        receiptUrl: form.receiptUrl || undefined,
      };

      const res = await fetch("/api/expenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Expense updated");
        emitFinanceChanged();
        onOpenChange(false);
        onSuccess?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update expense");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-xl flex flex-col gap-0" formGuardKey={`edit-${recordKind}-${expense?.id || "new"}`}>
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12">
          <DialogTitle>{recordKind === "subscription" ? "Edit Subscription" : "Edit Expense"}</DialogTitle>
          <DialogDescription>
            {recordKind === "subscription"
              ? "Update this subscription. Changes apply to finance totals immediately."
              : "Update this expense record. Fields marked with * are required."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {formatExpenseCategoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (GBP) *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description *</Label>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="What was this expense for?"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, projectId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                  <SelectItem value="NONE">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Employee</Label>
              <Select
                value={form.employeeId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, employeeId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                  <SelectItem value="NONE">None</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Ref</Label>
              <Input
                value={form.paymentRef}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentRef: e.target.value }))
                }
                placeholder="Transaction ID / reference"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Receipt URL</Label>
            <Input
              value={form.receiptUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, receiptUrl: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>

        </div>
        <DialogFooter className="shrink-0 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleUpdate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Update Expense
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
