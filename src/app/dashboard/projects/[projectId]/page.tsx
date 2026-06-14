"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X, CalendarDays, Tag,
  CheckCircle2, ShieldCheck, Activity, Gauge, ListTodo, CircleDot, ClipboardCheck,
  ChevronRight, ExternalLink, Settings, Globe, Star, Pencil, Trash2 as Trash2Icon,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { TASK_COLUMNS } from "@/lib/types";
import { safeText, safeNumber, safeDate, deepSanitize, cn, extractStr, extractNum, extractNestedStr } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLETPROOF v9: Redesigned layout — compact stats row, glassmorphism,
// removed view tabs (My Tasks link in header), horizontal member chips.
// ALL functionality preserved: handlers, RBAC, safe extractors, caching.
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
  // Audit fix: delete confirmation state for tasks
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  // Remove member confirmation state
  const [removeMemberUserId, setRemoveMemberUserId] = useState<string | null>(null);
  // Website management dialog state
  const [websiteMgmtOpen, setWebsiteMgmtOpen] = useState(false);
  const [deleteWebsiteId, setDeleteWebsiteId] = useState<string | null>(null);
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newWebsiteLabel, setNewWebsiteLabel] = useState("");
  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null);

  // M-PRJ-6 FIX: Debounce timer ref for progress input
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const dragValueRef = useRef<number>(0);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

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
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
      return Array.isArray((td as Record<string, unknown>)?.tasks) ? (td as Record<string, unknown>).tasks as unknown[] : Array.isArray(td) ? td : (Array.isArray((td as Record<string, unknown>)?.data) ? (td as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── React Query: Websites with caching ──
  const { data: websitesData = [] } = useQuery({
    queryKey: ["project-websites", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/websites`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return [];
      const raw = deepSanitize(await res.json());
      return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
    },
    enabled: !!projectId && isAdminUser,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const project = projectData;
  const tasks = tasksData;
  const members = membersData;
  const teamUsers = teamUsersData;
  const websites = websitesData;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-websites", projectId] });
  };

  // ── Website CRUD handlers ──
  const handleAddWebsite = async () => {
    if (!newWebsiteUrl.trim()) { toast.error("URL is required"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: newWebsiteUrl.trim(),
          label: newWebsiteLabel.trim() || "Production",
          isPrimary: websites.length === 0,
        }),
      });
      if (res.ok) { toast.success("Website added"); setNewWebsiteUrl(""); setNewWebsiteLabel(""); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add website"); }
    } catch { toast.error("Failed to add website"); }
  };

  const handleUpdateWebsite = async (websiteId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, ...updates }),
      });
      if (res.ok) { toast.success("Website updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update website"); }
    } catch { toast.error("Failed to update website"); }
  };

  const handleDeleteWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites?id=${websiteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) { toast.success("Website removed"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to delete website"); }
    } catch { toast.error("Failed to delete website"); }
  };

  const handleSetPrimaryWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, isPrimary: true }),
      });
      if (res.ok) { toast.success("Primary website set"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to set primary"); }
    } catch { toast.error("Failed to set primary"); }
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

  // Fix: Include tasksLoading and membersLoading to prevent layout shift
  const isLoading = sessionStatus === "loading" || projectLoading || tasksLoading || membersLoading;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <ListTodo className="h-7 w-7 text-muted-foreground/40" />
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
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <ListTodo className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  const progressColorClass = projectProgress < 30 ? "text-red-600 dark:text-red-400" : projectProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-5" style={{ animation: "fade-in 0.35s ease-out both" }}>
      {/* ═══════ Compact Header ═══════ */}
      <div className="flex items-start gap-3" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "50ms" }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/projects")}
          aria-label="Back to projects"
          className="mt-0.5 h-8 w-8 rounded-lg hover:bg-muted/80 hover:scale-105 transition-all duration-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{safeText(projectName, "Untitled")}</h1>
            {isAdminUser ? (
              <select
                className="h-6 text-[10px] border rounded-full px-2.5 bg-background/80 font-semibold focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer appearance-none pr-5"
                value={safeText(projectStatus, "PLANNING")}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={`${projectStatusColors[safeText(projectStatus, "")] || ""} text-[10px] font-semibold px-2 py-0`}>
                {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
              </Badge>
            )}
          </div>
          {projectDesc && (
            <p className="text-muted-foreground/70 text-sm mt-1 leading-relaxed line-clamp-2 max-w-2xl">{safeText(projectDesc)}</p>
          )}
        </div>
      </div>

      {/* ═══════ Compact Stats Row (glassmorphism pills) ═══════ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Progress pill — draggable for admins */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
          <Gauge className={cn("h-3.5 w-3.5", progressColorClass)} />
          {(() => {
            const displayProgress = dragProgress !== null ? dragProgress : safeNumber(projectProgress);
            const fillColor = displayProgress < 30 ? "bg-red-500" : displayProgress < 70 ? "bg-amber-500" : "bg-emerald-500";
            const handleShadow = displayProgress < 30 ? "shadow-red-500/30" : displayProgress < 70 ? "shadow-amber-500/30" : "shadow-emerald-500/30";
            const cursorClass = isAdminUser ? "cursor-pointer" : "cursor-default";
            return (
              <div className="flex items-center gap-1.5">
                <div
                  ref={progressTrackRef}
                  className={cn("relative h-2 w-24 rounded-full bg-black/10 dark:bg-white/10 select-none", cursorClass)}
                  onMouseDown={isAdminUser ? (e) => {
                    e.preventDefault();
                    const getVal = (ev: MouseEvent | React.MouseEvent) => {
                      if (!progressTrackRef.current) return 0;
                      const rect = progressTrackRef.current.getBoundingClientRect();
                      const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
                      return Math.round((x / rect.width) * 100);
                    };
                    const val = getVal(e);
                    dragValueRef.current = val;
                    setDragProgress(val);
                    const handleMove = (ev: MouseEvent) => {
                      const v = getVal(ev);
                      dragValueRef.current = v;
                      setDragProgress(v);
                    };
                    const handleUp = () => {
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                      const finalVal = dragValueRef.current;
                      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
                      progressTimerRef.current = setTimeout(() => {
                        handleUpdateProject({ progress: finalVal });
                      }, 500);
                      setDragProgress(null);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  } : undefined}
                >
                  <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-75", fillColor, handleShadow)} style={{ width: `${displayProgress}%` }} />
                  {isAdminUser && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white dark:border-gray-800 shadow-md transition-[left] duration-75 pointer-events-none"
                      style={{ left: `calc(${displayProgress}% - 6px)`, backgroundColor: displayProgress < 30 ? "#ef4444" : displayProgress < 70 ? "#f59e0b" : "#10b981" }}
                    />
                  )}
                </div>
                {isAdminUser ? (
                  <span className={cn("text-[11px] font-bold tabular-nums w-7 text-right", progressColorClass)}>{displayProgress}%</span>
                ) : (
                  <span className={cn("text-[11px] font-bold tabular-nums", progressColorClass)}>{displayProgress}%</span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Budget pill (admin only) */}
        {isAdminUser && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">₹</span>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {String(projectBudget || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            </span>
          </div>
        )}

        {/* Deadline pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {projectDeadline ? safeDate(projectDeadline, "No deadline") : "No deadline"}
          </span>
        </div>

        {/* Team Size pill (non-admin) */}
        {!isAdminUser && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{String(members.length)} members</span>
          </div>
        )}

        {/* My Tasks link (replaces the tab) */}
        <button
          type="button"
          onClick={() => router.push(`/dashboard/projects/${projectId}/todos`)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <ClipboardCheck className="h-3 w-3" />
          My Tasks
          <ChevronRight className="h-3 w-3" />
        </button>

        {/* Live button / Add Live URL (admin) */}
        {(() => {
          const projectWebsites = (project?.websites as Record<string, unknown>[] | undefined) || [];
          const mergedWebsites = isAdminUser && websites.length > 0 ? websites : projectWebsites;
          if (mergedWebsites.length === 1) {
            const wUrl = extractStr(mergedWebsites[0], "url", "");
            const wLabel = extractStr(mergedWebsites[0], "label", "");
            return (
              <>
                <a
                  href={wUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  {wLabel || "Live"}
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                    className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Manage websites"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
              </>
            );
          }
          if (mergedWebsites.length > 1) {
            const primary = mergedWebsites.find((w) => extractStr(w, "isPrimary", "") === "true" || w.isPrimary === true) || mergedWebsites[0];
            const pUrl = extractStr(primary, "url", "");
            const pLabel = extractStr(primary, "label", "");
            return (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      {pLabel || "Live"}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {mergedWebsites.map((w, i) => {
                      const wUrl = extractStr(w, "url", "");
                      const wLabel = extractStr(w, "label", "");
                      const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
                      return (
                        <DropdownMenuItem key={extractStr(w, "id", String(i))} asChild>
                          <a href={wUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{wLabel || `Site ${i + 1}`}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                            </div>
                            {wIsPrimary && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                          </a>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                {isAdminUser && (
                  <button
                    type="button"
                    onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                    className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Manage websites"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
              </>
            );
          }
          // 0 websites
          if (isAdminUser) {
            return (
              <button
                type="button"
                onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border border-dashed border-muted-foreground/30 transition-colors"
              >
                <Globe className="h-3 w-3" />
                Add Live URL
              </button>
            );
          }
          return null;
        })()}
      </div>

      {/* ═══════ Compact Team Members ═══════ */}
      {membersLoading ? (
        <div className="flex items-center gap-2" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {members.length === 0 && !isAdminUser && (
            <span className="text-xs text-muted-foreground/60 italic">No team members</span>
          )}
          {members.map((member) => {
            const mId = extractStr(member, "id", "");
            const mUserId = extractStr(member, "userId", "");
            const mRole = extractStr(member, "role", "");
            const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
            const initials = mUserName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
            const avatarColor = mRole === "LEAD" ? "from-amber-400 to-orange-500" : "from-slate-500 to-slate-600 dark:from-slate-400 dark:to-slate-500";
            return (
              <div
                key={mId}
                className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm hover:shadow-md transition-all group/member shrink-0"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn("text-[9px] font-bold text-white bg-gradient-to-br", avatarColor)}>{initials || "?"}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-medium text-foreground/80 max-w-[80px] truncate">{mUserName}</span>
                {isAdminUser && mUserId !== userId && (
                  <button
                    type="button"
                    className="h-4 w-4 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover/member:opacity-100 transition-all ml-0.5"
                    onClick={() => setRemoveMemberUserId(mUserId)}
                    aria-label={`Remove ${mUserName}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
          {isAdminUser && (
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full shrink-0 shadow-sm hover:shadow-md transition-all"
                  aria-label="Add member"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold">Add Team Member</DialogTitle>
                  <DialogDescription className="text-xs">Assign a team member to this project.</DialogDescription>
                </DialogHeader>
                {availableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    All team members are already assigned to this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-72">
                    <div className="space-y-1.5">
                      {availableUsers.map((user) => {
                        const uName = extractStr(user, "name", "Unknown");
                        const uRole = extractStr(user, "role", "");
                        const uDept = extractStr(user, "department", "");
                        const uId = extractStr(user, "id", "");
                        const initials = uName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                        return (
                          <div key={uId} className="flex items-center justify-between p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7 ring-1 ring-muted">
                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/20 to-primary/5">{initials || "?"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium">{uName}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {safeText(uRole)}{uDept ? ` · ${safeText(uDept)}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => handleAddMember(uId, "MEMBER")}>Member</Button>
                              <Button size="sm" className="h-7 text-[10px] px-2" onClick={() => handleAddMember(uId, "LEAD")}>Lead</Button>
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
      )}

      {/* ═══════ Task Board — Header + Add Task ═══════ */}
      <div className="flex items-center justify-between" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "200ms" }}>
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold tracking-tight">Task Board</h2>
          <Badge variant="secondary" className="text-[10px] font-semibold h-5 px-1.5">{String(tasks.length)}</Badge>
        </div>
        {(isAdminUser || members.length > 0) && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 h-7 text-xs px-3 shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
              <DialogHeader>
                <DialogTitle className="text-base font-bold">Add Task</DialogTitle>
                <DialogDescription className="text-xs">Create a new task for this project.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddTask} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title *</Label>
                  <Input name="title" required className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea name="description" rows={2} className="text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <select name="priority" defaultValue="MEDIUM" className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Assign To</Label>
                    <select name="assigneeType" defaultValue="HUMAN" className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full">
                      <option value="HUMAN">Team Member</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Assignee</Label>
                  <select name="assignedTo" className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full">
                    <option value="">Unassigned</option>
                    {members.map((m) => {
                      const mUserId = extractStr(m, "userId", "");
                      const mUserName = extractNestedStr(m, ["user", "name"], "Unknown");
                      return <option key={mUserId} value={mUserId}>{mUserName}</option>;
                    })}
                  </select>
                </div>
                <Button type="submit" className="w-full h-8 text-xs">Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ═══════ Website Management Dialog (admin only) ═══════ */}
      {isAdminUser && (
        <Dialog open={websiteMgmtOpen} onOpenChange={(open) => { setWebsiteMgmtOpen(open); if (!open) { setNewWebsiteUrl(""); setNewWebsiteLabel(""); setEditingWebsiteId(null); } }}>
          <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-500" /> Manage Live URLs
              </DialogTitle>
              <DialogDescription className="text-xs">Add, edit, or remove website URLs for this project.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Add new website form */}
              {editingWebsiteId ? null : (
                <div className="space-y-2 p-3 rounded-lg border border-dashed border-emerald-300/50 dark:border-emerald-700/30 bg-emerald-50/30 dark:bg-emerald-900/10">
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Add New Website</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        placeholder="https://example.com"
                        value={newWebsiteUrl}
                        onChange={(e) => setNewWebsiteUrl(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={handleAddWebsite}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Label (e.g. Production, Staging)"
                      value={newWebsiteLabel}
                      onChange={(e) => setNewWebsiteLabel(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Existing websites list */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Websites ({websites.length})</p>
                <div className="max-h-52 overflow-y-auto space-y-1.5">
                  {websites.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic py-3 text-center">No websites added yet.</p>
                  )}
                  {websites.map((w, i) => {
                    const wId = extractStr(w, "id", String(i));
                    const wUrl = extractStr(w, "url", "");
                    const wLabel = extractStr(w, "label", "");
                    const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
                    return (
                      <div key={wId} className="flex items-center gap-2 p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] group/ws">
                        <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate flex items-center gap-1.5">
                            {wLabel || `Site ${i + 1}`}
                            {wIsPrimary && <Star className="h-3 w-3 text-amber-500 inline" />}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {!wIsPrimary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryWebsite(wId)}
                              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 opacity-0 group-hover/ws:opacity-100 transition-all"
                              title="Set as primary"
                            >
                              <Star className="h-3 w-3" />
                            </button>
                          )}
                          <a
                            href={wUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 opacity-0 group-hover/ws:opacity-100 transition-all"
                            title="Open URL"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setDeleteWebsiteId(wId)}
                            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover/ws:opacity-100 transition-all"
                            title="Delete website"
                          >
                            <Trash2Icon className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ═══════ Task Detail Dialog (glassmorphism) ═══════ */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="sm:max-w-lg bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
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
                <DialogHeader className="pb-0">
                  <div className="flex items-start justify-between pr-6">
                    <DialogTitle className="text-base font-bold leading-snug">{safeText(dtTitle, "Untitled")}</DialogTitle>
                    <Badge className={`shrink-0 font-semibold text-[10px] ${priorityColors[dtPriority] || ""}`}>
                      {safeText(dtPriority, "MEDIUM")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className={`${taskStatusColors[dtStatus] || ""} text-[10px] font-medium px-1.5 py-0`}>{safeText(dtStatus, "TODO").replace("_", " ")}</Badge>
                    <DialogDescription className="text-[10px] text-muted-foreground">
                      Created {dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}
                    </DialogDescription>
                  </div>
                </DialogHeader>

                <div className="space-y-3.5 mt-1">
                  {/* Assignee & Deadline Meta */}
                  <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/30 border border-white/10">
                    {dtAssigneeType === "AI" ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Bot className="h-3 w-3" /> System</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><User className="h-3 w-3" /> {extractStr(selectedTask, "assignedToName", "") || safeText(dtAssignedTo) || "Unassigned"}</span>
                    )}
                    {dtDeadline && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="h-3 w-3" /> {safeDate(dtDeadline, "")}</span>
                    )}
                  </div>

                  {/* Approval Info */}
                  {isDone && dtApprovedBy && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200/80 dark:border-green-900/30">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                      <div className="text-[11px]">
                        <p className="font-semibold text-green-700 dark:text-green-300">Approved</p>
                        <p className="text-green-600/70 dark:text-green-400/70 mt-0.5">
                          by {extractStr(selectedTask, "approvedByName", "") || safeText(dtApprovedBy)} {dtApprovedAt ? `· ${safeDate(dtApprovedAt, "")}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                  {isAwaitingApproval && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200/80 dark:border-orange-900/30">
                      <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                      <p className="text-[11px] text-orange-700 dark:text-orange-300 font-medium">
                        Pending approval from admin/superadmin
                      </p>
                    </div>
                  )}

                  {/* Description */}
                  {dtDesc ? (
                    <div className="text-[12px] leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border border-white/10">
                      {safeText(dtDesc)}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic pl-1">No description provided.</p>
                  )}

                  {/* Timestamps */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Timeline</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-md bg-muted/30 p-2 border border-white/10">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Created</p>
                        <p className="text-[11px] font-medium mt-0.5">{dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}</p>
                      </div>
                      <div className="rounded-md bg-muted/30 p-2 border border-white/10">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Updated</p>
                        <p className="text-[11px] font-medium mt-0.5">{dtUpdatedAt ? safeDate(dtUpdatedAt, "N/A") : "N/A"}</p>
                      </div>
                      {dtCompletedAt && (
                        <div className="rounded-md bg-green-50/50 dark:bg-green-900/10 p-2 border border-green-200/50 dark:border-green-900/20">
                          <p className="text-[9px] text-green-600 dark:text-green-400 uppercase tracking-wider font-medium">Completed</p>
                          <p className="text-[11px] font-medium mt-0.5">{safeDate(dtCompletedAt, "N/A")}</p>
                        </div>
                      )}
                      {dtApprovedAt && (
                        <div className="rounded-md bg-green-50/50 dark:bg-green-900/10 p-2 border border-green-200/50 dark:border-green-900/20">
                          <p className="text-[9px] text-green-600 dark:text-green-400 uppercase tracking-wider font-medium">Approved</p>
                          <p className="text-[11px] font-medium mt-0.5">{safeDate(dtApprovedAt, "N/A")}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Approve / Reject Actions (for admin/superadmin) */}
                  {canApprove && (
                    <div className="flex gap-2 p-2.5 rounded-lg border-2 border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white shadow-sm"
                        onClick={() => {
                          handleMoveTask(dtId, "DONE");
                          setTaskDetailOpen(false);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[11px] border-orange-200 dark:border-orange-900/40 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                        onClick={() => {
                          handleMoveTask(dtId, "REVIEW");
                          setTaskDetailOpen(false);
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Send Back
                      </Button>
                    </div>
                  )}

                  {/* Move Task (hide Done when awaiting approval — use Approve instead) */}
                  {!isAwaitingApproval && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Move to</p>
                      <div className="flex flex-wrap gap-1.5">
                        {TASK_COLUMNS.filter((s) => String(s) !== dtStatus).map((s) => (
                          <Button
                            key={String(s)}
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              handleMoveTask(dtId, String(s));
                              setTaskDetailOpen(false);
                            }}
                          >
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            {String(s).replace("_", " ")}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete — with confirmation (audit fix) */}
                  <div className="flex justify-end pt-1 border-t border-white/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => { setDeleteTaskId(dtId); setTaskDetailOpen(false); }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Delete Task
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══════ Delete Task Confirmation (audit fix) ═══════ */}
      {deleteTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Delete Task?</h3>
              <p className="text-xs text-muted-foreground mt-1">This action cannot be undone. The task will be permanently deleted.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteTaskId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleDeleteTask(deleteTaskId);
                  setDeleteTaskId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Task Columns — Responsive Grid Layout ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2" style={{ animation: "fade-in 0.5s ease-out both", animationDelay: "280ms" }}>
        {TASK_COLUMNS.map((status, colIdx) => {
          const statusStr = String(status);
          const columnTasks = (tasks as Record<string, unknown>[]).filter(
            (t) => extractStr(t, "status", "") === statusStr
          );
          const accentColor = taskStatusAccentColors[statusStr] || "bg-gray-400";
          const textColor = taskStatusTextColors[statusStr] || "text-gray-500";

          return (
            <div key={statusStr} className="flex flex-col min-w-0" style={{ animation: "card-enter 0.45s ease-out both", animationDelay: `${300 + colIdx * 60}ms` }}>
              {/* Column Header */}
              <div className={cn(
                "rounded-t-xl px-3 py-2 flex items-center gap-1.5 relative overflow-hidden",
                taskStatusColors[statusStr] || "",
                "border border-b-0 border-gray-200/60 dark:border-gray-700/40"
              )}>
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accentColor)} />
                <CircleDot className={cn("h-3 w-3", textColor)} />
                <h3 className="font-bold text-[11px] tracking-tight flex-1 truncate">{statusStr.replace("_", " ")}</h3>
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{String(columnTasks.length)}</span>
              </div>
              {/* Column Card List — independently scrollable */}
              <div className="flex-1 space-y-1.5 p-1.5 bg-muted/20 rounded-b-xl border border-t-0 border-gray-200/60 dark:border-gray-700/40 min-h-[140px] max-h-[calc(100vh-280px)] overflow-y-auto">
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
                        "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-[3px] group",
                        borderL,
                        "bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10"
                      )}
                      onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
                    >
                      <CardContent className="p-2.5 space-y-2">
                        {/* Title + Priority dot */}
                        <div className="flex items-start gap-1.5">
                          <div className={cn("h-2 w-2 rounded-full mt-1 shrink-0", accentColor)} />
                          <p className="text-[11px] font-semibold leading-tight line-clamp-2 flex-1">{safeText(tTitle, "Untitled")}</p>
                        </div>

                        {/* Assignee + Deadline row */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                            {tAssigneeType === "AI" ? (
                              <Bot className="h-2.5 w-2.5 shrink-0" />
                            ) : (
                              <User className="h-2.5 w-2.5 shrink-0" />
                            )}
                            <span className="truncate max-w-[72px]">{safeText(tAssignedName)}</span>
                          </div>
                          {tDeadline && (
                            <span className="text-[9px] text-muted-foreground/70 flex items-center gap-0.5 shrink-0">
                              <Clock className="h-2.5 w-2.5" />
                              {safeDate(tDeadline, "")}
                            </span>
                          )}
                        </div>

                        {/* Approved by badge on DONE tasks */}
                        {statusStr === "DONE" && tApprovedBy && (
                          <div className="flex items-center gap-1 text-[9px] text-green-600 dark:text-green-400 font-medium">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            <span>by {extractStr(task, "approvedByName", "") || safeText(tApprovedBy)}</span>
                          </div>
                        )}

                        {/* Action buttons — compact, shown on hover */}
                        <div className="flex gap-0.5 flex-wrap opacity-60 group-hover:opacity-100 transition-opacity">
                          {/* AWAITING_APPROVAL: show Approve/Reject for admins, or a waiting indicator */}
                          {isThisAwaiting ? (
                            canApproveThis ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[9px] px-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "DONE"); }}
                                >
                                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[9px] px-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "REVIEW"); }}
                                >
                                  <X className="h-2.5 w-2.5 mr-0.5" /> Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-[9px] text-orange-500 flex items-center gap-0.5 px-1 font-medium">
                                <Clock className="h-2.5 w-2.5" /> Awaiting approval
                              </span>
                            )
                          ) : (
                            /* Normal columns: show move buttons */
                            TASK_COLUMNS.filter((s) => String(s) !== statusStr).map((s) => (
                              <Button
                                key={String(s)}
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[9px] px-1.5"
                                onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, String(s)); }}
                              >
                                {String(s).replace("_", " ").slice(0, 3)}
                              </Button>
                            ))
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-red-400 hover:text-red-500 px-1.5 ml-auto"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(tId); }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
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
      <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/70">
        <span>{String(tasks.length)} tasks across {String(TASK_COLUMNS.length)} columns</span>
        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span>{String(tasks.filter((t: unknown) => extractStr(t, "status", "") === "DONE").length)} completed</span>
            <Progress value={Math.round((tasks.filter((t: unknown) => extractStr(t, "status", "") === "DONE").length / tasks.length) * 100)} className="h-1 w-20 [&>div]:bg-emerald-500" />
          </div>
        )}
      </div>

      {/* ═══════ Remove Member Confirmation ═══════ */}
      {removeMemberUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Remove Team Member</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to remove this member from the project? They will lose access to all project tasks and data.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRemoveMemberUserId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleRemoveMember(removeMemberUserId);
                  setRemoveMemberUserId(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Delete Website Confirmation ═══════ */}
      {deleteWebsiteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Delete Website</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to delete this website URL? This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteWebsiteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleDeleteWebsite(deleteWebsiteId);
                  setDeleteWebsiteId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
