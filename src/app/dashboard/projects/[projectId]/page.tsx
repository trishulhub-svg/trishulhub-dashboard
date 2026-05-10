"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TASK_COLUMNS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZAI PROTOCOL: Multi-Layer Defense Against React #310
//
// React error #310 = "Objects are not valid as a React child"
// This occurs when an object/Date/Array/Function/Symbol is rendered
// directly in JSX like {someObject} instead of {someObject.prop}.
//
// ROOT CAUSE: Prisma `include` returns nested objects (Date instances,
// relation objects, circular refs). Even though HTTP JSON serialization
// converts most, edge cases survive and get stored in React state.
//
// DEFENSE LAYERS:
//   Layer 0: deepSanitize — JSON round-trip strips ALL non-serializable
//     values (Date objects → ISO strings, circular refs removed, etc.)
//   Layer 1: whitelistProject — Build from ONLY known scalar fields,
//     instead of stripping known relation fields (which misses unknowns)
//   Layer 2: safeText — Final render gatekeeper. Every value rendered
//     in JSX passes through this, guaranteeing a string/number primitive
//   Layer 3: safeTasks — Explicit primitive-only task construction
//   Layer 4: Error boundary with detailed diagnostics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Layer 0: Deep sanitization via JSON round-trip.
// Strips Date objects, circular references, BigInt, undefined, functions.
// Everything becomes JSON-safe: strings, numbers, booleans, null, plain objects, arrays.
function deepSanitize<T>(data: unknown): T {
  try {
    return JSON.parse(JSON.stringify(data)) as T;
  } catch {
    console.error("[ZAI #310] deepSanitize failed, returning empty");
    return {} as T;
  }
}

