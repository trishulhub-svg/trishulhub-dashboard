"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  TrendingUp, Receipt, CreditCard, AlertTriangle, DollarSign,
  FileText, ArrowUpRight, ArrowDownRight, RefreshCw, Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, safeText, safeNumber } from "@/lib/utils";

// ━━ Types ━━
interface OverviewSectionProps {
  data: {
    totalRevenue?: number;
    pendingAmount?: number;
    overdueAmount?: number;
    totalExpenses?: number;
    apiSpend?: number;
    recentInvoices?: Array<{
      id: string;
      invoiceNumber?: string;
      clientName?: string;
      amount?: number;
      status?: string;
      dueDate?: string;
      createdAt?: string;
    }>;
    monthlyRevenue?: Array<{ month: string; revenue: number; expenses: number }>;
    expenseBreakdown?: Array<{ name: string; value: number; color: string }>;
  } | null;
  totalManualExpenses: number;
  totalSubscriptionMonthly: number;
  loading: boolean;
  error: string | null;
  onInvoiceClick?: (invoiceId: string) => void;
  onRetry?: () => void;
}

// ━━ Helpers ━━
const formatINR = (amount: number) =>
  `₹${new Intl.NumberFormat("en-IN").format(amount)}`;

const formatDate = (d: string | undefined | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const invoiceStatusStyle: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const invoiceStatusIcon: Record<string, string> = {
  DRAFT: "text-gray-400",
  SENT: "text-blue-500",
  PAID: "text-green-500",
  OVERDUE: "text-red-500",
};

// ━━ Dynamic Chart Import (ssr:false to prevent #310 from ResponsiveContainer) ━━
const OverviewCharts = dynamic(
  () =>
    import("@/app/dashboard/finance/overview-charts").then((m) => ({
      default: m.default,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-card/50 rounded-2xl animate-pulse" />
    ),
  }
);

// ━━ Skeleton Card ━━
function SkeletonCard() {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonSmallCard() {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
}

function SkeletonInvoiceRow() {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl animate-pulse">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

// ━━ Main Component ━━
export default function OverviewSection({
  data,
  totalManualExpenses,
  totalSubscriptionMonthly,
  loading,
  error,
  onInvoiceClick,
  onRetry,
}: OverviewSectionProps) {
  const router = useRouter();

  const totalRevenue = safeNumber(data?.totalRevenue);
  const pendingAmount = safeNumber(data?.pendingAmount);
  const overdueAmount = safeNumber(data?.overdueAmount);
  const apiSpend = safeNumber(data?.apiSpend);
  const recentInvoices = Array.isArray(data?.recentInvoices)
    ? data.recentInvoices
    : [];
  const monthlyRevenue = Array.isArray(data?.monthlyRevenue)
    ? data.monthlyRevenue
    : [];
  const expenseBreakdown = Array.isArray(data?.expenseBreakdown)
    ? data.expenseBreakdown
    : [];

  const netProfit =
    data?.totalRevenue !== undefined
      ? totalRevenue - totalManualExpenses - totalSubscriptionMonthly
      : null;

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Bento cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        {/* Quick stats skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SkeletonSmallCard />
          <SkeletonSmallCard />
          <SkeletonSmallCard />
        </div>
        {/* Charts skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[300px] rounded-2xl" />
          <Skeleton className="h-[300px] rounded-2xl" />
        </div>
        {/* Recent invoices skeleton */}
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonInvoiceRow key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-red-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium text-red-600">Failed to load overview data</p>
          <p className="text-sm text-muted-foreground">{safeText(error)}</p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━ 1. Bento Summary Cards ━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-emerald-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Revenue
              </p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatINR(totalRevenue)}
              </p>
              <p className="text-[11px] text-muted-foreground">from paid invoices</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* Manual Expenses */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-rose-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Manual Expenses
              </p>
              <p className="text-2xl font-bold text-rose-600">
                {formatINR(totalManualExpenses)}
              </p>
              <p className="text-[11px] text-muted-foreground">logged costs</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-rose-600" />
            </div>
          </div>
        </div>

        {/* Auto Subscriptions */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-amber-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Auto Subscriptions
              </p>
              <p className="text-2xl font-bold text-amber-600">
                {formatINR(totalSubscriptionMonthly)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-[11px] text-muted-foreground">recurring</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Net Profit */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            netProfit === null
              ? "border-t-2 border-t-gray-300"
              : netProfit >= 0
                ? "border-t-2 border-t-emerald-500"
                : "border-t-2 border-t-red-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Net Profit
              </p>
              {netProfit === null ? (
                <Skeleton className="h-8 w-28 mt-0.5" />
              ) : (
                <p
                  className={cn(
                    "text-2xl font-bold flex items-center gap-1",
                    netProfit >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {formatINR(netProfit)}
                  {netProfit >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">estimated</p>
            </div>
            <div
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center",
                netProfit === null
                  ? "bg-gray-100 dark:bg-gray-900/30"
                  : netProfit >= 0
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : "bg-red-100 dark:bg-red-900/30"
              )}
            >
              {netProfit === null ? (
                <DollarSign className="h-5 w-5 text-gray-400" />
              ) : netProfit >= 0 ? (
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              ) : (
                <TrendingUp className="h-5 w-5 text-red-600 rotate-180" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ━━ 2. Quick Stats Row ━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Pending */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4",
            "hover:shadow-md transition-shadow duration-200"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Pending
              </p>
              <p className="text-xl font-bold text-amber-600">
                {formatINR(pendingAmount)}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4",
            "hover:shadow-md transition-shadow duration-200"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Overdue
              </p>
              <p className="text-xl font-bold text-red-600">
                {formatINR(overdueAmount)}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
          </div>
        </div>

        {/* API Spend */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4",
            "hover:shadow-md transition-shadow duration-200"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                API Spend
                <span className="normal-case tracking-normal"> (this month)</span>
              </p>
              <p className="text-xl font-bold text-purple-600">
                {formatINR(apiSpend)}
              </p>
            </div>
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ━━ 3. Charts ━━ */}
      <OverviewCharts revenueData={monthlyRevenue} expenseData={expenseBreakdown} />

      {/* ━━ 4. Recent Invoices ━━ */}
      <div
        className={cn(
          "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
          "hover:shadow-md transition-shadow duration-200"
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Recent Invoices</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/finance/invoices")}
            className="gap-1 text-xs"
          >
            View All
            <ArrowUpRight className="h-3 w-3" />
          </Button>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No invoices yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentInvoices.map((inv) => (
              <div
                key={safeText(inv.id, "")}
                role="button"
                tabIndex={0}
                onClick={() => onInvoiceClick?.(safeText(inv.id, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onInvoiceClick?.(safeText(inv.id, ""));
                  }
                }}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl cursor-pointer",
                  "hover:bg-accent/50 hover:shadow-sm",
                  "active:scale-[0.995] transition-all duration-150"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      invoiceStatusIcon[safeText(inv.status, "")]
                        ? invoiceStatusIcon[safeText(inv.status, "")]
                        : "bg-muted"
                    )}
                  >
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {safeText(inv.invoiceNumber, "—")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {safeText(inv.clientName, "Unknown Client")}
                      {" · "}
                      {formatDate(inv.dueDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatINR(safeNumber(inv.amount))}
                  </span>
                  <Badge
                    className={cn(
                      "text-[10px] px-2 py-0.5",
                      invoiceStatusStyle[safeText(inv.status, "")] || ""
                    )}
                  >
                    {safeText(inv.status, "—")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
