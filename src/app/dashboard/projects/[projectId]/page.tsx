"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X, CalendarDays, Tag, CheckCircle2, ShieldCheck,
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
import { safeText, safeNumber, safeDate, deepSanitize } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLETPROOF v7: Complete rebuild with safeText() on EVERY rendered value.
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

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

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
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  // ── State: ALL typed as unknown[] or Record<string,unknown> for safety ──
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [members, setMembers] = useState<unknown[]>([]);
  const [teamUsers, setTeamUsers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Record<string, unknown> | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!projectId) { setLoading(false); return; }
    try {
      const [projRes, taskRes, memberRes] = await Promise.all([
        fetch(`/api/projects?projectId=${projectId}`, { credentials: "include", signal }),
        fetch(`/api/tasks?projectId=${projectId}`, { credentials: "include", signal }),
        fetch(`/api/projects/${projectId}/members`, { credentials: "include", signal }),
      ]);

      if (projRes.ok) {
        const raw = deepSanitize(await projRes.json());
        if (Array.isArray(raw) && raw.length > 0) {
          setProject(raw[0] as Record<string, unknown>);
        } else if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id) {
          setProject(raw as Record<string, unknown>);
        } else if (Array.isArray((raw as Record<string, unknown>)?.data) && ((raw as Record<string, unknown>).data as unknown[]).length > 0) {
          setProject(((raw as Record<string, unknown>).data as unknown[])[0] as Record<string, unknown>);
        }
      } else { handle401(projRes); }

      if (taskRes.ok) {
        const td = deepSanitize(await taskRes.json());
        setTasks(Array.isArray(td) ? td : (Array.isArray((td as Record<string, unknown>)?.data) ? (td as Record<string, unknown>).data as unknown[] : []));
      } else { handle401(taskRes); }

      if (memberRes.ok) {
        const md = deepSanitize(await memberRes.json());
        setMembers(Array.isArray(md) ? md : (Array.isArray((md as Record<string, unknown>)?.data) ? (md as Record<string, unknown>).data as unknown[] : []));
      } else { handle401(memberRes); }

      if (isAdminUser) {
        const userRes = await fetch("/api/team?type=users", { credentials: "include", signal });
        if (userRes.ok) {
          const ud = deepSanitize(await userRes.json());
          setTeamUsers(Array.isArray(ud) ? ud : (Array.isArray((ud as Record<string, unknown>)?.data) ? (ud as Record<string, unknown>).data as unknown[] : []));
        } else { handle401(userRes); }
      }
    } catch {
      toast.error("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [projectId, isAdminUser, handle401]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

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
      if (res.ok) { toast.success("Task created"); setAddOpen(false); fetchData(); }
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
          toast.success(`Task moved to ${finalStatus.replace("_", " ")}`);
        }
        fetchData();
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
      if (res.ok) { toast.success("Task deleted"); fetchData(); }
      else { if (handle401(res)) return; toast.error("Failed to delete task"); }
    } catch { toast.error("Failed to delete task"); }
  };

  const handleAddMember = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ userId, role }) });
      if (res.ok) { toast.success("Member added"); setAddMemberOpen(false); fetchData(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add member"); }
    } catch { toast.error("Failed to add member"); }
  };

  const handleUpdateProject = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/projects", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: projectId, ...updates }) });
      if (res.ok) { toast.success("Project updated"); fetchData(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update project"); }
    } catch { toast.error("Failed to update project"); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Member removed"); fetchData(); }
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

  // ── Loading state ──
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 w-[260px] rounded-lg shrink-0" />)}
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Invalid project ID</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{safeText(projectName, "Untitled")}</h1>
          <p className="text-muted-foreground text-sm">{safeText(projectDesc) || "No description"}</p>
        </div>
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Status */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            {isAdminUser ? (
              <select
                className="mt-1 h-7 text-xs border rounded px-2 bg-background w-full"
                value={safeText(projectStatus, "PLANNING")}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={`mt-1 ${projectStatusColors[safeText(projectStatus, "")] || ""}`}>
                {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={safeNumber(projectProgress)} className="h-2 flex-1" />
              {isAdminUser ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={safeNumber(projectProgress)}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    handleUpdateProject({ progress: val });
                  }}
                  className="h-7 w-14 text-xs text-center"
                />
              ) : (
                <span className="text-sm font-medium">{safeNumber(projectProgress)}%</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Budget (admin only) */}
        {isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-medium mt-1">
                {String(projectBudget || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Deadline */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">
              {projectDeadline ? safeDate(projectDeadline, "No deadline") : "No deadline"}
            </p>
          </CardContent>
        </Card>

        {/* Team Size (non-admin) */}
        {!isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Team Size</p>
              <p className="text-sm font-medium mt-1">{String(members.length)} members</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Project Members */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Project Team</CardTitle>
              <CardDescription>
                {String(members.length)} member{members.length !== 1 ? "s" : ""} assigned to this project
              </CardDescription>
            </div>
            {isAdminUser && (
              <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus className="h-4 w-4 mr-1" /> Add Member
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
                            <div key={uId} className="flex items-center justify-between p-3 rounded-lg border">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
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
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No team members assigned yet</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {members.map((member) => {
                const mId = extractStr(member, "id", "");
                const mUserId = extractStr(member, "userId", "");
                const mRole = extractStr(member, "role", "");
                const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                const initials = mUserName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                return (
                  <div key={mId} className="flex items-center gap-2 p-2 pr-1 rounded-lg border bg-card">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-medium">{mUserName}</p>
                      <p className="text-[10px] text-muted-foreground">{safeText(mRole)}</p>
                    </div>
                    {isAdminUser && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-500"
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

      {/* Task Board */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Task Board</h2>
        {(isAdminUser || members.length > 0) && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Task</Button>
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
                    <DialogTitle className="text-lg">{safeText(dtTitle, "Untitled")}</DialogTitle>
                    <Badge className={`shrink-0 ${priorityColors[dtPriority] || ""}`}>
                      {safeText(dtPriority, "MEDIUM")}
                    </Badge>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {safeText(dtStatus, "TODO").replace("_", " ")} · Created {dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  {/* Status & Meta */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={`${taskStatusColors[dtStatus] || ""} text-xs`}>{safeText(dtStatus, "TODO").replace("_", " ")}</Badge>
                    {dtAssigneeType === "AI" ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Bot className="h-3 w-3" /> AI Agent</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> {extractStr(selectedTask, "assignedToName", "") || safeText(dtAssignedTo) || "Unassigned"}</span>
                    )}
                    {dtDeadline && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" /> {safeDate(dtDeadline, "")}</span>
                    )}
                  </div>

                  {/* Approval Info */}
                  {isDone && dtApprovedBy && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30">
                      <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium text-green-700 dark:text-green-300">Approved</p>
                        <p className="text-green-600/70 dark:text-green-400/70">
                          Approved by {extractStr(selectedTask, "approvedByName", "") || safeText(dtApprovedBy)} {dtApprovedAt ? `· ${safeDate(dtApprovedAt, "")}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                  {isAwaitingApproval && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30">
                      <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />
                      <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                        Pending approval from admin/superadmin
                      </p>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
                    {dtDesc ? (
                      <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/50 rounded-lg p-3 border">
                        {safeText(dtDesc)}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No description provided.</p>
                    )}
                  </div>

                  {/* Timestamps */}
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium">Created</p>
                      <p>{dtCreatedAt ? safeDate(dtCreatedAt, "N/A") : "N/A"}</p>
                    </div>
                    <div>
                      <p className="font-medium">Last Updated</p>
                      <p>{dtUpdatedAt ? safeDate(dtUpdatedAt, "N/A") : "N/A"}</p>
                    </div>
                    {dtCompletedAt && (
                      <div>
                        <p className="font-medium">Completed</p>
                        <p>{safeDate(dtCompletedAt, "N/A")}</p>
                      </div>
                    )}
                    {dtApprovedAt && (
                      <div>
                        <p className="font-medium">Approved</p>
                        <p>{safeDate(dtApprovedAt, "N/A")}</p>
                      </div>
                    )}
                  </div>

                  {/* Approve / Reject Actions (for admin/superadmin) */}
                  {canApprove && (
                    <div className="flex gap-2 p-3 rounded-lg border bg-muted/30">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
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
                        className="flex-1"
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
                      <p className="text-xs font-medium text-muted-foreground mb-2">Move to</p>
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

      {/* Task Columns */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((status) => {
          const statusStr = String(status);
          const columnTasks = (tasks as Record<string, unknown>[]).filter(
            (t) => extractStr(t, "status", "") === statusStr
          );
          return (
            <div key={statusStr} className="flex flex-col min-w-[220px] w-[220px] lg:w-[260px]">
              <div className={`rounded-t-lg px-3 py-2 ${taskStatusColors[statusStr] || ""}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{statusStr.replace("_", " ")}</h3>
                  <Badge variant="secondary" className="text-xs">{String(columnTasks.length)}</Badge>
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[150px] max-h-[calc(100vh-24rem)] overflow-y-auto custom-scrollbar">
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

                  return (
                    <Card
                      key={tId}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => { setSelectedTask(task as Record<string, unknown>); setTaskDetailOpen(true); }}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium">{safeText(tTitle, "Untitled")}</p>
                          <Badge className={`text-[10px] shrink-0 ${priorityColors[tPriority] || ""}`}>
                            {safeText(tPriority, "MEDIUM")}
                          </Badge>
                        </div>
                        {tDesc && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{safeText(tDesc)}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {tAssigneeType === "AI" ? (
                              <Bot className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            <span>{safeText(tAssignedName)}</span>
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
                          <div className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
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
                                  className="h-6 text-[10px] px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "DONE"); }}
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(tId, "REVIEW"); }}
                                >
                                  <X className="h-3 w-3 mr-0.5" /> Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-[10px] text-orange-500 flex items-center gap-0.5 px-1">
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
    </div>
  );
}
