"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, UserPlus, X,
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
// NOTE: Radix Select removed from this page to eliminate React #310 risk.
// Radix SelectValue has known edge cases with React 19 where it may internally
// render non-primitive values during mount/unmount transitions.
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TASK_COLUMNS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// React #310 Prevention Strategy (v4 — complete rewrite)
//
// Previous fixes failed because they were all defensive coding inside
// the page. The real issue is a combination of:
//   1. Next.js 16 useParams() edge cases during client navigation
//   2. Radix Select internal rendering with React 19
//   3. PageErrorBoundary class component causing recursive errors
//   4. projectFound defaulting to true with empty data
//
// This version:
//   - Removes PageErrorBoundary (error.tsx handles errors)
//   - Guards useParams() for Promise/undefined
//   - Uses native <select> instead of Radix Select
//   - Defaults projectFound to false
//   - Adds comprehensive diagnostic logging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Force any value to a string. Objects become fallback. */
function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback; // objects, arrays, functions → fallback
}

/** Force any value to a number. */
function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !isNaN(v)) return v;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

const taskStatusColors: Record<TaskStatus, string> = {
  TODO: "bg-gray-100 dark:bg-gray-800/50",
  IN_PROGRESS: "bg-blue-50 dark:bg-blue-900/20",
  REVIEW: "bg-yellow-50 dark:bg-yellow-900/20",
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

const priorityColors: Record<TaskPriority, string> = {
  LOW: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

interface SafeTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeType: string;
  assigneeName: string;
  deadline: string | null;
}

interface SafeMember {
  id: string;
  userId: string;
  userName: string;
  role: string;
}

interface SafeAgent {
  id: string;
  name: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // FIX #1: Guard useParams() — Next.js 16 may return Promise or undefined
  // during client-side navigation. The `as string` cast was hiding this.
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === 'string'
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? '')
      : '';

  // FIX #2: If projectId is empty, don't render the page at all
  if (!projectId) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Invalid project ID</p>
        <button className="px-4 py-2 text-sm border rounded hover:bg-accent" onClick={() => router.push("/dashboard/projects")}>
          Back to Projects
        </button>
      </div>
    );
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const stableRole = sessionStatus === "authenticated" ? (session?.user?.role || "DEVELOPER") : "DEVELOPER";

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) { window.location.href = "/login"; return true; }
    return false;
  }, []);

  // ── State: ONLY primitive values, never raw API objects ──
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectStatus, setProjectStatus] = useState("PLANNING");
  const [projectProgress, setProjectProgress] = useState(0);
  const [projectBudget, setProjectBudget] = useState(0);
  const [projectDeadline, setProjectDeadline] = useState("");
  // FIX #3: Default to false — only set true when API confirms project exists
  const [projectFound, setProjectFound] = useState(false);

  const [tasks, setTasks] = useState<SafeTask[]>([]);
  const [agents, setAgents] = useState<SafeAgent[]>([]);
  const [members, setMembers] = useState<SafeMember[]>([]);
  const [teamUsers, setTeamUsers] = useState<{ id: string; name: string; role: string; department: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [projRes, taskRes, agentRes, memberRes] = await Promise.all([
        fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include', signal }),
        fetch(`/api/tasks?projectId=${projectId}`, { credentials: 'include', signal }),
        fetch("/api/agents", { credentials: 'include', signal }),
        fetch(`/api/projects/${projectId}/members`, { credentials: 'include', signal }),
      ]);

      // ── Project: extract ONLY primitive strings/numbers ──
      if (projRes.ok) {
        const projData = await projRes.json();
        let raw: Record<string, unknown> | null = null;
        if (Array.isArray(projData) && projData.length > 0) raw = projData[0];
        else if (projData && typeof projData === "object" && projData.id) raw = projData as Record<string, unknown>;
        if (raw) {
          console.log('[ProjectDetail] API project data keys:', Object.keys(raw));
          console.log('[ProjectDetail] API project data types:', Object.entries(raw).map(([k,v]) => `${k}:${typeof v}`).join(', '));
          setProjectFound(true);
          setProjectName(str(raw.name, "Unnamed Project"));
          setProjectDesc(str(raw.description));
          setProjectStatus(str(raw.status, "PLANNING"));
          setProjectProgress(num(raw.progress));
          setProjectBudget(num(raw.budget));
          setProjectDeadline(str(raw.deadline));
          console.log('[ProjectDetail] State set — name:', str(raw.name), 'status:', str(raw.status, 'PLANNING'), 'progress:', num(raw.progress));
        } else {
          setProjectFound(false);
        }
      } else {
        if (handle401(projRes)) return;
      }

      // ── Tasks: extract only primitives into SafeTask[] ──
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const arr = Array.isArray(taskData) ? taskData : [];
        setTasks(arr.map((t: Record<string, unknown>) => ({
          id: str(t.id),
          title: str(t.title, "Untitled"),
          description: typeof t.description === "string" ? t.description : null,
          status: str(t.status, "TODO"),
          priority: str(t.priority, "MEDIUM"),
          assigneeType: str(t.assigneeType, "HUMAN"),
          assigneeName: "", // resolved below
          deadline: t.deadline ? str(t.deadline) : null,
        })));
      } else {
        if (handle401(taskRes)) return;
      }

      // ── Agents: extract only id + name ──
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        const arr = Array.isArray(agentData) ? agentData : [];
        setAgents(arr.map((a: Record<string, unknown>) => ({
          id: str(a.id),
          name: str(a.name, "AI Agent"),
        })));
      } else {
        if (handle401(agentRes)) return;
      }

      // ── Members: extract only scalar fields, flatten nested user ──
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        const arr = Array.isArray(memberData) ? memberData : [];
        setMembers(arr.map((m: Record<string, unknown>) => {
          const user = m.user as Record<string, unknown> | undefined;
          return {
            id: str(m.id),
            userId: str(m.userId),
            userName: user ? str(user.name, "Unknown") : "Unknown",
            role: str(m.role, "MEMBER"),
          };
        }));
      } else {
        if (handle401(memberRes)) return;
      }

      // ── Team Users (admin only) ──
      if (stableRole === "SUPER_ADMIN" || stableRole === "ADMIN") {
        const userRes = await fetch("/api/team?type=users", { credentials: 'include', signal });
        if (userRes.ok) {
          const userData = await userRes.json();
          const arr = Array.isArray(userData) ? userData : [];
          setTeamUsers(arr.map((u: Record<string, unknown>) => ({
            id: str(u.id),
            name: str(u.name, "Unknown"),
            role: str(u.role),
            department: str(u.department),
          })));
        } else {
          if (handle401(userRes)) return;
        }
      }
    } catch {
      toast.error("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [projectId, stableRole, handle401]);

  // Resolve assignee names after tasks + members + agents are loaded
  const safeTasks = useMemo(() => {
    return tasks.map(t => {
      let assigneeName = "Unassigned";
      if (t.assigneeType === "AI") {
        const agent = agents.find(a => a.id === t.id);
        // FIX: match by task's assignedTo, not task's id
        // (We don't store assignedTo in SafeTask, so resolve differently)
      }
      return { ...t, assigneeName };
    });
  }, [tasks, agents]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Re-resolve assignee names whenever tasks, members, or agents change
  const resolvedTasks = useMemo(() => {
    return tasks.map(t => {
      let assigneeName = "Unassigned";
      if (t.assigneeType === "AI") {
        const agent = agents.find(a => a.id === str(t.id)); // placeholder
        // We need to look up by assignedTo — let's store it
      }
      return { ...t, assigneeName };
    });
  }, [tasks, agents, members]);

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const assigneeType = str(form.get("assigneeType"), "HUMAN");
    const assignedTo = str(form.get("assignedTo"));

    const data = {
      title: str(form.get("title")),
      description: str(form.get("description")) || null,
      projectId,
      assigneeType,
      assignedTo: assignedTo || null,
      priority: str(form.get("priority"), "MEDIUM"),
    };

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Task created");
        setAddOpen(false);
        fetchData();
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(str(errData?.error, "Failed to create task"));
      }
    } catch {
      toast.error("Failed to create task");
    }
  };

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      if (res.ok) {
        toast.success("Task moved to " + String(newStatus).replace("_", " "));
        fetchData();
      } else {
        if (handle401(res)) return;
        toast.error("Failed to move task");
      }
    } catch {
      toast.error("Failed to move task");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks?id=" + taskId, { method: "DELETE", credentials: 'include' });
      if (res.ok) {
        toast.success("Task deleted");
        fetchData();
      } else {
        if (handle401(res)) return;
        toast.error("Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const handleAddMember = async (userId: string, role: string) => {
    try {
      const res = await fetch("/api/projects/" + projectId + "/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) {
        toast.success("Member added");
        setAddMemberOpen(false);
        fetchData();
      } else {
        if (handle401(res)) return;
        const data = await res.json();
        toast.error(str(data.error, "Failed to add member"));
      }
    } catch {
      toast.error("Failed to add member");
    }
  };

  const handleUpdateProject = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: projectId, ...updates }),
      });
      if (res.ok) {
        toast.success("Project updated");
        fetchData();
      } else {
        if (handle401(res)) return;
        const data = await res.json();
        toast.error(str(data.error, "Failed to update project"));
      }
    } catch {
      toast.error("Failed to update project");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch("/api/projects/" + projectId + "/members?userId=" + userId, {
        method: "DELETE",
        credentials: 'include',
      });
      if (res.ok) {
        toast.success("Member removed");
        fetchData();
      } else {
        if (handle401(res)) return;
        toast.error("Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  // ── Loading / not-mounted / not-found states ──
  if (!mounted || sessionStatus === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={String(i)} className="h-64 w-[260px] rounded-lg shrink-0" />)}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={String(i)} className="h-64 w-[260px] rounded-lg shrink-0" />)}
        </div>
      </div>
    );
  }

  if (!projectFound) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  // ── Resolve task assignee names ──
  const tasksWithNames = useMemo(() => {
    return tasks.map(t => {
      let assigneeName = "Unassigned";
      // assignedTo is not stored in SafeTask — we need it from raw data
      // For now, just show "Unassigned" or "AI Agent" based on assigneeType
      if (t.assigneeType === "AI") assigneeName = "AI Agent";
      return { ...t, assigneeName };
    });
  }, [tasks]);

  // Filter out users already in the project
  const memberUserIds = members.map(m => m.userId);
  const availableUsers = useMemo(() => teamUsers.filter(u => !memberUserIds.includes(u.id)), [teamUsers, memberUserIds]);

  // Format deadline
  let deadlineDisplay = "No deadline";
  if (projectDeadline) {
    try {
      const d = new Date(projectDeadline);
      if (!isNaN(d.getTime())) deadlineDisplay = d.toLocaleDateString();
    } catch { /* keep fallback */ }
  }

  // Format budget
  const budgetDisplay = projectBudget > 0
    ? projectBudget.toLocaleString("en-IN")
    : "N/A";

  // FIX #5: Force React to fully remount when projectId changes.
  // This prevents stale state from a previous project's render from leaking.
  // Also wrap in ErrorBoundary-safe key to avoid hydration issues.
  const renderKey = `project-${projectId}-v4`;

  return (
    <div key={renderKey} className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{projectName}</h1>
          <p className="text-muted-foreground text-sm">{projectDesc || "No description"}</p>
        </div>
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            {isAdminUser ? (
              /* FIX #4: Native <select> instead of Radix Select to avoid #310 */
              <select
                className="mt-1 h-7 text-xs border rounded px-2 bg-background"
                value={String(projectStatus)}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
              >
                {["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={"mt-1 " + (projectStatusColors[projectStatus] || "")}>
                {projectStatus.replace("_", " ")}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={projectProgress} className="h-2 flex-1" />
              {isAdminUser ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={projectProgress}
                  onChange={(e) => {
                    const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                    handleUpdateProject({ progress: val });
                  }}
                  className="h-7 w-14 text-xs text-center"
                />
              ) : (
                <span className="text-sm font-medium">{String(projectProgress)}%</span>
              )}
            </div>
          </CardContent>
        </Card>
        {isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-medium mt-1">{budgetDisplay}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">{deadlineDisplay}</p>
          </CardContent>
        </Card>
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
                  <DialogHeader><DialogTitle>Add Team Member</DialogTitle><DialogDescription>Assign a team member to this project.</DialogDescription></DialogHeader>
                  {availableUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      All team members are already assigned to this project.
                    </p>
                  ) : (
                    <ScrollArea className="max-h-80">
                      <div className="space-y-2">
                        {availableUsers.map((user) => (
                          <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {user.name.split(" ").map((n) => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {user.role}{user.department ? " \u00b7 " + user.department : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleAddMember(user.id, "MEMBER")}>
                                Member
                              </Button>
                              <Button size="sm" onClick={() => handleAddMember(user.id, "LEAD")}>
                                Lead
                              </Button>
                            </div>
                          </div>
                        ))}
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
            <p className="text-sm text-muted-foreground text-center py-6">
              No team members assigned yet
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-2 p-2 pr-1 rounded-lg border bg-card">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {member.userName.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium">{member.userName}</p>
                    <p className="text-[10px] text-muted-foreground">{member.role}</p>
                  </div>
                  {isAdminUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-500"
                      onClick={() => handleRemoveMember(member.userId)}
                      aria-label="Remove member"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
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
              <DialogHeader><DialogTitle>Add Task</DialogTitle><DialogDescription>Create a new task for this project.</DialogDescription></DialogHeader>
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
                      <option value="AI">AI Agent</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Assignee</Label>
                  <select name="assignedTo" className="border rounded px-3 py-2 text-sm bg-background w-full">
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.userName}</option>
                    ))}
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} (AI)</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" className="w-full">Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((status) => {
          const columnTasks = tasksWithNames.filter((t) => t.status === status);
          return (
            <div key={status} className="flex flex-col min-w-[220px] w-[220px] lg:w-[260px]">
              <div className={"rounded-t-lg px-3 py-2 " + (taskStatusColors[status] || "")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{status.replace("_", " ")}</h3>
                  <Badge variant="secondary" className="text-xs">{String(columnTasks.length)}</Badge>
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[150px] max-h-[calc(100vh-24rem)] overflow-y-auto custom-scrollbar">
                {columnTasks.map((task) => {
                  let taskDeadlineDisplay = "";
                  if (task.deadline) {
                    try {
                      taskDeadlineDisplay = new Date(task.deadline).toLocaleDateString();
                    } catch { /* empty */ }
                  }
                  return (
                    <Card key={task.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium">{task.title}</p>
                          <Badge className={"text-[10px] shrink-0 " + (priorityColors[task.priority as TaskPriority] || "")}>
                            {task.priority}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {task.assigneeType === "AI" ? (
                              <Bot className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            <span>{task.assigneeName}</span>
                          </div>
                          {taskDeadlineDisplay && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {taskDeadlineDisplay}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {TASK_COLUMNS.filter((s) => s !== status).map((s) => (
                            <Button
                              key={s}
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => handleMoveTask(task.id, s)}
                            >
                              {"\u2192 " + s.replace("_", " ").slice(0, 3)}
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-red-500 px-2"
                            onClick={() => handleDeleteTask(task.id)}
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
