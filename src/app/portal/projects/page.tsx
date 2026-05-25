"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { safeText, safeNumber, safeDate } from "@/lib/utils";

export default function PortalProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // Handle both array and paginated { data: [...] } responses
        setProjects(Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []));
      } else {
        setError("Failed to load projects");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchProjects(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // M-PRJ-8 FIX: Replaced unsafe `as` type assertions with safe extractors
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Projects</h1>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderKanban className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-1">No Projects Yet</h3>
            <p className="text-muted-foreground">Your projects will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(projects as Record<string, unknown>[]).map((project) => {
            const pId = safeText(project.id, "");
            const pName = safeText(project.name, "Untitled");
            const pDesc = safeText(project.description, "");
            const pStatus = safeText(project.status, "PLANNING");
            const pProgress = safeNumber(project.progress, 0);
            const pDeadline = safeText(project.deadline, "");
            return (
              <Card
                key={pId}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/portal/projects/${pId}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{pName}</h3>
                    <Badge variant="secondary">{pStatus.replace("_", " ")}</Badge>
                  </div>
                  {pDesc && <p className="text-sm text-muted-foreground">{pDesc}</p>}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Progress</span>
                      <span>{pProgress}%</span>
                    </div>
                    <Progress value={pProgress} className="h-2" />
                  </div>
                  {/* L-PRJ-9 FIX: Use safeDate for consistent formatting */}
                  {pDeadline && (
                    <p className="text-xs text-muted-foreground">Deadline: {safeDate(pDeadline, "No deadline")}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
