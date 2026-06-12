"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Rocket, DollarSign, FolderKanban, TrendingUp, AlertCircle,
  Clock, ArrowRight, Plus, Send, Shield,
  ClipboardList, Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, safeArray, safeJsonParse, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

interface EarningsEntry {
  id: string;
  description: string;
  amount: number;
  date: string;
  paymentRef: string | null;
}

interface EarningsData {
  entries: EarningsEntry[];
  totalINR: number;
  totalGBP: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSessionLoading = status === "loading";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Earnings state
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const userName = session?.user?.name || "User";

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        // ZAI FIX #310: Deep sanitize dashboard data to strip any non-serializable values
        setData(deepSanitize<Record<string, unknown>>(json));
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch earnings data when dialog opens
  useEffect(() => {
    if (!earningsOpen) return;
    let cancelled = false;
    setEarningsLoading(true);
    fetch("/api/earnings", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) {
          setEarningsData(json as EarningsData);
        }
      })
      .catch(() => { /* silently fail */ })
      .finally(() => {
        if (!cancelled) setEarningsLoading(false);
      });
    return () => { cancelled = true; };
  }, [earningsOpen]);

  if (isSessionLoading || loading || (!data && !error)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        {/* Animated dual-ring spinner */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-[3px] border-muted border-t-primary animate-spin" />
          <div
            className="absolute inset-2 rounded-full border-[3px] border-muted border-b-primary/50"
            style={{ animation: 'spin 1.8s linear infinite reverse' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
        </div>
        {/* Text */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Workspace is updating</h3>
          <p className="text-sm text-muted-foreground animate-pulse">Syncing your dashboard data...</p>
        </div>
        {/* Animated dots */}
        <div className="flex gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-7xl">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load dashboard data</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { setError(false); setLoading(true); fetchDashboard(); }}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // DASH-004: Safe default object with safeNumber — replaces unsafe `as` cast
  const rawStats = (data.stats || {}) as Record<string, unknown>;
  const stats = {
    totalRevenue: safeNumber(rawStats.totalRevenue),
    pendingAmount: safeNumber(rawStats.pendingAmount),
    overdueAmount: safeNumber(rawStats.overdueAmount),
    totalExpenses: safeNumber(rawStats.totalExpenses),
    totalApiSpend: safeNumber(rawStats.totalApiSpend),
    monthlyBudget: safeNumber(rawStats.monthlyBudget),
    newLeadsCount: safeNumber(rawStats.newLeadsCount),
    activeProjects: safeNumber(rawStats.activeProjects),
    openTickets: safeNumber(rawStats.openTickets),
    pendingTasks: safeNumber(rawStats.pendingTasks),
    totalClients: safeNumber(rawStats.totalClients),
    totalLeads: safeNumber(rawStats.totalLeads),
  };

  const projects = safeArray<{ id: string; name: string; status: string; progress: number; deadline: string | null; client: { name: string } }>(data.projects);
  const invoices = safeArray<{ id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string }>(data.invoices);
  const apiKeys = safeArray<{ id: string; keyName: string; currentSpend: number; monthlyBudget: number }>(data.apiKeys);
  // DASH-005: Extract tasks data for developer "My Tasks" section
  const tasks = safeArray<{ id: string; title: string; status: string; priority: string; project: { name: string } }>(data.tasks);

  // W9: Extract frequently-used stats to local variables to avoid redundant safeNumber() calls
  const budget = stats.monthlyBudget;
  const apiSpend = stats.totalApiSpend;
  const totalRevenue = stats.totalRevenue;
  const pendingAmount = stats.pendingAmount;
  const overdueAmount = stats.overdueAmount;
  const totalExpenses = stats.totalExpenses;
  const activeProjects = stats.activeProjects;
  const totalClients = stats.totalClients;
  const newLeadsCount = stats.newLeadsCount;
  const totalLeads = stats.totalLeads;
  const openTickets = stats.openTickets;
  const pendingTasks = stats.pendingTasks;

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Earnings card values (derived from dialog data, fallback to 0)
  const totalEarningsINR = earningsData?.totalINR ?? 0;
  const totalEarningsGBP = earningsData?.totalGBP ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {isAdminUser
              ? `Welcome back, ${safeText(userName, "Admin")}! Here's your overview.`
              : `Welcome back, ${safeText(userName, "User")}! Here's your project overview.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdminUser && (
            <Button size="sm" onClick={() => router.push("/dashboard/projects")}>
              <Plus className="h-4 w-4 mr-1" /> New Project
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/workspace")}>
            <Rocket className="h-4 w-4 mr-1" /> Open Workspace
          </Button>
          {isAdminUser && (
            <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
              <Send className="h-4 w-4 mr-1" /> Send Invoice
            </Button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ADMIN VIEW
          ═══════════════════════════════════════════════════════════════════ */}
      {isAdminUser && (
        <>
          {/* Row 1 — 4 stat cards with gradient icon accents */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Active Projects */}
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Projects</p>
                    <p className="text-2xl font-bold">{activeProjects}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{totalClients} clients total</p>
              </CardContent>
            </Card>

            {/* New Leads */}
            <Card
              onClick={() => router.push("/dashboard/crm")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">New Leads</p>
                    <p className="text-2xl font-bold">{newLeadsCount}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{totalLeads} total leads</p>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card
              onClick={() => router.push("/dashboard/finance")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-white" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <span>Pending: {formatCurrency(pendingAmount)}</span>
                  {overdueAmount > 0 && <span className="text-red-500">Overdue: {formatCurrency(overdueAmount)}</span>}
                </div>
              </CardContent>
            </Card>

            {/* Pending Tasks */}
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pending Tasks</p>
                    <p className="text-2xl font-bold">{pendingTasks}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{openTickets} open tickets</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2 — Earnings Overview (wider) + Active Projects */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Earnings Overview Card — 2 cols wide */}
            <Card
              onClick={() => setEarningsOpen(true)}
              className="lg:col-span-2 cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border-emerald-200/60 dark:border-emerald-800/30"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-600" />
                    Earnings Overview
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">Click to view details →</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 flex-wrap">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Earnings (INR)</p>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(totalEarningsINR)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approx. (GBP)</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-700 dark:text-blue-300">
                      £{totalEarningsGBP.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                {earningsData && earningsData.entries.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-3">No salary entries recorded yet.</p>
                )}
              </CardContent>
            </Card>

            {/* Active Projects — 1 col */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Active Projects</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-48 sm:max-h-64 overflow-y-auto custom-scrollbar">
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No active projects</p>
                  ) : (
                    projects.slice(0, 5).map((project) => {
                      const pClient = project.client as Record<string, unknown> | undefined;
                      const progress = safeNumber(project.progress);
                      return (
                        <button
                          key={safeText(project.id, "")}
                          onClick={() => router.push(`/dashboard/projects/${safeText(project.id, "")}`)}
                          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors text-left"
                          type="button"
                        >
                          <FolderKanban className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{safeText(project.name, "Untitled")}</p>
                            <p className="text-xs text-muted-foreground">{pClient ? safeText(pClient.name, "Client") : "Client"}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium">{progress}%</p>
                            <Progress value={progress} className="h-1.5 w-16 mt-1" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 3 — Recent Invoices + API Usage Tracker */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Invoices */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Invoices</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/finance/invoices")}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto custom-scrollbar">
                  {invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No invoices</p>
                  ) : (
                    invoices.slice(0, 5).map((inv) => (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => router.push("/dashboard/finance/invoices")}
                        className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{safeText(inv.invoiceNumber, "")}</p>
                            <p className="text-xs text-muted-foreground truncate">{inv.client ? safeText(inv.client.name, "") : ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{formatCurrency(safeNumber(inv.total))}</span>
                          <Badge className={`text-[10px] shrink-0 ${invoiceStatusColors[inv.status] || ""}`}>
                            {safeText(inv.status, "")}
                          </Badge>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* API Usage Tracker */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">API Usage Tracker</CardTitle>
                    <CardDescription>Monthly budget and spending across all keys</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/api-keys")}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap justify-between gap-1 text-xs sm:text-sm mb-1">
                      <span>Total Budget: ${budget.toFixed(2)}</span>
                      <span>Spent: ${apiSpend.toFixed(2)} ({budget > 0 ? ((apiSpend / budget) * 100).toFixed(1) : 0}%)</span>
                    </div>
                    <Progress
                      value={budget > 0 ? (apiSpend / budget) * 100 : 0}
                      className="h-3"
                    />
                  </div>
                  <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
                    <span>Remaining: ${(budget - apiSpend).toFixed(2)}</span>
                    <span>Expenses: {formatCurrency(totalExpenses)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          DEVELOPER VIEW
          ═══════════════════════════════════════════════════════════════════ */}
      {!isAdminUser && (
        <>
          {/* Row 1 — 3 stat cards with gradient icon accents */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Active Projects */}
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Projects</p>
                    <p className="text-2xl font-bold">{activeProjects}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <FolderKanban className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{totalClients} clients total</p>
              </CardContent>
            </Card>

            {/* My Tasks */}
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">My Tasks</p>
                    <p className="text-2xl font-bold">{pendingTasks}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <ClipboardList className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Pending tasks in your projects</p>
              </CardContent>
            </Card>

            {/* Open Tickets */}
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Open Tickets</p>
                    <p className="text-2xl font-bold">{openTickets}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-white" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Support tickets in your projects</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 2 — Earnings Card */}
          <Card
            onClick={() => setEarningsOpen(true)}
            className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border-emerald-200/60 dark:border-emerald-800/30"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Earnings</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(totalEarningsINR)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ £{totalEarningsGBP.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Row 3 — My Tasks Quick View + Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* My Tasks Quick View */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Team Tasks</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                    View All <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto custom-scrollbar">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                      <p>No pending tasks</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/dashboard/projects")}>
                        Go to Projects
                      </Button>
                    </div>
                  ) : (
                    tasks.slice(0, 5).map((task) => (
                      <div key={safeText(task.id, "")} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                        <div className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          task.status === "DONE" ? "bg-green-500" :
                          task.status === "IN_PROGRESS" ? "bg-blue-500" :
                          task.status === "REVIEW" ? "bg-yellow-500" : "bg-gray-400"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{safeText(task.title, "Untitled Task")}</p>
                          <p className="text-xs text-muted-foreground">{task.project ? safeText(task.project.name, "") : ""}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">{safeText(task.status, "")}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Actions</CardTitle>
                <CardDescription>Common actions for your workflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => router.push("/dashboard/time-tracking")}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  type="button"
                >
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Track Time</p>
                    <p className="text-xs text-muted-foreground">Log hours on your projects</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push("/dashboard/workspace")}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  type="button"
                >
                  <Rocket className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">AI Workspace</p>
                    <p className="text-xs text-muted-foreground">Launch the AI-powered workspace</p>
                  </div>
                </button>
                <button
                  onClick={() => router.push("/dashboard/leaves")}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  type="button"
                >
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Request Leave</p>
                    <p className="text-xs text-muted-foreground">Submit time-off requests</p>
                  </div>
                </button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          EARNINGS DIALOG (shared by both admin & developer views)
          ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={earningsOpen} onOpenChange={setEarningsOpen}>
        <DialogContent className="max-w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Earnings Details
            </DialogTitle>
            <DialogDescription>
              All salary entries recorded for your account
            </DialogDescription>
          </DialogHeader>

          {earningsLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : earningsData && earningsData.entries.length > 0 ? (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3">
                  <p className="text-xs text-muted-foreground">Total (INR)</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(earningsData.totalINR)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3">
                  <p className="text-xs text-muted-foreground">Approx. (GBP)</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                    £{earningsData.totalGBP.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Entries table */}
              <div className="rounded-md border overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Description</th>
                      <th className="text-right px-3 py-2 font-medium">Amount (INR)</th>
                      <th className="text-right px-3 py-2 font-medium">Amount (GBP)</th>
                      <th className="text-right px-3 py-2 font-medium">Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earningsData.entries.map((entry) => {
                      const gbp = Math.round((entry.amount / 105) * 100) / 100;
                      return (
                        <tr key={entry.id} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {safeDate(entry.date) ? new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[200px]">{safeText(entry.description, "—")}</td>
                          <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(entry.amount)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">£{gbp.toLocaleString("en-GB", { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{safeText(entry.paymentRef, "—")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <Wallet className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No salary entries recorded yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Contact your admin for salary details.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}