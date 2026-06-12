"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Kanban, Plus, Search, Filter, Loader2, Calendar, Bot, User, Clock,
  ShieldCheck, ArrowRight, MessageSquare, Phone, ArrowUpCircle, UserPlus,
  Building2, Trash2, Pencil, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn, safeText, safeDate, deepSanitize, extractStr } from "@/lib/utils";

// ── Types ──
interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
}

// ── Status constants (match project board exactly) ──
const TASK_COLUMNS = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"] as const;

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

const priorityBorderColors: Record<string, string> = {
  LOW: "border-l-gray-300 dark:border-l-gray-600",
  MEDIUM: "border-l-blue-400 dark:border-l-blue-500",
  HIGH: "border-l-orange-400 dark:border-l-orange-500",
  URGENT: "border-l-red-400 dark:border-l-red-500",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

// ── Category config ──
const CATEGORY_COLORS: Record<string, string> = {
  MEETING: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  FOLLOW_UP: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  UPGRADE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  CUSTOMER: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  INTERNAL: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  MEETING: <MessageSquare className="h-2.5 w-2.5" />,
  FOLLOW_UP: <Phone className="h-2.5 w-2.5" />,
  UPGRADE: <ArrowUpCircle className="h-2.5 w-2.5" />,
  CUSTOMER: <UserPlus className="h-2.5 w-2.5" />,
  INTERNAL: <Building2 className="h-2.5 w-2.5" />,
};

// ── Helpers ──
function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ═══════════════════════════════════════════════════════════════
// Global Task Board Page
// ═══════════════════════════════════════════════════════════════
export default function GlobalTaskBoardPage() {
  const { data: session, status: sessionStatus } = useSession();

  // ── State ──
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Record<string, unknown> | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // ── Derived ──
  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // ── Project name lookup map ──
  const projectNameMap = new Map<string, string>(
    (projects as Record<string, unknown>[]).map((p) => [
      extractStr(p, "id", ""),
      extractStr(p, "name", "Unknown"),
    ])
  );

  // ── User name lookup map ──
  const userNameMap = new Map<string, string>(users.map((u) => [u.id, u.name]));

  // ── Fetch tasks ──
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", "100");

      // Developers only see their own assigned/created tasks (enforced server-side by RBAC)
      // No forced assignedTo filter needed — the API restricts visibility automatically

      // Apply filters
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
      if (projectFilter !== "ALL") params.set("projectId", projectFilter);

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const raw = deepSanitize(await res.json());
      const list = Array.isArray((raw as Record<string, unknown>)?.tasks)
        ? (raw as Record<string, unknown>).tasks as unknown[]
        : Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.data)
            ? (raw as Record<string, unknown>).data as unknown[]
            : [];
      setTasks(list as Record<string, unknown>[]);
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [isAdminUser, statusFilter, priorityFilter, projectFilter]);

  // ── Fetch projects (for filter dropdown) ──
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) return;
      const raw = deepSanitize(await res.json());
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.data)
          ? (raw as Record<string, unknown>).data as unknown[]
          : [];
      setProjects(list as Record<string, unknown>[]);
    } catch {
      // Silent fail for projects
    }
  }, []);

  // ── Fetch users (for assignee dropdown) ──
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) return;
      const raw = deepSanitize(await res.json());
      const list = Array.isArray(raw) ? raw : [];
      setUsers(list as TeamUser[]);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    fetchTasks();
    // All users need project list for filtering; only admins need user list
    fetchProjects();
    if (isAdminUser) {
      fetchUsers();
    }
  }, [sessionStatus, fetchTasks, fetchProjects, fetchUsers, isAdminUser]);

  // ── Client-side search filter ──
  const filteredTasks = search.trim()
    ? tasks.filter((t) =>
        extractStr(t, "title", "").toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  // ── Move task handler ──
  const handleMoveTask = async (taskId: string, newStatus: string) => {
    setMovingTaskId(taskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Task moved to ${newStatus.replace("_", " ")}`);
        fetchTasks();
      } else {
        if (res.status === 401) { window.location.href = "/login"; return; }
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to move task");
      }
    } catch {
      toast.error("Failed to move task");
    } finally {
      setMovingTaskId(null);
    }
  };

  // ── Create task handler ──
  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      title: String(form.get("title") || ""),
      description: String(form.get("description") || "") || undefined,
      priority: String(form.get("priority") || "MEDIUM"),
      category: String(form.get("category") || "GENERAL"),
      projectId: String(form.get("projectId") || "") || undefined,
      assignedTo: String(form.get("assignedTo") || "") || undefined,
      deadline: String(form.get("deadline") || "") || undefined,
    };
    if (!data.title) { toast.error("Title is required"); return; }
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Task created");
        setAddOpen(false);
        fetchTasks();
      } else {
        if (res.status === 401) { window.location.href = "/login"; return; }
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to create task");
      }
    } catch {
      toast.error("Failed to create task");
    }
  };

  // ── Edit task handlers ──
  const openEditDialog = (task: Record<string, unknown>) => {
    setEditForm({
      id: extractStr(task, "id", ""),
      title: extractStr(task, "title", ""),
      description: extractStr(task, "description", ""),
      priority: extractStr(task, "priority", "MEDIUM"),
      category: extractStr(task, "category", "GENERAL"),
      assignedTo: extractStr(task, "assignedTo", ""),
      projectId: extractStr(task, "projectId", ""),
      deadline: extractStr(task, "deadline", "") ? extractStr(task, "deadline", "").split("T")[0] : "",
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm.id) return;
    setEditSaving(true);
    const data: Record<string, unknown> = {
      id: editForm.id,
      title: editForm.title,
      description: editForm.description || undefined,
      priority: editForm.priority,
      category: editForm.category,
      assignedTo: editForm.assignedTo || undefined,
      projectId: editForm.projectId || undefined,
      deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : null,
    };
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Task updated");
        setEditOpen(false);
        setTaskDetailOpen(false);
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update task");
      }
    } catch {
      toast.error("Failed to update task");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete task handler ──
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) return;
    setDeletingTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Task deleted");
        setTaskDetailOpen(false);
        setSelectedTask(null);
        fetchTasks();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setDeletingTaskId(null);
    }
  };

  // ── Loading ──
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-muted/50 animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-52 bg-muted/50 rounded-lg animate-pulse" />
            <div className="h-3.5 w-80 bg-muted/40 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-64 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-muted/40 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-muted/40 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-72 bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ animation: "fade-in 0.35s ease-out both" }}>
      {/* ═══════ Page Header ═══════ */}
      <div
        className="flex items-center justify-between flex-wrap gap-3"
        style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "50ms" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/15 to-blue-500/10 flex items-center justify-center">
            <Kanban className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              Global Task Board
              <Badge variant="secondary" className="text-[10px] font-bold h-5 px-1.5">
                {String(filteredTasks.length)}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground/70">
              {isAdminUser
                ? "All tasks across every project"
                : "Your personal tasks across all projects"}
            </p>
          </div>
        </div>

        {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 h-8 text-xs px-3.5 shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
              <DialogHeader>
                <DialogTitle className="text-base font-bold">Add Task</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateTask} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Title *</label>
                  <Input name="title" required className="h-8 text-sm" placeholder="Task title..." />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Description</label>
                  <Input name="description" className="h-8 text-sm" placeholder="Optional details..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Priority</label>
                    <select
                      name="priority"
                      defaultValue="MEDIUM"
                      className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Category</label>
                    <select
                      name="category"
                      defaultValue="GENERAL"
                      className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                    >
                      <option value="GENERAL">General</option>
                      <option value="MEETING">Meeting</option>
                      <option value="FOLLOW_UP">Follow Up</option>
                      <option value="UPGRADE">Upgrade</option>
                      <option value="CUSTOMER">Customer</option>
                      <option value="INTERNAL">Internal</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Project</label>
                    <select
                      name="projectId"
                      defaultValue=""
                      className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={extractStr(p, "id", "")} value={extractStr(p, "id", "")}>
                          {safeText(extractStr(p, "name", "Unknown"))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Assigned To</label>
                    <select
                      name="assignedTo"
                      defaultValue=""
                      className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.department ? `(${u.department})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Deadline</label>
                  <Input name="deadline" type="date" className="h-8 text-sm" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">Create</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ═══════ Filter Bar ═══════ */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "120ms" }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[150px] sm:min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs pl-8 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10"
          />
        </div>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10">
            <Filter className="h-3 w-3 mr-1.5 text-muted-foreground/60" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {TASK_COLUMNS.map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>

        {/* Project filter (admin only) */}
        {isAdminUser && projects.length > 0 && (
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={extractStr(p, "id", "")} value={extractStr(p, "id", "")}>
                  {safeText(extractStr(p, "name", "Unknown"))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ═══════ Kanban Board ═══════ */}
      <div
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2"
        style={{ animation: "fade-in 0.5s ease-out both", animationDelay: "200ms" }}
      >
        {TASK_COLUMNS.map((status, colIdx) => {
          const statusStr = String(status);
          const columnTasks = filteredTasks.filter(
            (t) => extractStr(t, "status", "") === statusStr
          );
          const accentColor = taskStatusAccentColors[statusStr] || "bg-gray-400";
          const textColor = taskStatusTextColors[statusStr] || "text-gray-500";

          return (
            <div
              key={statusStr}
              className="flex flex-col min-w-0"
              style={{
                animation: "card-enter 0.45s ease-out both",
                animationDelay: `${220 + colIdx * 60}ms`,
              }}
            >
              {/* Column Header */}
              <div
                className={cn(
                  "rounded-t-xl px-3 py-2 flex items-center gap-1.5 relative overflow-hidden",
                  taskStatusColors[statusStr] || "",
                  "border border-b-0 border-gray-200/60 dark:border-gray-700/40"
                )}
              >
                <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accentColor)} />
                <div className={cn("h-2.5 w-2.5 rounded-full", accentColor)} />
                <h3 className="font-bold text-[11px] tracking-tight flex-1 truncate">{statusStr.replace("_", " ")}</h3>
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  {String(columnTasks.length)}
                </span>
              </div>

              {/* Column Card List */}
              <div className="flex-1 space-y-1.5 p-1.5 bg-muted/20 rounded-b-xl border border-t-0 border-gray-200/60 dark:border-gray-700/40 min-h-[140px] max-h-[calc(100vh-300px)] overflow-y-auto">
                {columnTasks.length === 0 && (
                  <div className="flex items-center justify-center py-8 text-[10px] text-muted-foreground/50">
                    No tasks
                  </div>
                )}

                {columnTasks.map((task) => {
                  const tId = extractStr(task, "id", "");
                  const tTitle = extractStr(task, "title", "Untitled");
                  const tPriority = extractStr(task, "priority", "MEDIUM");
                  const tAssigneeType = extractStr(task, "assigneeType", "HUMAN");
                  const tDeadline = extractStr(task, "deadline", "");
                  const tAssignedToName = extractStr(task, "assignedToName", "");
                  const tAssignedTo = extractStr(task, "assignedTo", "");
                  const tCategory = extractStr(task, "category", "GENERAL");
                  const tProjectId = extractStr(task, "projectId", "");
                  const tApprovedBy = extractStr(task, "approvedBy", "");
                  const tLarkTaskId = extractStr(task, "larkTaskId", "");

                  const tAssignedName = tAssignedToName
                    || (tAssignedTo ? tAssignedTo.slice(0, 8) + "..." : "Unassigned");

                  const isAwaiting = statusStr === "AWAITING_APPROVAL";
                  const canApprove = isAdminUser && isAwaiting;
                  const isMoving = movingTaskId === tId;
                  const borderL = priorityBorderColors[tPriority] || "border-l-gray-300 dark:border-l-gray-600";

                  return (
                    <Card
                      key={tId}
                      className={cn(
                        "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-[3px] group",
                        borderL,
                        "bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border-white/20 dark:border-white/10"
                      )}
                      onClick={() => {
                        setSelectedTask(task);
                        setTaskDetailOpen(true);
                      }}
                    >
                      <CardContent className="p-2.5 space-y-2">
                        {/* Title + Lark indicator */}
                        <div className="flex items-start gap-1.5">
                          <div className={cn("h-2 w-2 rounded-full mt-1 shrink-0", accentColor)} />
                          <p className="text-[11px] font-semibold leading-tight line-clamp-2 flex-1">
                            {safeText(tTitle, "Untitled")}
                          </p>
                          {/* Lark sync indicator */}
                          {tLarkTaskId && (
                            <span
                              className="shrink-0 h-4 w-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[8px] font-bold"
                              title="Synced with Lark"
                            >
                              L
                            </span>
                          )}
                        </div>

                        {/* Category badge */}
                        {tCategory && tCategory !== "GENERAL" && CATEGORY_COLORS[tCategory] && (
                          <div className="flex items-center gap-1">
                            <Badge
                              className={cn(
                                "text-[9px] font-medium gap-0.5 h-4 px-1.5",
                                CATEGORY_COLORS[tCategory]
                              )}
                            >
                              {CATEGORY_ICONS[tCategory]}
                              {tCategory.replace("_", " ")}
                            </Badge>
                          </div>
                        )}

                        {/* Assignee + Deadline row (assignee hidden for non-admin: they only see their own tasks) */}
                        <div className="flex items-center justify-between gap-1">
                          {isAdminUser && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0">
                              {tAssigneeType === "AI" ? (
                                <Bot className="h-2.5 w-2.5 shrink-0" />
                              ) : (
                                <User className="h-2.5 w-2.5 shrink-0" />
                              )}
                              <span className="truncate max-w-[72px]">{safeText(tAssignedName)}</span>
                            </div>
                          )}
                          {tDeadline && (
                            <span className="text-[9px] text-muted-foreground/70 flex items-center gap-0.5 shrink-0">
                              <Calendar className="h-2.5 w-2.5" />
                              {safeDate(tDeadline, "")}
                            </span>
                          )}
                        </div>

                        {/* Project name (if multi-project context) */}
                        {tProjectId && (
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 truncate">
                            <ArrowRight className="h-2 w-2 shrink-0" />
                            <span className="truncate">{projectNameMap.get(tProjectId) || "Unknown"}</span>
                          </div>
                        )}

                        {/* Approved by badge on DONE */}
                        {statusStr === "DONE" && tApprovedBy && (
                          <div className="flex items-center gap-1 text-[9px] text-green-600 dark:text-green-400 font-medium">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            <span>by {extractStr(task, "approvedByName", "") || safeText(tApprovedBy)}</span>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-0.5 flex-wrap opacity-60 group-hover:opacity-100 transition-opacity">
                          {isAwaiting ? (
                            canApprove ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[9px] px-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "DONE"); }}
                                  disabled={isMoving}
                                >
                                  {isMoving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />}
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 text-[9px] px-1.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "REVIEW"); }}
                                  disabled={isMoving}
                                >
                                  Back
                                </Button>
                              </>
                            ) : (
                              <span className="text-[9px] text-orange-500 flex items-center gap-0.5 px-1 font-medium">
                                <Clock className="h-2.5 w-2.5" /> Awaiting approval
                              </span>
                            )
                          ) : statusStr !== "DONE" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[9px] px-1.5 text-primary hover:bg-primary/10 font-semibold"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentIdx = TASK_COLUMNS.indexOf(status as typeof TASK_COLUMNS[number]);
                                if (currentIdx < TASK_COLUMNS.length - 1) {
                                  handleMoveTask(tId, TASK_COLUMNS[currentIdx + 1]);
                                }
                              }}
                              disabled={isMoving}
                            >
                              {isMoving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : (
                                <>
                                  <ArrowRight className="h-2.5 w-2.5 mr-0.5" />
                                  Next
                                </>
                              )}
                            </Button>
                          ) : null}
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

      {/* ═══════ Board Summary Footer ═══════ */}
      <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground/70">
        <span>
          {String(filteredTasks.length)} tasks across {String(TASK_COLUMNS.length)} columns
          {!isAdminUser && " (your tasks)"}
        </span>
        {filteredTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <span>{String(filteredTasks.filter((t) => extractStr(t, "status", "") === "DONE").length)} completed</span>
            <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(
                    (filteredTasks.filter((t) => extractStr(t, "status", "") === "DONE").length / filteredTasks.length) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ═══════ Task Detail Dialog ═══════ */}
      <Dialog open={taskDetailOpen} onOpenChange={setTaskDetailOpen}>
        <DialogContent className="sm:max-w-lg bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-base font-bold truncate pr-4">
                {safeText(selectedTask ? extractStr(selectedTask, "title", "Untitled") : "Task Detail")}
              </DialogTitle>
              {isAdminUser && selectedTask && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => { setTaskDetailOpen(false); openEditDialog(selectedTask); }}
                    title="Edit task"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteTask(extractStr(selectedTask, "id", ""))}
                    disabled={deletingTaskId === extractStr(selectedTask, "id", "")}
                    title="Delete task"
                  >
                    {deletingTaskId === extractStr(selectedTask, "id", "") ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          {selectedTask && (
            <ScrollArea className="max-h-[50vh] sm:max-h-[60vh]">
              <div className="space-y-4 pr-2">
                {/* Description */}
                {extractStr(selectedTask, "description", "") && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Description</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {safeText(extractStr(selectedTask, "description", ""))}
                    </p>
                  </div>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Status</p>
                    <Badge className={cn("text-[10px] font-medium", taskStatusColors[extractStr(selectedTask, "status", "")] || "")}>
                      {extractStr(selectedTask, "status", "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Priority</p>
                    <Badge className={cn("text-[10px] font-medium", priorityColors[extractStr(selectedTask, "priority", "MEDIUM")] || "")}>
                      {extractStr(selectedTask, "priority", "MEDIUM")}
                    </Badge>
                  </div>
                  {isAdminUser && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Assignee</p>
                      <div className="flex items-center gap-1.5">
                        {extractStr(selectedTask, "assigneeType", "HUMAN") === "AI" ? (
                          <Bot className="h-3.5 w-3.5 text-violet-500" />
                        ) : (
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="text-[8px] bg-gradient-to-br from-slate-500 to-slate-600 text-white">
                              {getInitials(extractStr(selectedTask, "assignedToName", "Un"))}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <span className="text-xs font-medium">
                          {safeText(extractStr(selectedTask, "assignedToName", "") || "Unassigned")}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Deadline</p>
                    <span className="text-xs flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      {extractStr(selectedTask, "deadline", "") ? safeDate(extractStr(selectedTask, "deadline", "")) : "No deadline"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Category</p>
                    {extractStr(selectedTask, "category", "GENERAL") !== "GENERAL" && CATEGORY_COLORS[extractStr(selectedTask, "category", "")] ? (
                      <Badge className={cn("text-[10px] font-medium gap-1", CATEGORY_COLORS[extractStr(selectedTask, "category", "")] || "")}>
                        {CATEGORY_ICONS[extractStr(selectedTask, "category", "")]}
                        {extractStr(selectedTask, "category", "").replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">General</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Project</p>
                    <span className="text-xs font-medium">
                      {projectNameMap.get(extractStr(selectedTask, "projectId", "")) || "No project"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Created By</p>
                    <span className="text-xs">
                      {safeText(extractStr(selectedTask, "createdByName", "") || "Unknown")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Created</p>
                    <span className="text-xs">
                      {extractStr(selectedTask, "createdAt", "") ? safeDate(extractStr(selectedTask, "createdAt", "")) : "—"}
                    </span>
                  </div>
                </div>

                {/* Lark indicator */}
                {extractStr(selectedTask, "larkTaskId", "") && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200/60 dark:border-blue-800/30">
                    <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-[9px] font-bold shrink-0">
                      L
                    </span>
                    <span className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">Synced with Lark</span>
                  </div>
                )}

                {/* Quick status change */}
                <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/40">
                  <p className="text-xs text-muted-foreground font-medium">Move to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_COLUMNS.map((s) => {
                      const currentStatus = extractStr(selectedTask, "status", "");
                      return (
                        <Button
                          key={s}
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-7 text-[10px] px-2",
                            currentStatus === s && "ring-1 ring-primary"
                          )}
                          disabled={currentStatus === s || movingTaskId === extractStr(selectedTask, "id", "")}
                          onClick={() => handleMoveTask(extractStr(selectedTask, "id", ""), s)}
                        >
                          {movingTaskId === extractStr(selectedTask, "id", "") && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                          {s.replace(/_/g, " ")}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ Edit Task Dialog ═══════ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit Task
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Title *</label>
              <Input
                value={editForm.title || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="h-8 text-sm"
                placeholder="Task title..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Description</label>
              <Input
                value={editForm.description || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                className="h-8 text-sm"
                placeholder="Optional details..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Priority</label>
                <select
                  value={editForm.priority || "MEDIUM"}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <select
                  value={editForm.category || "GENERAL"}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                >
                  <option value="GENERAL">General</option>
                  <option value="MEETING">Meeting</option>
                  <option value="FOLLOW_UP">Follow Up</option>
                  <option value="UPGRADE">Upgrade</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="INTERNAL">Internal</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Project</label>
                <select
                  value={editForm.projectId || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, projectId: e.target.value }))}
                  className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={extractStr(p, "id", "")} value={extractStr(p, "id", "")}>
                      {safeText(extractStr(p, "name", "Unknown"))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Assigned To</label>
                <select
                  value={editForm.assignedTo || ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="h-8 border rounded-md px-2.5 text-xs bg-background/80 w-full"
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.department ? `(${u.department})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Deadline</label>
              <Input
                type="date"
                value={editForm.deadline || ""}
                onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEditSave} disabled={editSaving || !editForm.title?.trim()}>
                {editSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}