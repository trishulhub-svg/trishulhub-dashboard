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
}

export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  onSuccess,
  projects = [],
  employees = [],
  categories,
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
      <DialogContent className="sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
          <DialogTitle>Edit Expense</DialogTitle>
          <DialogDescription>
            Update this expense record. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto flex-1 min-h-0 px-5 pb-5">
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
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {formatExpenseCategoryLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (INR) *</Label>
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
                <SelectContent>
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
                <SelectContent>
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

          <div className="flex gap-2 justify-end pt-2">
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
