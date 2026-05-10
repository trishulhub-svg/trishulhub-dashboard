"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, User, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";

const taskStatusColors: Record<string, string> = {
  TODO: "bg-gray-200 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  REVIEW: "bg-yellow-100 text-yellow-800",
  DONE: "bg-green-100 text-green-800",
};

const projectStatusColors: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  REVIEW: "bg-purple-100 text-purple-800",
  APPROVAL: "bg-orange-100 text-orange-800",
  DEPLOYED: "bg-cyan-100 text-cyan-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default function PortalProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [tasks, setTasks] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include' }),
        fetch(`/api/tasks?projectId=${projectId}`, { credentials: 'include' }),
      ]);
      if (projRes.ok) {
        const projData = await projRes.json();
        // ZAI FIX #310: Deep sanitize before storing in state
        let raw: unknown = null;
        if (Array.isArray(projData) && projData.length > 0) raw = projData[0];
        else if (projData?.id) raw = projData;
        else if (Array.isArray(projData?.data) && projData.data.length > 0) raw = projData.data[0];
        if (raw) setProject(deepSanitize<Record<string, unknown>>(raw));
      }
      if (taskRes.ok) {
        const taskData = await taskRes.json();
        const raw = Array.isArray(taskData) ? taskData : (Array.isArray(taskData?.data) ? taskData.data : []);
        setTasks(deepSanitize<Record<string, unknown>[]>(raw));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-12 text-muted-foreground">Project not found</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/portal/projects")} aria-label="Back to projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{safeText(project.name, "Untitled")}</h1>
          <p className="text-muted-foreground text-sm">{safeText(project.description) || "No description"}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className={`mt-1 ${projectStatusColors[safeText(project.status, "")] || ""}`}>
              {safeText(project.status, "UNKNOWN").replace("_", " ")}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={safeNumber(project.progress)} className="h-2 flex-1" />
              <span className="text-sm font-medium">{safeNumber(project.progress)}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Deadline</p>
            <p className="text-sm font-medium mt-1">
              {safeDate(project.deadline, "No deadline")}
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mt-4">Tasks</h2>
      <div className="space-y-2">
        {(tasks as Record<string, unknown>[]).map((task) => (
          <Card key={safeText(task.id, "")}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className={`text-[10px] ${taskStatusColors[safeText(task.status, "")] || ""}`}>
                  {safeText(task.status, "UNKNOWN").replace("_", " ")}
                </Badge>
                <span className="text-sm">{safeText(task.title, "Untitled")}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {safeText(task.assigneeType, "HUMAN") === "AI" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                <span>Unassigned</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
