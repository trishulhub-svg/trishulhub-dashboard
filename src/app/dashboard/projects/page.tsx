"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus, Search, FolderKanban, ArrowRight, Pencil, Trash2, MoreHorizontal,
  Paperclip, Key, Eye, EyeOff, Copy, Download, Upload, X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// NOTE: Radix Select removed — replaced with native <select> to prevent React #310
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

// ━━ Credential form type ━━
interface CredentialForm {
  title: string;
  username: string;
  password: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  // Feature 3: Attachments & Credentials state
  const [attachments, setAttachments] = useState<{ id: string; fileName: string; fileSize: number; createdAt: string }[]>([]);
  const [credentials, setCredentials] = useState<{ id: string; title: string; username: string; password: string }[]>([]);
  // L-PRJ-2 FIX: Removed unused editEditOpen state
  const [newCred, setNewCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editingCred, setEditingCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [uploadingFile, setUploadingFile] = useState(false);
  // L-PRJ-6 FIX: State for credential delete confirmation dialog
  const [deleteCredId, setDeleteCredId] = useState<string | null>(null);

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

  // ━━ Fetch attachments for a project ━━
  const fetchAttachments = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAttachments(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  // ━━ Fetch credentials for a project ━━
  const fetchCredentials = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/credentials?projectId=${projectId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

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
      clientId: form.get("clientId") as string || null,
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
    // Fetch attachments and credentials for this project
    fetchAttachments(safeText(project.id, ""));
    fetchCredentials(safeText(project.id, ""));
    setShowPasswords({});
    setNewCred({ title: "", username: "", password: "" });
    setEditingCredId(null);
  };

  const openDeleteDialog = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteId(projectId);
  };

  // ━━ File upload handler ━━
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editProject || !e.target.files?.length) return;
    const file = e.target.files[0];
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    setUploadingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1]; // Remove data:application/pdf;base64, prefix
        const res = await fetch("/api/projects/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId: editProject.id,
            fileName: file.name,
            fileData: base64,
            fileSize: file.size,
          }),
        });
        if (res.ok) {
          toast.success("File uploaded");
          fetchAttachments(safeText(editProject.id, ""));
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Failed to upload");
        }
        setUploadingFile(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Failed to read file");
      setUploadingFile(false);
    }
    e.target.value = "";
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?id=${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Attachment removed");
        if (editProject) fetchAttachments(safeText(editProject.id, ""));
      }
    } catch {
      toast.error("Failed to delete attachment");
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/projects/attachments?id=${attachmentId}`, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const link = document.createElement("a");
        link.href = `data:application/pdf;base64,${data.fileData}`;
        link.download = data.fileName;
        link.click();
      }
    } catch {
      toast.error("Failed to download");
    }
  };

  // ━━ Credential handlers ━━
  const handleAddCredential = async () => {
    if (!editProject || !newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()) {
      toast.error("All credential fields are required");
      return;
    }
    try {
      const res = await fetch("/api/projects/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: editProject.id, ...newCred }),
      });
      if (res.ok) {
        toast.success("Credential added");
        setNewCred({ title: "", username: "", password: "" });
        fetchCredentials(safeText(editProject.id, ""));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add credential");
      }
    } catch {
      toast.error("Failed to add credential");
    }
  };

  const handleUpdateCredential = async () => {
    if (!editingCredId || !editingCred.title.trim() || !editingCred.username.trim()) {
      toast.error("Title and username are required");
      return;
    }
    try {
      const res = await fetch("/api/projects/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: editingCredId, ...editingCred }),
      });
      if (res.ok) {
        toast.success("Credential updated");
        setEditingCredId(null);
        if (editProject) fetchCredentials(safeText(editProject.id, ""));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update credential");
      }
    } catch {
      toast.error("Failed to update credential");
    }
  };

  // L-PRJ-6 FIX: Replaced confirm() with AlertDialog
  const handleDeleteCredential = async () => {
    if (!deleteCredId) return;
    try {
      const res = await fetch(`/api/projects/credentials?id=${deleteCredId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Credential removed");
        if (editProject) fetchCredentials(safeText(editProject.id, ""));
      }
    } catch {
      toast.error("Failed to delete credential");
    } finally {
      setDeleteCredId(null);
    }
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

  // L-PRJ-5 FIX: Merged duplicate loading skeleton blocks
  if (sessionStatus === "loading" || loading) {
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
                  <select name="clientId" required className="border rounded px-3 py-2 text-sm bg-background w-full">
                    <option value="">{clients.length === 0 ? "No clients available" : "Select client"}</option>
                    {(clients as { id: string; name: string }[]).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
        {/* M-PRJ-5 FIX: Added missing APPROVAL and DEPLOYED filter buttons */}
        {["ALL", "PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => (
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

      {/* Edit Project Dialog with Tabs */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details, attachments, and credentials.</DialogDescription></DialogHeader>
          {editProject && (
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="attachments" className="gap-1">
                  <Paperclip className="h-3 w-3" /> Attachments
                </TabsTrigger>
                <TabsTrigger value="credentials" className="gap-1">
                  <Key className="h-3 w-3" /> Credentials
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details">
                <form onSubmit={handleEditProject} className="space-y-3 mt-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Project Name *</Label>
                    <Input name="name" defaultValue={typeof editProject.name === 'string' ? editProject.name : ''} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Textarea name="description" rows={2} defaultValue={typeof editProject.description === 'string' ? editProject.description : ''} />
                  </div>
                  {/* Feature 2: Client selector in edit form */}
                  <div className="space-y-1">
                    <Label className="text-xs">Client</Label>
                    <select
                      name="clientId"
                      defaultValue={typeof editProject.clientId === 'string' ? editProject.clientId : ''}
                      className="border rounded px-3 py-2 text-sm bg-background w-full"
                    >
                      <option value="">Select client</option>
                      {(clients as { id: string; name: string; company?: string }[]).map((c) => (
                        <option key={c.id} value={c.id}>{c.company || c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <select name="status" defaultValue={typeof editProject.status === 'string' ? editProject.status : 'PLANNING'} className="border rounded px-3 py-2 text-sm bg-background w-full">
                        {VALID_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace("_", " ")}</option>
                        ))}
                      </select>
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
              </TabsContent>

              {/* Attachments Tab */}
              <TabsContent value="attachments">
                <div className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Upload PDF files for this project</p>
                    <label className="cursor-pointer">
                      <div className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                        {uploadingFile ? "Uploading..." : <><Upload className="h-4 w-4" /> Upload PDF</>}
                      </div>
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                    </label>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {attachments.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">No attachments yet</p>
                    )}
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-2 p-2 border rounded-md">
                        <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{att.fileName}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(att.fileSize)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => handleDownloadAttachment(att.id)} title="Download" aria-label="Download attachment">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => handleDeleteAttachment(att.id)} title="Delete" aria-label="Delete attachment">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Credentials Tab */}
              <TabsContent value="credentials">
                <div className="space-y-4 mt-4">
                  {/* Add new credential */}
                  <div className="border rounded-md p-3 space-y-2">
                    <p className="text-xs font-medium">Add New Credential</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input placeholder="Title (e.g., Hosting Login)" value={newCred.title} onChange={(e) => setNewCred({ ...newCred, title: e.target.value })} className="h-8 text-sm" />
                      <Input placeholder="Username / Email" value={newCred.username} onChange={(e) => setNewCred({ ...newCred, username: e.target.value })} className="h-8 text-sm" />
                      <Input placeholder="Password" type="password" value={newCred.password} onChange={(e) => setNewCred({ ...newCred, password: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <Button type="button" size="sm" onClick={handleAddCredential} disabled={!newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()} className="h-8">
                      <Plus className="h-3 w-3 mr-1" /> Add Credential
                    </Button>
                  </div>

                  {/* Existing credentials */}
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {credentials.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">No credentials stored</p>
                    )}
                    {credentials.map((cred) => (
                      <div key={cred.id} className="border rounded-md p-3 space-y-2">
                        {editingCredId === cred.id ? (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <Input value={editingCred.title} onChange={(e) => setEditingCred({ ...editingCred, title: e.target.value })} className="h-8 text-sm" />
                              <Input value={editingCred.username} onChange={(e) => setEditingCred({ ...editingCred, username: e.target.value })} className="h-8 text-sm" />
                              <Input value={editingCred.password} onChange={(e) => setEditingCred({ ...editingCred, password: e.target.value })} className="h-8 text-sm" />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" className="h-7" onClick={handleUpdateCredential}>Save</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditingCredId(null)}>Cancel</Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-medium">{cred.title}</span>
                              </div>
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => { setEditingCredId(cred.id); setEditingCred({ title: cred.title, username: cred.username, password: cred.password }); }} title="Edit">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {/* L-PRJ-6 FIX: Use AlertDialog instead of confirm() */}
                                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => setDeleteCredId(cred.id)} title="Delete">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Username: <span className="font-mono text-foreground">{cred.username}</span></span>
                              <span className="mx-1">•</span>
                              <span>Password: <span className="font-mono text-foreground">{showPasswords[cred.id] ? cred.password : "••••••••"}</span></span>
                              {/* L-PRJ-7 FIX: Added aria-labels for accessibility */}
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5 ml-auto" onClick={() => { setShowPasswords({ ...showPasswords, [cred.id]: !showPasswords[cred.id] }); }} title={showPasswords[cred.id] ? "Hide" : "Show"} aria-label={showPasswords[cred.id] ? "Hide password" : "Show password"}>
                                {showPasswords[cred.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(cred.password); toast.success("Password copied"); }} title="Copy" aria-label="Copy password">
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
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

      {/* L-PRJ-6 FIX: Credential Delete Confirmation (replaces native confirm()) */}
      <AlertDialog open={!!deleteCredId} onOpenChange={() => setDeleteCredId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this credential. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCredential} className="bg-red-600 hover:bg-red-700">
              Delete Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