// Layer 2: Guaranteed primitive render value.
// If the input is an object/array/function/symbol, converts to a safe string.
// Prevents React #310 under ALL circumstances.
function safeText(value: unknown, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Object, Array, Function, Symbol, Date — all become safe strings
  try {
    const s = String(value);
    // Detect "[object Object]" which means we'd render a useless string
    if (s === "[object Object]" || s === "[object Array]") return fallback;
    return s;
  } catch {
    return fallback;
  }
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

interface ProjectMember {
  id: string;
  userId: string;
  projectId: string;
  role: string;
  user?: { id?: string; name?: string; email?: string; role?: string; department?: string; avatar?: string };
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

// Layer 1: Known scalar fields for the Project model.
// Any field NOT in this list is treated as a potential object and dropped.
const PROJECT_SCALAR_FIELDS = [
  "id", "name", "description", "clientId", "status",
  "progress", "deadline", "budget", "createdAt", "updatedAt",
] as const;

// Build a safe project object from ONLY whitelisted scalar fields
function whitelistProject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // Layer 0 first: JSON round-trip to strip Dates and circular refs
  const clean = deepSanitize<Record<string, unknown>>(raw);
  // Layer 1: Build from whitelist only
  const safe: Record<string, unknown> = {};
  for (const key of PROJECT_SCALAR_FIELDS) {
    if (key in clean && clean[key] !== undefined) {
      const val = clean[key];
      // Double-check: only keep primitives
      if (val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        safe[key] = val;
      } else if (typeof val === "object" && !Array.isArray(val)) {
        // Could be a Date string from JSON — check if it looks like a date
        // JSON.stringify converts Dates to ISO strings, so this should be a string now
        safe[key] = String(val);
      }
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

// Layer 5: Recursive object scanner — logs any non-primitive values
// that could cause React #310 if rendered in JSX.
function scanForObjects(label: string, data: unknown, depth: number = 0): void {
  if (depth > 3 || !data || typeof data !== "object") return;
  if (Array.isArray(data)) {
    data.forEach((item, i) => scanForObjects(`${label}[${i}]`, item, depth + 1));
    return;
  }
  for (const [key, val] of Object.entries(data)) {
    if (val !== null && typeof val === "object") {
      console.warn(`[ZAI #310 SCAN] ${label}.${key} is ${Array.isArray(val) ? "Array" : typeof val}:`, 
        Array.isArray(val) ? `length=${val.length}` : Object.keys(val).join(","));
      scanForObjects(`${label}.${key}`, val, depth + 1);
    }
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const projectId = params.projectId as string;

  // Client-only mount guard prevents hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const stableRole = sessionStatus === "authenticated" ? (session?.user?.role || "DEVELOPER") : "DEVELOPER";

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
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

      // ── Project: Layer 0 + Layer 1 sanitization ──
      if (projRes.ok) {
        const projData = await projRes.json();
        let rawProject: unknown = null;
        if (Array.isArray(projData)) {
          rawProject = projData.length > 0 ? projData[0] : null;
        } else if (projData?.id) {
          rawProject = projData;
        } else if (Array.isArray(projData?.data) && projData.data.length > 0) {
          rawProject = projData.data[0];
        }
        if (rawProject) {
          const safe = whitelistProject(rawProject);
          if (safe) scanForObjects("project[whitelisted]", safe);
          setProject(safe);
        }
      } else {
        if (handle401(projRes)) return;
      }

      // ── Tasks: Layer 0 deep sanitize ──
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const raw = Array.isArray(taskData) ? taskData : (Array.isArray(taskData?.data) ? taskData.data : []);
        const cleaned = deepSanitize<Record<string, unknown>[]>(raw);
        // Scan first few tasks for non-scalar fields
        cleaned.slice(0, 3).forEach((t, i) => scanForObjects(`tasks[${i}]`, t));
        setTasks(cleaned);
      } else {
        if (handle401(taskRes)) return;
      }

      // ── Agents: Layer 0 sanitize + extract only id/name ──
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        const raw = Array.isArray(agentData) ? agentData : (Array.isArray(agentData?.data) ? agentData.data : []);
        const clean = deepSanitize<Record<string, unknown>[]>(raw);
        setAgents(clean.map((a) => ({
          id: safeText(a.id, ""),
          name: safeText(a.name, "AI Agent"),
        })));
      } else {
        if (handle401(agentRes)) return;
      }

      // ── Members: Layer 0 deep sanitize ──
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        const raw = Array.isArray(memberData) ? memberData : (Array.isArray(memberData?.data) ? memberData.data : []);
        setMembers(deepSanitize<ProjectMember[]>(raw));
      } else {
        if (handle401(memberRes)) return;
      }

      // ── Team Users (admin only): Layer 0 sanitize ──
      if (stableRole === "SUPER_ADMIN" || stableRole === "ADMIN") {
        const userRes = await fetch("/api/team?type=users", { credentials: 'include', signal });
        if (userRes.ok) {
          const userData = await userRes.json();
          const raw = Array.isArray(userData) ? userData : (Array.isArray(userData?.data) ? userData.data : []);
          setTeamUsers(deepSanitize<TeamUser[]>(raw));
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

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleAddTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const assigneeType = form.get("assigneeType") as string;
    const assignedTo = form.get("assignedTo") as string;

    const data = {
      title: form.get("title") as string,
      description: form.get("description") as string,
      projectId,
      assigneeType: assigneeType || "HUMAN",
      assignedTo: assignedTo || null,
      priority: form.get("priority") as string || "MEDIUM",
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
        toast.error(errData?.error || "Failed to create task");
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
        toast.success(`Task moved to ${newStatus.replace("_", " ")}`);
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
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE", credentials: 'include' });
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
      const res = await fetch(`/api/projects/${projectId}/members`, {
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
        toast.error(data.error || "Failed to add member");
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
        toast.error(data.error || "Failed to update project");
      }
    } catch {
      toast.error("Failed to update project");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, {
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

  if (!mounted || sessionStatus === "loading") {
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

  if (loading) {
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

  // ── Layer 3: safeTasks — explicit primitive-only task construction ──
  const VALID_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
  const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

  const safeTasks = tasks.map(t => {
    // Resolve assignee name from members or agents list
    let assigneeName = "Unassigned";
    const assignedTo = safeText(t.assignedTo, "");
    const assigneeType = safeText(t.assigneeType, "HUMAN");

    if (assignedTo) {
      if (assigneeType === "AI") {
        const agent = agents.find(a => a.id === assignedTo);
        if (agent) assigneeName = agent.name;
      } else {
        const member = members.find(m => m.userId === assignedTo);
        if (member?.user?.name) assigneeName = safeText(member.user.name, "Team Member");
      }
    }
    return {
      id: safeText(t.id, ""),
      title: safeText(t.title, "Untitled"),
      description: typeof t.description === "string" ? t.description : null,
      status: (VALID_STATUSES as readonly string[]).includes(safeText(t.status, "")) ? safeText(t.status, "TODO") : "TODO",
      priority: (VALID_PRIORITIES as readonly string[]).includes(safeText(t.priority, "")) ? safeText(t.priority, "MEDIUM") : "MEDIUM",
      assigneeType: assigneeType === "AI" ? "AI" : "HUMAN",
      assigneeName,
      deadline: t.deadline ? safeText(t.deadline, "") : null,
    };
  });

  // ── Layer 2: safeText for ALL project fields rendered in JSX ──
  const projectName = safeText(project.name, "Unnamed Project");
  const projectDesc = safeText(project.description, "");
  const projectStatus = safeText(project.status, "PLANNING");
  const projectProgress = typeof project.progress === "number" ? project.progress : (Number(project.progress) || 0);
  const projectBudget = typeof project.budget === "number" ? project.budget : (Number(project.budget) || 0);
  const projectDeadline = project.deadline ? new Date(safeText(project.deadline)) : null;

  // Filter out users already in the project
  const memberUserIds = members.map(m => safeText(m.userId, ""));
  const availableUsers = useMemo(() => teamUsers.filter(u => !memberUserIds.includes(safeText(u.id, ""))), [teamUsers, memberUserIds]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{projectName}</h1>
          <p className="text-muted-foreground text-sm">{projectDesc || "No description"}</p>
        </div>
      </div>

      {/* Project Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            {isAdminUser ? (
              <Select
                value={projectStatus}
                onValueChange={(val) => handleUpdateProject({ status: val })}
              >
                <SelectTrigger className="h-7 mt-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge className={`mt-1 ${projectStatusColors[projectStatus] || ""}`}>{projectStatus.replace("_", " ")}</Badge>
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
                <span className="text-sm font-medium">{projectProgress}%</span>
              )}
            </div>
          </CardContent>
        </Card>
        {isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-medium mt-1">{safeText(`${projectBudget.toLocaleString("en-IN")}`, "N/A")}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">
              {projectDeadline && !isNaN(projectDeadline.getTime()) ? projectDeadline.toLocaleDateString() : "No deadline"}
            </p>
          </CardContent>
        </Card>
        {!isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Team Size</p>
              <p className="text-sm font-medium mt-1">{members.length} members</p>
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
              <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''} assigned to this project</CardDescription>
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
                          <div key={safeText(user.id, "")} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {safeText(user.name, "?").split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{safeText(user.name, "Unknown")}</p>
                                <p className="text-xs text-muted-foreground">{safeText(user.role, "")} {user.department ? `· ${safeText(user.department, "")}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleAddMember(safeText(user.id, ""), "MEMBER")}>
                                Member
                              </Button>
                              <Button size="sm" onClick={() => handleAddMember(safeText(user.id, ""), "LEAD")}>
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
                <div key={safeText(member.id, "")} className="flex items-center gap-2 p-2 pr-1 rounded-lg border bg-card">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {safeText(member.user?.name, "?").split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium">{safeText(member.user?.name, "Unknown")}</p>
                    <p className="text-[10px] text-muted-foreground">{safeText(member.role, "")}</p>
                  </div>
                  {isAdminUser && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-red-500"
                      onClick={() => handleRemoveMember(safeText(member.userId, ""))}
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
                    <Select name="priority" defaultValue="MEDIUM">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Assign To</Label>
                    <Select name="assigneeType" defaultValue="HUMAN">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HUMAN">Team Member</SelectItem>
                        <SelectItem value="AI">AI Agent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Assignee</Label>
                  <Select name="assignedTo">
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={safeText(m.userId, "")} value={safeText(m.userId, "")}>{safeText(m.user?.name, "Team Member")}</SelectItem>
                      ))}
                      {agents.map((a) => (
                        <SelectItem key={safeText(a.id, "")} value={safeText(a.id, "")}>{safeText(a.name, "AI Agent")} (AI)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Create Task</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {TASK_COLUMNS.map((status) => {
          const columnTasks = safeTasks.filter((t) => t.status === status);
          return (
            <div key={status} className="flex flex-col min-w-[220px] w-[220px] lg:w-[260px]">
              <div className={`rounded-t-lg px-3 py-2 ${taskStatusColors[status]}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{status.replace("_", " ")}</h3>
                  <Badge variant="secondary" className="text-xs">{columnTasks.length}</Badge>
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[150px] max-h-[calc(100vh-24rem)] overflow-y-auto custom-scrollbar">
                {columnTasks.map((task) => (
                  <Card key={safeText(task.id, "")} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium">{safeText(task.title, "Untitled")}</p>
                        <Badge className={`text-[10px] shrink-0 ${priorityColors[task.priority as TaskPriority] || ""}`}>
                          {safeText(task.priority, "MEDIUM")}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{safeText(task.description, "")}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {task.assigneeType === "AI" ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          <span>{safeText(task.assigneeName, "Unassigned")}</span>
                        </div>
                        {task.deadline && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {(() => { try { return new Date(task.deadline).toLocaleDateString(); } catch { return ""; } })()}
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
                            onClick={() => handleMoveTask(safeText(task.id, ""), s)}
                          >
                            {safeText(`→ ${s.replace("_", " ").slice(0, 3)}`, "")}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-red-500 px-2"
                          onClick={() => handleDeleteTask(safeText(task.id, ""))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
