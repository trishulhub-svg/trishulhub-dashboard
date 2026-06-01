"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, CheckCircle2, Clock, AlertTriangle, BookOpen,
  GraduationCap, ExternalLink, ListTodo, MoreHorizontal, Trash2,
  Flag, UserCircle, Users, CheckCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn, safeText, safeDate, deepSanitize } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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

// ── Color maps ──
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

const priorityDotColors: Record<string, string> = {
  URGENT: "bg-red-400", HIGH: "bg-orange-400", MEDIUM: "bg-blue-400", LOW: "bg-gray-400",
};

const statusBadgeColors: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  REVIEW: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  AWAITING_APPROVAL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const VALID_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"];

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ══════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ══════════════════════════════════════════════════════

/** Glassmorphism stat card */
function GlassStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-3.5">
      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold tracking-tight", color)}>{String(value)}</p>
    </div>
  );
}

/** Single personal task item (checkbox + title + meta) */
function PersonalTaskItem({ task, togglingId, onToggleDone }: {
  task: unknown; togglingId: string | null; onToggleDone: (id: string) => void;
}) {
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
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200",
      "bg-white/70 dark:bg-white/[0.03] border-gray-200/60 dark:border-gray-700/40",
      "hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-sm",
      isAwaiting && "opacity-50 blur-[1px]",
    )}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleDone(taskId); }}
        disabled={isToggling || isAwaiting}
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center",
          "transition-all duration-200 hover:scale-110",
          isToggling && "animate-pulse",
          isAwaiting && "cursor-default",
          !isAwaiting && "hover:border-primary/60 hover:bg-primary/5",
          "border-gray-300 dark:border-gray-600",
        )}
      >
        {isAwaiting && <CheckCircle2 className="h-3 w-3 text-orange-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", isAwaiting && "line-through text-muted-foreground/60", !isAwaiting && "font-medium")}>
          {safeText(title)}
        </p>
      </div>
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
}

