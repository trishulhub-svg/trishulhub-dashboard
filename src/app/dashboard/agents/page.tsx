"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon,
  ArrowRight, Bot, MessageSquare, Calendar, Zap, Brain, AlertCircle,
  Pause, Play, RotateCcw, Activity, Radio, RefreshCw, Loader2, Settings,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS, AGENT_TYPES } from "@/lib/types";
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

interface AutonomyConfig {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  model: string;
  enabled: boolean;
  status: string;
  interval: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalRuns: number;
  totalErrors: number;
  lastError: string | null;
  totalActivityLogs: number;
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autonomyConfigs, setAutonomyConfigs] = useState<AutonomyConfig[]>([]);
  const [autonomyLoading, setAutonomyLoading] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAgents(data);
        } else if (data && typeof data === "object" && data.error) {
          setAgents([]);
        } else {
          setAgents([]);
        }
      } else {
        setError("Failed to fetch agents");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAutonomy = useCallback(async () => {
    try {
      setAutonomyLoading(true);
      const res = await fetch("/api/agents/autonomy", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAutonomyConfigs(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch autonomy status:", err);
    } finally {
      setAutonomyLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchAutonomy();
    // Refresh autonomy status every 30 seconds
    const interval = setInterval(fetchAutonomy, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchAutonomy]);

  const getAutonomyConfig = (agentId: string) =>
    autonomyConfigs.find(c => c.agentId === agentId);

  const handleToggleAgent = async (agentId: string, enabled: boolean) => {
    setTogglingAgent(agentId);
    try {
      const res = await fetch("/api/agents/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "toggle", agentId, enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? "Agent autonomous mode enabled" : "Agent paused");
        fetchAutonomy();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle agent");
      }
    } catch (err) {
      toast.error("Failed to toggle agent");
    } finally {
      setTogglingAgent(null);
    }
  };

  const handleToggleAll = async (enabled: boolean) => {
    try {
      const res = await fetch("/api/agents/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "toggleAll", enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? "All agents enabled" : "All agents paused");
        fetchAutonomy();
      } else {
        toast.error("Failed to toggle all agents");
      }
    } catch (err) {
      toast.error("Failed to toggle all agents");
    }
  };

  const handleRestart = async (agentId: string) => {
    setTogglingAgent(agentId);
    try {
      const res = await fetch("/api/agents/autonomy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "restart", agentId }),
      });
      if (res.ok) {
        toast.success("Agent restarted");
        fetchAutonomy();
      } else {
        toast.error("Failed to restart agent");
      }
    } catch (err) {
      toast.error("Failed to restart agent");
    } finally {
      setTogglingAgent(null);
    }
  };

  const activeCount = autonomyConfigs.filter(c => c.enabled).length;
  const totalCount = autonomyConfigs.length;
  const errorCount = autonomyConfigs.filter(c => c.status === "ERROR").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchAgents(); }}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground text-sm">Manage and interact with your AI-powered agents</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {agents.length} agents available
        </Badge>
      </div>

      {/* ── Autonomy Control Panel ── */}
      <Card className="border-orange-200 dark:border-orange-900/50 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Radio className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-base">Autonomous Mode</CardTitle>
                <CardDescription className="text-xs">
                  Agents think and act on their own. Runs every {autonomyConfigs[0]?.interval || 5} min.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleAll(false)}
                  className="gap-1.5 text-xs"
                >
                  <Pause className="h-3.5 w-3.5" /> Pause All
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => handleToggleAll(true)}
                className="gap-1.5 text-xs bg-orange-600 hover:bg-orange-700"
              >
                <Play className="h-3.5 w-3.5" /> Start All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Badge variant={activeCount > 0 ? "default" : "secondary"} className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
              {activeCount} running
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {errorCount} errors
              </Badge>
            )}
            <span className="text-muted-foreground">
              {totalCount} agents configured
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAutonomy}
              className="ml-auto gap-1 text-xs"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Agent Cards Grid ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(agents as any[]).length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No agents found.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchAgents(); }}>
              Refresh
            </Button>
          </div>
        ) : (agents as any[]).map((agent) => {
          const Icon = agentIcons[agent.type] || Bot;
          const agentConfig = AGENT_TYPES[agent.type as AgentType];
          const statusColor = STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400";
          const chatCount = agent._count?.chats || agent._count?.conversations || 0;
          const autonomy = getAutonomyConfig(agent.id);
          const isDev = agent.type === "DEV";
          const isToggling = togglingAgent === agent.id;

          let features: Record<string, boolean> = {};
          try {
            if (agent.roleConfig?.features) {
              features = typeof agent.roleConfig.features === "string"
                ? JSON.parse(agent.roleConfig.features)
                : agent.roleConfig.features;
            }
          } catch { /* ignore */ }

          let quickActionsCount = 0;
          try {
            if (agent.roleConfig?.quickActions) {
              const actions = typeof agent.roleConfig.quickActions === "string"
                ? JSON.parse(agent.roleConfig.quickActions)
                : agent.roleConfig.quickActions;
              quickActionsCount = Array.isArray(actions) ? actions.length : 0;
            }
          } catch { /* ignore */ }

          return (
            <Card
              key={agent.id}
              className="hover:shadow-md transition-all cursor-pointer border hover:border-primary/20 group"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-lg ${agentConfig?.bgColor || "bg-muted"} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {agent.name}
                        <div className={`h-2 w-2 rounded-full ${statusColor}`} />
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{agent.model}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={agent.status === "IDLE" ? "secondary" : agent.status === "RUNNING" ? "default" : agent.status === "ERROR" ? "destructive" : "outline"}
                    className="text-xs"
                  >
                    {agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {agentConfig?.description || agent.description}
                </p>

                {/* Features Badges */}
                <div className="flex flex-wrap gap-1.5">
                  {autonomy?.enabled && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                      <Radio className="h-2.5 w-2.5 mr-0.5" /> Auto
                    </Badge>
                  )}
                  {features.agentic && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                      <Brain className="h-2.5 w-2.5 mr-0.5" /> Agentic
                    </Badge>
                  )}
                  {features.webSearch && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <Zap className="h-2.5 w-2.5 mr-0.5" /> Web Search
                    </Badge>
                  )}
                  {features.crossAgent && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Cross-Agent
                    </Badge>
                  )}
                  {quickActionsCount > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {quickActionsCount} Actions
                    </Badge>
                  )}
                </div>

                {/* Autonomy status bar */}
                {autonomy && !isDev && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
                    {autonomy.enabled ? (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span>Cycle #{autonomy.totalRuns + 1}</span>
                        <span className="text-muted-foreground/60">|</span>
                        <span>Next: {autonomy.nextRunAt ? new Date(autonomy.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "..."}</span>
                        {autonomy.lastError && (
                          <>
                            <span className="text-muted-foreground/60">|</span>
                            <span className="text-red-500">Error</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        <span>Autonomy off</span>
                        {autonomy.totalRuns > 0 && (
                          <>
                            <span className="text-muted-foreground/60">|</span>
                            <span>{autonomy.totalRuns} cycles done</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Bottom bar with toggle + chat button */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {chatCount}
                    </span>
                    {/* Autonomy toggle button — DEV excluded */}
                    {!isDev && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1"
                      >
                        {autonomy?.status === "ERROR" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleRestart(agent.id)}
                            disabled={isToggling}
                            title="Restart agent"
                          >
                            {isToggling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-6 w-6 p-0 ${autonomy?.enabled ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-muted-foreground hover:text-foreground"}`}
                            onClick={() => handleToggleAgent(agent.id, !autonomy?.enabled)}
                            disabled={isToggling}
                            title={autonomy?.enabled ? "Pause autonomy" : "Enable autonomy"}
                          >
                            {isToggling ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : autonomy?.enabled ? (
                              <Pause className="h-3 w-3" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Chat <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
