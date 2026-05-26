"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, CheckCircle2, Circle, Bot, User, Clock, CalendarDays,
  LayoutDashboard, ClipboardCheck, ListTodo, AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { TaskStatus, TaskPriority } from "@/lib/types";
import { safeText, safeNumber, safeDate, deepSanitize, cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Todos Page: Clean, minimal task list view for DEVELOPERS.
// Inspired by Todoist / Things 3 / Microsoft To Do.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const priorityDotColors: Record<string, string> = {
  LOW: "bg-gray-400",
  MEDIUM: "bg-blue-400",
  HIGH: "bg-orange-400",
  URGENT: "bg-red-400",
};

const taskStatusColors: Record<string, string> = {
  TODO: "bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300",
  IN_PROGRESS: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
  DONE: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
};

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
  return typeof current === "string" ? current : (typeof current === "number" || typeof current === "boolean" ? String(current) : fallback);
}

type FilterTab = "ALL" | "TODO" | "IN_PROGRESS" | "REVIEW" | "AWAITING_APPROVAL" | "DONE";

const FILTER_TABS: { key: FilterTab; label: string; count?: number }[] = [
  { key: "ALL", label: "All" },
  { key: "TODO", label: "To Do" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "REVIEW", label: "Review" },
  { key: "AWAITING_APPROVAL", label: "Pending Approval" },
  { key: "DONE", label: "Completed" },
];

