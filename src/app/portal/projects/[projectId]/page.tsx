"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { safeText, deepClone, safeNumber, safeDate } from "@/lib/utils";
import { extractArray } from "@/lib/api-helpers";

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
  // FIX #1: Guard useParams() — Next.js 16 may return Promise or undefined
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === 'string'
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? '')
      : '';

  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const projRes = await fetch(`/api/projects?projectId=${projectId}`, { credentials: 'include' });
      if (projRes.ok) {
        const projData = await projRes.json();
        // ZAI FIX #310: Deep clone before storing in state
        let raw: unknown = null;
        if (Array.isArray(projData) && projData.length > 0) raw = projData[0];
        else if (projData && typeof projData === 'object' && 'id' in (projData as Record<string, unknown>)) raw = projData;
        else {
          const projArr = extractArray<Record<string, unknown>>(projData);
          if (projArr.length > 0) raw = projArr[0];
        }
        if (raw) setProject(deepClone(raw as Record<string, unknown>));
      } else {
        setError("Failed to load project details. Please try again.");
      }
    } catch (err) {
      console.error("[portal/project-detail] Failed to load data:", err);
      setError("Failed to load project data. Please try again.");
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" onClick={() => router.push("/portal/projects")}>
          Back to Projects
        </Button>
      </div>
    );
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
              <Progress value={Math.min(100, Math.max(0, safeNumber(project.progress, 0)))} className="h-2 flex-1" />
              <span className="text-sm font-medium">{Math.min(100, Math.max(0, safeNumber(project.progress, 0)))}%</span>
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
    </div>
  );
}
