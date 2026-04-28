"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import { TASK_COLUMNS } from "@/lib/types";
import type { TaskStatus, TaskPriority } from "@/lib/types";

const taskStatusColors: Record<TaskStatus, string> = {
  TODO: "bg-gray-100 dark:bg-gray-800/50",
  IN_PROGRESS: "bg-blue-50 dark:bg-blue-900/20",
  REVIEW: "bg-yellow-50 dark:bg-yellow-900/20",
  DONE: "bg-green-50 dark:bg-green-900/20",
};

const priorityColors: Record<TaskPriority, string> = {
  LOW: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  MEDIUM: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [agents, setAgents] = useState<unknown[]>([]);
  const [users, setUsers] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, taskRes, agentRes, userRes] = await Promise.all([
        fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include' }),
        fetch(`/api/tasks?projectId=${projectId}`, { credentials: 'include' }),
        fetch("/api/agents", { credentials: 'include' }),
        fetch("/api/team", { credentials: 'include' }),
      ]);

      if (projRes.ok) {
        const projects = await projRes.json();
        if (projects.length > 0) setProject(projects[0]);
      }
      if (taskRes.ok) setTasks(await taskRes.json());
      if (agentRes.ok) setAgents(await agentRes.json());
      if (userRes.ok) setUsers(await userRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{project.name as string}</h1>
          <p className="text-muted-foreground text-sm">{project.description as string || "No description"}</p>
        </div>
      </div>

      {/* Project Info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-1">{(project.status as string).replace("_", " ")}</Badge>
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
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="text-sm font-medium mt-1">₹{((project.budget as number) || 0).toLocaleString("en-IN")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">
              {project.deadline ? new Date(project.deadline as string).toLocaleDateString() : "No deadline"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Task Board */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Task Board</h2>
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
                <Input name="assignedTo" placeholder="Select from above" />
              </div>
              <Button type="submit" className="w-full">Create Task</Button>
            </form>
          </DialogContent>
        </Dialog>
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
