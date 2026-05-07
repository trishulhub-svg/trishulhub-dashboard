"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon,
  ArrowRight, Bot, MessageSquare, Calendar, Zap, Brain, AlertCircle,
  Pause, Play, RotateCcw, Activity, Radio, RefreshCw, Loader2, Settings,
  CheckCircle, XCircle, Wrench, Clock, TrendingUp, Eye, ChevronDown, ChevronUp,
  MonitorDot, ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface DueAgent {
  configId: string;
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  model: string;
  interval: number;
  totalRuns: number;
  totalErrors: number;
  lastRunAt: string | null;
}

interface ActivityLog {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  action: string;
  title: string;
  status: string;
  tokensUsed: number;
  cost: number;
  duration: number;
  createdAt: string;
}

interface LiveStep {
  agentId: string;
  agentName: string;
  step: string;
  type: "thinking" | "tool_call" | "tool_result";
  status: "running" | "done" | "error";
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autonomyConfigs, setAutonomyConfigs] = useState<AutonomyConfig[]>([]);
  const [autonomyLoading, setAutonomyLoading] = useState(true);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  // Client-driven autonomy state
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingInterAgent, setPendingInterAgent] = useState(0);
  const [showActivity, setShowActivity] = useState(true);
  const [pollStatus, setPollStatus] = useState<"idle" | "polling" | "triggering">("idle");
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const runningAgentsRef = useRef<Set<string>>(new Set());

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

  // ── Client-Driven Autonomous Polling Loop ──
  // Replaces Vercel Cron. Works on Vercel free plan.
  // Polls every 30s, triggers thinking cycles for due agents.
  const pollAndTrigger = useCallback(async () => {
    // Skip if no agents are enabled
    if (autonomyConfigs.filter(c => c.enabled).length === 0) return;
    // Skip if already triggering
    if (runningAgentsRef.current.size > 0) return;

    setPollStatus("polling");
    try {
      const res = await fetch("/api/agents/autonomy/poll", { credentials: "include" });
      if (!res.ok) { setPollStatus("idle"); return; }

      const data = await res.json();
      const dueAgents: DueAgent[] = data.dueAgents || [];
      setActivityLogs(data.recentActivity || []);
      setPendingApprovals(data.pendingApprovals || 0);
      setPendingInterAgent(data.pendingInterAgent || 0);

      // Trigger autonomous thinking for each due agent (max 1 at a time)
      if (dueAgents.length > 0) {
        const agent = dueAgents[0]; // Process one at a time
        setPollStatus("triggering");
        runningAgentsRef.current.add(agent.agentId);
        setRunningAgents(new Set(runningAgentsRef.current));

        // Show initial live step
        setLiveSteps(prev => [...prev, {
          agentId: agent.agentId,
          agentName: agent.agentName,
          step: "Starting autonomous thinking cycle...",
          type: "thinking",
          status: "running",
        }]);

        await triggerAgentCycle(agent);

        runningAgentsRef.current.delete(agent.agentId);
        setRunningAgents(new Set(runningAgentsRef.current));

        // Refresh autonomy configs after cycle
        fetchAutonomy();
      }
    } catch (err) {
      console.error("[autonomy-poll] Error:", err);
    }
    setPollStatus("idle");
  }, [autonomyConfigs, fetchAutonomy]);

  // ── Trigger Agent Thinking Cycle via SSE ──
  const triggerAgentCycle = async (agent: DueAgent) => {
    try {
      const res = await fetch("/api/agents/autonomy/client-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agentId: agent.agentId }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        updateLiveStep(agent.agentId, `Error: ${errText}`, "error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            if (event.type === "step") {
              updateLiveStep(
                agent.agentId,
                event.step.content,
                event.step.type === "tool_call" ? "done" : "running",
              );
            } else if (event.type === "complete") {
              if (event.success) {
                updateLiveStep(agent.agentId,
                  `Cycle complete (${event.usedTools?.length || 0} tools, ${(event.duration / 1000).toFixed(1)}s)`,
                  "done"
                );
                // Refresh activity logs
                fetch("/api/agents/autonomy/poll", { credentials: "include" })
                  .then(r => r.json())
                  .then(d => { if (d.recentActivity) setActivityLogs(d.recentActivity); })
                  .catch(() => {});
              } else {
                updateLiveStep(agent.agentId, `Error: ${event.error || "Unknown"}`, "error");
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      updateLiveStep(agent.agentId, `Connection error: ${err.message}`, "error");
    }
  };

  // Helper to update live steps
  const updateLiveStep = (agentId: string, step: string, status: "running" | "done" | "error") => {
    setLiveSteps(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(s => s.agentId === agentId);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], step, status };
      }
      // Keep only last 20 steps
      return updated.slice(-20);
    });
  };

  // Start polling loop when page is mounted
  useEffect(() => {
    fetchAgents();
    fetchAutonomy();

    // Initial poll after 5s (give time for autonomy configs to load)
    const initialTimeout = setTimeout(() => {
      pollAndTrigger();
      // Then poll every 30 seconds
      pollingIntervalRef.current = setInterval(pollAndTrigger, 30000);
    }, 5000);

    return () => {
      clearTimeout(initialTimeout);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [fetchAgents, fetchAutonomy, pollAndTrigger]);

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
        // Immediately poll if enabled
        if (enabled) {
          setTimeout(pollAndTrigger, 2000);
        }
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
        toast.success(enabled ? "All agents started" : "All agents paused");
        fetchAutonomy();
        if (enabled) {
          setTimeout(pollAndTrigger, 2000);
        }
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(data.error || "Failed to toggle all agents");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle all agents");
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
        setTimeout(pollAndTrigger, 2000);
      } else {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(data.error || "Failed to restart agent");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart agent");
    } finally {
      setTogglingAgent(null);
    }
  };

  const activeCount = autonomyConfigs.filter(c => c.enabled).length;
  const totalCount = autonomyConfigs.length;
  const errorCount = autonomyConfigs.filter(c => c.status === "ERROR").length;
  const totalRuns = autonomyConfigs.reduce((sum, c) => sum + c.totalRuns, 0);

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
                  {activeCount > 0
                    ? <>Agents think every {autonomyConfigs.find(c => c.enabled)?.interval || 5} min. Keep this page open for background thinking.</>
                    : <>Click Start All to enable autonomous thinking.</>
                  }
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
            {totalRuns > 0 && (
              <Badge variant="outline" className="text-xs">
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> {totalRuns} total cycles
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {errorCount} errors
              </Badge>
            )}
            {pendingApprovals > 0 && (
              <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> {pendingApprovals} approvals
              </Badge>
            )}
            {pendingInterAgent > 0 && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> {pendingInterAgent} messages
              </Badge>
            )}
            <span className="text-muted-foreground">{totalCount} agents configured</span>
            {runningAgents.size > 0 && (
              <Badge className="text-xs bg-green-100 text-green-700 border-0 animate-pulse">
                <MonitorDot className="h-2.5 w-2.5 mr-0.5" /> {runningAgents.size} thinking now
              </Badge>
            )}
            <div className="flex items-center gap-1 ml-auto">
              {pollStatus === "polling" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { fetchAutonomy(); pollAndTrigger(); }}
                className="gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Agent Cards Grid (2 cols) ── */}
        <div className="lg:col-span-2 grid gap-4 md:grid-cols-2">
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
            const isCurrentlyRunning = runningAgents.has(agent.id);

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
                className={`hover:shadow-md transition-all cursor-pointer border hover:border-primary/20 group ${isCurrentlyRunning ? "border-green-300 dark:border-green-700 shadow-green-100 dark:shadow-green-900/20 shadow-sm" : ""}`}
                onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-lg ${agentConfig?.bgColor || "bg-muted"} flex items-center justify-center relative`}>
                        <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
                        {isCurrentlyRunning && (
                          <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse border-2 border-white dark:border-gray-900" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {agent.name}
                          <div className={`h-2 w-2 rounded-full ${isCurrentlyRunning ? "bg-green-500 animate-pulse" : statusColor}`} />
                        </CardTitle>
                        <CardDescription className="text-xs mt-0.5">{agent.model}</CardDescription>
                      </div>
                    </div>
                    <Badge
                      variant={isCurrentlyRunning ? "default" : agent.status === "IDLE" ? "secondary" : agent.status === "ERROR" ? "destructive" : "outline"}
                      className="text-xs"
                    >
                      {isCurrentlyRunning ? "THINKING" : agent.status}
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
                          <span>{autonomy.totalRuns} completed</span>
                          {autonomy.lastRunAt && (
                            <>
                              <span className="text-muted-foreground/60">|</span>
                              <span>Last: {new Date(autonomy.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </>
                          )}
                          {autonomy.lastError && (
                            <>
                              <span className="text-muted-foreground/60">|</span>
                              <span className="text-red-500" title={autonomy.lastError}>Error</span>
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
                              disabled={isToggling || isCurrentlyRunning}
                              title={autonomy?.enabled ? "Pause autonomy" : "Enable autonomy"}
                            >
                              {isToggling || isCurrentlyRunning ? (
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

        {/* ── Right Panel: Activity Feed ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-orange-500" />
                  Live Activity
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowActivity(!showActivity)}
                >
                  {showActivity ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            {showActivity && (
              <CardContent className="pt-0">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {/* Live steps (currently running) */}
                    {liveSteps.filter(s => s.status === "running").length > 0 && (
                      <div className="space-y-1.5">
                        {liveSteps.filter(s => s.status === "running").map((step, i) => {
                          const StepIcon = step.type === "tool_call" ? Wrench : Brain;
                          return (
                            <div key={`live-${step.agentId}-${i}`} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-100 dark:border-green-800/30">
                              <StepIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0 animate-pulse" />
                              <div className="min-w-0">
                                <p className="text-[11px] font-medium text-green-700 dark:text-green-400 truncate">{step.agentName}</p>
                                <p className="text-[10px] text-green-600 dark:text-green-500 truncate">{step.step}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Completed steps */}
                    {liveSteps.filter(s => s.status !== "running").length > 0 && (
                      <div className="space-y-1">
                        {liveSteps.filter(s => s.status !== "running").slice(-5).map((step, i) => (
                          <div key={`done-${step.agentId}-${i}`} className="flex items-start gap-2 p-1.5 rounded-md">
                            <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] text-muted-foreground truncate">{step.agentName}: {step.step}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Activity logs */}
                    {activityLogs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-2 mb-1">Recent Activity</p>
                        {activityLogs.map((log) => {
                          const Icon = agentIcons[log.agentType] || Bot;
                          const isSuccess = log.status === "SUCCESS";
                          return (
                            <div key={log.id} className="flex items-start gap-2 p-1.5 rounded-md hover:bg-muted/50">
                              <Icon className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <p className="text-[10px] font-medium truncate">{log.agentName}</p>
                                  {isSuccess
                                    ? <CheckCircle className="h-2.5 w-2.5 text-green-500 shrink-0" />
                                    : <XCircle className="h-2.5 w-2.5 text-red-500 shrink-0" />
                                  }
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate">{log.title}</p>
                                <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
                                  <span className="flex items-center gap-0.5"><Clock className="h-2 w-2" />{(log.duration / 1000).toFixed(1)}s</span>
                                  {log.tokensUsed > 0 && <span>{log.tokensUsed} tokens</span>}
                                  {log.cost > 0 && <span>${log.cost.toFixed(4)}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty state */}
                    {liveSteps.length === 0 && activityLogs.length === 0 && (
                      <div className="text-center py-8">
                        <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No activity yet</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Enable agents to see them think autonomously</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-md p-2.5 text-center">
                  <p className="text-lg font-bold">{totalRuns}</p>
                  <p className="text-[10px] text-muted-foreground">Total Cycles</p>
                </div>
                <div className="bg-muted/50 rounded-md p-2.5 text-center">
                  <p className="text-lg font-bold">{activeCount}</p>
                  <p className="text-[10px] text-muted-foreground">Active Agents</p>
                </div>
                <div className="bg-muted/50 rounded-md p-2.5 text-center">
                  <p className="text-lg font-bold">{pendingApprovals}</p>
                  <p className="text-[10px] text-muted-foreground">Pending Approvals</p>
                </div>
                <div className="bg-muted/50 rounded-md p-2.5 text-center">
                  <p className="text-lg font-bold">{pendingInterAgent}</p>
                  <p className="text-[10px] text-muted-foreground">Agent Messages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
