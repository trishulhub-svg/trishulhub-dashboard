"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Bot, User, Clock, Trash2, Users, UserPlus, X, CalendarDays, Tag,
  CheckCircle2, ShieldCheck, Activity, Gauge, CircleDot, FolderKanban,
  ChevronRight, ExternalLink, Settings, Globe, Star, Pencil, Trash2 as Trash2Icon, Loader2,
  Github, Database, Server, Eye, EyeOff, Copy, Save, Key, Link2, FlaskConical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { safeText, safeNumber, safeDate, deepSanitize, cn, extractStr, extractNum, extractNestedStr } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLETPROOF v9: Redesigned layout — compact stats row, glassmorphism,
// removed view tabs (My Tasks link in header), horizontal member chips.
// ALL functionality preserved: handlers, RBAC, safe extractors, caching.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const projectStatusColors: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const VALID_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"];

/** Monday (UTC) of the week containing dateKey YYYY-MM-DD, as YYYY-MM-DD. */
function weekStartKey(dueIso: string): string {
  const d = new Date(dueIso.includes("T") ? dueIso : `${dueIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "none";
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(mondayKey: string, todayKey: string): string {
  if (mondayKey === "none") return "No due date";
  const thisMonday = weekStartKey(todayKey);
  const next = new Date(`${thisMonday}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextMonday = next.toISOString().slice(0, 10);
  if (mondayKey === thisMonday) return "This week";
  if (mondayKey === nextMonday) return "Next week";
  const mon = new Date(`${mondayKey}T00:00:00.000Z`);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const range = `${mon.toLocaleDateString(undefined, opts)} – ${sun.toLocaleDateString(undefined, opts)}`;
  if (mondayKey < thisMonday) return `Earlier · ${range}`;
  return `Week of ${range}`;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  // If viewing a demo project detail (/dashboard/demo/[projectId]), the back
  // button should return to the demo list — not the regular projects list.
  const isDemoDetail = pathname?.includes("/demo/") ?? false;
  const { data: session, status: sessionStatus } = useSession();
  const queryClient = useQueryClient();

  // Safe projectId extraction
  const rawProjectId = params?.projectId;
  const projectId = typeof rawProjectId === "string"
    ? rawProjectId
    : Array.isArray(rawProjectId)
      ? String(rawProjectId[0] ?? "")
      : "";

  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  // PROJECT_MANAGER can manage projects, members, infrastructure, and tokens
  // (same as ADMIN for project-management capabilities).
  const canManageProject = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";

  // Detect if loaded inside floating board iframe — hide back button & reduce padding
  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  const handle401 = useCallback((res: Response) => {
    if (res.status === 401) {
      window.location.href = "/login";
      return true;
    }
    return false;
  }, []);

  // ── State: UI-only state (dialogs, selections) ──
  const [creating, setCreating] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  // Remove member confirmation state
  const [removeMemberUserId, setRemoveMemberUserId] = useState<string | null>(null);
  // Website management dialog state
  const [websiteMgmtOpen, setWebsiteMgmtOpen] = useState(false);
  const [deleteWebsiteId, setDeleteWebsiteId] = useState<string | null>(null);
  const [newWebsiteUrl, setNewWebsiteUrl] = useState("");
  const [newWebsiteLabel, setNewWebsiteLabel] = useState("");
  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null);
  const [editingWebsiteUrl, setEditingWebsiteUrl] = useState("");
  const [editingWebsiteLabel, setEditingWebsiteLabel] = useState("");

  // ── Infrastructure section state ──
  const [infraEditing, setInfraEditing] = useState(false);
  const [infraSaving, setInfraSaving] = useState(false);
  const [infraForm, setInfraForm] = useState({
    githubRepoUrl: "",
    githubBranch: "",
    tursoUrl: "",
    vercelProjectId: "",
    deployUrl: "",
  });
  const [tokenEditOpen, setTokenEditOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState({ githubToken: "", tursoToken: "" });
  const [tokenSaving, setTokenSaving] = useState(false);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDue, setNewMilestoneDue] = useState("");
  const [newMilestoneAssignees, setNewMilestoneAssignees] = useState<string[]>([]);
  const [milestoneSaving, setMilestoneSaving] = useState(false);
  const [milestoneWeekFilter, setMilestoneWeekFilter] = useState<string>("__all__");
  const [editingMilestone, setEditingMilestone] = useState<Record<string, unknown> | null>(null);
  const [editMilestoneTitle, setEditMilestoneTitle] = useState("");
  const [editMilestoneDue, setEditMilestoneDue] = useState("");
  const [editMilestoneAssignees, setEditMilestoneAssignees] = useState<string[]>([]);
  const canManageMilestones = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // ── React Query: Project data with aggressive caching ──
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects?projectId=${projectId}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load project");
      const raw = deepSanitize(await res.json());
      if (Array.isArray(raw) && raw.length > 0) return raw[0] as Record<string, unknown>;
      if (raw && typeof raw === "object" && (raw as Record<string, unknown>).id) return raw as Record<string, unknown>;
      if (Array.isArray((raw as Record<string, unknown>)?.data) && ((raw as Record<string, unknown>).data as unknown[]).length > 0) {
        return ((raw as Record<string, unknown>).data as unknown[])[0] as Record<string, unknown>;
      }
      return null;
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: membersData = [], isLoading: membersLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/members`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load members");
      const md = deepSanitize(await res.json());
      return Array.isArray(md) ? md : (Array.isArray((md as Record<string, unknown>)?.data) ? (md as Record<string, unknown>).data as unknown[] : []);
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Lazy load team users — prefetch on hover/focus so the list is ready
  // by the time the dialog opens. The query is enabled when addMemberOpen
  // is true OR when the user hovers the add-member button (prefetch).
  const [prefetchTeamUsers, setPrefetchTeamUsers] = useState(false);
  const { data: teamUsersData = [] } = useQuery({
    queryKey: ["team-users"],
    queryFn: async () => {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load team users");
      const ud = deepSanitize(await res.json());
      return Array.isArray(ud) ? ud : (Array.isArray((ud as Record<string, unknown>)?.data) ? (ud as Record<string, unknown>).data as unknown[] : []);
    },
    // Enable on: dialog open OR prefetch trigger (hover/focus on add button)
    enabled: !isInIframe && canManageProject && (addMemberOpen || prefetchTeamUsers),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── React Query: Websites — SKIP in iframe (not needed for task board)
  const { data: websitesData = [] } = useQuery({
    queryKey: ["project-websites", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/websites`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return [];
      const raw = deepSanitize(await res.json());
      return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
    },
    enabled: !isInIframe && !!projectId && canManageProject,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ── React Query: Infrastructure ──
  const { data: infraData, isLoading: infraLoading } = useQuery({
    queryKey: ["project-infra", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await fetch(`/api/projects/${projectId}/infra`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return null;
      const raw = deepSanitize(await res.json());
      const infra = (raw as Record<string, unknown>)?.infrastructure as Record<string, unknown> | undefined;
      return infra || null;
    },
    enabled: !!projectId,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: milestonesData = [], refetch: refetchMilestones } = useQuery({
    queryKey: ["project-milestones", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/milestones`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) return [];
      const raw = deepSanitize(await res.json());
      return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
    },
    enabled: !!projectId && !isInIframe,
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
    retry: 1,
  });

  const project = projectData;
  const members = membersData;
  const teamUsers = teamUsersData;
  const websites = websitesData;
  const infrastructure = infraData;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-websites", projectId] });
    queryClient.invalidateQueries({ queryKey: ["project-infra", projectId] });
  };

  // ── Infrastructure handlers ──
  const handleInfraEdit = useCallback(() => {
    setInfraForm({
      githubRepoUrl: extractStr(infrastructure, "githubRepoUrl", ""),
      githubBranch: extractStr(infrastructure, "githubBranch", ""),
      tursoUrl: extractStr(infrastructure, "tursoUrl", ""),
      vercelProjectId: extractStr(infrastructure, "vercelProjectId", ""),
      deployUrl: extractStr(infrastructure, "deployUrl", ""),
    });
    setInfraEditing(true);
  }, [infrastructure]);

  const handleInfraSave = useCallback(async () => {
    setInfraSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/infra`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(infraForm),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save infrastructure");
        return;
      }
      toast.success("Infrastructure updated");
      setInfraEditing(false);
      queryClient.invalidateQueries({ queryKey: ["project-infra", projectId] });
    } catch {
      toast.error("Failed to save infrastructure");
    } finally {
      setInfraSaving(false);
    }
  }, [projectId, infraForm, queryClient]);

  const handleTokenSave = useCallback(async () => {
    setTokenSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/infra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          githubToken: tokenForm.githubToken || null,
          tursoToken: tokenForm.tursoToken || null,
        }),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save tokens");
        return;
      }
      toast.success("Tokens updated");
      setTokenEditOpen(false);
      setTokenForm({ githubToken: "", tursoToken: "" });
      queryClient.invalidateQueries({ queryKey: ["project-infra", projectId] });
      setRevealedTokens({});
    } catch {
      toast.error("Failed to save tokens");
    } finally {
      setTokenSaving(false);
    }
  }, [projectId, tokenForm, queryClient]);

  const handleRevealToken = useCallback(async (kind: "github" | "turso") => {
    setRevealing(kind);
    try {
      const res = await fetch(`/api/projects/${projectId}/infra/tokens/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind }),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `No ${kind} token set`);
        return;
      }
      const data = await res.json();
      setRevealedTokens(prev => ({ ...prev, [kind]: data.token }));
    } catch {
      toast.error("Failed to reveal token");
    } finally {
      setRevealing(null);
    }
  }, [projectId]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard`);
    }).catch(() => {
      toast.error("Failed to copy");
    });
  }, []);

  // ── Website CRUD handlers ──
  const handleAddWebsite = async () => {
    if (!newWebsiteUrl.trim()) { toast.error("URL is required"); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: newWebsiteUrl.trim(),
          label: newWebsiteLabel.trim() || "Production",
          isPrimary: websites.length === 0,
        }),
      });
      if (res.ok) { toast.success("Website added"); setNewWebsiteUrl(""); setNewWebsiteLabel(""); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add website"); }
    } catch { toast.error("Failed to add website"); }
  };

  const handleUpdateWebsite = async (websiteId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, ...updates }),
      });
      if (res.ok) { toast.success("Website updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update website"); }
    } catch { toast.error("Failed to update website"); }
  };

  const handleDeleteWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites?id=${websiteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) { toast.success("Website removed"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to delete website"); }
    } catch { toast.error("Failed to delete website"); }
  };

  const handleSetPrimaryWebsite = async (websiteId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/websites`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: websiteId, isPrimary: true }),
      });
      if (res.ok) { toast.success("Primary website set"); invalidateAll(); }
      else { if (handle401(res)) return; toast.error("Failed to set primary"); }
    } catch { toast.error("Failed to set primary"); }
  };

  const handleAddMember = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ userId, role }) });
      if (res.ok) {
        toast.success("Member added");
        setAddMemberOpen(false);
        // PERF: Only invalidate the members query — not the entire project.
        // invalidateAll() refetches project + members + websites + infra,
        // which causes a visible flash and adds ~1-2s of loading state.
        queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to add member"); }
    } catch { toast.error("Failed to add member"); }
  };

  const handleUpdateProject = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/projects", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ id: projectId, ...updates }) });
      if (res.ok) { toast.success("Project updated"); invalidateAll(); }
      else { if (handle401(res)) return; const d = await res.json(); toast.error(d.error || "Failed to update project"); }
    } catch { toast.error("Failed to update project"); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members?userId=${userId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("Member removed");
        // PERF: Only invalidate members, not the entire project.
        queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      }
      else { if (handle401(res)) return; toast.error("Failed to remove member"); }
    } catch { toast.error("Failed to remove member"); }
  };

  const refreshProgress = useCallback(() => {
    void refetchMilestones();
    queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }, [refetchMilestones, queryClient, projectId]);

  const handleAddMilestone = async () => {
    if (!newMilestoneTitle.trim()) {
      toast.error("Milestone title is required");
      return;
    }
    if (!newMilestoneDue) {
      toast.error("Due date is required");
      return;
    }
    if (newMilestoneAssignees.length === 0) {
      toast.error("Select at least one project member to assign");
      return;
    }
    setMilestoneSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: newMilestoneTitle.trim(),
          dueDate: newMilestoneDue,
          assigneeIds: newMilestoneAssignees,
        }),
      });
      if (res.ok) {
        toast.success("Milestone added — assignees notified");
        setNewMilestoneTitle("");
        setNewMilestoneDue("");
        setNewMilestoneAssignees([]);
        refreshProgress();
      } else {
        if (handle401(res)) return;
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to add milestone");
      }
    } catch {
      toast.error("Failed to add milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const openEditMilestone = (m: Record<string, unknown>) => {
    setEditingMilestone(m);
    setEditMilestoneTitle(extractStr(m, "title", ""));
    const due = extractStr(m, "dueDate", "");
    setEditMilestoneDue(due ? due.slice(0, 10) : "");
    const assignees = Array.isArray(m.assignees)
      ? (m.assignees as Record<string, unknown>[]).map((a) =>
          extractStr(a, "userId", "") || extractNestedStr(a, ["user", "id"], "")
        ).filter(Boolean)
      : [];
    setEditMilestoneAssignees(assignees);
  };

  const handleSaveMilestoneEdit = async () => {
    if (!editingMilestone) return;
    const id = extractStr(editingMilestone, "id", "");
    if (!id || !editMilestoneTitle.trim() || !editMilestoneDue) {
      toast.error("Title and due date are required");
      return;
    }
    if (editMilestoneAssignees.length === 0) {
      toast.error("Select at least one project member to assign");
      return;
    }
    setMilestoneSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id,
          title: editMilestoneTitle.trim(),
          dueDate: editMilestoneDue,
          assigneeIds: editMilestoneAssignees,
        }),
      });
      if (res.ok) {
        toast.success("Milestone updated");
        setEditingMilestone(null);
        refreshProgress();
      } else {
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to update milestone");
      }
    } catch {
      toast.error("Failed to update milestone");
    } finally {
      setMilestoneSaving(false);
    }
  };

  const handleToggleMilestone = async (id: string, done: boolean) => {
    const nextDone = !done;
    // Optimistic UI — progress bar updates instantly
    queryClient.setQueryData(
      ["project-milestones", projectId],
      (old: Record<string, unknown>[] | undefined) =>
        (old ?? []).map((m) =>
          extractStr(m, "id", "") === id ? { ...m, done: nextDone } : m
        )
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, done: nextDone }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.projectProgress === "number") {
          queryClient.setQueryData(
            ["project", projectId],
            (old: Record<string, unknown> | undefined) =>
              old ? { ...old, progress: data.projectProgress } : old
          );
        }
        toast.success(nextDone ? "Milestone marked done — progress updated" : "Milestone reopened");
        refreshProgress();
      } else {
        refreshProgress();
        const d = await res.json().catch(() => null);
        toast.error(d?.error || "Failed to update milestone");
      }
    } catch {
      refreshProgress();
      toast.error("Failed to update milestone");
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Milestone removed");
        refreshProgress();
      } else {
        toast.error("Failed to delete milestone");
      }
    } catch {
      toast.error("Failed to delete milestone");
    }
  };

  const toggleAssignee = (list: string[], setList: (v: string[]) => void, userId: string) => {
    setList(list.includes(userId) ? list.filter((id) => id !== userId) : [...list, userId]);
  };

  // ── Derived values (ALL guaranteed primitives via safe extractors) ──
  const projectName = project ? extractStr(project, "name", "Untitled") : "";
  const projectDesc = project ? extractStr(project, "description", "") : "";
  const projectStatus = project ? extractStr(project, "status", "PLANNING") : "PLANNING";
  // Progress is driven only by milestone completion (not manually editable).
  // No milestones ⇒ always 0% (never fall back to a stale stored Project.progress).
  const milestoneTotal = milestonesData.length;
  const milestoneDone = milestonesData.filter((m) => m.done === true).length;
  const projectProgress =
    milestoneTotal > 0 ? Math.round((milestoneDone / milestoneTotal) * 100) : 0;
  const projectBudget = project ? extractNum(project, "budget", 0) : 0;
  const projectDeadline = project ? extractStr(project, "deadline", "") : "";

  // Admin/SuperAdmin: group milestones by due-date week for easier planning
  const milestonesByWeek = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const buckets = new Map<string, Record<string, unknown>[]>();
    for (const m of milestonesData) {
      const due = extractStr(m, "dueDate", "");
      const key = due ? weekStartKey(due) : "none";
      const list = buckets.get(key) || [];
      list.push(m);
      buckets.set(key, list);
    }
    const keys = [...buckets.keys()].sort((a, b) => {
      if (a === "none") return 1;
      if (b === "none") return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => ({
      key,
      label: formatWeekLabel(key, todayKey),
      items: (buckets.get(key) || []).slice().sort((a, b) => {
        const da = extractStr(a, "dueDate", "");
        const db = extractStr(b, "dueDate", "");
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      }),
    }));
  }, [milestonesData]);

  const memberUserIds = useMemo(() => members.map((m) => extractStr(m, "userId", "")), [members]);
  const availableUsers = useMemo(() => {
    const ids = memberUserIds;
    return teamUsers.filter((u) => !ids.includes(extractStr(u, "id", "")));
  }, [teamUsers, memberUserIds]);

  // CRITICAL FIX: Only gate on session + project loading.
  // Do NOT block on tasksLoading/membersLoading — show the board immediately
  // with tasks/members populating in as they arrive. This fixes:
  // 1. "No data visible" in floating task board iframes (was blocked by slow teamUsers query)
  // 2. Slow perceived loading (page was blank until ALL 4 queries finished)
  const isInitialLoading = sessionStatus === "loading" || projectLoading;

  // ── Loading state — only for session/project (not tasks/members) ──
  if (isInitialLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Invalid project ID</p>
        <Button variant="outline" onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <FolderKanban className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground mb-4 font-medium">Project not found</p>
        <Button variant="outline" onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Button>
      </div>
    );
  }

  const progressColorClass = projectProgress < 30 ? "text-red-600 dark:text-red-400" : projectProgress < 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-5" style={{ animation: "fade-in 0.35s ease-out both", padding: isInIframe ? "8px" : undefined }}>
      {/* ═══════ DEMO PROJECT banner (shown only when isDemo is true) ═══════ */}
      {project?.isDemo === true && (
        <div
          className="flex items-center gap-2.5 rounded-xl border border-teal-300/50 dark:border-teal-500/30 bg-teal-50/80 dark:bg-teal-950/30 backdrop-blur-sm px-3.5 py-2.5 shadow-sm"
          role="status"
          aria-label="Demo project"
        >
          <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold tracking-wider text-teal-700 dark:text-teal-200 uppercase">
              Demo Project
            </p>
            <p className="text-[11px] text-teal-600/80 dark:text-teal-300/70 mt-0.5">
              This is a demo project — it works exactly like a regular project (members, credentials, infrastructure) but is grouped under Demo Projects for walkthroughs.
            </p>
          </div>
          <Badge className="text-[10px] font-bold tracking-wider px-2 py-0.5 border border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-200 shrink-0">
            DEMO
          </Badge>
        </div>
      )}

      {/* ═══════ Compact Header ═══════ */}
      <div className="flex items-start gap-3" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "50ms" }}>
        {!isInIframe && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(isDemoDetail ? "/dashboard/demo" : "/dashboard/projects")}
          aria-label="Back to projects"
          className="mt-0.5 h-8 w-8 rounded-lg hover:bg-muted/80 hover:scale-105 transition-all duration-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight">{safeText(projectName, "Untitled")}</h1>
            {canManageProject ? (
              <select
                className="h-6 text-[10px] border rounded-full px-2.5 bg-background/80 font-semibold focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer appearance-none pr-5"
                value={safeText(projectStatus, "PLANNING")}
                onChange={(e) => handleUpdateProject({ status: e.target.value })}
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
              >
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            ) : (
              <Badge className={`${projectStatusColors[safeText(projectStatus, "")] || ""} text-[10px] font-semibold px-2 py-0`}>
                {safeText(projectStatus, "UNKNOWN").replace("_", " ")}
              </Badge>
            )}
          </div>
          {projectDesc && (
            <p className="text-muted-foreground/70 text-sm mt-1 leading-relaxed line-clamp-2 max-w-2xl">{safeText(projectDesc)}</p>
          )}
        </div>
      </div>

      {/* ═══════ Compact Stats Row (glassmorphism pills) ═══════ */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Progress pill — auto from milestones (uneditable) */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm"
          title="Progress = completed milestones / total milestones"
        >
          <Gauge className={cn("h-3.5 w-3.5", progressColorClass)} />
          {(() => {
            const displayProgress = safeNumber(projectProgress);
            const fillColor = displayProgress < 30 ? "bg-red-500" : displayProgress < 70 ? "bg-amber-500" : "bg-emerald-500";
            const handleShadow = displayProgress < 30 ? "shadow-red-500/30" : displayProgress < 70 ? "shadow-amber-500/30" : "shadow-emerald-500/30";
            return (
              <div className="flex items-center gap-1.5">
                <div className="relative h-2 w-24 rounded-full bg-black/10 dark:bg-white/10 select-none cursor-default">
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", fillColor, handleShadow)}
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>
                <span className={cn("text-[11px] font-bold tabular-nums", progressColorClass)}>
                  {displayProgress}%
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {milestoneDone}/{milestoneTotal || 0}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Budget pill (admin + PM) */}
        {canManageProject && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">₹</span>
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
              {String(projectBudget || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            </span>
          </div>
        )}

        {/* Deadline pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {projectDeadline ? safeDate(projectDeadline, "No deadline") : "No deadline"}
          </span>
        </div>

        {/* Team Size pill (non-manager) */}
        {!canManageProject && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">{String(members.length)} members</span>
          </div>
        )}

        {/* Live button / Add Live URL (admin) */}
        {(() => {
          const projectWebsites = (project?.websites as Record<string, unknown>[] | undefined) || [];
          const mergedWebsites = canManageProject && websites.length > 0 ? websites : projectWebsites;
          if (mergedWebsites.length === 1) {
            const wUrl = extractStr(mergedWebsites[0], "url", "");
            const wLabel = extractStr(mergedWebsites[0], "label", "");
            return (
              <>
                <a
                  href={wUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  {wLabel || "Live"}
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
                {canManageProject && (
                  <button
                    type="button"
                    onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                    className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Manage websites"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
              </>
            );
          }
          if (mergedWebsites.length > 1) {
            const primary = mergedWebsites.find((w) => extractStr(w, "isPrimary", "") === "true" || w.isPrimary === true) || mergedWebsites[0];
            const pUrl = extractStr(primary, "url", "");
            const pLabel = extractStr(primary, "label", "");
            return (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/10 shadow-sm transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      {pLabel || "Live"}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {mergedWebsites.map((w, i) => {
                      const wUrl = extractStr(w, "url", "");
                      const wLabel = extractStr(w, "label", "");
                      const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
                      return (
                        <DropdownMenuItem key={extractStr(w, "id", String(i))} asChild>
                          <a href={wUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{wLabel || `Site ${i + 1}`}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                            </div>
                            {wIsPrimary && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                          </a>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                {canManageProject && (
                  <button
                    type="button"
                    onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                    className="inline-flex items-center justify-center h-[26px] w-[26px] rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Manage websites"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                )}
              </>
            );
          }
          // 0 websites
          if (canManageProject) {
            return (
              <button
                type="button"
                onClick={() => { setWebsiteMgmtOpen(true); setEditingWebsiteId(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border border-dashed border-muted-foreground/30 transition-colors"
              >
                <Globe className="h-3 w-3" />
                Add Live URL
              </button>
            );
          }
          return null;
        })()}
      </div>

      {/* ═══════ Compact Team Members ═══════ */}
      {membersLoading ? (
        <div className="flex items-center gap-2" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "150ms" }}>
          {members.length === 0 && !canManageProject && (
            <span className="text-xs text-muted-foreground/60 italic">No team members</span>
          )}
          {members.map((member) => {
            const mId = extractStr(member, "id", "");
            const mUserId = extractStr(member, "userId", "");
            const mRole = extractStr(member, "role", "");
            const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
            const initials = mUserName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
            const avatarColor = mRole === "LEAD" ? "from-amber-400 to-orange-500" : "from-slate-500 to-slate-600 dark:from-slate-400 dark:to-slate-500";
            return (
              <div
                key={mId}
                className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-sm hover:shadow-md transition-all group/member shrink-0"
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={cn("text-[9px] font-bold text-white bg-gradient-to-br", avatarColor)}>{initials || "?"}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] font-medium text-foreground/80 max-w-[80px] truncate">{mUserName}</span>
                {canManageProject && mUserId !== userId && (
                  <button
                    type="button"
                    title="Remove member"
                    aria-label="Remove member"
                    className="h-7 w-7 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 hover:text-red-600 opacity-0 group-hover/member:opacity-100 transition-all ml-0.5"
                    onClick={() => setRemoveMemberUserId(mUserId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {canManageProject && (
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-full shrink-0 shadow-sm hover:shadow-md transition-all"
                  aria-label="Add member"
                  onMouseEnter={() => setPrefetchTeamUsers(true)}
                  onFocus={() => setPrefetchTeamUsers(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold">Add Team Member</DialogTitle>
                  <DialogDescription className="text-xs">Assign a team member to this project.</DialogDescription>
                </DialogHeader>
                {availableUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    All team members are already assigned to this project.
                  </p>
                ) : (
                  <ScrollArea className="max-h-72">
                    <div className="space-y-1.5">
                      {availableUsers.map((user) => {
                        const uName = extractStr(user, "name", "Unknown");
                        const uRole = extractStr(user, "role", "");
                        const uDept = extractStr(user, "department", "");
                        const uId = extractStr(user, "id", "");
                        const initials = uName.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
                        return (
                          <div key={uId} className="flex items-center justify-between p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.05] transition-colors">
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-7 w-7 ring-1 ring-muted">
                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-primary/20 to-primary/5">{initials || "?"}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-xs font-medium">{uName}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {safeText(uRole)}{uDept ? ` · ${safeText(uDept)}` : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => handleAddMember(uId, "MEMBER")}>Member</Button>
                              <Button size="sm" className="h-7 text-[10px] px-2" onClick={() => handleAddMember(uId, "LEAD")}>Lead</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ═══════ Milestones ═══════ */}
      {!isInIframe && (
        <div className="rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "165ms" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-bold tracking-tight">Milestones</h2>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {milestonesData.filter((m) => m.done === true).length}/{milestonesData.length}
              </Badge>
              {canManageMilestones && milestonesData.length > 0 && (
                <span className="text-[10px] text-muted-foreground hidden sm:inline">Grouped by week</span>
              )}
            </div>
          </div>
          <div className="p-4 space-y-2">
            {canManageMilestones && (
              <div className="space-y-2 mb-3 rounded-lg border border-dashed border-border/60 p-3 bg-white/30 dark:bg-white/[0.02]">
                <Input
                  placeholder="Milestone title…"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Due date *</Label>
                    <Input
                      type="date"
                      value={newMilestoneDue}
                      onChange={(e) => setNewMilestoneDue(e.target.value)}
                      className="h-8 text-xs w-[150px]"
                    />
                  </div>
                  <Button size="sm" className="h-8 text-xs shrink-0 ml-auto mt-3" onClick={handleAddMilestone} disabled={milestoneSaving}>
                    {milestoneSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                    Add
                  </Button>
                </div>
                {members.length > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Assign to * (project members — single or multiple)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((member) => {
                        const mUserId = extractStr(member, "userId", "");
                        const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                        const selected = newMilestoneAssignees.includes(mUserId);
                        return (
                          <button
                            key={mUserId}
                            type="button"
                            onClick={() => toggleAssignee(newMilestoneAssignees, setNewMilestoneAssignees, mUserId)}
                            className={cn(
                              "text-[10px] px-2 py-1 rounded-full border transition-colors",
                              selected
                                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                            )}
                          >
                            {mUserName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    Add team members to this project first, then assign the milestone.
                  </p>
                )}
              </div>
            )}
            {milestonesData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No milestones yet</p>
            ) : canManageMilestones ? (
              <div className="space-y-3">
                {/* Week filter chips — jump to a week quickly */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={() => setMilestoneWeekFilter("__all__")}
                    className={cn(
                      "shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                      milestoneWeekFilter === "__all__"
                        ? "bg-foreground text-background border-foreground"
                        : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                    )}
                  >
                    All weeks ({milestonesData.length})
                  </button>
                  {milestonesByWeek.map((week) => (
                    <button
                      key={week.key}
                      type="button"
                      onClick={() => setMilestoneWeekFilter(week.key)}
                      className={cn(
                        "shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                        milestoneWeekFilter === week.key
                          ? "bg-foreground text-background border-foreground"
                          : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                      )}
                    >
                      {week.label} ({week.items.length})
                    </button>
                  ))}
                </div>

                {(milestoneWeekFilter === "__all__"
                  ? milestonesByWeek
                  : milestonesByWeek.filter((w) => w.key === milestoneWeekFilter)
                ).map((week) => {
                  const weekDone = week.items.filter((m) => m.done === true).length;
                  return (
                    <div key={week.key} className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <h3 className="text-xs font-semibold tracking-tight truncate">{week.label}</h3>
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">
                            {weekDone}/{week.items.length} done
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {week.items.map((m) => {
                          const mId = extractStr(m, "id", "");
                          const mTitle = extractStr(m, "title", "");
                          const mDone = m.done === true;
                          const mDue = extractStr(m, "dueDate", "");
                          const assignees = Array.isArray(m.assignees) ? (m.assignees as Record<string, unknown>[]) : [];
                          const isAssignee = assignees.some(
                            (a) =>
                              extractStr(a, "userId", "") === userId ||
                              extractNestedStr(a, ["user", "id"], "") === userId
                          );
                          const canToggleDone = canManageMilestones || isAssignee;
                          return (
                            <div key={mId} className="flex items-start gap-2 p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.03]">
                              <button
                                type="button"
                                onClick={() => canToggleDone && handleToggleMilestone(mId, mDone)}
                                className={cn("shrink-0 mt-0.5", canToggleDone ? "cursor-pointer" : "cursor-default")}
                                disabled={!canToggleDone}
                                title={canToggleDone ? (mDone ? "Mark incomplete" : "Mark done") : "Only assignees or admin can mark done"}
                              >
                                <CheckCircle2 className={cn("h-4 w-4", mDone ? "text-emerald-500" : "text-muted-foreground/40")} />
                              </button>
                              <div className="flex-1 min-w-0 space-y-1">
                                <span className={cn("text-xs font-medium block", mDone && "line-through text-muted-foreground")}>{mTitle}</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {mDue && (
                                    <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 font-normal">
                                      <CalendarDays className="h-2.5 w-2.5" />
                                      {new Date(mDue).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                                    </Badge>
                                  )}
                                  {assignees.length === 0 ? (
                                    <span className="text-[9px] text-muted-foreground">All members</span>
                                  ) : (
                                    assignees.map((a) => {
                                      const name = extractNestedStr(a, ["user", "name"], "?");
                                      return (
                                        <Badge key={extractStr(a, "userId", name)} variant="secondary" className="text-[9px] h-5 px-1.5 font-normal">
                                          {name}
                                        </Badge>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => openEditMilestone(m)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => handleDeleteMilestone(mId)} className="text-muted-foreground hover:text-red-500 transition-colors p-1" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              milestonesData.map((m) => {
                const mId = extractStr(m, "id", "");
                const mTitle = extractStr(m, "title", "");
                const mDone = m.done === true;
                const mDue = extractStr(m, "dueDate", "");
                const assignees = Array.isArray(m.assignees) ? (m.assignees as Record<string, unknown>[]) : [];
                const isAssignee = assignees.some(
                  (a) =>
                    extractStr(a, "userId", "") === userId ||
                    extractNestedStr(a, ["user", "id"], "") === userId
                );
                const canToggleDone = canManageMilestones || isAssignee;
                return (
                  <div key={mId} className="flex items-start gap-2 p-2.5 rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => canToggleDone && handleToggleMilestone(mId, mDone)}
                      className={cn("shrink-0 mt-0.5", canToggleDone ? "cursor-pointer" : "cursor-default")}
                      disabled={!canToggleDone}
                      title={canToggleDone ? (mDone ? "Mark incomplete" : "Mark done") : "Only assignees or admin can mark done"}
                    >
                      <CheckCircle2 className={cn("h-4 w-4", mDone ? "text-emerald-500" : "text-muted-foreground/40")} />
                    </button>
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className={cn("text-xs font-medium block", mDone && "line-through text-muted-foreground")}>{mTitle}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mDue && (
                          <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 font-normal">
                            <CalendarDays className="h-2.5 w-2.5" />
                            {new Date(mDue).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                          </Badge>
                        )}
                        {assignees.length === 0 ? (
                          <span className="text-[9px] text-muted-foreground">All members</span>
                        ) : (
                          assignees.map((a) => {
                            const name = extractNestedStr(a, ["user", "name"], "?");
                            return (
                              <Badge key={extractStr(a, "userId", name)} variant="secondary" className="text-[9px] h-5 px-1.5 font-normal">
                                {name}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Edit milestone dialog */}
      <Dialog open={!!editingMilestone} onOpenChange={(o) => !o && setEditingMilestone(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Edit milestone</DialogTitle>
            <DialogDescription className="text-xs">Update title, due date, and assignees.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={editMilestoneTitle} onChange={(e) => setEditMilestoneTitle(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date</Label>
              <Input type="date" value={editMilestoneDue} onChange={(e) => setEditMilestoneDue(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assignees * (single or multiple)</Label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((member) => {
                  const mUserId = extractStr(member, "userId", "");
                  const mUserName = extractNestedStr(member, ["user", "name"], "Unknown");
                  const selected = editMilestoneAssignees.includes(mUserId);
                  return (
                    <button
                      key={mUserId}
                      type="button"
                      onClick={() => toggleAssignee(editMilestoneAssignees, setEditMilestoneAssignees, mUserId)}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-full border transition-colors",
                        selected
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-muted/40 border-transparent text-muted-foreground"
                      )}
                    >
                      {mUserName}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingMilestone(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveMilestoneEdit} disabled={milestoneSaving}>
                {milestoneSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ Infrastructure Section ═══════ */}
      <div className="rounded-xl border border-white/20 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] backdrop-blur-xl overflow-hidden" style={{ animation: "card-enter 0.4s ease-out both", animationDelay: "180ms" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-bold tracking-tight">Infrastructure</h2>
            {infrastructure && (extractStr(infrastructure, "githubRepoUrl", "") || extractStr(infrastructure, "tursoUrl", "")) && (
              <Badge variant="secondary" className="text-[10px] font-semibold h-5 px-1.5">Configured</Badge>
            )}
          </div>
          {canManageProject && !infraEditing && (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1" onClick={handleInfraEdit}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              {canManageProject && (
                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 gap-1" onClick={() => setTokenEditOpen(true)}>
                  <Key className="h-3 w-3" /> Tokens
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          {infraLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : infraEditing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5"><Github className="h-3 w-3" /> GitHub Repo URL</Label>
                  <Input
                    value={infraForm.githubRepoUrl}
                    onChange={(e) => setInfraForm(p => ({ ...p, githubRepoUrl: e.target.value }))}
                    placeholder="trishulhub-svg/trishulhub-dashboard.git"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Default Branch</Label>
                  <Input
                    value={infraForm.githubBranch}
                    onChange={(e) => setInfraForm(p => ({ ...p, githubBranch: e.target.value }))}
                    placeholder="main"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5"><Database className="h-3 w-3" /> Turso DB URL</Label>
                  <Input
                    value={infraForm.tursoUrl}
                    onChange={(e) => setInfraForm(p => ({ ...p, tursoUrl: e.target.value }))}
                    placeholder="libsql://xxx.turso.io"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Vercel Project ID</Label>
                  <Input
                    value={infraForm.vercelProjectId}
                    onChange={(e) => setInfraForm(p => ({ ...p, vercelProjectId: e.target.value }))}
                    placeholder="prj_xxxxx"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium flex items-center gap-1.5"><Link2 className="h-3 w-3" /> Deploy URL</Label>
                  <Input
                    value={infraForm.deployUrl}
                    onChange={(e) => setInfraForm(p => ({ ...p, deployUrl: e.target.value }))}
                    placeholder="https://xxx.vercel.app"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleInfraSave} disabled={infraSaving}>
                  {infraSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setInfraEditing(false)} disabled={infraSaving}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* GitHub Repo */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/40 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.04]">
                <Github className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">GitHub Repo</p>
                  {extractStr(infrastructure, "githubRepoUrl", "") ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <code className="text-[11px] font-mono truncate flex-1">{extractStr(infrastructure, "githubRepoUrl", "")}</code>
                      <button onClick={() => copyToClipboard(extractStr(infrastructure, "githubRepoUrl", ""), "Repo URL")} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">Not configured</p>
                  )}
                  {extractStr(infrastructure, "githubBranch", "") && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Branch: {extractStr(infrastructure, "githubBranch", "")}</p>
                  )}
                </div>
              </div>

              {/* GitHub Token — only visible to project managers */}
              {canManageProject && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/40 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.04]">
                <Key className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">GitHub Token</p>
                  {infrastructure && infrastructure.hasGithubToken ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      {revealedTokens.github ? (
                        <>
                          <code className="text-[11px] font-mono truncate flex-1">{revealedTokens.github}</code>
                          <button onClick={() => copyToClipboard(revealedTokens.github, "GitHub token")} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy">
                            <Copy className="h-3 w-3" />
                          </button>
                          <button onClick={() => setRevealedTokens(p => { const n = { ...p }; delete n.github; return n; })} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Hide">
                            <EyeOff className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] font-mono text-muted-foreground flex-1">••••••••••••</span>
                          <button onClick={() => handleRevealToken("github")} disabled={revealing === "github"} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0 disabled:opacity-50" aria-label="Reveal">
                            {revealing === "github" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">No token set</p>
                  )}
                </div>
              </div>
              )}

              {/* Turso URL */}
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/40 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.04]">
                <Database className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Turso DB URL</p>
                  {extractStr(infrastructure, "tursoUrl", "") ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <code className="text-[11px] font-mono truncate flex-1">{extractStr(infrastructure, "tursoUrl", "")}</code>
                      <button onClick={() => copyToClipboard(extractStr(infrastructure, "tursoUrl", ""), "Turso URL")} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">Not configured</p>
                  )}
                </div>
              </div>

              {/* Turso Token — only visible to project managers */}
              {canManageProject && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/40 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.04]">
                <Key className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Turso Token</p>
                  {infrastructure && infrastructure.hasTursoToken ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      {revealedTokens.turso ? (
                        <>
                          <code className="text-[11px] font-mono truncate flex-1">{revealedTokens.turso}</code>
                          <button onClick={() => copyToClipboard(revealedTokens.turso, "Turso token")} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Copy">
                            <Copy className="h-3 w-3" />
                          </button>
                          <button onClick={() => setRevealedTokens(p => { const n = { ...p }; delete n.turso; return n; })} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0" aria-label="Hide">
                            <EyeOff className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] font-mono text-muted-foreground flex-1">••••••••••••</span>
                          <button onClick={() => handleRevealToken("turso")} disabled={revealing === "turso"} className="text-muted-foreground/40 hover:text-foreground/80 shrink-0 disabled:opacity-50" aria-label="Reveal">
                            {revealing === "turso" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/50 italic mt-0.5">No token set</p>
                  )}
                </div>
              </div>
              )}

              {/* Deploy URL */}
              {extractStr(infrastructure, "deployUrl", "") && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/40 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.04] sm:col-span-2">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deploy URL</p>
                    <a href={extractStr(infrastructure, "deployUrl", "")} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-0.5">
                      {extractStr(infrastructure, "deployUrl", "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Token Edit Dialog (ADMIN + PROJECT_MANAGER) ── */}
      {canManageProject && (
        <Dialog open={tokenEditOpen} onOpenChange={setTokenEditOpen}>
          <DialogContent className="sm:max-w-md bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Key className="h-4 w-4" /> Manage Tokens
              </DialogTitle>
              <DialogDescription className="text-xs">
                Set GitHub and Turso access tokens. Tokens are encrypted at rest. Leave blank to clear.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5"><Github className="h-3 w-3" /> GitHub Token (PAT)</Label>
                <Input
                  type="password"
                  value={tokenForm.githubToken}
                  onChange={(e) => setTokenForm(p => ({ ...p, githubToken: e.target.value }))}
                  placeholder="ghp_xxxxxxxxxxxx (leave blank to keep current)"
                  className="h-9 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5"><Database className="h-3 w-3" /> Turso Token</Label>
                <Input
                  type="password"
                  value={tokenForm.tursoToken}
                  onChange={(e) => setTokenForm(p => ({ ...p, tursoToken: e.target.value }))}
                  placeholder="eyJxxxxxxxxxxxxx (leave blank to keep current)"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={handleTokenSave} disabled={tokenSaving}>
                {tokenSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Tokens
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setTokenEditOpen(false); setTokenForm({ githubToken: "", tursoToken: "" }); }} disabled={tokenSaving}>
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}


      {/* ═══════ Website Management Dialog ═══════ */}
      <Dialog open={websiteMgmtOpen} onOpenChange={(open) => { setWebsiteMgmtOpen(open); if (!open) { setEditingWebsiteId(null); setEditingWebsiteUrl(""); setEditingWebsiteLabel(""); } }}>
        <DialogContent className="sm:max-w-lg bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-white/20 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Globe className="h-4 w-4" /> Manage Websites
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add, edit, or remove website URLs for this project.
            </DialogDescription>
          </DialogHeader>

          {/* Add website form */}
          <div className="space-y-2 pb-3 border-b border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Website</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="https://example.com"
                value={newWebsiteUrl}
                onChange={(e) => setNewWebsiteUrl(e.target.value)}
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddWebsite(); } }}
              />
              <Input
                placeholder="Label (e.g. Production)"
                value={newWebsiteLabel}
                onChange={(e) => setNewWebsiteLabel(e.target.value)}
                className="h-8 text-xs sm:w-36"
              />
              <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={handleAddWebsite} disabled={!newWebsiteUrl.trim()}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>

          {/* Existing websites list */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {websites.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No websites added yet.</p>
            )}
            {websites.map((w) => {
              const wId = extractStr(w, "id", "");
              const wUrl = extractStr(w, "url", "");
              const wLabel = extractStr(w, "label", "");
              const wIsPrimary = w.isPrimary === true || extractStr(w, "isPrimary", "") === "true";
              return (
                <div key={wId} className="rounded-lg border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] overflow-hidden">
                  {editingWebsiteId === wId ? (
                    <div className="flex flex-col sm:flex-row gap-2 p-2">
                      <Input
                        value={editingWebsiteUrl}
                        onChange={(e) => setEditingWebsiteUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="h-8 text-xs flex-1"
                        autoFocus
                      />
                      <Input
                        value={editingWebsiteLabel}
                        onChange={(e) => setEditingWebsiteLabel(e.target.value)}
                        placeholder="Label"
                        className="h-8 text-xs sm:w-28"
                      />
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={() => {
                          handleUpdateWebsite(wId, { url: editingWebsiteUrl, label: editingWebsiteLabel });
                          setEditingWebsiteId(null);
                        }}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={() => setEditingWebsiteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2">
                      <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{wLabel || wUrl}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{wUrl}</p>
                      </div>
                      {wIsPrimary && <span title="Primary"><Star className="h-3 w-3 text-amber-500 shrink-0" /></span>}
                      {!wIsPrimary && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] shrink-0" onClick={() => handleSetPrimaryWebsite(wId)} title="Set as primary">
                          Primary
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0" onClick={() => { setEditingWebsiteId(wId); setEditingWebsiteUrl(wUrl); setEditingWebsiteLabel(wLabel); }} aria-label="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 shrink-0 text-red-500 hover:text-red-600" onClick={() => setDeleteWebsiteId(wId)} aria-label="Delete">
                        <Trash2Icon className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════ Remove Member Confirmation ═══════ */}
      {removeMemberUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Remove Team Member</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to remove this member from the project? They will lose access to all project tasks and data.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRemoveMemberUserId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleRemoveMember(removeMemberUserId);
                  setRemoveMemberUserId(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ Delete Website Confirmation ═══════ */}
      {deleteWebsiteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl rounded-xl border border-white/20 dark:border-white/10 p-5 max-w-sm w-full mx-4 shadow-2xl space-y-3">
            <div>
              <h3 className="font-bold text-sm">Delete Website</h3>
              <p className="text-xs text-muted-foreground mt-1">Are you sure you want to delete this website URL? This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeleteWebsiteId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  await handleDeleteWebsite(deleteWebsiteId);
                  setDeleteWebsiteId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