export default function TodosPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === "string"
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? "")
      : "";

  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [filter, setFilter] = useState<FilterTab>("ALL");
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<Record<string, unknown> | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handle401 = (res: Response) => {
    if (res.status === 401) { window.location.href = "/login"; return true; }
    return false;
  };

  // ── React Query ──
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects?projectId=${projectId}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load project");
      const raw = deepSanitize(await res.json());
      if (Array.isArray(raw) && raw.length > 0) return raw[0] as Record<string, unknown>;
      if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id) return raw as Record<string, unknown>;
      if (Array.isArray((raw as Record<string, unknown>)?.data) && ((raw as Record<string, unknown>).data as unknown[]).length > 0) {
        return ((raw as Record<string, unknown>).data as unknown[])[0] as Record<string, unknown>;
      }
      return null;
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const { data: tasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/tasks?projectId=${projectId}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load tasks");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : (Array.isArray((td as Record<string, unknown>)?.data) ? (td as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const project = projectData;
  const projectName = project ? extractStr(project, "name", "Untitled") : "";

  // Audit fix: show ALL task statuses so developers can see REVIEW and AWAITING_APPROVAL
  const visibleTasks = tasksData;

  // Apply search and filter
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((t) => {
      const title = extractStr(t, "title", "").toLowerCase();
      const desc = extractStr(t, "description", "").toLowerCase();
      const status = extractStr(t, "status", "");
      const matchesSearch = !search || title.includes(search.toLowerCase()) || desc.includes(search.toLowerCase());
      const matchesFilter = filter === "ALL" || status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [visibleTasks, search, filter]);

  // Group filtered tasks by section
  const todoTasks = filteredTasks.filter((t) => extractStr(t, "status", "") === "TODO");
  const inProgressTasks = filteredTasks.filter((t) => extractStr(t, "status", "") === "IN_PROGRESS");
  const reviewTasks = filteredTasks.filter((t) => extractStr(t, "status", "") === "REVIEW");
  const awaitingTasks = filteredTasks.filter((t) => extractStr(t, "status", "") === "AWAITING_APPROVAL");
  const doneTasks = filteredTasks.filter((t) => extractStr(t, "status", "") === "DONE");
  const remainingCount = visibleTasks.filter((t) => extractStr(t, "status", "") !== "DONE").length;

  // Toggle task done/todo
  const handleToggleDone = async (taskId: string, currentStatus: string) => {
    setTogglingId(taskId);
    try {
      const newStatus = currentStatus === "DONE" ? "TODO" : "DONE";
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        const finalStatus = updated?.status || newStatus;
        if (finalStatus === "AWAITING_APPROVAL" && newStatus === "DONE") {
          toast.success("Task submitted for approval");
        } else if (finalStatus === "DONE") {
          toast.success("Task completed");
        } else {
          toast.success("Task moved back to To Do");
        }
        queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
        // Audit fix: also invalidate global todos cache for consistency
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

  // Check if deadline is overdue
  const isOverdue = (deadline: string) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const isLoading = sessionStatus === "loading" || projectLoading || tasksLoading;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-20 rounded-lg" />)}
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!projectId || !project) {
    return (
      <div className="text-center py-16">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <ListTodo className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/projects/${projectId}`)} aria-label="Back to project" className="mt-0.5 hover:bg-muted/80 rounded-lg hover:scale-105 transition-all duration-200">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight">{safeText(projectName, "Untitled")}</h1>
            <Badge variant="secondary" className="font-medium bg-primary/10 text-primary border-primary/20">
              <ClipboardCheck className="h-3 w-3 mr-1" /> My Tasks
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {String(remainingCount)} task{remainingCount !== 1 ? "s" : ""} remaining
          </p>
        </div>
      </div>

      {/* ── View Tabs ── */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 w-fit">
        <Button
          variant={pathname.endsWith("/todos") ? "ghost" : "default"}
          size="sm"
          className={cn(
            "gap-1.5 text-xs transition-all",
            pathname.endsWith("/todos") && "text-muted-foreground hover:text-foreground",
            !pathname.endsWith("/todos") && "shadow-sm"
          )}
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
          {isAdminUser && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">Admin</Badge>}
        </Button>
        <Button
          variant={pathname.endsWith("/todos") ? "default" : "ghost"}
          size="sm"
          className={cn(
            "gap-1.5 text-xs transition-all",
            !pathname.endsWith("/todos") && "text-muted-foreground hover:text-foreground",
            pathname.endsWith("/todos") && "shadow-sm"
          )}
          onClick={() => router.push(`/dashboard/projects/${projectId}/todos`)}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          My Tasks
          {!isAdminUser && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">You</Badge>}
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50 focus:bg-white dark:focus:bg-white/[0.06] transition-all"
            aria-label="Search tasks"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_TABS.map((tab) => {
            const isActive = filter === tab.key;
            const count =
              tab.key === "ALL" ? visibleTasks.length :
              tab.key === "TODO" ? visibleTasks.filter((t) => extractStr(t, "status", "") === "TODO").length :
              tab.key === "IN_PROGRESS" ? visibleTasks.filter((t) => extractStr(t, "status", "") === "IN_PROGRESS").length :
              tab.key === "REVIEW" ? visibleTasks.filter((t) => extractStr(t, "status", "") === "REVIEW").length :
              tab.key === "AWAITING_APPROVAL" ? visibleTasks.filter((t) => extractStr(t, "status", "") === "AWAITING_APPROVAL").length :
              visibleTasks.filter((t) => extractStr(t, "status", "") === "DONE").length;
            return (
              <Button
                key={tab.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs transition-all duration-200 gap-1.5",
                  isActive ? "shadow-md shadow-primary/20" : "hover:bg-muted/80 border-gray-200/80 dark:border-gray-700/50",
                )}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                <Badge variant="secondary" className={cn("h-4 px-1 text-[10px] font-bold", isActive ? "bg-white/20 text-white" : "bg-muted/80")}>
                  {String(count)}
                </Badge>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {filteredTasks.length === 0 && (
        <div className="text-center py-16">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-muted-foreground mb-1 font-medium">
            {search ? "No tasks match your search" : filter !== "ALL" ? `No ${filter.replace("_", " ").toLowerCase()} tasks` : "No tasks yet"}
          </p>
          <p className="text-sm text-muted-foreground/60">
            {search ? "Try a different search term" : "Tasks assigned to this project will appear here"}
          </p>
        </div>
      )}

      {/* ── To Do Section ── */}
      {filter === "ALL" && todoTasks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Circle className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-bold text-muted-foreground">To Do</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(todoTasks.length)}</Badge>
          </div>
          <div className="space-y-2">
            {todoTasks.map((task) => (
              <TaskCard
                key={extractStr(task, "id", "")}
                task={task}
                isDone={false}
                isToggling={togglingId === extractStr(task, "id", "")}
                onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
                onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── In Progress Section ── */}
      {(filter === "ALL" || filter === "IN_PROGRESS") && inProgressTasks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-3.5 w-3.5 rounded-sm bg-blue-400" />
            <h2 className="text-sm font-bold text-muted-foreground">In Progress</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(inProgressTasks.length)}</Badge>
          </div>
          <div className="space-y-2">
            {inProgressTasks.map((task) => (
              <TaskCard
                key={extractStr(task, "id", "")}
                task={task}
                isDone={false}
                isToggling={togglingId === extractStr(task, "id", "")}
                onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
                onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Review Section (audit fix: was hidden) ── */}
      {(filter === "ALL" || filter === "REVIEW") && reviewTasks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="h-3.5 w-3.5 rounded-sm bg-yellow-400" />
            <h2 className="text-sm font-bold text-muted-foreground">In Review</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(reviewTasks.length)}</Badge>
          </div>
          <div className="space-y-2">
            {reviewTasks.map((task) => (
              <TaskCard
                key={extractStr(task, "id", "")}
                task={task}
                isDone={false}
                isToggling={togglingId === extractStr(task, "id", "")}
                onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
                onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Awaiting Approval Section (audit fix: was hidden) ── */}
      {(filter === "ALL" || filter === "AWAITING_APPROVAL") && awaitingTasks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-bold text-muted-foreground">Pending Approval</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(awaitingTasks.length)}</Badge>
          </div>
          <div className="space-y-2">
            {awaitingTasks.map((task) => (
              <TaskCard
                key={extractStr(task, "id", "")}
                task={task}
                isDone={false}
                isToggling={togglingId === extractStr(task, "id", "")}
                onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
                onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Completed Section ── */}
      {(filter === "ALL" || filter === "DONE") && doneTasks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <h2 className="text-sm font-bold text-muted-foreground">Completed</h2>
            <Badge variant="secondary" className="text-[10px] font-bold">{String(doneTasks.length)}</Badge>
          </div>
          <div className="space-y-2">
            {doneTasks.map((task) => (
              <TaskCard
                key={extractStr(task, "id", "")}
                task={task}
                isDone={true}
                isToggling={togglingId === extractStr(task, "id", "")}
                onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
                onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Single filter view (flat list) ── */}
      {filter !== "ALL" && (
        <div className="space-y-2">
          {(filter === "TODO" ? todoTasks : filter === "IN_PROGRESS" ? inProgressTasks : filter === "REVIEW" ? reviewTasks : filter === "AWAITING_APPROVAL" ? awaitingTasks : doneTasks).map((task) => (
            <TaskCard
              key={extractStr(task, "id", "")}
              task={task}
              isDone={extractStr(task, "status", "") === "DONE"}
              isToggling={togglingId === extractStr(task, "id", "")}
              onToggle={() => handleToggleDone(extractStr(task, "id", ""), extractStr(task, "status", ""))}
              onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
            />
          ))}
        </div>
      )}

      {/* ── Task Detail Dialog ── */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="max-w-lg">
          {selectedTask && (() => {
            const dtId = extractStr(selectedTask, "id", "");
            const dtTitle = extractStr(selectedTask, "title", "Untitled");
            const dtDesc = extractStr(selectedTask, "description", "");
            const dtPriority = extractStr(selectedTask, "priority", "MEDIUM");
            const dtStatus = extractStr(selectedTask, "status", "TODO");
            const dtAssigneeType = extractStr(selectedTask, "assigneeType", "HUMAN");
            const dtAssignedTo = extractStr(selectedTask, "assignedTo", "");
            const dtDeadline = extractStr(selectedTask, "deadline", "");
            const dtCreatedAt = extractStr(selectedTask, "createdAt", "");
            const dtUpdatedAt = extractStr(selectedTask, "updatedAt", "");
            const dtCompletedAt = extractStr(selectedTask, "completedAt", "");
            const dtApprovedBy = extractStr(selectedTask, "approvedBy", "");
            const dtApprovedAt = extractStr(selectedTask, "approvedAt", "");
            const isDone = dtStatus === "DONE";
            const overdue = dtDeadline && isOverdue(dtDeadline) && !isDone;
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between pr-6">
                    <DialogTitle className={cn("text-lg font-bold", isDone && "line-through text-muted-foreground")}>{safeText(dtTitle, "Untitled")}</DialogTitle>
                    <Badge className={`shrink-0 font-semibold ${priorityColors[dtPriority] || ""}`}>
                      {safeText(dtPriority, "MEDIUM")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${taskStatusColors[dtStatus] || "bg-gray-100 text-gray-800"} text-xs font-medium`}>{safeText(dtStatus, "TODO").replace("_", " ")}</Badge>
                    <DialogDescription className="text-xs text-muted-foreground">
                      Created {dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}
                    </DialogDescription>
                  </div>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  {/* Assignee & Deadline Meta */}
                  <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-muted/30 border">
                    {dtAssigneeType === "AI" ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> System</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><User className="h-3.5 w-3.5" /> {extractStr(selectedTask, "assignedToName", "") || safeText(dtAssignedTo) || "Unassigned"}</span>
                    )}
                    {dtDeadline && (
                      <span className={cn("flex items-center gap-1.5 text-xs", overdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
                        <CalendarDays className="h-3.5 w-3.5" /> {safeDate(dtDeadline, "")}
                        {overdue && " (Overdue)"}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</p>
                    {dtDesc ? (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-xl p-3.5 border">
                        {safeText(dtDesc)}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No description provided.</p>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/30 p-2.5 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Created</p>
                        <p className="text-xs font-medium mt-0.5">{dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-2.5 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Last Updated</p>
                        <p className="text-xs font-medium mt-0.5">{dtUpdatedAt ? safeDate(dtUpdatedAt, "N/A") : "N/A"}</p>
                      </div>
                      {dtCompletedAt && (
                        <div className="rounded-lg bg-green-50/50 dark:bg-green-900/10 p-2.5 border border-green-200/50 dark:border-green-900/20">
                          <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wider font-medium">Completed</p>
                          <p className="text-xs font-medium mt-0.5">{safeDate(dtCompletedAt, "N/A")}</p>
                        </div>
                      )}
                      {dtApprovedAt && (
                        <div className="rounded-lg bg-green-50/50 dark:bg-green-900/10 p-2.5 border border-green-200/50 dark:border-green-900/20">
                          <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wider font-medium">Approved</p>
                          <p className="text-xs font-medium mt-0.5">{safeDate(dtApprovedAt, "N/A")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Task Card Component ──
function TaskCard({
  task,
  isDone,
  isToggling,
  onToggle,
  onClick,
}: {
  task: unknown;
  isDone: boolean;
  isToggling: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const tTitle = extractStr(task, "title", "Untitled");
  const tDesc = extractStr(task, "description", "");
  const tPriority = extractStr(task, "priority", "MEDIUM");
  const tStatus = extractStr(task, "status", "TODO");
  const tDeadline = extractStr(task, "deadline", "");
  const tAssigneeType = extractStr(task, "assigneeType", "HUMAN");
  const tAssignedTo = extractStr(task, "assignedTo", "");
  const tAssignedToName = extractStr(task, "assignedToName", "");
  const tAssignedName = tAssignedToName || (tAssignedTo ? tAssignedTo.slice(0, 8) + "..." : "Unassigned");

  const deadlineOverdue = tDeadline && !isDone && new Date(tDeadline) < new Date();

  return (
    <Card
      className={cn(
        "group/card relative border border-gray-200/80 dark:border-gray-700/50",
        "hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600",
        "hover:-translate-y-[1px] transition-all duration-200 cursor-pointer",
        "bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm",
        isDone && "opacity-70",
      )}
      onClick={onClick}
    >
      <CardContent className="p-3.5">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={isToggling}
            className={cn(
              "mt-0.5 shrink-0 h-[22px] w-[22px] rounded-full border-2 flex items-center justify-center",
              "transition-all duration-200 hover:scale-110",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              isToggling && "animate-pulse",
              isDone
                ? "bg-green-500 border-green-500 text-white shadow-sm shadow-green-500/30"
                : "border-gray-300 dark:border-gray-600 hover:border-primary/60 hover:bg-primary/5"
            )}
            aria-label={isDone ? "Mark as incomplete" : "Mark as done"}
          >
            {isDone && <CheckCircle2 className="h-3.5 w-3.5" />}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Title + Priority */}
            <div className="flex items-start justify-between gap-2">
              <p className={cn(
                "text-sm leading-snug",
                isDone
                  ? "line-through text-muted-foreground/70 font-medium"
                  : "font-semibold text-foreground"
              )}>
                {safeText(tTitle, "Untitled")}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn("h-2 w-2 rounded-full", priorityDotColors[tPriority] || "bg-gray-400")} />
                <Badge className={`text-[10px] font-semibold ${priorityColors[tPriority] || ""}`}>
                  {safeText(tPriority, "MEDIUM")}
                </Badge>
              </div>
            </div>

            {/* Description preview */}
            {tDesc && (
              <p className={cn(
                "text-xs leading-relaxed line-clamp-1",
                isDone ? "text-muted-foreground/50" : "text-muted-foreground/80"
              )}>
                {safeText(tDesc)}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Assignee */}
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                {tAssigneeType === "AI" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {safeText(tAssignedName)}
              </span>

              {/* Deadline */}
              {tDeadline && (
                <span className={cn(
                  "text-[11px] flex items-center gap-1",
                  deadlineOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                )}>
                  {deadlineOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {safeDate(tDeadline, "")}
                </span>
              )}

              {/* Status badge */}
              <Badge className={`text-[10px] ${taskStatusColors[tStatus] || "bg-gray-100 text-gray-800"} font-medium`}>
                {safeText(tStatus, "TODO").replace("_", " ")}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
