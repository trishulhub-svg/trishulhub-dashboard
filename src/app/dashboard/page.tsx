"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, DollarSign, FolderKanban, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Zap, ArrowRight, Plus, Send, Shield,
  Code2, Crosshair, ClipboardList, PenTool, HeadphonesIcon, Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Seed database if empty
  useEffect(() => {
    if (!loading && !data) {
      fetch("/api/seed", { method: "POST" }).then(() => fetchDashboard());
    }
  }, [loading, data, fetchDashboard]);

  if (loading || !data) {
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

  const stats = data.stats as {
    totalRevenue: number;
    pendingAmount: number;
    overdueAmount: number;
    totalExpenses: number;
    totalApiSpend: number;
    monthlyBudget: number;
    newLeadsCount: number;
    activeProjects: number;
    openTickets: number;
    pendingTasks: number;
    totalClients: number;
    totalLeads: number;
  };

  const agents = (data.agents as { id: string; name: string; type: string; status: string; description: string }[]) || [];
  const projects = (data.projects as { id: string; name: string; status: string; progress: number; deadline: string | null; client: { name: string } }[]) || [];
  const invoices = (data.invoices as { id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string }[]) || [];
  const usageLogs = (data.usageLogs as { agentId: string; agent: { name: string; type: string }; cost: number }[]) || [];
  const apiKeys = (data.apiKeys as { id: string; keyName: string; currentSpend: number; monthlyBudget: number }[]) || [];

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Calculate usage by agent
  const usageByAgent = usageLogs.reduce((acc, log) => {
    const agentName = log.agent?.name || log.agentId;
    acc[agentName] = (acc[agentName] || 0) + log.cost;
    return acc;
  }, {} as Record<string, number>);

  // Invoice status colors
  const invoiceStatusColors: Record<string, string> = {
    DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
    SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome back! Here&apos;s what&apos;s happening with your agents.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => router.push("/dashboard/projects")}>
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/agents")}>
            <Bot className="h-4 w-4 mr-1" /> Give Task
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/finance/invoices")}>
            <Send className="h-4 w-4 mr-1" /> Send Invoice
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Projects</p>
                <p className="text-2xl font-bold">{stats.activeProjects}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stats.totalClients} clients total</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">New Leads</p>
                <p className="text-2xl font-bold">{stats.newLeadsCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stats.totalLeads} total leads</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
              <span>Pending: {formatCurrency(stats.pendingAmount)}</span>
              {stats.overdueAmount > 0 && <span className="text-red-500">Overdue: {formatCurrency(stats.overdueAmount)}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Tasks</p>
                <p className="text-2xl font-bold">{stats.pendingTasks}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stats.openTickets} open tickets</p>
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
                <CardDescription>Real-time status of all AI agents</CardDescription>
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
                >
                  <div className="relative">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background", statusColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{AGENT_TYPES[agent.type as AgentType]?.label || agent.type}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Active Projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Active Projects</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projects")}>
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No active projects</p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                    className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <FolderKanban className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.client?.name || "Client"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium">{project.progress}%</p>
                      <Progress value={project.progress} className="h-1.5 w-16 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* API Usage Tracker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">API Usage Tracker</CardTitle>
            <CardDescription>Monthly budget and spending across all keys</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Total Budget: ${stats.monthlyBudget.toFixed(2)}</span>
                  <span>Spent: ${stats.totalApiSpend.toFixed(2)} ({stats.monthlyBudget > 0 ? ((stats.totalApiSpend / stats.monthlyBudget) * 100).toFixed(1) : 0}%)</span>
                </div>
                <Progress
                  value={stats.monthlyBudget > 0 ? (stats.totalApiSpend / stats.monthlyBudget) * 100 : 0}
                  className="h-3"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Remaining: ${(stats.monthlyBudget - stats.totalApiSpend).toFixed(2)}</span>
                <span>Expenses: {formatCurrency(stats.totalExpenses)}</span>
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
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">{inv.client?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{formatCurrency(inv.total)}</span>
                      <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>
                        {inv.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