/** Single team task row with admin action dropdown */
function TeamTaskRow({ task, projectNameMap, teamMembers, onDelete, onReassign, onChangePriority, onChangeStatus, togglingId }: {
  task: unknown; projectNameMap: Map<string, string>; teamMembers: Record<string, unknown>[];
  onDelete: (id: string) => void; onReassign: (taskId: string, userId: string) => void;
  onChangePriority: (taskId: string, priority: string) => void; onChangeStatus: (taskId: string, status: string) => void;
  togglingId: string | null;
}) {
  const taskId = extractStr(task, "id", "");
  const title = extractStr(task, "title", "Untitled");
  const status = extractStr(task, "status", "TODO");
  const priority = extractStr(task, "priority", "MEDIUM");
  const deadline = extractStr(task, "deadline", "");
  const assignedTo = extractStr(task, "assignedTo", "");
  const projectId = extractStr(task, "projectId", "");
  const isAwaiting = status === "AWAITING_APPROVAL";
  const isDone = status === "DONE";
  const isOverdue = deadline && new Date(deadline) < new Date() && !isAwaiting && !isDone;
  const isToggling = togglingId === taskId;
  const priorityDot = priorityDotColors[priority] || "bg-gray-400";
  const projectName = projectNameMap.get(projectId) || "Unknown";

  return (
    <div className={cn(
      "flex items-center gap-3 p-2.5 rounded-lg border transition-all duration-200",
      "bg-white/70 dark:bg-white/[0.03] border-gray-200/60 dark:border-gray-700/40",
      "hover:bg-white dark:hover:bg-white/[0.06] hover:shadow-sm",
      isDone && "opacity-50", isAwaiting && "opacity-60",
    )}>
      <button
        type="button"
        onClick={() => onChangeStatus(taskId, isDone ? "TODO" : "DONE")}
        disabled={isToggling}
        className={cn(
          "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center",
          "transition-all duration-200 hover:scale-110",
          isToggling && "animate-pulse",
          isDone ? "border-green-400 bg-green-400" : "border-gray-300 dark:border-gray-600",
          !isDone && !isAwaiting && "hover:border-primary/60 hover:bg-primary/5",
        )}
      >
        {isDone && <CheckCircle2 className="h-3 w-3 text-white" />}
        {isAwaiting && <CheckCircle2 className="h-3 w-3 text-orange-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", (isDone || isAwaiting) && "line-through text-muted-foreground/60", !isDone && !isAwaiting && "font-medium")}>
          {safeText(title)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground truncate">{safeText(projectName)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("h-2 w-2 rounded-full shrink-0", priorityDot)} title={priority} />
        {deadline && (
          <span className={cn("text-[11px] flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
            {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {safeDate(deadline)}
          </span>
        )}
        {isAwaiting && (
          <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium">Reviewing</Badge>
        )}
        {!isAwaiting && !isDone && (
          <Badge className={cn("text-[10px] font-medium", statusBadgeColors[status] || "")}>
            {safeText(status).replace("_", " ")}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Manage Task</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
            {VALID_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onChangeStatus(taskId, s)} disabled={status === s}>
                <CheckCircle className={cn("h-3.5 w-3.5", status === s && "text-primary")} />
                {s.replace(/_/g, " ")}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Priority</DropdownMenuLabel>
            {VALID_PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onClick={() => onChangePriority(taskId, p)} disabled={priority === p}>
                <Flag className={cn("h-3.5 w-3.5", priorityDotColors[p])} />
                {p}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Reassign</DropdownMenuLabel>
            <div className="max-h-40 overflow-y-auto">
              {teamMembers.filter((m) => m.isActive !== false).map((member) => {
                const mId = extractStr(member, "id", "");
                const mName = extractStr(member, "name", "");
                return (
                  <DropdownMenuItem key={mId} onClick={() => onReassign(taskId, mId)} disabled={mId === assignedTo}>
                    <UserCircle className="h-3.5 w-3.5" />
                    {mName}
                    {mId === assignedTo && <span className="ml-auto text-[10px] text-muted-foreground">current</span>}
                  </DropdownMenuItem>
                );
              })}
            </div>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem variant="destructive" className="text-red-600 dark:text-red-400" onSelect={(e) => e.preventDefault()}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Task
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{safeText(title)}&quot;? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onDelete(taskId)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** The full "My Todos" personal view — shared between admin tab and non-admin fallback */
function PersonalTodosView({ props }: { props: {
  totalActive: number; overdueTasks: number; awaitingApproval: number;
  sortedTraining: unknown[]; tasksByProject: Map<string, unknown[]>; activeTasks: unknown[];
  filteredTasks: unknown[]; search: string; togglingId: string | null;
  handleToggleDone: (taskId: string) => Promise<void>;
  projectNameMap: Map<string, string>; router: ReturnType<typeof useRouter>;
} }) {
  const {
    totalActive, overdueTasks, awaitingApproval, sortedTraining,
    tasksByProject, activeTasks, filteredTasks, search, togglingId,
    handleToggleDone, projectNameMap, router,
  } = props;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <GlassStatCard label="Active" value={totalActive} color="text-violet-700 dark:text-violet-300" />
        <GlassStatCard label="Overdue" value={overdueTasks} color="text-red-700 dark:text-red-300" />
        <GlassStatCard label="Awaiting Review" value={awaitingApproval} color="text-amber-700 dark:text-amber-300" />
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

      {/* Main Content Area */}
      <Card className="bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm border-white/20 dark:border-white/10">
        <CardContent className="p-4 sm:p-5 space-y-6">
          {/* Training Section */}
          {sortedTraining.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <GraduationCap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <h2 className="text-sm font-bold text-foreground">Training</h2>
                <Badge variant="secondary" className="text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  {String(sortedTraining.length)}
                </Badge>
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
                        "border border-white/20 dark:border-white/10 cursor-pointer",
                        "hover:shadow-md hover:-translate-y-[1px] transition-all duration-200",
                        "bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl",
                        isOverdue && "border-red-300 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/5",
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
                  const projectName = projectNameMap.get(projectId) || "Unknown Project";
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
                        {tasks.map((task: unknown) => (
                          <PersonalTaskItem
                            key={extractStr(task, "id", "")}
                            task={task}
                            togglingId={togglingId}
                            onToggleDone={handleToggleDone}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Search no results */}
          {search && filteredTasks.length === 0 && sortedTraining.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground font-medium">No tasks match your search</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════

export default function GlobalTodosPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  const userId = session?.user?.id || "";
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("my");
  const [selectedMember, setSelectedMember] = useState<string>("all");

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) { window.location.href = "/login"; return true; }
    return false;
  }, []);

  // ── Data fetching ──

  const { data: myTasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["my-tasks-all"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?assignedTo=current", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load tasks");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 15 * 1000, retry: 1,
  });

  const { data: allTasksData = [], isLoading: allTasksLoading } = useQuery({
    queryKey: ["all-tasks-team"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load tasks");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 15 * 1000, retry: 1, enabled: isAdminUser,
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["team-users-list"],
    queryFn: async () => {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load team");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 30 * 1000, retry: 1, enabled: isAdminUser,
  });

  const { data: projectsData = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    },
    staleTime: 60 * 1000, retry: 1,
  });

  const { data: trainingData = [], isLoading: trainingLoading } = useQuery({
    queryKey: ["my-training-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/training/assignments", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load training");
      const td = deepSanitize(await res.json());
      return Array.isArray(td) ? td : [];
    },
    staleTime: 30 * 1000, retry: 1,
  });

  // ── Derived data ──

  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectsData as Record<string, unknown>[]) {
      const pid = extractStr(p, "id", "");
      const name = extractStr(p, "name", "");
      if (pid && name) map.set(pid, name);
    }
    return map;
  }, [projectsData]);

  // Personal view
  const activeTasks = useMemo(() => myTasksData.filter((t: unknown) => extractStr(t, "status", "") !== "DONE"), [myTasksData]);

  const activeTraining = useMemo(() => trainingData.filter((t: unknown) => {
    const s = extractStr(t, "status", "");
    return s !== "COMPLETED" && s !== "PASSED" && s !== "FAILED";
  }), [trainingData]);

  const filteredTasks = useMemo(() => {
    if (!search) return activeTasks;
    const q = search.toLowerCase();
    return activeTasks.filter((t: unknown) => {
      const title = extractStr(t, "title", "").toLowerCase();
      const desc = extractStr(t, "description", "").toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [activeTasks, search]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, unknown[]>();
    for (const task of filteredTasks) {
      const pid = extractStr(task, "projectId", "other");
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(task);
    }
    for (const [, tasks] of map) {
      tasks.sort((a, b) => {
        const aDate = extractStr(a, "deadline", "") ? new Date(extractStr(a, "deadline", "")).getTime() : Infinity;
        const bDate = extractStr(b, "deadline", "") ? new Date(extractStr(b, "deadline", "")).getTime() : Infinity;
        const now = Date.now();
        const ao = aDate < now ? 0 : 1; const bo = bDate < now ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return aDate - bDate;
      });
    }
    return map;
  }, [filteredTasks]);

  const sortedTraining = useMemo(() => {
    return [...activeTraining].sort((a, b) => {
      const aDate = extractStr(a, "dueDate", "") ? new Date(extractStr(a, "dueDate", "")).getTime() : Infinity;
      const bDate = extractStr(b, "dueDate", "") ? new Date(extractStr(b, "dueDate", "")).getTime() : Infinity;
      return aDate - bDate;
    }).filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const topic = extractNestedStr(t, ["document", "topic"], "").toLowerCase();
      const status = extractStr(t, "status", "").toLowerCase();
      return topic.includes(q) || status.includes(q);
    });
  }, [activeTraining, search]);

  const totalActive = activeTasks.length + activeTraining.length;
  const overdueTasks = activeTasks.filter((t: unknown) => {
    const d = extractStr(t, "deadline", "");
    return d && new Date(d) < new Date();
  }).length;
  const awaitingApproval = activeTasks.filter((t: unknown) => extractStr(t, "status", "") === "AWAITING_APPROVAL").length;

  // Team view
  const teamActiveTasks = useMemo(() => allTasksData.filter((t: unknown) => extractStr(t, "status", "") !== "DONE"), [allTasksData]);

  const teamFilteredTasks = useMemo(() => {
    let tasks = teamActiveTasks;
    if (selectedMember !== "all") tasks = tasks.filter((t: unknown) => extractStr(t, "assignedTo", "") === selectedMember);
    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter((t: unknown) => {
        const title = extractStr(t, "title", "").toLowerCase();
        const desc = extractStr(t, "description", "").toLowerCase();
        return title.includes(q) || desc.includes(q);
      });
    }
    return tasks;
  }, [teamActiveTasks, selectedMember, search]);

  const teamStats = useMemo(() => {
    const tasks = teamActiveTasks.filter((t: unknown) => selectedMember === "all" || extractStr(t, "assignedTo", "") === selectedMember);
    return {
      total: tasks.length,
      overdue: tasks.filter((t: unknown) => {
        const d = extractStr(t, "deadline", ""); const s = extractStr(t, "status", "");
        return d && new Date(d) < new Date() && s !== "AWAITING_APPROVAL";
      }).length,
      awaiting: tasks.filter((t: unknown) => extractStr(t, "status", "") === "AWAITING_APPROVAL").length,
    };
  }, [teamActiveTasks, selectedMember]);

  const teamTasksGrouped = useMemo(() => {
    if (selectedMember === "all") {
      const map = new Map<string, unknown[]>();
      for (const task of teamFilteredTasks) {
        const aid = extractStr(task, "assignedTo", "unassigned");
        const aname = extractStr(task, "assignedToName", aid === "unassigned" ? "Unassigned" : "Unknown");
        const key = `${aid}:::${aname}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
      }
      for (const [, tasks] of map) {
        tasks.sort((a, b) => {
          const ad = extractStr(a, "deadline", "") ? new Date(extractStr(a, "deadline", "")).getTime() : Infinity;
          const bd = extractStr(b, "deadline", "") ? new Date(extractStr(b, "deadline", "")).getTime() : Infinity;
          const now = Date.now();
          const ao = ad < now ? 0 : 1; const bo = bd < now ? 0 : 1;
          if (ao !== bo) return ao - bo; return ad - bd;
        });
      }
      const sorted = Array.from(map.entries()).sort(([, a], [, b]) => {
        const ao = a.filter((t) => { const d = extractStr(t, "deadline", ""); return d && new Date(d) < new Date(); }).length;
        const bo = b.filter((t) => { const d = extractStr(t, "deadline", ""); return d && new Date(d) < new Date(); }).length;
        if (ao !== bo) return bo - ao; return a.length - b.length;
      });
      return { groupBy: "assignee" as const, entries: sorted };
    }
    const map = new Map<string, unknown[]>();
    for (const task of teamFilteredTasks) {
      const pid = extractStr(task, "projectId", "other");
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(task);
    }
    for (const [, tasks] of map) {
      tasks.sort((a, b) => {
        const ad = extractStr(a, "deadline", "") ? new Date(extractStr(a, "deadline", "")).getTime() : Infinity;
        const bd = extractStr(b, "deadline", "") ? new Date(extractStr(b, "deadline", "")).getTime() : Infinity;
        const now = Date.now();
        const ao = ad < now ? 0 : 1; const bo = bd < now ? 0 : 1;
        if (ao !== bo) return ao - bo; return ad - bd;
      });
    }
    return { groupBy: "project" as const, entries: Array.from(map.entries()) };
  }, [teamFilteredTasks, selectedMember]);

  // ── Actions ──

  const handleToggleDone = useCallback(async (taskId: string) => {
    setTogglingId(taskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: taskId, status: "DONE" }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        toast.success(updated?.status === "AWAITING_APPROVAL" ? "Task submitted for approval" : "Task completed");
        queryClient.invalidateQueries({ queryKey: ["my-tasks-all"] });
      } else {
        if (handle401(res)) return;
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update task");
      }
    } catch { toast.error("Failed to update task"); } finally { setTogglingId(null); }
  }, [queryClient, handle401]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast.success("Task deleted"); queryClient.invalidateQueries({ queryKey: ["all-tasks-team"] }); }
      else { if (handle401(res)) return; const err = await res.json().catch(() => null); toast.error(err?.error || "Failed to delete task"); }
    } catch { toast.error("Failed to delete task"); }
  }, [queryClient, handle401]);

  const handleReassignTask = useCallback(async (taskId: string, newAssigneeId: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: taskId, assignedTo: newAssigneeId }),
      });
      if (res.ok) {
        const m = teamMembers.find((m2) => extractStr(m2, "id", "") === newAssigneeId);
        toast.success(`Task reassigned to ${extractStr(m, "name", "team member")}`);
        queryClient.invalidateQueries({ queryKey: ["all-tasks-team"] });
      } else { if (handle401(res)) return; const err = await res.json().catch(() => null); toast.error(err?.error || "Failed to reassign task"); }
    } catch { toast.error("Failed to reassign task"); }
  }, [queryClient, teamMembers, handle401]);

  const handleChangePriority = useCallback(async (taskId: string, priority: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: taskId, priority }),
      });
      if (res.ok) { toast.success(`Priority changed to ${priority}`); queryClient.invalidateQueries({ queryKey: ["all-tasks-team"] }); }
      else { if (handle401(res)) return; const err = await res.json().catch(() => null); toast.error(err?.error || "Failed to update priority"); }
    } catch { toast.error("Failed to update priority"); }
  }, [queryClient, handle401]);

  const handleChangeStatus = useCallback(async (taskId: string, status: string) => {
    setTogglingId(taskId);
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: taskId, status }),
      });
      if (res.ok) {
        toast.success(status === "DONE" ? "Task completed" : `Status changed to ${status.replace(/_/g, " ")}`);
        queryClient.invalidateQueries({ queryKey: ["all-tasks-team"] });
        queryClient.invalidateQueries({ queryKey: ["my-tasks-all"] });
      } else { if (handle401(res)) return; const err = await res.json().catch(() => null); toast.error(err?.error || "Failed to update status"); }
    } catch { toast.error("Failed to update status"); } finally { setTogglingId(null); }
  }, [queryClient, handle401]);

  // ── Shared props for personal view ──
  const personalViewProps = useMemo(() => ({
    totalActive, overdueTasks, awaitingApproval, sortedTraining, tasksByProject,
    activeTasks, filteredTasks, search, togglingId, handleToggleDone, projectNameMap, router,
  }), [totalActive, overdueTasks, awaitingApproval, sortedTraining, tasksByProject,
    activeTasks, filteredTasks, search, togglingId, handleToggleDone, projectNameMap, router]);

  const isLoading = sessionStatus === "loading" || tasksLoading || trainingLoading;

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="My Todos" description="Track your tasks and training assignments">
          <Skeleton className="h-9 w-40 rounded-lg" />
        </PageHeader>
        <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        <Card className="bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm border-white/20 dark:border-white/10">
          <CardContent className="p-4 sm:p-5 space-y-5">
            <Skeleton className="h-6 w-32 rounded-lg" />
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader title="My Todos" description="Track your tasks and training assignments">
        <div className="relative max-w-xs flex-1 min-w-[140px] sm:min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50"
          />
        </div>
      </PageHeader>

      {/* Admin: Tabs view */}
      {isAdminUser && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="my" className="gap-1.5">
              <ListTodo className="h-3.5 w-3.5" />
              My Todos
              {totalActive > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-1.5 py-0">
                  {String(totalActive)}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Team Todos
              {teamStats.total > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-1.5 py-0">
                  {String(teamStats.total)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* My Todos Tab */}
          <TabsContent value="my">
            <PersonalTodosView props={personalViewProps} />
          </TabsContent>

          {/* Team Todos Tab */}
          <TabsContent value="team">
            {allTasksLoading || teamLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
                <Skeleton className="h-10 w-full rounded-xl" />
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : (
              <>
                {/* Team Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <GlassStatCard label="Active" value={teamStats.total} color="text-violet-700 dark:text-violet-300" />
                  <GlassStatCard label="Overdue" value={teamStats.overdue} color="text-red-700 dark:text-red-300" />
                  <GlassStatCard label="Awaiting Review" value={teamStats.awaiting} color="text-amber-700 dark:text-amber-300" />
                </div>

                {/* Team Content Area */}
                <Card className="bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm border-white/20 dark:border-white/10">
                  <CardContent className="p-4 sm:p-5 space-y-5">
                    {/* Member filter chips */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      <button
                        type="button"
                        onClick={() => setSelectedMember("all")}
                        className={cn(
                          "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                          selectedMember === "all"
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800/50"
                            : "bg-white/60 dark:bg-white/[0.04] text-muted-foreground border-gray-200/60 dark:border-gray-700/40 hover:bg-gray-100 dark:hover:bg-white/[0.08] backdrop-blur-sm",
                        )}
                      >
                        <Users className="h-3.5 w-3.5" />
                        All
                        <span className="text-[10px] opacity-70">({String(teamMembers.length)})</span>
                      </button>
                      {teamMembers.map((member) => {
                        const mId = extractStr(member, "id", "");
                        const mName = extractStr(member, "name", "");
                        const mAvatar = extractStr(member, "avatar", "");
                        const taskCount = teamActiveTasks.filter((t) => extractStr(t, "assignedTo", "") === mId).length;
                        const isInactive = member.isActive === false;

                        return (
                          <button
                            key={mId}
                            type="button"
                            onClick={() => setSelectedMember(mId)}
                            className={cn(
                              "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200",
                              selectedMember === mId
                                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800/50"
                                : "bg-white/60 dark:bg-white/[0.04] text-muted-foreground border-gray-200/60 dark:border-gray-700/40 hover:bg-gray-100 dark:hover:bg-white/[0.08] backdrop-blur-sm",
                              isInactive && "opacity-50",
                            )}
                          >
                            <Avatar className="h-5 w-5">
                              {mAvatar && <AvatarImage src={mAvatar} alt={mName} />}
                              <AvatarFallback className="text-[8px]">{getInitials(mName)}</AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-24">{safeText(mName)}</span>
                            {taskCount > 0 && <span className="text-[10px] opacity-70">({String(taskCount)})</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Empty: no team members */}
                    {teamMembers.length === 0 && (
                      <div className="text-center py-20">
                        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 flex items-center justify-center mb-4">
                          <Users className="h-8 w-8 text-violet-400/40" />
                        </div>
                        <p className="text-lg font-bold text-foreground/80">No team members found</p>
                        <p className="text-sm text-muted-foreground/60 mt-1">Add team members to see their tasks here</p>
                      </div>
                    )}

                    {/* Empty: no tasks */}
                    {teamMembers.length > 0 && teamFilteredTasks.length === 0 && (
                      <div className="text-center py-20">
                        <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-green-500/10 to-green-500/5 flex items-center justify-center mb-4">
                          <CheckCircle2 className="h-8 w-8 text-green-400/40" />
                        </div>
                        <p className="text-lg font-bold text-foreground/80">
                          {selectedMember === "all" ? "No tasks found" : "No tasks found for this team member"}
                        </p>
                        <p className="text-sm text-muted-foreground/60 mt-1">{search ? "Try a different search term" : "All tasks are completed"}</p>
                      </div>
                    )}

                    {/* Grouped tasks */}
                    {teamTasksGrouped.entries.length > 0 && (
                      <div className="space-y-4">
                        {teamTasksGrouped.entries.map(([key, tasks]) => {
                          if (teamTasksGrouped.groupBy === "assignee") {
                            const [assigneeId, assigneeName] = (key as string).split(":::");
                            const member = teamMembers.find((m) => extractStr(m, "id", "") === assigneeId);
                            const mAvatar = extractStr(member, "avatar", "");
                            const memberTasks = tasks as unknown[];
                            const memberOverdue = memberTasks.filter((t) => {
                              const d = extractStr(t, "deadline", "");
                              return d && new Date(d) < new Date() && extractStr(t, "status", "") !== "AWAITING_APPROVAL";
                            }).length;

                            return (
                              <div key={key}>
                                <div className="flex items-center gap-2.5 mb-2 px-1">
                                  <Avatar className="h-6 w-6">
                                    {mAvatar && <AvatarImage src={mAvatar} alt={assigneeName} />}
                                    <AvatarFallback className="text-[9px]">{getInitials(assigneeName)}</AvatarFallback>
                                  </Avatar>
                                  <h3 className="text-sm font-bold text-foreground">{safeText(assigneeName)}</h3>
                                  <Badge variant="secondary" className="text-[10px] font-bold">{String(memberTasks.length)}</Badge>
                                  {memberOverdue > 0 && (
                                    <Badge className="text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                      {String(memberOverdue)} overdue
                                    </Badge>
                                  )}
                                </div>
                                <div className="space-y-1.5 ml-8 border-l-2 border-gray-200/60 dark:border-gray-700/30 pl-4">
                                  {memberTasks.map((task) => (
                                    <TeamTaskRow key={extractStr(task, "id", "")} task={task} projectNameMap={projectNameMap}
                                      teamMembers={teamMembers} onDelete={handleDeleteTask} onReassign={handleReassignTask}
                                      onChangePriority={handleChangePriority} onChangeStatus={handleChangeStatus} togglingId={togglingId} />
                                  ))}
                                </div>
                              </div>
                            );
                          }

                          // Grouped by project
                          const projectId = key as string;
                          const projectName = projectNameMap.get(projectId) || "Unknown Project";
                          const projectTasks = tasks as unknown[];
                          return (
                            <div key={projectId}>
                              <div className="flex items-center gap-2 mb-2 px-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{safeText(projectName)}</h3>
                                <Badge variant="secondary" className="text-[10px] font-bold">{String(projectTasks.length)}</Badge>
                              </div>
                              <div className="space-y-1.5 ml-2.5 border-l-2 border-gray-200/60 dark:border-gray-700/30 pl-4">
                                {projectTasks.map((task) => (
                                  <TeamTaskRow key={extractStr(task, "id", "")} task={task} projectNameMap={projectNameMap}
                                    teamMembers={teamMembers} onDelete={handleDeleteTask} onReassign={handleReassignTask}
                                    onChangePriority={handleChangePriority} onChangeStatus={handleChangeStatus} togglingId={togglingId} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Team search no results */}
                    {search && teamFilteredTasks.length === 0 && teamMembers.length > 0 && (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground font-medium">No tasks match your search</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Non-admin: Personal view directly (no tabs) */}
      {!isAdminUser && (
        <PersonalTodosView props={personalViewProps} />
      )}
    </div>
  );
}
