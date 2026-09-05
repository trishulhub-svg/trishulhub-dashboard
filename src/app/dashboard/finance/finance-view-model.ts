export type ProjectHealth =
  "OVER_BUDGET" | "WATCH" | "MISSING_BUDGET" | "HEALTHY" | "COMPLETED";

export type AgencyFinanceOverview = {
  period: { label: string; from: string; to: string };
  summary: {
    cashCollected: number;
    invoiced: number;
    outstanding: number;
    overdue: number;
    currentExpenses: number;
    recurringCosts: number;
    oneTimeCosts: number;
    recordedCosts: number;
    recordedResult: number;
    activeProjectValue: number;
  };
  attention: {
    overdueInvoices: number;
    projectsOverBudget: number;
    projectsAtRisk: number;
    projectsMissingBudget: number;
    activeProjectsWithoutInvoices: number;
    unassignedExpenses: { count: number; amount: number };
  };
  projects: Array<{
    id: string;
    name: string;
    status: string;
    budget: number | null;
    clientName: string | null;
    invoiced: number;
    collected: number;
    outstanding: number;
    directExpenses: number;
    monthlyRecurringCost: number;
    recordedCosts: number;
    trackedHours: number;
    budgetUsedPercent: number | null;
    recordedMargin: number;
    health: ProjectHealth;
  }>;
  clients: Array<{
    id: string;
    name: string;
    invoiced: number;
    collected: number;
    outstanding: number;
    projectCount: number;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    clientName: string;
    projectName: string | null;
    total: number;
    collected: number;
    outstanding: number;
    status: string;
    dueDate: string | null;
  }>;
  trend: Array<{
    month: string;
    invoiced: number;
    collected: number;
    costs: number;
  }>;
};

export const FINANCE_TABS = new Set(["overview", "projects", "clients", "reports"]);
export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  OVER_BUDGET: "Over budget",
  WATCH: "Watch",
  MISSING_BUDGET: "Set budget",
  HEALTHY: "Healthy",
  COMPLETED: "Completed",
};
export const HEALTH_CLASS: Record<ProjectHealth, string> = {
  OVER_BUDGET:
    "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  WATCH:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
  MISSING_BUDGET:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  HEALTHY:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  COMPLETED: "border-border bg-muted text-muted-foreground",
};
export const STATUS_CLASS: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  DRAFT: "bg-muted text-muted-foreground",
};
