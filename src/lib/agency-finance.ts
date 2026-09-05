import { roundMoney } from "@/lib/money";

type DateValue = Date | string | null;

export type AgencyFinanceProject = {
  id: string;
  name: string;
  status: string;
  budget: number | null;
  clientId: string | null;
  clientName: string | null;
};

export type AgencyFinanceInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  status: string;
  dueDate: DateValue;
  paidAt: DateValue;
  createdAt: DateValue;
  updatedAt: DateValue;
  projectId: string | null;
  projectName: string | null;
  clientId: string;
  clientName: string;
  payments: Array<{ amount: number; paidAt: DateValue }>;
};

export type AgencyFinanceExpense = {
  amount: number;
  date: DateValue;
  projectId: string | null;
};

export type AgencyFinanceSubscription = {
  amount: number;
  frequency: string;
  status: string;
  startDate: DateValue;
  endDate: DateValue;
  projectId: string | null;
};

export type AgencyFinanceTimeEntry = {
  projectId: string | null;
  totalHours: number | null;
  date: DateValue;
};

export type AgencyFinanceInput = {
  projects: AgencyFinanceProject[];
  invoices: AgencyFinanceInvoice[];
  expenses: AgencyFinanceExpense[];
  subscriptions: AgencyFinanceSubscription[];
  timeEntries: AgencyFinanceTimeEntry[];
};

export type ProjectFinanceHealth =
  | "OVER_BUDGET"
  | "WATCH"
  | "MISSING_BUDGET"
  | "HEALTHY"
  | "COMPLETED";

function asDate(value: DateValue): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function inRange(value: DateValue, start: Date, end: Date): boolean {
  const date = asDate(value);
  return !!date && date >= start && date < end;
}

function monthlyCost(subscription: AgencyFinanceSubscription): number {
  const amount = Number(subscription.amount || 0);
  if (subscription.frequency === "YEARLY") return amount / 12;
  return subscription.frequency === "ONE_TIME" ? 0 : amount;
}

function activeInMonth(subscription: AgencyFinanceSubscription, start: Date, end: Date): boolean {
  const subscriptionStart = asDate(subscription.startDate);
  const subscriptionEnd = asDate(subscription.endDate);
  if (!subscriptionStart || subscriptionStart >= end) return false;
  if (subscription.status === "ACTIVE") return !subscriptionEnd || subscriptionEnd >= start;
  return !!subscriptionEnd && subscriptionEnd >= start;
}

function invoiceCollected(invoice: AgencyFinanceInvoice): number {
  const payments = roundMoney(
    invoice.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );
  if (payments > 0) return Math.min(payments, Number(invoice.total || 0));
  return invoice.status === "PAID" ? Number(invoice.total || 0) : 0;
}

function invoiceCollectedInRange(invoice: AgencyFinanceInvoice, start: Date, end: Date): number {
  if (invoice.payments.length > 0) {
    return invoice.payments.reduce(
      (sum, payment) => sum + (inRange(payment.paidAt, start, end) ? Number(payment.amount || 0) : 0),
      0
    );
  }
  const paidDate = invoice.paidAt || invoice.updatedAt;
  return invoice.status === "PAID" && inRange(paidDate, start, end) ? Number(invoice.total || 0) : 0;
}

function projectHealth(status: string, budget: number | null, recordedCosts: number): ProjectFinanceHealth {
  if (status === "COMPLETED") return "COMPLETED";
  if (!budget || budget <= 0) return "MISSING_BUDGET";
  const used = recordedCosts / budget;
  if (used > 1) return "OVER_BUDGET";
  if (used >= 0.8) return "WATCH";
  return "HEALTHY";
}

const HEALTH_ORDER: Record<ProjectFinanceHealth, number> = {
  OVER_BUDGET: 5,
  WATCH: 4,
  MISSING_BUDGET: 3,
  HEALTHY: 2,
  COMPLETED: 1,
};

