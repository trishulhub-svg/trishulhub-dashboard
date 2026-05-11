"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bot, DollarSign, FolderKanban, TrendingUp, AlertCircle,
  Clock, ArrowRight, Plus, Send, Shield,
  Code2, Crosshair, ClipboardList, PenTool, HeadphonesIcon, Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, safeArray, safeJsonParse, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";
import { AGENT_TYPES, STATUS_COLORS } from "@/lib/types";
import type { AgentStatus, AgentType } from "@/lib/types";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  DEV: Code2,
  CLIENT_HUNTER: Crosshair,
  FINANCE: DollarSign,
  PROJECT_MANAGER: ClipboardList,
  HR: Users,
  CONTENT: PenTool,
  SUPPORT: HeadphonesIcon,
};

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
  }, [fetchDashboard]);

  // SECURITY FIX: Removed auto-seed that could unintentionally seed the database.
  // Seeding should only happen via explicit admin action at /api/setup POST.
  // If the dashboard fails to load, show an error state instead.

  if (isSessionLoading || loading || (!data && !error)) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
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

  const agents = safeArray<{ id: string; name: string; type: string; status: string; description: string }>(data.agents);
  const projects = safeArray<{ id: string; name: string; status: string; progress: number; deadline: string | null; client: { name: string } }>(data.projects);
  const invoices = safeArray<{ id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string }>(data.invoices);
  const usageLogs = safeArray<{ agentId: string; agent: { name: string; type: string }; cost: number }>(data.usageLogs);
  const apiKeys = safeArray<{ id: string; keyName: string; currentSpend: number; monthlyBudget: number }>(data.apiKeys);
  // DASH-005: Extract tasks data for developer "My Tasks" section
  const tasks = safeArray<{ id: string; title: string; status: string; priority: string; project: { name: string } }>(data.tasks);

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Calculate usage by agent
  const usageByAgent = usageLogs.reduce((acc, log) => {
    const agentName = log.agent?.name || log.agentId;
    acc[agentName] = (acc[agentName] || 0) + log.cost;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {isAdminUser 
              ? "Welcome back! Here's what's happening with your agents." 
              : "Welcome back! Here's your project overview."}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdminUser && (
            <Button size="sm" onClick={() => router.push("/dashboard/projects")}>
              <Plus className="h-4 w-4 mr-1" /> New Project
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/agents")}>
            <Bot className="h-4 w-4 mr-1" /> Give Task
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card
          onClick={() => router.push("/dashboard/projects")}
          className="cursor-pointer hover:shadow-md transition-shadow"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                {/* DASH-003: All stats values wrapped in safeNumber() */}
                <p className="text-2xl font-bold">{safeNumber(stats.activeProjects)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{safeNumber(stats.totalClients)} clients total</p>
          </CardContent>
        </Card>

        {isAdminUser ? (
          <>
            <Card
              onClick={() => router.push("/dashboard/crm")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">New Leads</p>
                    <p className="text-2xl font-bold">{safeNumber(stats.newLeadsCount)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{safeNumber(stats.totalLeads)} total leads</p>
              </CardContent>
            </Card>

            <Card
              onClick={() => router.push("/dashboard/finance")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold">{formatCurrency(safeNumber(stats.totalRevenue))}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>Pending: {formatCurrency(safeNumber(stats.pendingAmount))}</span>
                  {safeNumber(stats.overdueAmount) > 0 && <span className="text-red-500">Overdue: {formatCurrency(safeNumber(stats.overdueAmount))}</span>}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">My Tasks</p>
                    <p className="text-2xl font-bold">{safeNumber(stats.pendingTasks)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                    <ClipboardList className="h-5 w-5 text-yellow-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Pending tasks in your projects</p>
              </CardContent>
            </Card>

            <Card
              onClick={() => router.push("/dashboard/projects")}
              className="cursor-pointer hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Open Tickets</p>
                    <p className="text-2xl font-bold">{safeNumber(stats.openTickets)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Support tickets in your projects</p>
              </CardContent>
            </Card>
          </>
        )}

        <Card
          onClick={() => router.push("/dashboard/projects")}
          className="cursor-pointer hover:shadow-md transition-shadow"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isAdminUser ? "Pending Tasks" : "Team Tasks"}</p>
                <p className="text-2xl font-bold">{safeNumber(stats.pendingTasks)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{safeNumber(stats.openTickets)} open tickets</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Agent Status Panel */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Agent Status</CardTitle>
                <CardDescription>Real-time status of AI agents</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/agents")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {agents.map((agent) => {
              const Icon = agentIcons[agent.type] || Bot;
              const statusColor = STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400";
              return (
                <button
                  key={agent.id}
                  onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                  className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors text-left"
                  type="button"
                >
                  <div className="relative">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background", statusColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{safeText(agent.name, "Agent")}</p>
                    <p className="text-xs text-muted-foreground">{AGENT_TYPES[agent.type as AgentType]?.label || safeText(agent.type, "")}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Active Projects */}
        <Card className={isAdminUser ? "lg:col-span-2" : "lg:col-span-2"}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{isAdminUser ? "Active Projects" : "My Projects"}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
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

      {/* Bottom section - only show API tracker and Invoices for admins */}
      {isAdminUser && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* API Usage Tracker */}
          <Card>
            {/* DASH-006: Added "View All" button to API Usage Tracker header */}
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
                  <div className="flex justify-between text-sm mb-1">
                    <span>Total Budget: ${safeNumber(stats.monthlyBudget).toFixed(2)}</span>
                    <span>Spent: ${safeNumber(stats.totalApiSpend).toFixed(2)} ({safeNumber(stats.monthlyBudget) > 0 ? ((safeNumber(stats.totalApiSpend) / safeNumber(stats.monthlyBudget)) * 100).toFixed(1) : 0}%)</span>
                  </div>
                  <Progress
                    value={safeNumber(stats.monthlyBudget) > 0 ? (safeNumber(stats.totalApiSpend) / safeNumber(stats.monthlyBudget)) * 100 : 0}
                    className="h-3"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Remaining: ${(safeNumber(stats.monthlyBudget) - safeNumber(stats.totalApiSpend)).toFixed(2)}</span>
                  <span>Expenses: {formatCurrency(safeNumber(stats.totalExpenses))}</span>
                </div>
                {Object.keys(usageByAgent).length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Usage by Agent</p>
                    {Object.entries(usageByAgent).map(([name, cost]) => (
                      <div key={name} className="flex items-center justify-between text-xs">
                        <span>{name}</span>
                        <span>${cost.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
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
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{safeText(inv.invoiceNumber, "")}</p>
                          <p className="text-xs text-muted-foreground">{inv.client ? safeText(inv.client.name, "") : ""}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{formatCurrency(safeNumber(inv.total))}</span>
                        <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>
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

      {/* Developer-specific bottom section */}
      {!isAdminUser && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* My Tasks Quick View */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">My Tasks</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                  View All <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* DASH-005: Real task data from API instead of static placeholder */}
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
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
                onClick={() => router.push("/dashboard/agents")}
                className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted transition-colors text-left"
                type="button"
              >
                <Bot className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Chat with Agents</p>
                  <p className="text-xs text-muted-foreground">Get AI assistance on your tasks</p>
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
