"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X, CalendarDays, Tag, CheckCircle2, ShieldCheck,
  DollarSign, Activity, Gauge, ListTodo, CircleDot, ClipboardCheck, LayoutDashboard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TASK_COLUMNS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";
import { safeText, safeNumber, safeDate, deepSanitize, cn } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLETPROOF v8: React Query migration + improved task board layout.
// ALL Radix Select replaced with native <select> (React 19 compatibility).
// Every JSX child is guaranteed to be string | number | null | undefined | boolean.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const taskStatusColors: Record<string, string> = {
  TODO: "bg-gray-100 dark:bg-gray-800/50",
  IN_PROGRESS: "bg-blue-50 dark:bg-blue-900/20",
  REVIEW: "bg-yellow-50 dark:bg-yellow-900/20",
  AWAITING_APPROVAL: "bg-orange-50 dark:bg-orange-900/20",
  DONE: "bg-green-50 dark:bg-green-900/20",
};

const taskStatusAccentColors: Record<string, string> = {
  TODO: "bg-gray-400",
  IN_PROGRESS: "bg-blue-400",
  REVIEW: "bg-yellow-400",
  AWAITING_APPROVAL: "bg-orange-400",
  DONE: "bg-green-400",
};

const taskStatusTextColors: Record<string, string> = {
  TODO: "text-gray-600 dark:text-gray-400",
  IN_PROGRESS: "text-blue-600 dark:text-blue-400",
  REVIEW: "text-yellow-600 dark:text-yellow-400",
  AWAITING_APPROVAL: "text-orange-600 dark:text-orange-400",
  DONE: "text-green-600 dark:text-green-400",
};

