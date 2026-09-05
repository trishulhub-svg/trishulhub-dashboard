"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  FileDown,
  FileText,
  Gauge,
  HandCoins,
  Loader2,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { FinanceReportSection } from "@/components/dashboard/finance/finance-report-section";
import { handleFetchError } from "@/lib/fetch-utils";
import { formatCurrency } from "@/lib/format";
import { useFinanceLiveRefresh } from "@/lib/finance-events";
import { useUrlState } from "@/hooks/use-url-state";
import { ClientsView, ProjectsView } from "./finance-details";
import { OwnerAttention, ProjectFocus, RecentInvoices } from "./finance-panels";
import { FINANCE_TABS, type AgencyFinanceOverview } from "./finance-view-model";

const OverviewCharts = dynamic(() => import("./overview-charts"), {
  ssr: false,
});
function FinanceLoading() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3"
      aria-busy="true"
    >
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Preparing your agency finance view…
      </p>
    </div>
  );
}

function MoneyCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Banknote;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-destructive"
        : "";
  return (
    <Card className="border-border/80">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p
              className={`mt-1 truncate text-xl font-semibold tabular-nums sm:text-2xl ${toneClass}`}
            >
              {formatCurrency(value)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/50 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancePage() {
  return (
    <Suspense fallback={<FinanceLoading />}>
      <FinancePageInner />
    </Suspense>
  );
}

function FinancePageInner() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<AgencyFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawTab, setRawTab] = useUrlState("tab", "overview");
  const activeTab = FINANCE_TABS.has(rawTab) ? rawTab : "overview";

  const loadOverview = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/finance/overview?months=6", {
          credentials: "include",
          signal,
        });
        if (handleFetchError(response, router)) return;
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Finance overview could not be loaded");
        }
        setData(await response.json());
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Finance overview could not be loaded",
        );
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!["SUPER_ADMIN", "ADMIN"].includes(session.user.role)) {
      router.replace("/dashboard");
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => void loadOverview(controller.signal));
    return () => controller.abort();
  }, [loadOverview, router, session?.user.role, status]);

  useEffect(() => {
    if (!FINANCE_TABS.has(rawTab)) setRawTab("overview");
  }, [rawTab, setRawTab]);

  useFinanceLiveRefresh(() => void loadOverview());

  const attentionCount = useMemo(
    () =>
      data
        ? data.attention.overdueInvoices +
          data.attention.projectsOverBudget +
          data.attention.projectsAtRisk +
          data.attention.projectsMissingBudget +
          data.attention.activeProjectsWithoutInvoices +
          data.attention.unassignedExpenses.count
        : 0,
    [data],
  );

  if (status === "loading" || (status === "authenticated" && loading && !data))
    return <FinanceLoading />;
  if (
    status !== "authenticated" ||
    !["SUPER_ADMIN", "ADMIN"].includes(session.user.role)
  )
    return null;
  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <h1 className="font-semibold">Finance overview unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => void loadOverview()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) return <FinanceLoading />;

  const resultPositive = data.summary.recordedResult >= 0;
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Agency Finance"
        description={`Private owner view · ${data.period.label} · projects, cash, costs and collections`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadOverview()}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </Button>
        <Button size="sm" asChild>
          <Link href="/dashboard/finance/invoices">
            <FileText className="mr-1.5 h-4 w-4" /> New invoice
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          {
            href: "/dashboard/finance/invoices",
            icon: FileText,
            title: "Invoices",
            description: "Create, send and collect client billing",
          },
          {
            href: "/dashboard/finance/expenses",
            icon: Receipt,
            title: "Expenses",
            description: "Direct costs, subscriptions and salaries",
          },
          {
            href: "/dashboard/finance/pnl",
            icon: TrendingUp,
            title: "P&L",
            description: "Recorded revenue, costs and monthly performance",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-w-0 items-center gap-2.5 rounded-lg border bg-card px-3 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <item.icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {item.title}
              </span>
              <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {item.description}
              </span>
            </span>
            <ArrowRight className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
          </Link>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setRawTab} className="space-y-5">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList className="inline-flex h-auto min-w-full justify-start p-1 sm:min-w-0">
            <TabsTrigger value="overview">Owner overview</TabsTrigger>
            <TabsTrigger value="projects">Project financials</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MoneyCard
              label="Cash collected"
              value={data.summary.cashCollected}
              description="Payments received this month"
              icon={HandCoins}
              tone="success"
            />
            <MoneyCard
              label="Invoiced"
              value={data.summary.invoiced}
              description="Invoices created this month"
              icon={FileText}
            />
            <MoneyCard
              label="Outstanding"
              value={data.summary.outstanding}
              description={`${data.attention.overdueInvoices} overdue invoice${data.attention.overdueInvoices === 1 ? "" : "s"}`}
              icon={CalendarClock}
              tone={data.summary.overdue > 0 ? "danger" : "default"}
            />
            <MoneyCard
              label="Recorded operating result"
              value={data.summary.recordedResult}
              description="Collected cash minus this month’s recorded costs"
              icon={resultPositive ? TrendingUp : TrendingDown}
              tone={resultPositive ? "success" : "danger"}
            />
          </div>

          <OwnerAttention data={data} count={attentionCount} />
          <OverviewCharts data={data.trend} />
          <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <ProjectFocus
              projects={data.projects}
              onViewAll={() => setRawTab("projects")}
            />
            <RecentInvoices invoices={data.recentInvoices} />
          </div>

          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">
                    Profitability is intentionally marked as recorded, not
                    final.
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    It includes linked expenses and recurring costs. Labour
                    cost, billable rates and retainers can be connected in the
                    next finance phase.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                <Badge variant="outline" className="w-fit">
                  No accounting ledger added
                </Badge>
                <span className="max-w-xs text-[10px] text-muted-foreground sm:text-right">
                  Values are shown as stored in GBP; legacy foreign-currency
                  rows are not silently converted.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects">
          <ProjectsView data={data} />
        </TabsContent>
        <TabsContent value="clients">
          <ClientsView clients={data.clients} />
        </TabsContent>
        <TabsContent value="reports" className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
            <FileDown className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="font-medium">Finance reports</h2>
              <p className="text-sm text-muted-foreground">
                Generate PDF, Google Sheets or Google Docs-compatible reports.
                Files remain organized in Drive for Admin and Super Admin.
              </p>
            </div>
          </div>
          <FinanceReportSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
