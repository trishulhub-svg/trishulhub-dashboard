"use client";

import { safeText, cn } from "@/lib/utils";
import {
  Calendar,
  FolderOpen,
  User,
  Hash,
  ExternalLink,
  Clock,
  Edit3,
  Trash2,
  Receipt,
  Tag,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ─── Types ───────────────────────────────────────────────────────────
export interface ExpenseDetail {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  createdAt?: string | null;
  projectId?: string | null;
  project?: { id?: string; name?: string } | null;
  employeeId?: string | null;
  employee?: { id?: string; name?: string } | null;
  paymentRef?: string | null;
  receiptUrl?: string | null;
  status?: string | null;
}

interface ExpenseDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseDetail | null;
  onEdit?: (expense: ExpenseDetail) => void;
  onDelete?: (expense: ExpenseDetail) => void;
}

// ─── Constants ───────────────────────────────────────────────────────
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

const STATUS_BADGE_COLORS: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UNPAID: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

// ─── Helpers ─────────────────────────────────────────────────────────
const formatCurrency = (n: number) => {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatDate = (d: string) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (d: string) => {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Detail Row Sub-component ───────────────────────────────────────
function DetailRow({
  icon: Icon,
  label,
  value,
  fallback = "—",
  actionSlot,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  fallback?: string;
  actionSlot?: React.ReactNode;
}) {
  const displayValue = safeText(value, fallback);
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/60 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        {actionSlot ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium break-all">{displayValue}</span>
            {actionSlot}
          </div>
        ) : (
          <p className="text-sm font-medium break-all">{displayValue}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export function ExpenseDetailSheet({
  open,
  onOpenChange,
  expense,
  onEdit,
  onDelete,
}: ExpenseDetailSheetProps) {
  if (!expense) return null;

  const categoryLabel = safeText(expense.category, "OTHER").replace(/_/g, " ");
  const badgeColor =
    CATEGORY_BADGE_COLORS[expense.category] ||
    CATEGORY_BADGE_COLORS["OTHER"] ||
    "";

  const statusLabel = safeText(expense.status, "").toUpperCase();
  const statusColor = statusLabel
    ? STATUS_BADGE_COLORS[statusLabel] ||
      STATUS_BADGE_COLORS["PENDING"] ||
      "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    : null;

  const displayDescription = safeText(expense.description);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-lg overflow-y-auto"
      >
        {/* ─── Header: Category, Amount, Status ──── */}
        <SheetHeader className="pb-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn("text-xs font-medium", badgeColor)}>
              <Tag className="h-3 w-3 mr-1" />
              {categoryLabel}
            </Badge>
            {statusLabel && (
              <Badge
                className={cn(
                  "text-xs font-medium",
                  statusColor
                )}
              >
                {statusLabel}
              </Badge>
            )}
          </div>
          <SheetTitle className="text-3xl font-bold tracking-tight">
            {formatCurrency(expense.amount)}
          </SheetTitle>
          <SheetDescription>
            Expense details for {categoryLabel.toLowerCase()}
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-2" />

        {/* ─── Glassmorphism Details Card ──── */}
        <div className="rounded-xl border bg-background/40 backdrop-blur-sm shadow-sm p-4 space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Details
          </h4>

          {/* Date */}
          <DetailRow
            icon={Calendar}
            label="Expense Date"
            value={expense.date ? formatDate(expense.date) : undefined}
          />

          {/* Project */}
          <DetailRow
            icon={FolderOpen}
            label="Project"
            value={expense.project?.name}
            fallback="No Project"
          />

          {/* Employee */}
          <DetailRow
            icon={User}
            label="Employee"
            value={expense.employee?.name}
            fallback="Unassigned"
          />

          {/* Payment Reference */}
          <DetailRow
            icon={Hash}
            label="Payment Reference"
            value={expense.paymentRef}
            fallback="None"
          />

          {/* Receipt URL */}
          <DetailRow
            icon={Receipt}
            label="Receipt"
            value={expense.receiptUrl}
            fallback="No receipt uploaded"
            actionSlot={
              expense.receiptUrl ? (
                <a
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </a>
              ) : undefined
            }
          />

          {/* Created At */}
          <DetailRow
            icon={Clock}
            label="Created"
            value={expense.createdAt ? formatDateTime(expense.createdAt) : undefined}
          />
        </div>

        <Separator className="my-2" />

        {/* ─── Description Section ──── */}
        {displayDescription && (
          <div className="rounded-xl border bg-background/40 backdrop-blur-sm shadow-sm p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Description
            </h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {displayDescription}
            </p>
          </div>
        )}

        {/* ─── Actions ──── */}
        {(onEdit || onDelete) && (
          <>
            <Separator className="my-2" />
            <div className="flex items-center gap-3">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => onEdit(expense)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit Expense
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 border-red-200 dark:border-red-900/40"
                  onClick={() => onDelete(expense)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
