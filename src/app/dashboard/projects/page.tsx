"use client";

import { useState, useCallback, useMemo, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, FolderKanban, Pencil, Trash2,
  X, Activity, CheckCircle2,
  ArrowUpDown, CircleDot,
} from "lucide-react";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn, safeText, deepSanitize, safeNumber, safeDate } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import {
  WorkPriorityBadge,
  compareProjectsByWorkPriority,
} from "@/components/dashboard/projects/work-priority-badge";

// TODO: Make configurable per project/client
const CURRENCY_SYMBOL = "₹";

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

// Column display order: IN_PROGRESS first, PLANNING middle, COMPLETED last
const COLUMN_DISPLAY_ORDER: Record<string, number> = {
  IN_PROGRESS: 0,
  REVIEW: 1,
  APPROVAL: 2,
  DEPLOYED: 3,
  PLANNING: 4,
  COMPLETED: 5,
};


function getProgressColor(progress: number) {
  if (progress < 30) return "[&>div]:bg-red-500 [&>div]:shadow-red-500/30";
  if (progress < 70) return "[&>div]:bg-amber-500 [&>div]:shadow-amber-500/30";
  return "[&>div]:bg-emerald-500 [&>div]:shadow-emerald-500/30";
}

// ━━ List View Row ━━
function ListViewRow({
  project,
  isAdminUser,
  onView,
  onEdit,
  onDelete,
}: {
  project: Record<string, unknown>;
  isAdminUser: boolean;
  onView: () => void;
  onEdit?: (project: Record<string, unknown>, e: React.MouseEvent) => void;
  onDelete?: (projectId: string, e: React.MouseEvent) => void;
}) {
  const client = project.client as Record<string, unknown> | undefined;
  const pName = safeText(project.name, "Untitled");
  const pStatus = safeText(project.status, "");
  const pClientName = client ? safeText(client.name, "Client") : "Client";
  const pProgress = safeNumber(project.progress);
  const pDeadline = project.deadline as string | null | undefined;
  const hasOpenAssigned = project.hasOpenAssignedMilestones === true;
  const workPriority =
    typeof project.workPriority === "number" ? project.workPriority : null;

  return (
    <div
      className={cn(
        "group/row flex items-center gap-4 p-3 rounded-lg border transition-all duration-150",
        "bg-white/70 dark:bg-white/[0.04] backdrop-blur-sm",
        "border-gray-200/60 dark:border-gray-700/40",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:bg-white/90 dark:hover:bg-white/[0.07]",
        "hover:shadow-sm cursor-pointer",
      )}
      onClick={onView}
    >
      {/* Status dot + Name */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", statusDotColors[pStatus] || "bg-gray-400", statusDotColors[pStatus] && statusDotColors[pStatus].replace("bg-", "ring-"))} />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate inline-flex items-center gap-1.5 max-w-full" title={hasOpenAssigned ? `${pName} — you have open milestones` : pName}>
            <span className="truncate">{pName}</span>
            {hasOpenAssigned && (
              <span className="relative inline-flex h-2 w-2 shrink-0" title="You have open milestones on this project">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
            )}
            <WorkPriorityBadge priority={workPriority} />
          </h4>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="text-[11px] text-muted-foreground">{pClientName}</span>
            {Array.isArray(project.methods) && (project.methods as Array<{name: string}>).length > 0 && (
              <span className="flex items-center gap-0.5">
                {(project.methods as Array<{name: string}>).map((m, i) => (
                  <Badge key={i} className="text-[9px] px-1.5 py-0 leading-3 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40">
                    {m.name}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Badge className={`text-[10px] px-2 py-0.5 font-medium ${statusColors[pStatus] || ""}`}>
          {pStatus.replace("_", " ")}
        </Badge>
        {/* Task 7 (Phase 4): per-card DEMO badge removed — demos no longer
            surface in the main projects list. The demo view shows a single
            header-level DEMO badge instead. */}
      </div>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-2 min-w-[140px] shrink-0">
        <Progress value={pProgress} className={cn("h-1.5 rounded-full flex-1", getProgressColor(pProgress))} />
        <span className={cn("text-[11px] font-bold tabular-nums w-8 text-right", pProgress < 30 ? "text-red-600 dark:text-red-400" : pProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
          {pProgress}%
        </span>
      </div>

      {/* Deadline */}
      <div className="hidden lg:block shrink-0 min-w-[90px]">
        {pDeadline ? (
          <p className="text-[12px] text-muted-foreground">{safeDate(pDeadline, "No date")}</p>
        ) : (
          <p className="text-[12px] text-muted-foreground/50">—</p>
        )}
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="sm" className="h-7 w-7" onClick={onView} title="View" aria-label="View project">
          <ArrowUpDown className="h-3.5 w-3.5" />
        </Button>
        {isAdminUser && onEdit && onDelete && (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7" onClick={(e) => onEdit(project, e)} title="Edit" aria-label="Edit project">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={(e) => onDelete(safeText(project.id, ""), e)} title="Delete" aria-label="Delete project">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ━━ Searchable Client Select (Combobox) ━━
// Shows "No Client" option + 10 most recent clients by default.
// Typing in the search box filters the full client list.
function ClientSearchSelect({
  name,
  defaultValue,
  clients,
  required = false,
}: {
  name: string;
  defaultValue?: string;
  clients: Array<{ id: string; name: string; company?: string }>;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue || "");
  const ref = useRef<HTMLDivElement>(null);

  // Sync when parent prefills from ?clientId=
  useEffect(() => {
    if (defaultValue !== undefined) setSelectedId(defaultValue || "");
  }, [defaultValue]);

  // Display name for currently selected client
  const selectedClient = selectedId
    ? clients.find((c) => c.id === selectedId)
    : null;
  const displayValue = selectedClient
    ? selectedClient.company || selectedClient.name
    : selectedId === "__none__"
      ? "No Client (Internal)"
      : "";

  // Filter: "No Client" always shows first, then 10 recent by default, or search results
  const filtered = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return clients.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q))
      );
    }
    // Default: show 10 most recent
    return clients.slice(0, 10);
  }, [clients, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Hidden input to store the value for form submission */}
      <input type="hidden" name={name} value={selectedId} />

      {/* Trigger button — shows selected value or placeholder */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border px-3 py-2 text-sm bg-background transition-colors",
          "hover:bg-accent hover:border-accent-foreground/20",
          open && "ring-2 ring-ring",
          !selectedId && "text-muted-foreground"
        )}
      >
        <span className="truncate">{displayValue || "Select client..."}</span>
        <Search className="h-3.5 w-3.5 shrink-0 ml-2 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-[240px] overflow-hidden">
          {/* Search input */}
          <div className="p-1.5 border-b">
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 rounded border bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-[170px] p-1">
            {/* "No Client" option */}
            <button
              type="button"
              className={cn(
                "w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors",
                selectedId === "__none__"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-accent"
              )}
              onClick={() => {
                setSelectedId("__none__");
                setOpen(false);
                setSearch("");
              }}
            >
              <span className="text-muted-foreground italic">No Client (Internal)</span>
            </button>

            {filtered.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground text-center">
                {search ? "No clients found" : "No clients registered"}
              </p>
            )}

            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors",
                  selectedId === c.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-accent"
                )}
                onClick={() => {
                  setSelectedId(c.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="font-medium">{c.company || c.name}</span>
                {c.company && c.name !== c.company && (
                  <span className="text-muted-foreground ml-1.5 text-xs">({c.name})</span>
                )}
              </button>
            ))}

            {!search && clients.length > 10 && (
              <p className="px-2.5 py-1.5 text-[10px] text-muted-foreground text-center border-t mt-1">
                Showing 10 recent — type to search all {clients.length} clients
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ━━ Helper: Calculate and format period between two dates ━━
function calcProjectPeriod(startDate: string, deadline: string): string | null {
  if (!startDate || !deadline) return null;
  const start = new Date(startDate);
  const end = new Date(deadline);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return "Start date is after deadline";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "Same day";
  const months = Math.floor(days / 30);
  const remainDays = days % 30;
  if (months > 0 && remainDays > 0) return `${months}m ${remainDays}d (${days} days)`;
  if (months > 0) return `${months}m (${days} days)`;
  return `${days} days`;
}

// ━━ Create Project Form with Start Date + Total Period ━━
function CreateProjectForm({ onSubmit, clients, defaultClientId }: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  clients: { id: string; name: string; company?: string }[];
  defaultClientId?: string;
}) {
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const period = useMemo(() => calcProjectPeriod(startDate, deadline), [startDate, deadline]);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Project Name *</Label>
        <Input name="name" required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Textarea name="description" rows={2} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Client</Label>
        <ClientSearchSelect name="clientId" clients={clients} defaultValue={defaultClientId} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input name="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Deadline</Label>
          <Input name="deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      </div>
      {period && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Total Period: {period}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Budget ({CURRENCY_SYMBOL})</Label>
          <Input name="budget" type="number" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Live URL</Label>
          <Input name="liveUrl" type="text" inputMode="url" placeholder="https://example.com" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Work priority <span className="text-muted-foreground/60 font-normal">(1 = clock in first; blank = none)</span>
        </Label>
        <Input name="workPriority" type="number" min={1} max={99} placeholder="e.g. 1" />
      </div>
      <Button type="submit" className="w-full">Create Project</Button>
    </form>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading projects…</div>}>
      <ProjectsBoard />
    </Suspense>
  );
}

// ━━ Projects list — shared by /dashboard/projects and /dashboard/demo ━━
// Shared list implementation used by both /dashboard/projects (isDemoView=false)
// and /dashboard/demo (isDemoView=true). Demo view filters to isDemo projects,
// shows a DEMO badge in the header, and defaults new projects to isDemo=true.
export function ProjectsBoard({ isDemoView = false }: { isDemoView?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [prefillClientId, setPrefillClientId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useUrlState("status", "ALL");
  const [search, setSearch] = useState("");

  // ━━ React Query — cached fetch with stale-while-revalidate ━━
  // Query key includes isDemoView so the two views maintain independent caches;
  // mutations invalidate with the root ["projects"] key to refresh both.
  const projectsQueryKey = useMemo(
    () => ["projects", { demo: isDemoView }] as const,
    [isDemoView]
  );
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery({
    queryKey: projectsQueryKey,
    queryFn: async () => {
      // Task 7 (Phase 4): main projects page excludes demo projects — they
      // live exclusively on /dashboard/demo. Explicit ?isDemo=false mirrors
      // the new API default and keeps the intent obvious at the call site.
      const url = isDemoView ? "/api/projects?isDemo=true" : "/api/projects?isDemo=false";
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load projects");
      const data = await res.json();
      const raw = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      return deepSanitize(raw) as unknown[];
    },
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
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
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const projects = projectsData;
  const clients = clientsData;

  // PROJECT_MANAGER has the same project-management capabilities as ADMIN
  // per requirements ("Projects: ✅ Full (like admin) — Can manage all projects").
  const isAdminUser = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN" || session?.user?.role === "PROJECT_MANAGER";

  // Deep-link from Clients: /dashboard/projects?clientId=xxx → open create with client prefilled
  useEffect(() => {
    if (!isAdminUser || isDemoView) return;
    const clientId = searchParams.get("clientId");
    if (!clientId) return;
    setPrefillClientId(clientId);
    setAddOpen(true);
    // Clear query so refresh doesn't re-open forever
    router.replace("/dashboard/projects", { scroll: false });
  }, [isAdminUser, isDemoView, searchParams, router]);

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const rawClientId = String(form.get("clientId") || "").trim();
    // "No Client" / empty → null so API persists without a client
    const clientId = !rawClientId || rawClientId === "__none__" ? null : rawClientId;

    const rawPriority = String(form.get("workPriority") || "").trim();
    const parsedPriority = rawPriority ? parseInt(rawPriority, 10) : NaN;
    const data = {
      name: form.get("name") as string,
      description: (form.get("description") as string) || undefined,
      clientId,
      budget: form.get("budget") ? parseFloat(form.get("budget") as string) || null : null,
      startDate: (form.get("startDate") as string) || null,
      deadline: (form.get("deadline") as string) || null,
      workPriority: Number.isInteger(parsedPriority) && parsedPriority >= 1 ? parsedPriority : null,
      // Demo view: new projects default to isDemo=true so they appear on /dashboard/demo
      ...(isDemoView ? { isDemo: true } : {}),
    };
    const liveUrl = (form.get("liveUrl") as string)?.trim();

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const newProject = await res.json().catch(() => null);
        const newProjectId = newProject?.id;
        // If live URL was provided, create a website entry
        if (liveUrl && newProjectId) {
          try {
            await fetch(`/api/projects/${newProjectId}/websites`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ url: liveUrl, label: "Production", isPrimary: true }),
            });
          } catch {
            // silently fail — project was created
          }
        }
        toast.success("Project created");
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    }
  };

  const handleEditProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editProject) return;

    const form = new FormData(e.currentTarget);
    const nextIsDemo = form.get("isDemo") === "on";
    const wasDemo = editProject.isDemo === true;
    // Confirm before moving a demo project back to the main Projects list
    if (wasDemo && !nextIsDemo) {
      const ok = window.confirm(
        "Remove Demo flag? This project will leave Demo Projects and appear on the main Projects list."
      );
      if (!ok) return;
    }
    const rawPriority = String(form.get("workPriority") || "").trim();
    const parsedPriority = rawPriority ? parseInt(rawPriority, 10) : NaN;
    const data: Record<string, unknown> = {
      id: editProject.id,
      name: form.get("name") as string,
      description: form.get("description") as string || null,
      status: form.get("status") as string,
      clientId: (form.get("clientId") as string === "__none__" ? null : form.get("clientId") as string) || null,
      budget: parseFloat(form.get("budget") as string) || null,
      startDate: form.get("startDate") as string || null,
      deadline: form.get("deadline") as string || null,
      progress: parseInt(form.get("progress") as string) || 0,
      isDemo: nextIsDemo,
      workPriority: Number.isInteger(parsedPriority) && parsedPriority >= 1 ? parsedPriority : null,
    };
    const liveUrl = (form.get("liveUrl") as string)?.trim();

    try {
      const res = await fetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        // Update website if live URL changed
        const projectWebsites = (editProject.websites as Record<string, unknown>[] | undefined) || [];
        const primaryWebsite = projectWebsites.find((w) => w.isPrimary === true || w.isPrimary === "true") || projectWebsites[0];
        const currentUrl = primaryWebsite ? safeText(primaryWebsite.url, "") : "";
        const primaryId = primaryWebsite ? safeText(primaryWebsite.id, "") : "";

        if (liveUrl && liveUrl !== currentUrl) {
          // Update existing primary website or create new
          if (primaryId) {
            try {
              await fetch(`/api/projects/${editProject.id}/websites`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: primaryId, url: liveUrl, isPrimary: true }),
              });
            } catch { /* silent */ }
          } else {
            try {
              await fetch(`/api/projects/${editProject.id}/websites`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ url: liveUrl, label: "Production", isPrimary: true }),
              });
            } catch { /* silent */ }
          }
        } else if (!liveUrl && currentUrl && primaryId) {
          // URL was cleared — remove the website
          try {
            await fetch(`/api/projects/${editProject.id}/websites?id=${primaryId}`, {
              method: "DELETE",
              credentials: "include",
            });
          } catch { /* silent */ }
        }

        toast.success("Project updated");
        setEditOpen(false);
        setEditProject(null);
        queryClient.invalidateQueries({ queryKey: ["projects"] });
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to update project");
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
        queryClient.setQueryData(projectsQueryKey, (old: unknown[]) =>
          (old || []).filter((p: any) => p.id !== deleteId)
        );
      } else {
        if (handle401(res)) return;
        const errData = await res.json().catch(() => null);
        toast.error((errData as Record<string, string>)?.error?.slice(0, 100) || "Failed to delete project");
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

  const filtered = (projects as Record<string, unknown>[])
    .filter((p) => {
      const pName = safeText(p.name, "");
      const pStatus = safeText(p.status, "");
      const pClient = p.client as Record<string, unknown> | undefined;
      const pClientName = pClient ? safeText(pClient.name, "") : "";
      const matchesFilter = filter === "ALL" || pStatus === filter;
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || pName.toLowerCase().includes(searchLower) || pClientName.toLowerCase().includes(searchLower) || pStatus.toLowerCase().includes(searchLower);
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) =>
      compareProjectsByWorkPriority(
        {
          workPriority: typeof a.workPriority === "number" ? a.workPriority : null,
          name: safeText(a.name, ""),
        },
        {
          workPriority: typeof b.workPriority === "number" ? b.workPriority : null,
          name: safeText(b.name, ""),
        }
      )
    );

  // ━━ Stats computation ━━
  const totalProjects = projects.length;
  const inProgressCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "IN_PROGRESS").length;
  const reviewCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "REVIEW").length;
  const completedCount = (projects as Record<string, unknown>[]).filter(p => safeText(p.status, "") === "COMPLETED").length;

  // ━━ Loading skeleton ━━
  if (sessionStatus === "loading" || projectsLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        {/* Stats bar skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-2.5 sm:p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        {/* Filter skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        {/* List row skeletons */}
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ━━━━ Header ━━━━ */}
      <div className="flex items-center justify-between flex-wrap gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
            <FolderKanban className="h-4.5 w-4.5 text-primary" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            {isDemoView ? "Demo Projects" : "Projects"}
          </h1>
          {isDemoView && (
            <Badge className="ml-1 text-[10px] font-bold tracking-wider px-2 py-0.5 border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 shadow-sm" title="Demo projects are full-fledged projects used for walkthroughs and demos">
              DEMO
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {/* Inline Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-48 h-8 text-sm bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50 focus:bg-white dark:focus:bg-white/[0.06] transition-all"
              aria-label="Search projects"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {/* New Project */}
          {isAdminUser && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-primary shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02]">
                <Plus className="h-3.5 w-3.5" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  {isDemoView
                    ? "Creating in Demo Projects — this project will appear on the Demo Projects page."
                    : "Create a new web development project for your client."}
                </DialogDescription>
              </DialogHeader>
              <CreateProjectForm
                onSubmit={handleCreateProject}
                clients={clients as { id: string; name: string; company?: string }[]}
                defaultClientId={prefillClientId || undefined}
              />
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* ━━━━ Stats Bar — Glassmorphism, 4 stats ━━━━ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-xl font-bold tracking-tight">{totalProjects}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-blue-200/40 dark:border-blue-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{inProgressCount}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-yellow-200/40 dark:border-yellow-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <CircleDot className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Review</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-yellow-600 dark:text-yellow-400">{reviewCount}</p>
        </div>
        <div className="rounded-xl p-2.5 sm:p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-emerald-200/40 dark:border-emerald-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{completedCount}</p>
        </div>
      </div>

      {/* ━━━━ Filter Bar — Horizontal scrollable pills ━━━━ */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {["ALL", "PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"].map((s) => {
          const isActive = filter === s;
          const dotColor = s === "ALL" ? "bg-gray-400" : statusDotColors[s] || "bg-gray-400";
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50 text-muted-foreground hover:bg-white dark:hover:bg-white/[0.07] hover:text-foreground"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-primary-foreground/80" : dotColor)} />
              {s === "ALL" ? "All" : s.replace("_", " ")}
            </button>
          );
        })}
      </div>

      {/* ━━━━ Main Content Area ━━━━ */}
      {filtered.length === 0 ? (
        <div className="text-center py-24">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
            <FolderKanban className="h-8 w-8 text-primary/40" />
          </div>
          <p className="text-lg font-bold text-foreground/80">
            {projects.length === 0
              ? (isDemoView ? "No demo projects yet" : "No projects yet")
              : "No projects match your search"}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-sm mx-auto">
            {projects.length === 0
              ? (isDemoView ? "Create a demo project to showcase walkthroughs and examples" : "Get started by creating your first project")
              : "Try adjusting your search or filter criteria"}
          </p>
          {projects.length === 0 && isAdminUser && (
            <Button variant="outline" className="mt-5 gap-2 shadow-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> {isDemoView ? "Create your first demo project" : "Create your first project"}
            </Button>
          )}
        </div>
      ) : (
        /* ━━ List View ━━ */
        <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
          {[...(filtered as Record<string, unknown>[])].sort((a, b) => {
            const orderA = COLUMN_DISPLAY_ORDER[safeText(a.status, "")] ?? 99;
            const orderB = COLUMN_DISPLAY_ORDER[safeText(b.status, "")] ?? 99;
            return orderA - orderB;
          }).map((project) => {
            const pId = safeText(project.id, "");
            return (
              <ListViewRow
                key={pId}
                project={project}
                isAdminUser={isAdminUser}
                onView={() => {
                  handlePrefetchProject(pId);
                  router.push(isDemoView ? `/dashboard/demo/${pId}` : `/dashboard/projects/${pId}`);
                }}
                onEdit={isAdminUser ? openEditDialog : undefined}
                onDelete={isAdminUser ? openDeleteDialog : undefined}
              />
            );
          })}
        </div>
      )}

      {/* ━━━━ Edit Project Dialog ━━━━ */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditProject(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update project details.</DialogDescription></DialogHeader>
          {editProject && (
            <div className="rounded-lg bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5" /> Project Information
              </h3>
              <form onSubmit={handleEditProject} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Project Name *</Label>
                  <Input name="name" defaultValue={typeof editProject.name === 'string' ? editProject.name : ''} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea name="description" rows={2} defaultValue={typeof editProject.description === 'string' ? editProject.description : ''} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Client</Label>
                  <ClientSearchSelect
                    name="clientId"
                    defaultValue={typeof editProject.clientId === 'string' ? editProject.clientId : ''}
                    clients={(clients as { id: string; name: string; company?: string }[])}
                  />
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
                <div className="space-y-1">
                  <Label className="text-xs">
                    Work priority <span className="text-muted-foreground/60 font-normal">(1 = clock in first; blank = none)</span>
                  </Label>
                  <Input
                    name="workPriority"
                    type="number"
                    min={1}
                    max={99}
                    placeholder="e.g. 1"
                    defaultValue={typeof editProject.workPriority === "number" ? editProject.workPriority : ""}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Budget ({CURRENCY_SYMBOL}) <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                    <Input name="budget" type="number" step="any" min="0" placeholder="0.00" defaultValue={editProject.budget != null ? Number(editProject.budget) : ''} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Live URL <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                    <Input
                      name="liveUrl"
                      type="url"
                      placeholder="https://example.com"
                      defaultValue={(() => {
                        const ws = (editProject.websites as Record<string, unknown>[] | undefined) || [];
                        const primary = ws.find((w) => w.isPrimary === true || w.isPrimary === "true") || ws[0];
                        return primary ? safeText(primary.url, "") : "";
                      })()}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                    <Input name="startDate" type="date" defaultValue={editProject.startDate ? String(editProject.startDate).slice(0, 10) : ''} id="edit-start-date" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const deadlineInput = document.getElementById("edit-deadline") as HTMLInputElement | null;
                      const sd = e.target.value;
                      const dl = deadlineInput?.value || "";
                      const period = calcProjectPeriod(sd, dl);
                      const el = document.getElementById("edit-period-display");
                      if (el) el.style.display = period ? "" : "none";
                      if (el) el.textContent = period ? `Total Period: ${period}` : "";
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Deadline <span className="text-muted-foreground/60 font-normal">(optional)</span></Label>
                    <Input name="deadline" type="date" defaultValue={editProject.deadline ? String(editProject.deadline).slice(0, 10) : ''} id="edit-deadline" onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const startInput = document.getElementById("edit-start-date") as HTMLInputElement | null;
                      const sd = startInput?.value || "";
                      const dl = e.target.value;
                      const period = calcProjectPeriod(sd, dl);
                      const el = document.getElementById("edit-period-display");
                      if (el) el.style.display = period ? "" : "none";
                      if (el) el.textContent = period ? `Total Period: ${period}` : "";
                    }} />
                  </div>
                </div>
                <div id="edit-period-display" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10" style={{ display: (() => {
                  const sd = editProject.startDate ? String(editProject.startDate).slice(0, 10) : '';
                  const dl = editProject.deadline ? String(editProject.deadline).slice(0, 10) : '';
                  return calcProjectPeriod(sd, dl) ? "" : "none";
                })() }}>
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">{(() => {
                    const sd = editProject.startDate ? String(editProject.startDate).slice(0, 10) : '';
                    const dl = editProject.deadline ? String(editProject.deadline).slice(0, 10) : '';
                    const p = calcProjectPeriod(sd, dl);
                    return p ? `Total Period: ${p}` : "";
                  })()}</span>
                </div>
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="edit-is-demo"
                    name="isDemo"
                    defaultChecked={editProject.isDemo === true}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30 cursor-pointer"
                  />
                  <Label htmlFor="edit-is-demo" className="text-xs cursor-pointer select-none">
                    Demo Project <span className="text-muted-foreground font-normal">(shows under Demo Projects)</span>
                  </Label>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setEditOpen(false); setEditProject(null); }}>Cancel</Button>
                  <Button type="submit" className="flex-1">Save Changes</Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ━━━━ Delete Project Confirmation ━━━━ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and ALL related data including tasks, team members, time entries, expenses, and invoices. This action cannot be undone.
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
