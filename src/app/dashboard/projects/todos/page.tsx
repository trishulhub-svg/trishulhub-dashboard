"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, CheckCircle2, Circle, Clock, CalendarDays,
  AlertTriangle, BookOpen, GraduationCap, ExternalLink, ListTodo,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn, safeText, safeDate, deepSanitize } from "@/lib/utils";

// ── Safe extractors ──
function extractStr(obj: unknown, key: string, fallback = ""): string {
  if (!obj || typeof obj !== "object") return fallback;
  const val = (obj as Record<string, unknown>)[key];
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return fallback;
}

function extractNestedStr(obj: unknown, path: string[], fallback = ""): string {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return fallback;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : fallback;
}

const trainingStatusColors: Record<string, string> = {
  ASSIGNED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  READ: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  TEST_STARTED: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  PASSED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const trainingLevelColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
  MEDIUM: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  HIGH: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function GlobalTodosPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  const userId = session?.user?.id || "";
  const userRole = session?.user?.role || "DEVELOPER";

  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) { window.location.href = "/login"; return true; }
    return false;
  }, []);

  // ── Fetch all tasks assigned to current user ──
  const { data: tasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["my-tasks-all"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?assignedTo=current", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load tasks");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 15 * 1000,
    retry: 1,
  });

  // ── Fetch training assignments ──
  const { data: trainingData = [], isLoading: trainingLoading } = useQuery({
    queryKey: ["my-training-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/training/assignments", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load training");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  // ── Filter: hide DONE tasks, keep AWAITING_APPROVAL with blur ──
  const activeTasks = useMemo(() => {
    return tasksData.filter((t: unknown) => {
      const status = extractStr(t, "status", "");
      return status !== "DONE";
    });
  }, [tasksData]);

  // ── Active (non-completed) training assignments ──
  const activeTraining = useMemo(() => {
    return trainingData.filter((t: unknown) => {
      const status = extractStr(t, "status", "");
      return status !== "COMPLETED" && status !== "PASSED" && status !== "FAILED";
    });
  }, [trainingData]);

  // ── Search filter ──
  const filteredTasks = useMemo(() => {
    if (!search) return activeTasks;
    const q = search.toLowerCase();
    return activeTasks.filter((t: unknown) => {
      const title = extractStr(t, "title", "").toLowerCase();
      const desc = extractStr(t, "description", "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [activeTasks, search]);

  // ── Group tasks by projectId ──
  const tasksByProject = useMemo(() => {
    const map = new Map<string, unknown[]>();
    for (const task of filteredTasks) {
      const pid = extractStr(task, "projectId", "other");
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(task);
    }
    // Sort within each group: overdue first, then by deadline
    for (const [, tasks] of map) {
      tasks.sort((a, b) => {
        const aDeadline = extractStr(a, "deadline", "");
        const bDeadline = extractStr(b, "deadline", "");
        const aDate = aDeadline ? new Date(aDeadline).getTime() : Infinity;
        const bDate = bDeadline ? new Date(bDeadline).getTime() : Infinity;
        const now = Date.now();
        const aOverdue = aDate < now ? 0 : 1;
        const bOverdue = bDate < now ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        return aDate - bDate;
      });
    }
    return map;
  }, [filteredTasks]);

  // ── Sort training by due date ──
  const sortedTraining = useMemo(() => {
    return [...activeTraining].sort((a, b) => {
      const aDue = extractStr(a, "dueDate", "");
      const bDue = extractStr(b, "dueDate", "");
      const aDate = aDue ? new Date(aDue).getTime() : Infinity;
      const bDate = bDue ? new Date(bDue).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [activeTraining]);

  // ── Stats ──
  const totalActive = activeTasks.length + activeTraining.length;
  const overdueTasks = activeTasks.filter((t: unknown) => {
    const deadline = extractStr(t, "deadline", "");
    return deadline && new Date(deadline) < new Date();
  }).length;
  const awaitingApproval = activeTasks.filter((t: unknown) => extractStr(t, "status", "") === "AWAITING_APPROVAL").length;

  // ── Toggle task done ──
  const handleToggleDone = async (taskId: string) => {
    setTogglingId(taskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: taskId, status: "DONE" }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        const finalStatus = updated?.status || "DONE";
        if (finalStatus === "AWAITING_APPROVAL") {
          toast.success("Task submitted for approval");
        } else {
          toast.success("Task completed");
        }
        queryClient.invalidateQueries({ queryKey: ["my-tasks-all"] });
      } else {
        if (handle401(res)) return;
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update task");
      }
    } catch {
      toast.error("Failed to update task");
    } finally {
      setTogglingId(null);
    }
  };

  const isLoading = sessionStatus === "loading" || tasksLoading || trainingLoading;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-3 bg-gradient-to-br from-muted/40 to-muted/20">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects" className="mt-0.5 hover:bg-muted/80 rounded-lg">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center">
              <ListTodo className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">My Todos</h1>
            <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-bold">
              {String(totalActive)}
            </Badge>
          </div>
          <p className="text-muted-foreground/70 text-sm mt-1 ml-12">
            All your tasks and training across projects
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-gradient-to-br from-violet-50/80 to-violet-100/40 dark:from-violet-900/15 dark:to-violet-900/5 p-3.5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Active</p>
          <p className="text-2xl font-bold tracking-tight text-violet-700 dark:text-violet-300">{String(totalActive)}</p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-red-50/80 to-red-100/40 dark:from-red-900/15 dark:to-red-900/5 p-3.5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Overdue</p>
          <p className="text-2xl font-bold tracking-tight text-red-700 dark:text-red-300">{String(overdueTasks)}</p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-amber-50/80 to-amber-100/40 dark:from-amber-900/15 dark:to-amber-900/5 p-3.5">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Awaiting Review</p>
          <p className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300">{String(awaitingApproval)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50"
        />
      </div>

      {/* Empty state */}
      {totalActive === 0 && (
        <div className="text-center py-20">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-violet-400/40" />
          </div>
          <p className="text-lg font-bold text-foreground/80">All caught up!</p>
          <p className="text-sm text-muted-foreground/60 mt-1">No pending tasks or training assignments</p>
        </div>
      )}

      {/* Training Section */}
      {sortedTraining.length > 0 && !search && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <GraduationCap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <h2 className="text-sm font-bold text-foreground">Training</h2>
            <Badge variant="secondary" className="text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{String(sortedTraining.length)}</Badge>
          </div>
          <div className="space-y-2">
            {sortedTraining.map((training: unknown) => {
              const tId = extractStr(training, "id", "");
              const topic = extractNestedStr(training, ["document", "topic"], "Untitled Training");
              const dueDate = extractStr(training, "dueDate", "");
              const status = extractStr(training, "status", "ASSIGNED");
              const level = extractStr(training, "testLevel", "MEDIUM");
              const isOverdue = dueDate && new Date(dueDate) < new Date();

              return (
                <Card
                  key={tId}
                  className={cn(
                    "border border-gray-200/80 dark:border-gray-700/50 cursor-pointer",
                    "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
                    "hover:-translate-y-[1px] transition-all duration-200",
                    "bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm",
                    isOverdue && "border-red-300 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/5"
                  )}
                  onClick={() => router.push(`/dashboard/my-training/${tId}`)}
                >
                  <CardContent className="p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-violet-500/5 flex items-center justify-center">
                        <BookOpen className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{safeText(topic)}</p>
                          <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn("text-[10px] font-medium", trainingStatusColors[status] || "")}>
                            {safeText(status).replace("_", " ")}
                          </Badge>
                          <Badge className={cn("text-[10px] font-medium", trainingLevelColors[level] || "")}>
                            {safeText(level)}
                          </Badge>
                          {dueDate && (
                            <span className={cn("text-[11px] flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                              {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {safeDate(dueDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Tasks Section - Grouped by Project */}
      {tasksByProject.size > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <ListTodo className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Tasks</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(activeTasks.length)}</Badge>
          </div>
          <div className="space-y-4">
            {Array.from(tasksByProject.entries()).map(([projectId, tasks]) => {
              // Get project name from first task's nested data (if available) or use ID
              const firstTask = tasks[0] || {};
              // We need to figure out the project name - use the project name from task if available
              const projectName = extractStr(firstTask, "projectName", projectId.length > 12 ? projectId.slice(0, 12) + "..." : projectId);

              return (
                <div key={projectId}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {safeText(projectName)}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] font-bold">{String(tasks.length)}</Badge>
                  </div>
                  <div className="space-y-1.5 ml-2.5 border-l-2 border-gray-200/60 dark:border-gray-700/30 pl-4">
                    {tasks.map((task: unknown) => {
                      const taskId = extractStr(task, "id", "");
                      const title = extractStr(task, "title", "Untitled");
                      const status = extractStr(task, "status", "TODO");
                      const priority = extractStr(task, "priority", "MEDIUM");
                      const deadline = extractStr(task, "deadline", "");
                      const isAwaiting = status === "AWAITING_APPROVAL";
                      const isOverdue = deadline && new Date(deadline) < new Date() && !isAwaiting;
                      const isToggling = togglingId === taskId;

                      const priorityDot = priority === "URGENT" ? "bg-red-400" : priority === "HIGH" ? "bg-orange-400" : priority === "MEDIUM" ? "bg-blue-400" : "bg-gray-400";

                      return (
                        <div
                          key={taskId}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200",
                            "bg-white/70 dark:bg-white/[0.03] border-gray-200/60 dark:border-gray-700/40",
                            "hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-sm",
                            isAwaiting && "opacity-50 blur-[1px]"
                          )}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleDone(taskId); }}
                            disabled={isToggling || isAwaiting}
                            className={cn(
                              "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center",
                              "transition-all duration-200 hover:scale-110",
                              isToggling && "animate-pulse",
                              isAwaiting && "cursor-default",
                              !isAwaiting && "hover:border-primary/60 hover:bg-primary/5",
                              "border-gray-300 dark:border-gray-600"
                            )}
                          >
                            {isAwaiting && <CheckCircle2 className="h-3 w-3 text-orange-400" />}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm leading-snug",
                              isAwaiting && "line-through text-muted-foreground/60",
                              !isAwaiting && "font-medium"
                            )}>
                              {safeText(title)}
                            </p>
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={cn("h-2 w-2 rounded-full", priorityDot)} />
                            {deadline && (
                              <span className={cn("text-[11px] flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                                {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                {safeDate(deadline)}
                              </span>
                            )}
                            {isAwaiting && (
                              <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium">
                                Reviewing
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Only search active but no results */}
      {search && filteredTasks.length === 0 && sortedTraining.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground font-medium">No tasks match your search</p>
        </div>
      )}
    </div>
  );
}
