"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Rocket, DollarSign, FolderKanban, TrendingUp, AlertCircle,
  Clock, ArrowRight, Plus, Send,
  IndianRupee, Wallet, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, safeArray, safeJsonParse, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSessionLoading = status === "loading";
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [earnings, setEarnings] = useState<{ totalINR: number; totalGBP: number; entries: Array<{ id: string; description: string; amount: number; date: string; paymentRef: string | null }> } | null>(null);
  const [showEarningsDetail, setShowEarningsDetail] = useState(false);

  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

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
    // Fetch earnings/salary data
    fetch("/api/earnings", { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setEarnings(d); })
      .catch(() => {});
  }, [fetchDashboard]);

  // SECURITY FIX: Removed auto-seed that could unintentionally seed the database.
  // Seeding should only happen via explicit admin action at /api/setup POST.
  // If the dashboard fails to load, show an error state instead.

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
  // NOTE: API Usage (totalApiSpend/monthlyBudget/totalExpenses) and Support Ticket (openTickets)
  // stats have been intentionally removed from the dashboard home page.
  // The underlying data is still returned by /api/dashboard and the api-keys/support APIs remain intact.
  const rawStats = (data.stats || {}) as Record<string, unknown>;
  const stats = {
    totalRevenue: safeNumber(rawStats.totalRevenue),
    pendingAmount: safeNumber(rawStats.pendingAmount),
    overdueAmount: safeNumber(rawStats.overdueAmount),
    newLeadsCount: safeNumber(rawStats.newLeadsCount),
    activeProjects: safeNumber(rawStats.activeProjects),
    totalClients: safeNumber(rawStats.totalClients),
    totalLeads: safeNumber(rawStats.totalLeads),
  };

  const projects = safeArray<{ id: string; name: string; status: string; progress: number; deadline: string | null; client: { name: string } }>(data.projects);
  const invoices = safeArray<{ id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string }>(data.invoices);

  // W9: Extract frequently-used stats to local variables to avoid redundant safeNumber() calls
  const totalRevenue = stats.totalRevenue;
  const pendingAmount = stats.pendingAmount;
  const overdueAmount = stats.overdueAmount;
  const activeProjects = stats.activeProjects;
  const totalClients = stats.totalClients;
  const newLeadsCount = stats.newLeadsCount;
  const totalLeads = stats.totalLeads;

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {isAdminUser 
              ? "Welcome back! Here's your overview." 
              : "Welcome back! Here's your project overview."}
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

      {/* Stats Cards - Different for developers vs admins */}
      {/* DASH-001: All stat cards are now clickable with onClick, cursor-pointer, hover effect */}
      {/* Redesign: Switched to a 3-col grid so admins get a perfectly balanced row (3 cards). */}
      {/* For developers (single Active Projects stat), the card spans full width to stay prominent and avoid gaps. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          onClick={() => router.push("/dashboard/projects")}
          className={cn(
            "cursor-pointer hover:shadow-md transition-shadow liquid-glass-card",
            !isAdminUser && "sm:col-span-2 lg:col-span-3"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                {/* DASH-003: All stats values wrapped in safeNumber() */}
                <p className="text-2xl font-bold">{activeProjects}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{totalClients} clients total</p>
          </CardContent>
        </Card>

        {isAdminUser && (
          <>
            <Card
              onClick={() => router.push("/dashboard/crm")}
              className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">New Leads</p>
                    <p className="text-2xl font-bold">{newLeadsCount}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{totalLeads} total leads</p>
              </CardContent>
            </Card>

            <Card
              onClick={() => router.push("/dashboard/finance")}
              className="cursor-pointer hover:shadow-md transition-shadow liquid-glass-card"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                  <span>Pending: {formatCurrency(pendingAmount)}</span>
                  {overdueAmount > 0 && <span className="text-red-500">Overdue: {formatCurrency(overdueAmount)}</span>}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Earnings / Salary Card ── */}
      {earnings && (
        <Card className="liquid-glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-500" /> My Earnings
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEarningsDetail(!showEarningsDetail)}
                className="h-7 text-xs gap-1"
              >
                {showEarningsDetail ? "Hide" : "Details"}
                <ChevronDown className={cn("h-3 w-3 transition-transform", showEarningsDetail && "rotate-180")} />
              </Button>
            </div>
            <CardDescription>Total salary disbursed to date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-1">
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">₹{earnings.totalINR.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground">≈ £{earnings.totalGBP.toLocaleString("en-GB", { minimumFractionDigits: 2 })} GBP</p>
              </div>
            </div>
            {earnings.entries.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                {earnings.entries.length} salary {earnings.entries.length === 1 ? "entry" : "entries"} recorded
              </p>
            )}
            {showEarningsDetail && earnings.entries.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {earnings.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background/50 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{safeText(entry.description, "Salary")}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {safeDate(entry.date)}
                        {entry.paymentRef ? ` · Ref: ${safeText(entry.paymentRef, "")}` : ""}
                      </p>
                    </div>
                    <p className="font-semibold shrink-0 ml-3">₹{safeNumber(entry.amount).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Active Projects */}
        <Card className="md:col-span-2 lg:col-span-3 liquid-glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{isAdminUser ? "Active Projects" : "My Projects"}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-48 sm:max-h-64 overflow-y-auto custom-scrollbar">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {isAdminUser ? "No active projects" : "No projects assigned yet. Contact your admin to get assigned to a project."}
                </p>
              ) : (
                projects.map((project) => {
                  const pClient = project.client as Record<string, unknown> | undefined;
                  // DASH-007: Cache safeNumber result for project progress
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

      {/* Bottom section - Recent Invoices for admins (API Usage Tracker removed in dashboard redesign) */}
      {isAdminUser && (
        <div className="grid gap-4 md:grid-cols-1">
          {/* Recent Invoices */}
          <Card className="liquid-glass-card">
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
                    // DASH-002: Changed invoice items from div to button with onClick navigation
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
        </div>
      )}

      {/* Developer-specific bottom section (Open Tickets card removed in dashboard redesign) */}
      {!isAdminUser && (
        <div className="grid gap-4 md:grid-cols-1">
          {/* Quick Actions */}
          <Card className="liquid-glass-card">
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
      )}
    </div>
  );
}
