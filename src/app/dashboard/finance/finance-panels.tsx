"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import { EmptyState } from "./finance-ui";
import { HEALTH_CLASS, HEALTH_LABEL, STATUS_CLASS, type AgencyFinanceOverview } from "./finance-view-model";

export function OwnerAttention({
  data,
  count,
}: {
  data: AgencyFinanceOverview;
  count: number;
}) {
  const items = [
    {
      show: data.attention.overdueInvoices > 0,
      title: `${data.attention.overdueInvoices} overdue invoice${data.attention.overdueInvoices === 1 ? "" : "s"}`,
      value: formatCurrency(data.summary.overdue),
      href: "/dashboard/finance/invoices",
    },
    {
      show: data.attention.projectsOverBudget > 0,
      title: `${data.attention.projectsOverBudget} project${data.attention.projectsOverBudget === 1 ? "" : "s"} over budget`,
      value: "Review costs now",
      href: "/dashboard/finance?tab=projects",
    },
    {
      show: data.attention.projectsAtRisk > 0,
      title: `${data.attention.projectsAtRisk} project${data.attention.projectsAtRisk === 1 ? "" : "s"} above 80%`,
      value: "Budget watch",
      href: "/dashboard/finance?tab=projects",
    },
    {
      show: data.attention.projectsMissingBudget > 0,
      title: `${data.attention.projectsMissingBudget} active project${data.attention.projectsMissingBudget === 1 ? "" : "s"} without budget`,
      value: "Set commercial value",
      href: "/dashboard/projects",
    },
    {
      show: data.attention.activeProjectsWithoutInvoices > 0,
      title: `${data.attention.activeProjectsWithoutInvoices} active project${data.attention.activeProjectsWithoutInvoices === 1 ? "" : "s"} not invoiced`,
      value: "Check billing status",
      href: "/dashboard/finance?tab=projects",
    },
    {
      show: data.attention.unassignedExpenses.count > 0,
      title: `${data.attention.unassignedExpenses.count} unassigned expense${data.attention.unassignedExpenses.count === 1 ? "" : "s"}`,
      value: formatCurrency(data.attention.unassignedExpenses.amount),
      href: "/dashboard/finance/expenses",
    },
  ].filter((item) => item.show);

  return (
    <Card className={count ? "border-amber-300/70 dark:border-amber-900" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle
                className={
                  count
                    ? "h-4 w-4 text-amber-600"
                    : "h-4 w-4 text-muted-foreground"
                }
              />
              Owner attention
            </CardTitle>
            <CardDescription>
              Items that need a decision or follow-up
            </CardDescription>
          </div>
          <Badge variant="outline">
            {count} item{count === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <EmptyState
            title="Nothing urgent"
            description="No overdue invoices or project-cost warnings were found."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {item.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {item.value}
                  </span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectFocus({
  projects,
  onViewAll,
}: {
  projects: AgencyFinanceOverview["projects"];
  onViewAll: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Projects needing focus</CardTitle>
            <CardDescription>Highest financial risk first</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View all <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Project financials will appear after projects are created."
          />
        ) : (
          projects.slice(0, 5).map((project) => (
            <div key={project.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.clientName || "Internal / no client"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={HEALTH_CLASS[project.health]}
                >
                  {HEALTH_LABEL[project.health]}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Collected</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(project.collected)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Visible costs</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(project.recordedCosts)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hours</p>
                  <p className="font-medium tabular-nums">
                    {project.trackedHours.toLocaleString("en-GB")}
                  </p>
                </div>
              </div>
              {project.budgetUsedPercent !== null && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>Recorded cost vs budget</span>
                    <span>{project.budgetUsedPercent}%</span>
                  </div>
                  <Progress
                    value={Math.min(project.budgetUsedPercent, 100)}
                    className="h-1.5"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function RecentInvoices({
  invoices,
}: {
  invoices: AgencyFinanceOverview["recentInvoices"];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Recent invoices</CardTitle>
            <CardDescription>Latest billing activity</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/finance/invoices">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Create an invoice to start tracking collections."
          />
        ) : (
          invoices.map((invoice) => (
            <Link
              key={invoice.id}
              href="/dashboard/finance/invoices"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
            >
              <div className="rounded-md bg-muted p-2">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(invoice.total)}
                  </p>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {invoice.clientName}
                  {invoice.projectName ? ` · ${invoice.projectName}` : ""}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Badge
                    className={
                      STATUS_CLASS[invoice.status] || STATUS_CLASS.DRAFT
                    }
                  >
                    {invoice.status}
                  </Badge>
                  {invoice.outstanding > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {formatCurrency(invoice.outstanding)} open
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

