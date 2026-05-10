"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus, Search, FolderKanban, ArrowRight, Pencil, Trash2, MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";

const statusColors: Record<string, string> = {
  PLANNING: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [projects, setProjects] = useState<unknown[]>([]);
  const [clients, setClients] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const isAdminUser = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [projRes, clientRes] = await Promise.all([
        fetch("/api/projects", { credentials: 'include' }),
        fetch("/api/clients", { credentials: 'include' }),
      ]);
      if (projRes.ok) {
        const projData = await projRes.json();
        // ZAI FIX #310: Deep sanitize all project data to strip any non-serializable values
        const raw = Array.isArray(projData) ? projData : (Array.isArray(projData?.data) ? projData.data : []);
        setProjects(deepSanitize(raw));
      } else {
        if (handle401(projRes)) return;
        toast.error("Failed to load projects");
      }
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClients(Array.isArray(clientData) ? clientData : (Array.isArray(clientData?.data) ? clientData.data : []));
      } else {
        if (handle401(clientRes)) return;
        toast.error("Failed to load clients");
      }
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [handle401]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clientId = form.get("clientId") as string;

    if (!clientId) {
      toast.error("Please select a client");
      return;
    }

    const data = {
      name: form.get("name") as string,
      description: form.get("description") as string,
      clientId,
      budget: parseFloat(form.get("budget") as string) || null,
      deadline: form.get("deadline") as string || null,
    };

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Project created");
        setAddOpen(false);
        fetchData();
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleEditProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProject) return;

    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      id: editProject.id,
      name: form.get("name") as string,
      description: form.get("description") as string || null,
      status: form.get("status") as string,
      budget: parseFloat(form.get("budget") as string) || null,
      deadline: form.get("deadline") as string || null,
      progress: parseInt(form.get("progress") as string) || 0,
    };

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Project updated");
        setEditOpen(false);
        setEditProject(null);
        fetchData();
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to update project");
      }
    } catch {
      toast.error("Failed to update project");
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/projects?id=${deleteId}`, {
        method: "DELETE",
        credentials: 'include',
      });
      if (res.ok) {
        toast.success("Project deleted successfully");
        setProjects((prev) => prev.filter((p: any) => p.id !== deleteId));
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to delete project");
      }
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeleteId(null);
    }
  };

  const openEditDialog = (project: Record<string, unknown>, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditProject(project);
    setEditOpen(true);
  };

  const openDeleteDialog = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(projectId);
  };

  const filtered = (projects as Record<string, unknown>[]).filter((p) => {
    const pName = safeText(p.name, "");
    const pStatus = safeText(p.status, "");
    const pClient = p.client as Record<string, unknown> | undefined;
    const pClientName = pClient ? safeText(pClient.name, "") : "";
    const matchesFilter = filter === "ALL" || pStatus === filter;
    const matchesSearch = !search || pName.toLowerCase().includes(search.toLowerCase()) || pClientName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (sessionStatus === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm">Manage your web development projects</p>
        </div>
        {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Project</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Project</DialogTitle><DialogDescription>Create a new web development project for your client.</DialogDescription></DialogHeader>
              <form onSubmit={handleCreateProject} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Project Name *</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea name="description" rows={2} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <Select name="clientId" required>
                    <SelectTrigger><SelectValue placeholder={clients.length === 0 ? "No clients available" : "Select client"} /></SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No clients found. Create a client first.</div>
                      ) : (
                        (clients as { id: string; name: string }[]).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Budget (₹)</Label>
                    <Input name="budget" type="number" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Deadline</Label>
                    <Input name="deadline" type="date" />
                  </div>
                </div>
                <Button type="submit" className="w-full">Create Project</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48" aria-label="Search projects" />
        </div>
        {["ALL", "PLANNING", "IN_PROGRESS", "REVIEW", "COMPLETED"].map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "ALL" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-16">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
            <p className="text-muted-foreground">
              {projects.length === 0 ? "No projects yet" : "No projects match your filter"}
            </p>
            {projects.length === 0 && isAdminUser && (
              <Button variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create your first project
              </Button>
            )}
          </div>
        ) : null}
        {filtered.map((project) => (
          <Card
            key={safeText(project.id, "")}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(`/dashboard/projects/${safeText(project.id, "")}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderKanban className="h-5 w-5 text-muted-foreground shrink-0" />
                  <CardTitle className="text-base truncate">{safeText(project.name, "Untitled")}</CardTitle>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Badge className={`text-[10px] ${statusColors[safeText(project.status, "")] || ""}`}>
                    {safeText(project.status, "UNKNOWN").replace("_", " ")}
                  </Badge>
                  {isAdminUser && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => openEditDialog(project, e)} className="gap-2 cursor-pointer">
                          <Pencil className="h-3.5 w-3.5" /> Edit Project
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => openDeleteDialog(safeText(project.id, ""), e)} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" /> Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const client = project.client as Record<string, unknown> | undefined;
                return <p className="text-sm text-muted-foreground mb-3">{client ? safeText(client.name, "Client") : "Client"}</p>;
              })()}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Progress</span>
                  <span>{safeNumber(project.progress)}%</span>
                </div>
                <Progress value={safeNumber(project.progress)} className="h-2" />
              </div>
              {project.deadline ? (
                <p className="text-xs text-muted-foreground mt-2">
                  Deadline: {safeDate(project.deadline, "No date")}
                </p>
              ) : null}
              <div className="flex justify-end mt-3">
                <Button variant="ghost" size="sm">
                  View <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details.</DialogDescription></DialogHeader>
          {editProject && (
            <form onSubmit={handleEditProject} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Project Name *</Label>
                <Input name="name" defaultValue={typeof editProject.name === 'string' ? editProject.name : ''} required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea name="description" rows={2} defaultValue={typeof editProject.description === 'string' ? editProject.description : ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select name="status" defaultValue={typeof editProject.status === 'string' ? editProject.status : 'PLANNING'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VALID_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Progress (%)</Label>
                  <Input name="progress" type="number" min={0} max={100} defaultValue={typeof editProject.progress === 'number' ? editProject.progress : 0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Budget (₹)</Label>
                  <Input name="budget" type="number" defaultValue={editProject.budget != null ? Number(editProject.budget) : ''} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Deadline</Label>
                  <Input name="deadline" type="date" defaultValue={editProject.deadline ? String(editProject.deadline).slice(0, 10) : ''} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditProject(null); }}>Cancel</Button>
                <Button type="submit" className="flex-1">Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Project Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and ALL related data including tasks, team members, time entries, meetings, expenses, and invoices. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-red-600 hover:bg-red-700">
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