const projectStatusColors: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const priorityBorderColors: Record<string, string> = {
  LOW: "border-l-gray-300 dark:border-l-gray-600",
  MEDIUM: "border-l-blue-400 dark:border-l-blue-500",
  HIGH: "border-l-orange-400 dark:border-l-orange-500",
  URGENT: "border-l-red-400 dark:border-l-red-500",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

// ── Safe extractors: guarantee primitive return type ──
function extractStr(obj: unknown, key: string, fallback = ""): string {
  if (!obj || typeof obj !== "object") return fallback;
  const val = (obj as Record<string, unknown>)[key];
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return fallback;
}

function extractNum(obj: unknown, key: string, fallback = 0): number {
  if (!obj || typeof obj !== "object") return fallback;
  const val = (obj as Record<string, unknown>)[key];
  if (typeof val === "number" && !isNaN(val)) return val;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function extractNestedStr(obj: unknown, path: string[], fallback = ""): string {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return fallback;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : (typeof current === "number" || typeof current === "boolean" ? String(current) : fallback);
}

function getProgressColor(progress: number) {
  if (progress < 30) return "[&>div]:bg-red-500 [&>div]:shadow-red-500/30";
  if (progress < 70) return "[&>div]:bg-amber-500 [&>div]:shadow-amber-500/30";
  return "[&>div]:bg-emerald-500 [&>div]:shadow-emerald-500/30";
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // Safe projectId extraction
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === "string"
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? "")
      : "";

  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  // ── State: UI-only state (dialogs, selections) ──
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Record<string, unknown> | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  // M-PRJ-6 FIX: Debounce timer ref for progress input
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── React Query: Project data with caching ──
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

  const { data: membersData = [], isLoading: membersLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/members`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load members");
      const md = deepSanitize(await res.json());
      return Array.isArray(md) ? md : (Array.isArray((md as Record<string, unknown>)?.data) ? (md as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const { data: teamUsersData = [] } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load team users");
      const ud = deepSanitize(await res.json());
      return Array.isArray(ud) ? ud : (Array.isArray((ud as Record<string, unknown>)?.data) ? (ud as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: isAdminUser,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const project = projectData;
  const tasks = tasksData;
  const members = membersData;
  const teamUsers = teamUsersData;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
  };

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      projectId,
      assigneeType: String(form.get("assigneeType") || "HUMAN"),
      assignedTo: String(form.get("assignedTo") || "") || null,
      priority: String(form.get("priority") || "MEDIUM"),
    };
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (res.ok) { toast.success("Task created"); setAddOpen(false); invalidateAll(); }
      else { if (handle401(res)) return; const err = await res.json().catch(() => null); toast.error(err?.error || "Failed to create task"); }
    } catch { toast.error("Failed to create task"); }
  };

  const handleMoveTask = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: taskId, status: newStatus }) });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        const finalStatus = updated?.status || newStatus;
        if (finalStatus === "AWAITING_APPROVAL" && newStatus === "DONE") {
          toast.success("Task submitted for approval");
        } else if (finalStatus === "DONE" && newStatus === "DONE") {
          toast.success("Task approved and marked as done");
        } else {
          toast.success(`Task moved to ${String(finalStatus).replace("_", " ")}`);
        }
        invalidateAll();
      } else {
        if (handle401(res)) return;
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to move task");
      }
    } catch { toast.error("Failed to move task"); }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Task deleted"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to delete task"); }
    } catch { toast.error("Failed to delete task"); }
  };

  const handleAddMember = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ userId, role }) });
      if (res.ok) { toast.success("Member added"); setAddMemberOpen(false); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add member"); }
    } catch { toast.error("Failed to add member"); }
  };

  const handleUpdateProject = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/projects", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: projectId, ...updates }) });
      if (res.ok) { toast.success("Project updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update project"); }
    } catch { toast.error("Failed to update project"); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Member removed"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to remove member"); }
    } catch { toast.error("Failed to remove member"); }
  };

  // ── Derived values (ALL guaranteed primitives via safe extractors) ──
  const projectName = project ? extractStr(project, "name", "Untitled") : "";
  const projectDesc = project ? extractStr(project, "description", "") : "";
  const projectStatus = project ? extractStr(project, "status", "PLANNING") : "PLANNING";
  const projectProgress = project ? extractNum(project, "progress", 0) : 0;
  const projectBudget = project ? extractNum(project, "budget", 0) : 0;
  const projectDeadline = project ? extractStr(project, "deadline", "") : "";

  const memberUserIds = useMemo(() => members.map((m) => extractStr(m, "userId", "")), [members]);
  const availableUsers = useMemo(() => {
    const ids = memberUserIds;
    return teamUsers.filter((u) => !ids.includes(extractStr(u, "id", "")));
  }, [teamUsers, memberUserIds]);

  const isLoading = sessionStatus === "loading" || projectLoading;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border p-4 bg-gradient-to-br from-muted/40 to-muted/20">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <ListTodo className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Invalid project ID</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  if (!project) {
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

  const progressColorClass = projectProgress < 30 ? "text-red-600 dark:text-red-400" : projectProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  const isTodosPage = pathname.endsWith("/todos");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects" className="mt-0.5 hover:bg-muted/80 rounded-lg hover:scale-105 transition-all duration-200">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight">{safeText(projectName, "Untitled")}</h1>
            <Badge className={`${projectStatusColors[safeText(projectStatus, "")] || ""} font-medium shadow-sm`}>
              {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
            </Badge>
          </div>
          {projectDesc && (
            <p className="text-muted-foreground/80 text-sm mt-1.5 leading-relaxed max-w-2xl">{safeText(projectDesc)}</p>
          )}
        </div>
      </div>

      {/* ── View Tabs: Overview | My Tasks ── */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-1 w-fit">
        <Button
          variant={isTodosPage ? "ghost" : "default"}
          size="sm"
          className={cn(
            "gap-1.5 text-xs transition-all",
            isTodosPage && "text-muted-foreground hover:text-foreground",
            !isTodosPage && "shadow-sm"
          )}
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
          {isAdminUser && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">Admin</Badge>}
        </Button>
        <Button
          variant={isTodosPage ? "default" : "ghost"}
          size="sm"
          className={cn(
            "gap-1.5 text-xs transition-all",
            !isTodosPage && "text-muted-foreground hover:text-foreground",
            isTodosPage && "shadow-sm"
          )}
          onClick={() => router.push(`/dashboard/projects/${projectId}/todos`)}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          My Tasks
          {!isAdminUser && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">You</Badge>}
        </Button>
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        {/* Status */}
        <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-slate-50/90 to-slate-100/60 dark:from-slate-900/50 dark:to-slate-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Status</p>
            </div>
            {isAdminUser ? (
              <select
                className="h-8 text-xs border rounded-lg px-2.5 bg-background/80 w-full font-medium focus:ring-2 focus:ring-primary/20 transition-all"
                value={safeText(projectStatus, "PLANNING")}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={`${projectStatusColors[safeText(projectStatus, "")] || ""} font-semibold text-xs shadow-sm`}>
                {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-slate-50/90 to-slate-100/60 dark:from-slate-900/50 dark:to-slate-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Gauge className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Progress</p>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={safeNumber(projectProgress)} className={cn("h-2 flex-1 rounded-full", getProgressColor(projectProgress))} />
              {isAdminUser ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={safeNumber(projectProgress)}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
                    progressTimerRef.current = setTimeout(() => {
                      handleUpdateProject({ progress: val });
                    }, 500);
                  }}
                  className="h-7 w-14 text-xs text-center font-semibold"
                />
              ) : (
                <span className={cn("text-sm font-bold tabular-nums", progressColorClass)}>{safeNumber(projectProgress)}%</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget (admin only) */}
        {isAdminUser && (
          <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 dark:from-emerald-900/15 dark:to-emerald-900/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Budget</p>
              </div>
              <p className="text-lg font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                {String(projectBudget || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Deadline */}
        <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-slate-50/90 to-slate-100/60 dark:from-slate-900/50 dark:to-slate-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <CalendarDays className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Deadline</p>
            </div>
            <p className="text-sm font-bold">
              {projectDeadline ? safeDate(projectDeadline, "No deadline") : <span className="text-muted-foreground font-medium">No deadline</span>}
            </p>
          </CardContent>
        </Card>

        {/* Team Size (non-admin) */}
        {!isAdminUser && (
          <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-slate-50/90 to-slate-100/60 dark:from-slate-900/50 dark:to-slate-800/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                </div>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Team Size</p>
              </div>
              <p className="text-lg font-bold tracking-tight">{String(members.length)} <span className="text-sm font-medium text-muted-foreground">members</span></p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Project Members — show skeleton if loading */}
      {membersLoading ? (
        <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-white/80 to-white/50 dark:from-gray-900/30 dark:to-gray-900/10">
          <CardHeader className="pb-3 border-b border-gray-100/60 dark:border-gray-800/40">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="flex gap-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-xl border">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-2 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-white/80 to-white/50 dark:from-gray-900/30 dark:to-gray-900/10">
        <CardHeader className="pb-3 border-b border-gray-100/60 dark:border-gray-800/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Project Team</CardTitle>
                <CardDescription className="text-xs">
                  {String(members.length)} member{members.length !== 1 ? "s" : ""} assigned to this project
                </CardDescription>
              </div>
            </div>
            {isAdminUser && (
              <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5 shadow-sm hover:shadow-md transition-all">
                    <UserPlus className="h-3.5 w-3.5" /> Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription>Assign a team member to this project.</DialogDescription>
                  </DialogHeader>
                  {availableUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      All team members are already assigned to this project.
                    </p>
                  ) : (
                    <ScrollArea className="max-h-80">
                      <div className="space-y-2">
                        {availableUsers.map((user) => {
                          const uName = extractStr(user, "name", "Unknown");
                          const uRole = extractStr(user, "role", "");
                          const uDept = extractStr(user, "department", "");
                          const uId = extractStr(user, "id", "");
                          const initials = uName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                          return (
                            <div key={uId} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 ring-2 ring-muted">
                                  <AvatarFallback className="text-xs bg-gradient-to-br from-primary/20 to-primary/5">{initials || "?"}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{uName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {safeText(uRole)}{uDept ? ` · ${safeText(uDept)}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleAddMember(uId, "MEMBER")}>Member</Button>
                                <Button size="sm" onClick={() => handleAddMember(uId, "LEAD")}>Lead</Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {members.length === 0 ? (
            <div className="text-center py-8">
              <div className="h-10 w-10 mx-auto rounded-full bg-muted/50 flex items-center justify-center mb-2">
                <Users className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground/70 font-medium">No team members assigned yet</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {members.map((member) => {
                const mId = extractStr(member, "id", "");
                const mUserId = extractStr(member, "userId", "");
                const mRole = extractStr(member, "role", "");
                const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                const initials = mUserName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                const avatarColor = mRole === "LEAD" ? "from-amber-400 to-orange-500" : "from-primary/60 to-primary/40";
                return (
                  <div key={mId} className="flex items-center gap-2 p-2 pr-1.5 rounded-xl border bg-card/80 hover:bg-card hover:shadow-sm transition-all group/member">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className={cn("text-[10px] font-bold text-white bg-gradient-to-br", avatarColor)}>{initials || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="mr-1">
                      <p className="text-xs font-semibold">{mUserName}</p>
                      <p className="text-[10px] text-muted-foreground">{safeText(mRole)}</p>
                    </div>
                    {isAdminUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground/50 hover:text-red-500 opacity-0 group-hover/member:opacity-100 transition-all"
                        onClick={() => handleRemoveMember(mUserId)}
                        aria-label="Remove member"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ── Task Board Header with Add Task ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
            <ListTodo className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Task Board</h2>
            <p className="text-xs text-muted-foreground">{String(tasks.length)} total tasks</p>
          </div>
        </div>
        {(isAdminUser || members.length > 0) && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 shadow-sm bg-gradient-to-r from-primary to-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all duration-200 hover:scale-[1.02]">
                <Plus className="h-4 w-4" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Task</DialogTitle>
                <DialogDescription>Create a new task for this project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title *</Label>
                  <Input name="title" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea name="description" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <select name="priority" defaultValue="MEDIUM" className="border rounded px-3 py-2 text-sm bg-background w-full">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Assign To</Label>
                    <select name="assigneeType" defaultValue="HUMAN" className="border rounded px-3 py-2 text-sm bg-background w-full">
                      <option value="HUMAN">Team Member</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Assignee</Label>
                  <select name="assignedTo" className="border rounded px-3 py-2 text-sm bg-background w-full">
                    <option value="">Unassigned</option>
                    {members.map((m) => {
                      const mUserId = extractStr(m, "userId", "");
                      const mUserName = extractNestedStr(m, ["user", "name"], "Unknown");
                      return <option key={mUserId} value={mUserId}>{mUserName}</option>;
                    })}
                  </select>
                </div>
                <Button type="submit" className="w-full">Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Task Detail Dialog */}
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
            const isAwaitingApproval = dtStatus === "AWAITING_APPROVAL";
            const isDone = dtStatus === "DONE";
            // Self-approval check: ADMIN cannot approve their own tasks
            const canApprove = isAdminUser && isAwaitingApproval && !(userRole === "ADMIN" && dtAssignedTo === userId);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between pr-6">
                    <DialogTitle className="text-lg font-bold">{safeText(dtTitle, "Untitled")}</DialogTitle>
                    <Badge className={`shrink-0 font-semibold ${priorityColors[dtPriority] || ""}`}>
                      {safeText(dtPriority, "MEDIUM")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`${taskStatusColors[dtStatus] || ""} text-xs font-medium`}>{safeText(dtStatus, "TODO").replace("_", " ")}</Badge>
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
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> {safeDate(dtDeadline, "")}</span>
                    )}
                  </div>

                  {/* Approval Info */}
                  {isDone && dtApprovedBy && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/80 dark:border-green-900/30">
                      <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      <div className="text-xs">
                        <p className="font-semibold text-green-700 dark:text-green-300">Approved</p>
                        <p className="text-green-600/70 dark:text-green-400/70 mt-0.5">
                          Approved by {extractStr(selectedTask, "approvedByName", "") || safeText(dtApprovedBy)} {dtApprovedAt ? `· ${safeDate(dtApprovedAt, "")}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                  {isAwaitingApproval && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200/80 dark:border-orange-900/30">
                      <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                      <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                        Pending approval from admin/superadmin
                      </p>
                    </div>
                  )}

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

                  {/* Approve / Reject Actions (for admin/superadmin) */}
                  {canApprove && (
                    <div className="flex gap-2 p-3 rounded-xl border-2 border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white shadow-sm shadow-green-600/20"
                        onClick={() => {
                          handleMoveTask(dtId, "DONE");
                          setTaskDetailOpen(false);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-orange-200 dark:border-orange-900/40 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                        onClick={() => {
                          handleMoveTask(dtId, "REVIEW");
                          setTaskDetailOpen(false);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" /> Send Back
                      </Button>
                    </div>
                  )}

                  {/* Move Task (hide Done when awaiting approval — use Approve instead) */}
                  {!isAwaitingApproval && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Move to</p>
                      <div className="flex flex-wrap gap-2">
                        {TASK_COLUMNS.filter((s) => String(s) !== dtStatus).map((s) => (
                          <Button
                            key={String(s)}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              handleMoveTask(dtId, String(s));
                              setTaskDetailOpen(false);
                            }}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            {String(s).replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete */}
                  <div className="flex justify-end pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => {
                        handleDeleteTask(dtId);
                        setTaskDetailOpen(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Task
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Task Columns — Responsive Grid Layout (TASK 4) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {TASK_COLUMNS.map((status) => {
          const statusStr = String(status);
          const columnTasks = (tasks as Record<string, unknown>[]).filter(
            (t) => extractStr(t, "status", "") === statusStr
          );
          const accentColor = taskStatusAccentColors[statusStr] || "bg-gray-400";
          const textColor = taskStatusTextColors[statusStr] || "text-gray-500";

          return (
            <div key={statusStr} className="flex flex-col min-w-0">
              {/* Column Header */}
              <div className={cn(
                "rounded-t-xl px-3 py-2 flex items-center gap-1.5 relative overflow-hidden",
                taskStatusColors[statusStr] || "",
                "border border-b-0 border-gray-200/60 dark:border-gray-700/40"
              )}>
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accentColor)} />
                <CircleDot className={cn("h-3.5 w-3.5", textColor)} />
                <h3 className="font-bold text-xs tracking-tight flex-1 truncate">{statusStr.replace("_", " ")}</h3>
                <Badge variant="secondary" className="text-[10px] font-bold bg-muted/80">{String(columnTasks.length)}</Badge>
              </div>
              {/* Column Card List — independently scrollable */}
              <div className="flex-1 space-y-1.5 p-1.5 bg-muted/20 rounded-b-xl border border-t-0 border-gray-200/60 dark:border-gray-700/40 min-h-[140px] max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
                {columnTasks.map((task) => {
                  const tId = extractStr(task, "id", "");
                  const tTitle = extractStr(task, "title", "Untitled");
                  const tDesc = extractStr(task, "description", "");
                  const tPriority = extractStr(task, "priority", "MEDIUM");
                  const tAssigneeType = extractStr(task, "assigneeType", "HUMAN");
                  const tDeadline = extractStr(task, "deadline", "");
                  const tAssignedTo = extractStr(task, "assignedTo", "");
                  const tAssignedToName = extractStr(task, "assignedToName", "");
                  const tAssignedName = tAssignedToName || (tAssignedTo ? tAssignedTo.slice(0, 8) + "..." : "Unassigned");
                  const tApprovedBy = extractStr(task, "approvedBy", "");
                  const isThisAwaiting = statusStr === "AWAITING_APPROVAL";
                  const canApproveThis = isAdminUser && isThisAwaiting && !(userRole === "ADMIN" && tAssignedTo === userId);
                  const borderL = priorityBorderColors[tPriority] || "border-l-gray-300 dark:border-l-gray-600";

                  return (
                    <Card
                      key={tId}
                      className={cn(
                        "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-[3px]",
                        borderL,
                        "bg-white/80 dark:bg-white/[0.04] backdrop-blur-sm"
                      )}
                      onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
                    >
                      <CardContent className="p-2 space-y-1.5">
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="text-xs font-semibold leading-tight line-clamp-1">{safeText(tTitle, "Untitled")}</p>
                          <Badge className={`text-[10px] shrink-0 font-semibold px-1.5 py-0 ${priorityColors[tPriority] || ""}`}>
                            {safeText(tPriority, "MEDIUM")}
                          </Badge>
                        </div>
                        {tDesc && (
                          <p className="text-[10px] text-muted-foreground/70 line-clamp-1 leading-snug">{safeText(tDesc)}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {tAssigneeType === "AI" ? (
                              <Bot className="h-2.5 w-2.5" />
                            ) : (
                              <User className="h-2.5 w-2.5" />
                            )}
                            <span className="truncate max-w-[70px]">{safeText(tAssignedName)}</span>
                          </div>
                          {tDeadline && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {safeDate(tDeadline, "")}
                            </span>
                          )}
                        </div>
                        {/* Approved by badge on DONE tasks */}
                        {statusStr === "DONE" && tApprovedBy && (
                          <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
                            <ShieldCheck className="h-3 w-3" />
                            <span>Approved by {extractStr(task, "approvedByName", "") || safeText(tApprovedBy)}</span>
                          </div>
                        )}
                        <div className="flex gap-1 flex-wrap">
                          {/* AWAITING_APPROVAL: show Approve/Reject for admins, or a waiting indicator */}
                          {isThisAwaiting ? (
                            canApproveThis ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "DONE"); }}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "REVIEW"); }}
                                >
                                  <X className="h-3 w-3 mr-0.5" /> Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-[10px] text-orange-500 flex items-center gap-0.5 px-1 font-medium">
                                <Clock className="h-2.5 w-2.5" /> Waiting for approval
                              </span>
                            )
                          ) : (
                            /* Normal columns: show move buttons */
                            TASK_COLUMNS.filter((s) => String(s) !== statusStr).map((s) => (
                              <Button
                                key={String(s)}
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, String(s)); }}
                              >
                                {String(s).replace("_", " ").slice(0, 3)}
                              </Button>
                            ))
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-red-500 px-2"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(tId); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Board Summary Footer */}
      <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
        <span>{String(tasks.length)} tasks across {String(TASK_COLUMNS.length)} columns</span>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span>{String(tasks.filter((t: unknown) => extractStr(t, "status", "") === "DONE").length)} completed</span>
            <Progress value={Math.round((tasks.filter((t: unknown) => extractStr(t, "status", "") === "DONE").length / tasks.length) * 100)} className="h-1.5 w-24 [&>div]:bg-emerald-500" />
          </div>
        )}
      </div>
    </div>
  );
}
