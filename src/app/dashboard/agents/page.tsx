"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bot, MessageSquare, Zap, Brain, AlertCircle,
  Pause, Play, RotateCcw, Activity, Radio, RefreshCw, Loader2,
  CheckCircle, XCircle, Wrench, Clock, TrendingUp, ChevronDown, ChevronUp,
  MonitorDot, ShieldAlert, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_COLORS, AGENT_TYPES } from "@/lib/types";
import { safeJsonParse } from "@/lib/utils";
import { AGENT_ICON_COMPONENTS, AgentIconFallback } from "@/lib/agent-icons";
import type { AgentStatus, AgentType } from "@/lib/types";

interface AgentListItem {
  id: string;
  name: string;
  type: string;
  description: string;
  model: string;
  status: string;
  roleConfig?: {
    features?: string;
    quickActions?: string;
    githubToken?: string;
    githubRepo?: string;
    [key: string]: any;
  } | null;
  _count?: {
    chats?: number;
    conversations?: number;
  };
  [key: string]: any;
}

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
  startedBy: string | null;
  startedByRole: string | null;
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
  const [agents, setAgents] = useState<AgentListItem[]>([]);
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
  const [currentlyRunningAgents, setCurrentlyRunningAgents] = useState<Array<{agentId: string; agentName: string; agentType: string; startedBy: string | null; startedByRole: string | null}>>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const runningAgentsRef = useRef<Set<string>>(new Set());

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setAgents(Array.isArray(data) ? data : []);
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
  const pollAndTrigger = useCallback(async () => {
    if (autonomyConfigs.filter(c => c.enabled).length === 0) return;
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
      setCurrentlyRunningAgents(data.currentlyRunning || []);

      if (dueAgents.length > 0) {
        const agent = dueAgents[0];
        setPollStatus("triggering");
        runningAgentsRef.current.add(agent.agentId);
        setRunningAgents(new Set(runningAgentsRef.current));

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
                fetch("/api/agents/autonomy/poll", { credentials: "include" })
                  .then(r => r.json())
                  .then(d => { if (d.recentActivity) setActivityLogs(d.recentActivity); })
                  .catch(() => {});
              } else {
                updateLiveStep(agent.agentId, `Error: ${event.error || "Unknown"}`, "error");
              }
            }
          } catch (e) { /* ignore non-JSON SSE lines */ }
        }
      }
    } catch (err: any) {
      updateLiveStep(agent.agentId, `Connection error: ${err.message}`, "error");
    }
  };

  const updateLiveStep = (agentId: string, step: string, status: "running" | "done" | "error") => {
    setLiveSteps(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(s => s.agentId === agentId);
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], step, status };
      }
      return updated.slice(-20);
    });
  };

  // Start polling loop — pauses when tab is hidden to save resources
  useEffect(() => {
    fetchAgents();
    fetchAutonomy();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Resume: immediately poll once, then restart interval
        pollAndTrigger();
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = setInterval(pollAndTrigger, 10000);
      } else {
        // Pause: clear interval when tab is hidden
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    const initialTimeout = setTimeout(() => {
      pollingIntervalRef.current = setInterval(pollAndTrigger, 10000);
    }, 5000);

    return () => {
      clearTimeout(initialTimeout);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
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

  // Memoize repeated filter computations
  const runningLiveSteps = useMemo(() => liveSteps.filter(s => s.status === "running"), [liveSteps]);
  const completedLiveSteps = useMemo(() => liveSteps.filter(s => s.status !== "running").slice(-5), [liveSteps]);

  const activeCount = autonomyConfigs.filter(c => c.enabled).length;
  const totalCount = autonomyConfigs.length;
  const errorCount = autonomyConfigs.filter(c => c.status === "ERROR").length;
  const totalRuns = autonomyConfigs.reduce((sum, c) => sum + c.totalRuns, 0);

  // Check if agents were started by a different user (e.g. superadmin)
  const startedByOther = activeCount > 0 && autonomyConfigs.some(c => c.enabled && c.startedBy);
  const startedByInfo = autonomyConfigs.find(c => c.enabled && c.startedBy);
  const startedByRoleLabel = startedByInfo?.startedByRole === "SUPER_ADMIN" ? "Super Admin" : startedByInfo?.startedByRole === "ADMIN" ? "Admin" : null;

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        <h1 className="text-xl sm:text-2xl font-bold">AI Agents</h1>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-52 sm:h-56 rounded-lg" />
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
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">AI Agents</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Manage and interact with your AI-powered agents</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {agents.length} agents available
        </Badge>
      </div>

      {/* ── Autonomy Control Panel ── */}
      <Card className="border-orange-200 dark:border-orange-900/50 bg-gradient-to-r from-orange-50/50 to-transparent dark:from-orange-950/20">
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base">Autonomous Mode</CardTitle>
                <CardDescription className="text-[11px] sm:text-xs leading-relaxed">
                  {activeCount > 0
                    ? <>Agents think every {autonomyConfigs.find(c => c.enabled)?.interval || 5} min. Keep this page open for background thinking.</>
                    : <>Click Start All to enable autonomous thinking.</>
                  }
                  {startedByOther && startedByRoleLabel && (
                    <span className="block mt-1 text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                      Started by {startedByRoleLabel} — live activity visible below
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleAll(false)}
                  className="gap-1.5 text-xs h-8 sm:h-9"
                >
                  <Pause className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Pause All</span><span className="xs:hidden">Pause</span>
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => handleToggleAll(true)}
                className="gap-1.5 text-xs h-8 sm:h-9 bg-orange-600 hover:bg-orange-700"
              >
                <Play className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Start All</span><span className="xs:hidden">Start</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-[11px] sm:text-xs">
            <Badge variant={activeCount > 0 ? "default" : "secondary"} className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0 text-[10px] sm:text-xs">
              {activeCount} running
            </Badge>
            {totalRuns > 0 && (
              <Badge variant="outline" className="text-[10px] sm:text-xs">
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> {totalRuns} cycles
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-[10px] sm:text-xs">
                {errorCount} errors
              </Badge>
            )}
            {pendingApprovals > 0 && (
              <Badge variant="outline" className="text-[10px] sm:text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> {pendingApprovals} approvals
              </Badge>
            )}
            {pendingInterAgent > 0 && (
              <Badge variant="outline" className="text-[10px] sm:text-xs bg-blue-50 text-blue-700 border-blue-200">
                <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> {pendingInterAgent} messages
              </Badge>
            )}
            <span className="text-muted-foreground hidden sm:inline">{totalCount} agents configured</span>
            {runningAgents.size > 0 && (
              <Badge className="text-[10px] sm:text-xs bg-green-100 text-green-700 border-0 animate-pulse">
                <MonitorDot className="h-2.5 w-2.5 mr-0.5" /> {runningAgents.size} thinking now
              </Badge>
            )}
            <div className="flex items-center gap-1 ml-auto">
              {pollStatus === "polling" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { fetchAutonomy(); pollAndTrigger(); }}
                className="gap-1 text-xs h-7"
              >
                <RefreshCw className="h-3 w-3" /> <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Live Activity Feed (Full Width, below Autonomy) ── */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
              Live Activity
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowActivity(!showActivity)}
              >
                {showActivity ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showActivity && (
          <CardContent className="pt-0">
            <ScrollArea className="h-[220px] sm:h-[260px] lg:h-[300px]">
              <div className="space-y-2">
                {/* Live steps (currently running) */}
                {runningLiveSteps.length > 0 && (
                  <div className="space-y-1.5">
                    {runningLiveSteps.map((step, i) => {
                      const StepIcon = step.type === "tool_call" ? Wrench : Brain;
                      return (
                        <div key={`live-${step.agentId}-${i}`} className="relative flex items-start gap-2 p-2 sm:p-2.5 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-800/30 overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-green-400/20 to-transparent animate-[shimmer_2s_infinite] rounded-lg" />
                          <StepIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0 animate-pulse relative" />
                          <div className="min-w-0 flex-1 relative">
                            <p className="text-[11px] sm:text-xs font-medium text-green-700 dark:text-green-400 truncate">{step.agentName}</p>
                            <p className="text-[10px] sm:text-[11px] text-green-600 dark:text-green-500 break-words line-clamp-2">{step.step}</p>
                          </div>
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0 mt-1 relative" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Agents running by another admin session */}
                {currentlyRunningAgents.length > 0 && runningLiveSteps.length === 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mt-1 mb-1 px-1">Running by another admin</p>
                    {currentlyRunningAgents.map((agent) => {
                      const Icon = AGENT_ICON_COMPONENTS[agent.agentType as AgentType] || AgentIconFallback;
                      return (
                        <div key={agent.agentId} className="flex items-center gap-2 p-2 sm:p-2.5 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800/30">
                          <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] sm:text-xs font-medium text-blue-700 dark:text-blue-400 truncate">{agent.agentName}</p>
                            <p className="text-[10px] sm:text-[11px] text-blue-600/70 dark:text-blue-500/70">
                              {agent.startedByRole === "SUPER_ADMIN" ? "Running by Super Admin" : agent.startedByRole === "ADMIN" ? "Running by Admin" : "Running..."}
                            </p>
                          </div>
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Completed steps */}
                {completedLiveSteps.length > 0 && (
                  <div className="space-y-1">
                    {completedLiveSteps.map((step, i) => (
                      <div key={`done-${step.agentId}-${i}`} className="flex items-start gap-2 p-1.5 sm:p-2 rounded-md">
                        <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-[11px] text-muted-foreground break-words line-clamp-2">{step.agentName}: {step.step}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Activity logs */}
                {activityLogs.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1 mb-1 px-1">Recent Activity</p>
                    {activityLogs.map((log) => {
                      const Icon = AGENT_ICON_COMPONENTS[log.agentType as AgentType] || AgentIconFallback;
                      const isSuccess = log.status === "SUCCESS";
                      return (
                        <div key={log.id} className="flex items-start gap-2 p-1.5 sm:p-2 rounded-md hover:bg-muted/50 transition-colors">
                          <div className={`h-6 w-6 sm:h-7 sm:w-7 rounded-md flex items-center justify-center shrink-0 ${isSuccess ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] sm:text-xs font-medium truncate">{log.agentName}</p>
                              {isSuccess
                                ? <CheckCircle className="h-2.5 w-2.5 text-green-500 shrink-0" />
                                : <XCircle className="h-2.5 w-2.5 text-red-500 shrink-0" />
                              }
                            </div>
                            <p className="text-[10px] sm:text-[11px] text-muted-foreground break-words line-clamp-2">{log.title}</p>
                            <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] text-muted-foreground/60 mt-0.5">
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
                  <div className="text-center py-8 sm:py-12 animate-[fadeIn_0.5s_ease-out]">
                    <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3 animate-pulse" />
                    <p className="text-xs sm:text-sm text-muted-foreground">No activity yet</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-1">Enable agents to see them think autonomously</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        )}
      </Card>

      {/* ── Agent Cards Grid (Full Width, Responsive) ── */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {agents.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Bot className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No agents found.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); fetchAgents(); }}>
              Refresh
            </Button>
          </div>
        ) : agents.map((agent, index) => {
          const Icon = AGENT_ICON_COMPONENTS[agent.type as AgentType] || AgentIconFallback;
          const agentConfig = AGENT_TYPES[agent.type as AgentType];
          const statusColor = STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400";
          const chatCount = agent._count?.chats || agent._count?.conversations || 0;
          const autonomy = getAutonomyConfig(agent.id);
          const isDev = agent.type === "DEV";
          const isToggling = togglingAgent === agent.id;
          const isCurrentlyRunning = runningAgents.has(agent.id);

          const features = safeJsonParse<Record<string, boolean>>(agent.roleConfig?.features, {});
          const quickActions = safeJsonParse<unknown[]>(agent.roleConfig?.quickActions, []);
          const quickActionsCount = quickActions.length;

          return (
            <Card
              key={agent.id}
              className={`hover:shadow-md transition-all cursor-pointer border hover:border-primary/20 group animate-[card-enter_0.4s_ease-out_both] ${isCurrentlyRunning ? "border-green-300 dark:border-green-700 shadow-green-100 dark:shadow-green-900/20 shadow-sm" : ""}`}
              style={{ animationDelay: `${index * 60}ms` }}
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              <CardHeader className="pb-2 sm:pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-lg ${agentConfig?.bgColor || "bg-muted"} flex items-center justify-center relative shrink-0`}>
                      <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
                      {isCurrentlyRunning && (
                        <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm sm:text-base flex items-center gap-2 truncate">
                        <span className="truncate">{agent.name}</span>
                        <div className={`h-2 w-2 rounded-full shrink-0 ${isCurrentlyRunning ? "bg-green-500 animate-pulse" : statusColor}`} />
                      </CardTitle>
                      <CardDescription className="text-[11px] sm:text-xs mt-0.5 truncate">{agent.model}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={isCurrentlyRunning ? "default" : agent.status === "IDLE" ? "secondary" : agent.status === "ERROR" ? "destructive" : "outline"}
                    className="text-[10px] sm:text-xs shrink-0"
                  >
                    {isCurrentlyRunning ? "THINKING" : agent.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 sm:space-y-3">
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                  {agentConfig?.description || agent.description}
                </p>

                {/* Features Badges */}
                <div className="flex flex-wrap gap-1 sm:gap-1.5">
                  {autonomy?.enabled && (
                    <Badge className="text-[9px] sm:text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">
                      <Radio className="h-2.5 w-2.5 mr-0.5" /> Auto
                    </Badge>
                  )}
                  {features.agentic && (
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                      <Brain className="h-2.5 w-2.5 mr-0.5" /> Agentic
                    </Badge>
                  )}
                  {features.webSearch && (
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0">
                      <Zap className="h-2.5 w-2.5 mr-0.5" /> Web Search
                    </Badge>
                  )}
                  {features.crossAgent && (
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0">
                      <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> Cross-Agent
                    </Badge>
                  )}
                  {quickActionsCount > 0 && (
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0">
                      {quickActionsCount} Actions
                    </Badge>
                  )}
                </div>

                {/* Autonomy status bar */}
                {autonomy && !isDev && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
                    {autonomy.enabled ? (
                      <>
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                        <span>Cycle #{autonomy.totalRuns + 1}</span>
                        <span className="text-muted-foreground/60 hidden sm:inline">|</span>
                        <span className="hidden sm:inline">{autonomy.totalRuns} completed</span>
                        {autonomy.lastRunAt && (
                          <>
                            <span className="text-muted-foreground/60 hidden md:inline">|</span>
                            <span className="hidden md:inline">Last: {new Date(autonomy.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
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
                    <span className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1">
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
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
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
                            className={`h-7 w-7 p-0 ${autonomy?.enabled ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-muted-foreground hover:text-foreground"}`}
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
                  <Button size="sm" variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors text-xs h-7">
                    Chat <ArrowRight className="h-3 w-3 ml-0.5 sm:ml-1" />
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
