"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Search, FolderKanban, ArrowRight, Pencil, Trash2, MoreHorizontal,
  Paperclip, Key, Eye, EyeOff, Copy, Download, Upload, X, Activity, CheckCircle2, LayoutGrid,
  ClipboardCheck,
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
import { cn, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";

const statusColors: Record<string, string> = {
  PLANNING: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  REVIEW: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const statusDotColors: Record<string, string> = {
  PLANNING: "bg-gray-400",
  IN_PROGRESS: "bg-blue-400",
  REVIEW: "bg-yellow-400",
  APPROVAL: "bg-orange-400",
  DEPLOYED: "bg-green-400",
  COMPLETED: "bg-emerald-400",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

// ━━ Kanban column configuration ━━
const KANBAN_COLUMNS = [
  { key: "PLANNING",   label: "Planning",    dot: "bg-gray-400",    glowColor: "hover:shadow-gray-500/5 dark:hover:shadow-gray-400/10", accentBar: "bg-gray-400", accentRing: "ring-gray-400/20" },
  { key: "IN_PROGRESS", label: "In Progress",  dot: "bg-blue-400",    glowColor: "hover:shadow-blue-500/5 dark:hover:shadow-blue-400/10", accentBar: "bg-blue-400", accentRing: "ring-blue-400/20" },
  { key: "REVIEW",     label: "Review",      dot: "bg-yellow-400",  glowColor: "hover:shadow-yellow-500/5 dark:hover:shadow-yellow-400/10", accentBar: "bg-yellow-400", accentRing: "ring-yellow-400/20" },
  { key: "APPROVAL",   label: "Approval",    dot: "bg-orange-400",  glowColor: "hover:shadow-orange-500/5 dark:hover:shadow-orange-400/10", accentBar: "bg-orange-400", accentRing: "ring-orange-400/20" },
  { key: "DEPLOYED",   label: "Deployed",    dot: "bg-green-400",   glowColor: "hover:shadow-green-500/5 dark:hover:shadow-green-400/10", accentBar: "bg-green-400", accentRing: "ring-green-400/20" },
  { key: "COMPLETED",  label: "Completed",   dot: "bg-emerald-400", glowColor: "hover:shadow-emerald-500/5 dark:hover:shadow-emerald-400/10", accentBar: "bg-emerald-400", accentRing: "ring-emerald-400/20" },
] as const;

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

function getProgressColor(progress: number) {
  if (progress < 30) return "[&>div]:bg-red-500 [&>div]:shadow-red-500/30";
  if (progress < 70) return "[&>div]:bg-amber-500 [&>div]:shadow-amber-500/30";
  return "[&>div]:bg-emerald-500 [&>div]:shadow-emerald-500/30";
}

// ━━ Kanban Project Card (visual only — used in both sortable cards and DragOverlay) ━━
function KanbanProjectCard({
  project,
  onClick,
  isAdminUser,
  onEdit,
  onDelete,
  isDragging,
  onHover,
}: {
  project: Record<string, unknown>;
  onClick: () => void;
  isAdminUser: boolean;
  onEdit?: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete?: (projectId: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
  onHover?: () => void;
}) {
  const client = project.client as Record<string, unknown> | undefined;
  const pName = safeText(project.name, "Untitled");
  const pStatus = safeText(project.status, "");
  const pClientName = client ? safeText(client.name, "Client") : "Client";
  const pProgress = safeNumber(project.progress);
  const pDeadline = project.deadline as string | null | undefined;

  return (
    <div
      className={cn(
        "group/card relative rounded-xl border-l-[3px] p-3.5 cursor-pointer transition-all duration-200",
        "bg-white/70 dark:bg-white/[0.05] backdrop-blur-sm",
        "border border-gray-200/60 dark:border-gray-700/40 border-l-gray-300 dark:border-l-gray-600",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/20",
        !isDragging && "hover:-translate-y-0.5 hover:scale-[1.01]",
        isDragging && "shadow-xl shadow-black/10 dark:shadow-black/40 ring-2 ring-primary/20 scale-105",
        pStatus === "IN_PROGRESS" && "border-l-blue-400 dark:border-l-blue-500",
        pStatus === "REVIEW" && "border-l-yellow-400 dark:border-l-yellow-500",
        pStatus === "APPROVAL" && "border-l-orange-400 dark:border-l-orange-500",
        pStatus === "DEPLOYED" && "border-l-green-400 dark:border-l-green-500",
        pStatus === "COMPLETED" && "border-l-emerald-400 dark:border-l-emerald-500",
        pStatus === "PLANNING" && "border-l-gray-400 dark:border-l-gray-500",
      )}
      onClick={onClick}
      onMouseEnter={onHover}
      style={isDragging ? { pointerEvents: "none" as const } : undefined}
    >
      {/* Admin: 3-dot menu — absolutely positioned to prevent overflow */}
      {isAdminUser && onEdit && onDelete && !isDragging && (
        <div
          className="absolute top-2.5 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover/card:opacity-100 focus:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e) => onEdit(project, e)} className="gap-2 cursor-pointer">
                <Pencil className="h-3.5 w-3.5" /> Edit Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => onDelete(safeText(project.id, ""), e)} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Project Title + Status Dot */}
      <div className="flex items-start gap-2.5 pr-7">
        <span className={cn("h-2 w-2 rounded-full shrink-0 mt-1.5 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", statusDotColors[pStatus] || "bg-gray-400", statusDotColors[pStatus] && statusDotColors[pStatus].replace("bg-", "ring-"))} />
        <div className="flex-1 min-w-0">
          <h4
            className="text-sm font-semibold leading-snug line-clamp-2"
            title={pName}
          >
            {pName}
          </h4>
        </div>
      </div>

      {/* Status Badge + Client Name */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <Badge className={`text-[10px] px-1.5 py-0 leading-4 font-medium ${statusColors[pStatus] || ""}`}>
          {pStatus.replace("_", " ")}
        </Badge>
        <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
          {pClientName}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-muted-foreground">Progress</span>
          <span className={cn("font-bold tabular-nums", pProgress < 30 ? "text-red-600 dark:text-red-400" : pProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{pProgress}%</span>
        </div>
        <Progress value={pProgress} className={cn("h-1.5 rounded-full shadow-sm", getProgressColor(pProgress))} />
      </div>

      {/* Deadline */}
      {pDeadline && (
        <p className="text-[11px] text-muted-foreground/70 mt-2.5 flex items-center gap-1">
          <span className="font-medium text-muted-foreground">Deadline:</span>
          {safeDate(pDeadline, "No date")}
        </p>
      )}

      {/* View Action */}
      <div className="mt-3 pt-2.5 border-t border-gray-200/30 dark:border-gray-700/30">
        <span className="text-xs font-semibold text-primary/60 group-hover/card:text-primary transition-all duration-200 inline-flex items-center gap-1 group-hover/card:gap-2">
          View <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/card:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

// ━━ SortableProjectCard — wraps KanbanProjectCard with useSortable ━━
function SortableProjectCard({
  project,
  onCardClick,
  isAdminUser,
  onEdit,
  onDelete,
  onHover,
}: {
  project: Record<string, unknown>;
  onCardClick: () => void;
  isAdminUser: boolean;
  onEdit: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete: (projectId: string, e: React.MouseEvent) => void;
  onHover?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: safeText(project.id, ""),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanProjectCard
        project={project}
        onClick={onCardClick}
        isAdminUser={isAdminUser}
        onEdit={onEdit}
        onDelete={onDelete}
        isDragging={false}
        onHover={onHover}
      />
    </div>
  );
}

// ━━ DroppableKanbanColumn — wraps column card list with useDroppable + SortableContext ━━
function DroppableKanbanColumn({
  col,
  projects,
  isAdminUser,
  onCardClick,
  onEdit,
  onDelete,
  isDimmed,
  activeId,
  onHover,
}: {
  col: typeof KANBAN_COLUMNS[number];
  projects: Record<string, unknown>[];
  isAdminUser: boolean;
  onCardClick: (project: Record<string, unknown>) => void;
  onEdit: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete: (projectId: string, e: React.MouseEvent) => void;
  isDimmed: boolean;
  activeId: string | null;
  onHover?: (pid: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div
      className={cn(
        "flex-shrink-0 w-[300px] rounded-xl border transition-all duration-300 snap-start relative overflow-hidden",
        "bg-gradient-to-b from-white/80 to-white/50 dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl",
        "border-gray-200/80 dark:border-gray-700/50",
        "hover:border-gray-300 dark:hover:border-gray-600",
        col.glowColor,
        isDimmed && "opacity-40 pointer-events-none",
        isOver && !isDimmed && `ring-2 ${col.accentRing} border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08] shadow-lg`
      )}
      style={{ minHeight: "calc(100vh - 300px)" }}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", col.accentBar, isOver && !isDimmed ? "opacity-100" : "opacity-60")} />

      {/* Column Header */}
      <div className="px-4 py-3.5 border-b border-gray-200/50 dark:border-gray-700/40 pl-5">
        <div className="flex items-center gap-2.5">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", col.dot, col.dot.replace("bg-", "ring-"))} />
          <h3 className="font-bold text-[13px] tracking-tight">{col.label}</h3>
          <Badge
            variant="secondary"
            className="ml-auto h-5 min-w-[22px] px-1.5 text-[10px] font-bold justify-center bg-muted/80"
          >
            {projects.length}
          </Badge>
        </div>
      </div>

      {/* Card List — Droppable zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "p-2.5 space-y-2.5 overflow-y-auto transition-all duration-300 pl-5",
          isOver && !isDimmed && "bg-primary/[0.03] dark:bg-primary/[0.05]"
        )}
        style={{ maxHeight: "calc(100vh - 380px)" }}
      >
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center mb-2">
              <FolderKanban className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="text-[11px] text-muted-foreground/50 font-medium">No projects</p>
          </div>
        )}
        <SortableContext items={projects.map((p) => safeText(p.id, ""))} strategy={verticalListSortingStrategy}>
          {projects.map((project) => {
            const pId = safeText(project.id, "");
            // Don't render the actively dragged card in the list
            if (activeId === pId) return null;
            return (
              <SortableProjectCard
                key={pId}
                project={project}
                onCardClick={() => onCardClick(project)}
                isAdminUser={isAdminUser}
                onEdit={onEdit}
                onDelete={onDelete}
                onHover={() => onHover && onHover(pId)}
              />
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // ━━ React Query — cached fetch with stale-while-revalidate ━━
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      return deepSanitize(raw) as unknown[];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const { data: clientsData = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const projects = projectsData;
  const clients = clientsData;

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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

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
        queryClient.invalidateQueries({ queryKey: ["projects"] });
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
        queryClient.invalidateQueries({ queryKey: ["projects"] });
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
        queryClient.setQueryData(["projects"], (old: unknown[]) =>
          (old || []).filter((p: any) => p.id !== deleteId)
        );
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

  // ━━ Prefetch project detail data on hover (Task 2: fast navigation) ━━
  const handlePrefetchProject = useCallback((pid: string) => {
    if (!pid) return;
    queryClient.prefetchQuery({
      queryKey: ["project", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects?projectId=${pid}`, { credentials: "include" });
        if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
        if (!res.ok) throw new Error("Failed to load project");
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) return raw[0];
        if (raw && typeof raw === "object" && raw.id) return raw;
        return null;
      },
      staleTime: 30 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ["project-tasks", pid],
      queryFn: async () => {
        const res = await fetch(`/api/tasks?projectId=${pid}`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load tasks");
        const td = await res.json();
        return Array.isArray(td) ? td : (Array.isArray(td?.data) ? td.data : []);
      },
      staleTime: 30 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ["project-members", pid],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${pid}/members`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load members");
        const md = await res.json();
        return Array.isArray(md) ? md : (Array.isArray(md?.data) ? md.data : []);
      },
      staleTime: 30 * 1000,
    });
  }, [queryClient]);

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

  // ━━ DnD handlers ━━
  const handleDragStart = (event: DragStartEvent) => {
    if (updating) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const newStatus = over.id as string;

    if (!VALID_STATUSES.includes(newStatus)) return;

    const project = (projects as Record<string, unknown>[]).find((p) => safeText(p.id, "") === projectId);
    if (!project) return;

    const currentStatus = safeText(project.status, "");
    if (currentStatus === newStatus) return;

    // Store previous state for rollback
    const prevProjects = projects;

    // Optimistic update
    setUpdating(true);
    queryClient.setQueryData(["projects"], (old: unknown[]) =>
      (old || []).map((p) =>
        safeText((p as Record<string, unknown>).id, "") === projectId
          ? { ...(p as Record<string, unknown>), status: newStatus }
          : p
      )
    );

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: projectId, status: newStatus }),
      });
      if (handle401(res)) {
        queryClient.setQueryData(["projects"], prevProjects);
        return;
      }
      if (!res.ok) {
        queryClient.setQueryData(["projects"], prevProjects);
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error || "Failed to move project");
      } else {
        toast.success(`Project moved to ${newStatus.replace("_", " ")}`);
      }
    } catch {
      queryClient.setQueryData(["projects"], prevProjects);
      toast.error("Failed to move project");
    } finally {
      setUpdating(false);
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

  // ━━ Group filtered projects into Kanban columns ━━
  const kanbanColumns = KANBAN_COLUMNS.map((col) => ({
    ...col,
    projects: (filtered as Record<string, unknown>[]).filter(
      (p) => safeText(p.status, "") === col.key
    ),
  }));

  // ━━ Stats computation (reuse projects directly — was duplicate 'allProjects' variable) ━━
  const totalProjects = projects.length;
  const inProgressCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "IN_PROGRESS").length;
  const completedCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "COMPLETED").length;

  // ━━ Loading skeleton (Kanban-style) ━━
  if (sessionStatus === "loading" || projectsLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        {/* Stats bar skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-3 bg-gradient-to-br from-muted/50 to-muted/20">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-8" />
            </div>
          ))}
        </div>
        <Skeleton className="h-9 w-72" />
        <div className="flex gap-4 overflow-hidden">
          {KANBAN_COLUMNS.slice(0, 4).map((col) => (
            <div key={col.key} className="flex-shrink-0 w-[300px] space-y-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-lg animate-pulse" />
              <Skeleton className="h-36 w-full rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ━━━━ Header ━━━━ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <LayoutGrid className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text">Projects</h1>
          </div>
          <p className="text-muted-foreground/70 text-sm mt-1 ml-[46px]">Manage your web development projects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/dashboard/projects/todos")}
          >
            <ClipboardCheck className="h-3.5 w-3.5" /> My Todos
          </Button>
          {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 relative overflow-hidden bg-gradient-to-r from-primary to-primary/90 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]">
                <span className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary opacity-0 hover:opacity-100 transition-opacity" />
                <Plus className="h-4 w-4 relative z-10" /> <span className="relative z-10">New Project</span>
              </Button>
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
      </div>

      {/* ━━━━ Stats Bar ━━━━ */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-slate-100/50 dark:from-slate-900/40 dark:to-slate-800/20 p-3.5 transition-all hover:shadow-md hover:shadow-black/[0.04] dark:hover:shadow-black/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <FolderKanban className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-2xl font-bold tracking-tight">{totalProjects}</p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-blue-50/80 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 p-3.5 transition-all hover:shadow-md hover:shadow-blue-500/[0.06] dark:hover:shadow-blue-500/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-300">{inProgressCount}</p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50/80 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 p-3.5 transition-all hover:shadow-md hover:shadow-emerald-500/[0.06] dark:hover:shadow-emerald-500/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{completedCount}</p>
        </div>
      </div>

      {/* ━━━━ Search & Status Filters ━━━━ */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64 bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50 focus:bg-white dark:focus:bg-white/[0.06] transition-all"
            aria-label="Search projects"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["ALL", "PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => {
            const isActive = filter === s;
            const dotColor = s === "ALL" ? "bg-gray-400" : statusDotColors[s] || "bg-gray-400";
            return (
              <Button
                key={s}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs transition-all duration-200 gap-1.5",
                  isActive ? "shadow-md shadow-primary/20" : "hover:bg-muted/80 border-gray-200/80 dark:border-gray-700/50",
                )}
                onClick={() => setFilter(s)}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
                {s === "ALL" ? "All" : s.replace("_", " ")}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ━━━━ Kanban Board ━━━━ */}
      {filtered.length === 0 ? (
        <div className="text-center py-24">
          <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-5">
            <FolderKanban className="h-10 w-10 text-primary/40" />
          </div>
          <p className="text-xl font-bold text-foreground/80">
            {projects.length === 0 ? "No projects yet" : "No projects match your search"}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm mx-auto">
            {projects.length === 0 ? "Get started by creating your first project" : "Try adjusting your search or filter criteria"}
          </p>
          {projects.length === 0 && isAdminUser && (
            <Button variant="outline" className="mt-6 gap-2 shadow-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory">
            {kanbanColumns.map((col) => {
              const isDimmed = filter !== "ALL" && filter !== col.key;
              return (
                <DroppableKanbanColumn
                  key={col.key}
                  col={col}
                  projects={col.projects}
                  isAdminUser={isAdminUser}
                  onCardClick={(project) => {
                    const pId = safeText(project.id, "");
                    router.push(`/dashboard/projects/${pId}`);
                  }}
                  onEdit={openEditDialog}
                  onDelete={openDeleteDialog}
                  isDimmed={isDimmed}
                  activeId={activeId}
                  onHover={handlePrefetchProject}
                />
              );
            })}
          </div>
          {/* DragOverlay — visual floating card during drag */}
          <DragOverlay dropAnimation={null}>
            {activeId ? (() => {
              const project = (filtered as Record<string, unknown>[]).find(
                (p) => safeText(p.id, "") === activeId
              );
              return project ? (
                <KanbanProjectCard
                  project={project}
                  onClick={() => {}}
                  isAdminUser={false}
                  isDragging={true}
                />
              ) : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ━━━━ Edit Project Dialog with Tabs ━━━━ */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details, attachments, and credentials.</DialogDescription></DialogHeader>
          {editProject && (
            <Tabs defaultValue="details">
              <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
                <TabsTrigger value="details" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all">
                  <Pencil className="h-3 w-3" /> Details
                </TabsTrigger>
                <TabsTrigger value="attachments" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all">
                  <Paperclip className="h-3 w-3" /> Attachments
                </TabsTrigger>
                <TabsTrigger value="credentials" className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all">
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
                              <span className="mx-1">&bull;</span>
                              <span>Password: <span className="font-mono text-foreground">{showPasswords[cred.id] ? cred.password : "&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"}</span></span>
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

      {/* ━━━━ Delete Project Confirmation ━━━━ */}
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

      {/* ━━━━ Credential Delete Confirmation (replaces native confirm()) ━━━━ */}
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
