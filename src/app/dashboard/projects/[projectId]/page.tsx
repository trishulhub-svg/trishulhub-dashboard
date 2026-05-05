"use client";

import { useEffect, useState, useCallback } from "react";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { TASK_COLUMNS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

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
  user: { id: string; name: string; email: string; role: string; department?: string };
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const projectId = params.projectId as string;

  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [agents, setAgents] = useState<unknown[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, taskRes, agentRes, memberRes] = await Promise.all([
        fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include' }),
        fetch(`/api/tasks?projectId=${projectId}`, { credentials: 'include' }),
        fetch("/api/agents", { credentials: 'include' }),
        fetch(`/api/projects/${projectId}/members`, { credentials: 'include' }),
      ]);

      if (projRes.ok) {
        const projData = await projRes.json();
        // Handle both array and paginated { data: [...] } responses
        const projectsList = Array.isArray(projData) ? projData : (Array.isArray(projData?.data) ? projData.data : []);
        if (projectsList.length > 0) setProject(projectsList[0]);
      }
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        setTasks(Array.isArray(taskData) ? taskData : (Array.isArray(taskData?.data) ? taskData.data : []));
      }
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgents(Array.isArray(agentData) ? agentData : (Array.isArray(agentData?.data) ? agentData.data : []));
      }
      if (memberRes.ok) {
        const memberData = await memberRes.json();
        setMembers(Array.isArray(memberData) ? memberData : (Array.isArray(memberData?.data) ? memberData.data : []));
      }

      // Only fetch team users if admin (for member assignment)
      if (isAdminUser) {
        const userRes = await fetch("/api/team?type=users", { credentials: 'include' });
        if (userRes.ok) {
          const userData = await userRes.json();
          setTeamUsers(Array.isArray(userData) ? userData : (Array.isArray(userData?.data) ? userData.data : []));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, [projectId, isAdminUser]);

  useEffect(() => {
    fetchData();
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
      }
    } catch {
      toast.error("Failed to create task");
    }
  };

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      toast.success(`Task moved to ${newStatus.replace("_", " ")}`);
      fetchData();
    } catch {
      toast.error("Failed to move task");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/tasks?id=${taskId}`, { method: "DELETE", credentials: 'include' });
      toast.success("Task deleted");
      fetchData();
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
        const data = await res.json();
        toast.error(data.error || "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
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
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

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
    return <div className="text-center py-12 text-muted-foreground">Project not found</div>;
  }

  const typedTasks = tasks as {
    id: string; title: string; description?: string; status: TaskStatus;
    priority: TaskPriority; assigneeType: string; assignedTo?: string;
    assignee?: { name: string }; agent?: { name: string };
  }[];

  // Filter out users already in the project
  const memberUserIds = members.map(m => m.userId);
  const availableUsers = teamUsers.filter(u => !memberUserIds.includes(u.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")} aria-label="Back to projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project.name as string}</h1>
          <p className="text-muted-foreground text-sm">{project.description as string || "No description"}</p>
        </div>
      </div>

      {/* Project Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className={`mt-1 ${projectStatusColors[project.status as string] || ""}`}>{(project.status as string).replace("_", " ")}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={project.progress as number} className="h-2 flex-1" />
              <span className="text-sm font-medium">{project.progress as number}%</span>
            </div>
          </CardContent>
        </Card>
        {isAdminUser && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="text-sm font-medium mt-1">₹{((project.budget as number) || 0).toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">
              {project.deadline ? new Date(project.deadline as string).toLocaleDateString() : "No deadline"}
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
                  <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
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
                                  {user.name.split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{user.name}</p>
                                <p className="text-xs text-muted-foreground">{user.role} {user.department ? `· ${user.department}` : ''}</p>
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
                      {member.user.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium">{member.user.name}</p>
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
              <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
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
                        <SelectItem key={m.userId} value={m.userId}>{m.user.name}</SelectItem>
                      ))}
                      {(agents as { id: string; name: string }[]).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} (AI)</SelectItem>
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
          const columnTasks = typedTasks.filter((t) => t.status === status);
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
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium">{task.title}</p>
                        <Badge className={`text-[10px] shrink-0 ${priorityColors[task.priority]}`}>
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
                          <span>{task.assignee?.name || task.agent?.name || "Unassigned"}</span>
                        </div>
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
                            → {s.replace("_", " ").slice(0, 3)}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