export function buildAgencyFinanceOverview(
  input: AgencyFinanceInput,
  options: { months?: number; now?: Date } = {}
) {
  const now = options.now || new Date();
  const currentMonth = monthStart(now);
  const nextMonth = addMonths(currentMonth, 1);
  const months = Math.min(Math.max(options.months || 6, 1), 12);

  const currentExpenses = input.expenses
    .filter((expense) => inRange(expense.date, currentMonth, nextMonth))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const currentRecurringCosts = input.subscriptions
    .filter((subscription) => activeInMonth(subscription, currentMonth, nextMonth))
    .reduce((sum, subscription) => sum + monthlyCost(subscription), 0);
  const currentOneTimeCosts = input.subscriptions
    .filter(
      (subscription) =>
        subscription.frequency === "ONE_TIME" &&
        inRange(subscription.startDate, currentMonth, nextMonth)
    )
    .reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);
  const cashCollected = input.invoices.reduce(
    (sum, invoice) => sum + invoiceCollectedInRange(invoice, currentMonth, nextMonth),
    0
  );
  const invoiced = input.invoices
    .filter((invoice) => inRange(invoice.createdAt, currentMonth, nextMonth))
    .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);

  const invoiceBalances = input.invoices.map((invoice) => {
    const collected = invoiceCollected(invoice);
    return {
      ...invoice,
      collected,
      outstanding: Math.max(0, roundMoney(Number(invoice.total || 0) - collected)),
    };
  });
  const outstanding = invoiceBalances.reduce((sum, invoice) => sum + invoice.outstanding, 0);
  const overdueInvoices = invoiceBalances.filter((invoice) => {
    const dueDate = asDate(invoice.dueDate);
    return invoice.outstanding > 0 && !!dueDate && dueDate < now;
  });

  const projects = input.projects
    .map((project) => {
      const projectInvoices = invoiceBalances.filter((invoice) => invoice.projectId === project.id);
      const directExpenses = input.expenses
        .filter((expense) => expense.projectId === project.id)
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const recurringCost = input.subscriptions
        .filter(
          (subscription) =>
            subscription.projectId === project.id &&
            activeInMonth(subscription, currentMonth, nextMonth)
        )
        .reduce((sum, subscription) => sum + monthlyCost(subscription), 0);
      const oneTimeSubscriptions = input.subscriptions
        .filter(
          (subscription) =>
            subscription.projectId === project.id && subscription.frequency === "ONE_TIME"
        )
        .reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);
      const trackedHours = input.timeEntries
        .filter((entry) => entry.projectId === project.id)
        .reduce((sum, entry) => sum + Number(entry.totalHours || 0), 0);
      const recordedCosts = directExpenses + recurringCost + oneTimeSubscriptions;
      const projectInvoiced = projectInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.total || 0),
        0
      );
      const projectCollected = projectInvoices.reduce((sum, invoice) => sum + invoice.collected, 0);
      const health = projectHealth(project.status, project.budget, recordedCosts);

      return {
        ...project,
        invoiced: roundMoney(projectInvoiced),
        collected: roundMoney(projectCollected),
        outstanding: roundMoney(projectInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0)),
        directExpenses: roundMoney(directExpenses),
        monthlyRecurringCost: roundMoney(recurringCost),
        recordedCosts: roundMoney(recordedCosts),
        trackedHours: Math.round(trackedHours * 100) / 100,
        budgetUsedPercent:
          project.budget && project.budget > 0
            ? Math.round((recordedCosts / project.budget) * 1000) / 10
            : null,
        recordedMargin: roundMoney(projectCollected - recordedCosts),
        health,
      };
    })
    .sort(
      (a, b) =>
        HEALTH_ORDER[b.health] - HEALTH_ORDER[a.health] ||
        b.outstanding - a.outstanding ||
        a.name.localeCompare(b.name)
    );

  const clientMap = new Map<
    string,
    { id: string; name: string; invoiced: number; collected: number; outstanding: number; projects: Set<string> }
  >();
  for (const project of input.projects) {
    if (!project.clientId) continue;
    const client = clientMap.get(project.clientId) || {
      id: project.clientId,
      name: project.clientName || "Unnamed client",
      invoiced: 0,
      collected: 0,
      outstanding: 0,
      projects: new Set<string>(),
    };
    client.projects.add(project.id);
    clientMap.set(project.clientId, client);
  }
  for (const invoice of invoiceBalances) {
    const client = clientMap.get(invoice.clientId) || {
      id: invoice.clientId,
      name: invoice.clientName,
      invoiced: 0,
      collected: 0,
      outstanding: 0,
      projects: new Set<string>(),
    };
    client.invoiced += Number(invoice.total || 0);
    client.collected += invoice.collected;
    client.outstanding += invoice.outstanding;
    if (invoice.projectId) client.projects.add(invoice.projectId);
    clientMap.set(invoice.clientId, client);
  }

  const trend = Array.from({ length: months }, (_, index) => {
    const start = addMonths(currentMonth, index - months + 1);
    const end = addMonths(start, 1);
    const monthExpenses = input.expenses
      .filter((expense) => inRange(expense.date, start, end))
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const recurringCosts = input.subscriptions
      .filter((subscription) => activeInMonth(subscription, start, end))
      .reduce((sum, subscription) => sum + monthlyCost(subscription), 0);
    const oneTimeCosts = input.subscriptions
      .filter(
        (subscription) =>
          subscription.frequency === "ONE_TIME" && inRange(subscription.startDate, start, end)
      )
      .reduce((sum, subscription) => sum + Number(subscription.amount || 0), 0);

    return {
      month: start.toLocaleString("en-GB", { month: "short" }),
      invoiced: roundMoney(
        input.invoices
          .filter((invoice) => inRange(invoice.createdAt, start, end))
          .reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
      ),
      collected: roundMoney(
        input.invoices.reduce(
          (sum, invoice) => sum + invoiceCollectedInRange(invoice, start, end),
          0
        )
      ),
      costs: roundMoney(monthExpenses + recurringCosts + oneTimeCosts),
    };
  });

  const unassignedExpenses = input.expenses.filter((expense) => !expense.projectId);

  return {
    period: {
      label: currentMonth.toLocaleString("en-GB", { month: "long", year: "numeric" }),
      from: currentMonth.toISOString(),
      to: nextMonth.toISOString(),
    },
    summary: {
      cashCollected: roundMoney(cashCollected),
      invoiced: roundMoney(invoiced),
      outstanding: roundMoney(outstanding),
      overdue: roundMoney(overdueInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0)),
      currentExpenses: roundMoney(currentExpenses),
      recurringCosts: roundMoney(currentRecurringCosts),
      oneTimeCosts: roundMoney(currentOneTimeCosts),
      recordedCosts: roundMoney(currentExpenses + currentRecurringCosts + currentOneTimeCosts),
      recordedResult: roundMoney(
        cashCollected - currentExpenses - currentRecurringCosts - currentOneTimeCosts
      ),
      activeProjectValue: roundMoney(
        input.projects
          .filter((project) => project.status !== "COMPLETED")
          .reduce((sum, project) => sum + Number(project.budget || 0), 0)
      ),
    },
    attention: {
      overdueInvoices: overdueInvoices.length,
      projectsOverBudget: projects.filter((project) => project.health === "OVER_BUDGET").length,
      projectsAtRisk: projects.filter((project) => project.health === "WATCH").length,
      projectsMissingBudget: projects.filter((project) => project.health === "MISSING_BUDGET").length,
      activeProjectsWithoutInvoices: projects.filter(
        (project) => project.status !== "COMPLETED" && project.invoiced === 0
      ).length,
      unassignedExpenses: {
        count: unassignedExpenses.length,
        amount: roundMoney(
          unassignedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
        ),
      },
    },
    projects,
    clients: [...clientMap.values()]
      .map((client) => ({
        id: client.id,
        name: client.name,
        invoiced: roundMoney(client.invoiced),
        collected: roundMoney(client.collected),
        outstanding: roundMoney(client.outstanding),
        projectCount: client.projects.size,
      }))
      .sort((a, b) => b.outstanding - a.outstanding || b.invoiced - a.invoiced),
    recentInvoices: invoiceBalances
      .sort(
        (a, b) =>
          (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0)
      )
      .slice(0, 5)
      .map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        projectName: invoice.projectName,
        total: roundMoney(Number(invoice.total || 0)),
        collected: roundMoney(invoice.collected),
        outstanding: roundMoney(invoice.outstanding),
        status: invoice.status,
        dueDate: asDate(invoice.dueDate)?.toISOString() || null,
      })),
    trend,
  };
}
