"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Mail, Phone, Globe, Building2, Star, Send, Search, AlertCircle,
  Users, TrendingUp, Calendar, Trash2, UserCheck, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { LEAD_COLUMNS } from "@/lib/types";
import type { LeadStatus } from "@/lib/types";
import { cn, safeText, safeNumber } from "@/lib/utils";

// CRM-028: 401 handling helper
function handleFetchError(res: Response, router: ReturnType<typeof useRouter>): boolean {
  if (res.status === 401) {
    router.push("/login");
    return true;
  }
  return false;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  website?: string;
  phone?: string;
  source: string;
  score: number;
  status: LeadStatus;
  notes?: string;
  clientId?: string | null;
  createdAt: string;
}

const columnColors: Record<LeadStatus, string> = {
  NEW: "bg-blue-100 dark:bg-blue-900/30",
  CONTACTED: "bg-cyan-100 dark:bg-cyan-900/30",
  INTERESTED: "bg-green-100 dark:bg-green-900/30",
  PROPOSAL: "bg-yellow-100 dark:bg-yellow-900/30",
  NEGOTIATING: "bg-orange-100 dark:bg-orange-900/30",
  WON: "bg-emerald-100 dark:bg-emerald-900/30",
  LOST: "bg-red-100 dark:bg-red-900/30",
};

// CRM-025: Score color coding helpers
function getScoreColors(score: number): { star: string; text: string } {
  if (score >= 80) return { star: "text-green-500", text: "text-green-600 dark:text-green-400" };
  if (score >= 50) return { star: "text-yellow-500", text: "text-yellow-600 dark:text-yellow-400" };
  return { star: "text-red-500", text: "text-red-600 dark:text-red-400" };
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (score >= 50) return "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400";
}

// CRM-008: Source badge color coding map
const sourceColors: Record<string, string> = {
  AI_FOUND: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  REFERRAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  SOCIAL_MEDIA: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  MANUAL: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// CRM-S01: Smart filter parser
function parseSmartFilter(query: string, dateFilterStr: string) {
  const textParts: string[] = [];
  let minScore: number | null = null;
  let maxScore: number | null = null;
  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Process date filter buttons
  if (dateFilterStr === "today") {
    dateFrom = today;
    dateTo = new Date(today.getTime() + 86400000);
  } else if (dateFilterStr === "yesterday") {
    dateFrom = new Date(today.getTime() - 86400000);
    dateTo = today;
  } else if (dateFilterStr === "this week") {
    dateFrom = new Date(today.getTime() - today.getDay() * 86400000);
    dateTo = new Date(today.getTime() + (7 - today.getDay()) * 86400000);
  } else if (dateFilterStr === "this month") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (dateFilterStr === "last month") {
    dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    dateTo = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  // Process query text for smart keywords
  const lower = query.toLowerCase().trim();
  const tokens = lower.split(/\s+/);

  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthShort = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  for (const token of tokens) {
    // Score filters: score:80+, score:>80, score:<30, score:50-80, score:50
    const scoreMatch = token.match(/^score:([<>=]?)(\d+)(?:-(\d+))?$/);
    if (scoreMatch) {
      const op = scoreMatch[1];
      const val = parseInt(scoreMatch[2]);
      const val2 = scoreMatch[3] ? parseInt(scoreMatch[3]) : null;
      if (val2 !== null) { minScore = val; maxScore = val2; }
      else if (op === ">" || op === "") { minScore = val; }
      else if (op === "<") { maxScore = val; }
      else if (op === "=") { minScore = val; maxScore = val; }
      continue;
    }

    // Date keywords (only if no dateFilter button is active)
    if (!dateFilterStr) {
      if (token === "today") { dateFrom = today; dateTo = new Date(today.getTime() + 86400000); continue; }
      if (token === "yesterday") { dateFrom = new Date(today.getTime() - 86400000); dateTo = today; continue; }
      if (token === "this" && tokens.includes("week")) { dateFrom = new Date(today.getTime() - today.getDay() * 86400000); dateTo = new Date(today.getTime() + (7 - today.getDay()) * 86400000); continue; }
      if (token === "this" && tokens.includes("month")) { dateFrom = new Date(now.getFullYear(), now.getMonth(), 1); dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1); continue; }

      // Year: 4 digits
      const yearMatch = token.match(/^(\d{4})$/);
      if (yearMatch) { const y = parseInt(yearMatch[1]); dateFrom = new Date(y, 0, 1); dateTo = new Date(y + 1, 0, 1); continue; }

      // Month name
      const mIdx = months.indexOf(token);
      const msIdx = monthShort.indexOf(token);
      if (mIdx >= 0 || msIdx >= 0) {
        const mi = mIdx >= 0 ? mIdx : msIdx;
        dateFrom = new Date(now.getFullYear(), mi, 1);
        dateTo = new Date(now.getFullYear(), mi + 1, 1);
        continue;
      }
    }

    textParts.push(token);
  }

  return { textSearch: textParts.join(" "), minScore, maxScore, dateFrom, dateTo };
}

const dateQuickFilters = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this week" },
  { label: "This Month", value: "this month" },
  { label: "Last Month", value: "last month" },
];

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const scoreColors = getScoreColors(lead.score);
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow text-left"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{safeText(lead.name, "Lead")}</p>
            {lead.company && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {safeText(lead.company, "")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Star className={`h-3 w-3 ${scoreColors.star}`} />
            <span className={`text-xs font-medium ${scoreColors.text}`}>{safeNumber(lead.score)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge className={cn("text-[10px]", sourceColors[lead.source] || "bg-gray-100 text-gray-700")}>
            {safeText(lead.source, "")}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// CRM-001: SortableLeadCard wrapper with useSortable
function SortableLeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} onClick={onClick} />
    </div>
  );
}

function DroppableColumn({ status, leads, onLeadClick }: { status: LeadStatus; leads: Lead[]; onLeadClick: (lead: Lead) => void }) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[220px] w-[220px] lg:w-[260px]">
      <div className={`rounded-t-lg px-3 py-2 ${columnColors[status]}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{status}</h3>
          <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 p-2 bg-muted/30 rounded-b-lg min-h-[200px] max-h-[calc(100vh-16rem)] overflow-y-auto custom-scrollbar"
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <SortableLeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No leads</p>
        )}
      </div>
    </div>
  );
}

// CRM-012: Form validation
function validateAddForm(form: FormData): Record<string, string> | null {
  const errors: Record<string, string> = {};
  const name = form.get("name") as string;
  const email = form.get("email") as string;
  const score = form.get("score") as string;
  const website = form.get("website") as string;
  if (!name?.trim()) errors.name = "Name is required";
  if (!email?.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Valid email is required";
  if (score && (parseInt(score) < 0 || parseInt(score) > 100)) errors.score = "Score must be 0-100";
  if (website && !/^https?:\/\/.+/.test(website)) errors.website = "Enter a valid URL";
  return Object.keys(errors).length > 0 ? errors : null;
}

export default function CRMPage() {
  const router = useRouter();
  // CRM-002: Destructure status from useSession
  const { data: session, status } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  // CRM-006: updating state for concurrent drag prevention
  const [updating, setUpdating] = useState(false);
  // CRM-010: adding state for add lead operation
  const [adding, setAdding] = useState(false);
  // CRM-004: Quick email state
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  // CRM-012: Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // CRM-006: Sort by dropdown state
  const [sortBy, setSortBy] = useState<"score" | "name" | "createdAt">("createdAt");
  // CRM-002: Inline score editing state
  const [editingScore, setEditingScore] = useState(false);
  const [scoreInput, setScoreInput] = useState(0);
  // CRM-S03: Date quick filter state
  const [dateFilter, setDateFilter] = useState("");
  // CRM-S05: Edit mode states
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  // CRM-S04: Source and status filter states
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchLeads = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/leads?limit=200", { credentials: 'include', signal });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const result = await res.json();
        // Handle paginated response format { data, total, page, limit, totalPages }
        setLeads(Array.isArray(result) ? result : (result.data || []));
      } else {
        // CRM-028: Handle non-ok fetchLeads response
        const data = await res.json().catch(() => ({}));
        setError((data as Record<string, string>).error || "Failed to load leads");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, [router]);

  // CRM-002: Role guard with useEffect
  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLeads(controller.signal);
    return () => controller.abort();
  }, [fetchLeads]);

  // CRM-004: Clear email fields when selectedLead changes
  useEffect(() => {
    setEmailSubject("");
    setEmailBody("");
  }, [selectedLead?.id]);

  // CRM-S05: Reset edit mode when selectedLead changes
  useEffect(() => {
    setEditMode(false);
    setEditForm({});
    setEditingScore(false);
  }, [selectedLead?.id]);

  // CRM-S01/S02/S03 + CRM-003 + CRM-006: useMemo for grouped leads with smart filter
  const groupedLeads = useMemo(() => {
    const { textSearch, minScore, maxScore, dateFrom, dateTo } = parseSmartFilter(search, dateFilter);

    const filtered = leads.filter((l) => {
      // Text search (name, email, company, phone)
      if (textSearch) {
        const q = textSearch.toLowerCase();
        const matches =
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          (l.company || "").toLowerCase().includes(q) ||
          (l.phone || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      // Score filters
      if (minScore !== null && l.score < minScore) return false;
      if (maxScore !== null && l.score > maxScore) return false;
      // Date filters
      if (dateFrom) {
        const created = new Date(l.createdAt);
        if (created < dateFrom) return false;
      }
      if (dateTo) {
        const created = new Date(l.createdAt);
        if (created >= dateTo) return false;
      }
      // Source filter
      if (filterSource !== "all" && l.source !== filterSource) return false;
      // Status filter
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      return true;
    });

    const groups: Record<LeadStatus, Lead[]> = {} as Record<LeadStatus, Lead[]>;
    for (const s of LEAD_COLUMNS) groups[s] = [];
    for (const l of filtered) {
      if (groups[l.status]) groups[l.status].push(l);
    }
    // CRM-003 + CRM-006: Sort each column based on sortBy state
    for (const s of LEAD_COLUMNS) {
      if (sortBy === "score") {
        groups[s].sort((a, b) => b.score - a.score);
      } else if (sortBy === "name") {
        groups[s].sort((a, b) => a.name.localeCompare(b.name));
      }
      // createdAt is default order (no sort needed)
    }
    return groups;
  }, [leads, search, sortBy, dateFilter, filterSource, filterStatus]);

  // CRM-007: Count total filtered leads for empty search state
  const totalFiltered = Object.values(groupedLeads).reduce((sum, arr) => sum + arr.length, 0);

  // CRM-023: Summary stats
  const stats = useMemo(() => {
    const total = leads.length;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = leads.filter((l) => new Date(l.createdAt) >= weekAgo).length;
    const won = leads.filter((l) => l.status === "WON").length;
    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : "0";
    const avgScore = total > 0 ? Math.round(leads.reduce((sum, l) => sum + l.score, 0) / total) : 0;
    return { total, newThisWeek, conversionRate, avgScore };
  }, [leads]);

  // CRM-S05: Toggle edit mode
  const toggleEditMode = () => {
    if (!editMode && selectedLead) {
      setEditForm({
        name: selectedLead.name,
        email: selectedLead.email,
        company: selectedLead.company || "",
        phone: selectedLead.phone || "",
        website: selectedLead.website || "",
        notes: selectedLead.notes || "",
        source: selectedLead.source,
      });
    }
    setEditMode(!editMode);
  };

  // CRM-S05: Save edit handler
  const handleSaveEdit = async () => {
    if (!selectedLead) return;
    if (!editForm.name?.trim() || !editForm.email?.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
      toast.error("Valid email is required");
      return;
    }
    await handleUpdateLead({
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      company: editForm.company.trim() || null,
      phone: editForm.phone.trim() || null,
      website: editForm.website.trim() || null,
      notes: editForm.notes.trim() || null,
      source: editForm.source,
    });
    setEditMode(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    // CRM-006: Prevent drag when updating
    if (updating) return;
    setActiveId(event.active.id as string);
  };

  // CRM-006 + CRM-007: handleDragEnd with rollback and updating state
  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const newStatus = over.id as LeadStatus;

    if (!LEAD_COLUMNS.includes(newStatus)) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    // CRM-007: Store previous state for rollback
    const prevLeads = leads;

    // Optimistic update
    setUpdating(true);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    // CRM-011: Update selectedLead on optimistic update
    setSelectedLead((prev) => prev?.id === leadId ? { ...prev, status: newStatus } as Lead : prev);

    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: leadId, status: newStatus }),
      });
      if (handleFetchError(res, router)) {
        // Rollback on 401 redirect
        setLeads(prevLeads);
        setSelectedLead((prev) => prev?.id === leadId ? { ...prev, status: lead.status } as Lead : prev);
        return;
      }
      if (!res.ok) {
        // CRM-007: Rollback on failure
        setLeads(prevLeads);
        setSelectedLead((prev) => prev?.id === leadId ? { ...prev, status: lead.status } as Lead : prev);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update lead");
      } else {
        toast.success(`Lead moved to ${newStatus}`);
      }
    } catch {
      // CRM-007: Rollback on error
      setLeads(prevLeads);
      setSelectedLead((prev) => prev?.id === leadId ? { ...prev, status: lead.status } as Lead : prev);
      toast.error("Failed to move lead");
    } finally {
      setUpdating(false);
    }
  };

  // CRM-012 + CRM-014: handleAddLead with validation and non-ok handling
  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    // CRM-012: Validate form
    const errors = validateAddForm(form);
    if (errors) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const data = {
      name: form.get("name") as string,
      email: form.get("email") as string,
      company: form.get("company") as string,
      phone: form.get("phone") as string,
      website: form.get("website") as string,
      source: form.get("source") as string || "MANUAL",
      score: parseInt(form.get("score") as string) || 0,
      notes: form.get("notes") as string,
    };

    // CRM-010: Set adding state
    setAdding(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      // CRM-028: 401 handling
      if (handleFetchError(res, router)) return;
      // CRM-014: Handle non-ok response
      if (res.ok) {
        toast.success("Lead added");
        setAddOpen(false);
        fetchLeads();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to add lead");
      }
    } catch {
      toast.error("Failed to add lead");
    } finally {
      setAdding(false);
    }
  };

  // CRM-003 + CRM-009: Fix handleUpdateLead - check res.ok, don't close panel on failure
  const handleUpdateLead = async (data: Record<string, unknown>) => {
    if (!selectedLead) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: selectedLead.id, ...data }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Lead updated");
        fetchLeads();
        // CRM-009: Don't close panel, update selectedLead in place
        setSelectedLead((prev) => prev?.id === selectedLead.id ? { ...prev, ...data } as Lead : prev);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update lead");
      }
    } catch {
      toast.error("Failed to update lead");
    } finally {
      setUpdating(false);
    }
  };

  // Quick email handler — wired to /api/leads/emails
  const [sendingEmail, setSendingEmail] = useState(false);
  const handleQuickEmail = async () => {
    if (!selectedLead || !emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/leads/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadId: selectedLead.id,
          subject: emailSubject.trim(),
          body: emailBody.trim(),
        }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Email saved as draft for approval");
        setEmailSubject("");
        setEmailBody("");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to send email");
      }
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  // Delete lead handler
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);
  const handleDeleteLead = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Lead deleted");
        fetchLeads();
        if (selectedLead?.id === deleteTarget.id) setSelectedLead(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete lead");
      }
    } catch {
      toast.error("Failed to delete lead");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Convert lead to client
  const [converting, setConverting] = useState(false);
  const handleConvertLead = async () => {
    if (!selectedLead) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/leads/${selectedLead.id}`, {
        method: "POST",
        credentials: "include",
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Lead converted to client!");
        fetchLeads();
        setSelectedLead(null);
        // Navigate to clients page to see the new client
        router.push("/dashboard/clients");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to convert lead");
      }
    } catch {
      toast.error("Failed to convert lead");
    } finally {
      setConverting(false);
    }
  };

  // Check if any filter is active
  const hasActiveFilters = search || dateFilter || filterSource !== "all" || filterStatus !== "all";

  // CRM-002: Show loading skeleton while session is loading
  if (status === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-96 w-[260px] rounded-lg shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // CRM-002: Don't render if not authenticated or not admin
  if (status !== "authenticated" || !isAdminUser) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-96 w-[260px] rounded-lg shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        {/* CRM-020: Set loading before fetchLeads on retry */}
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchLeads(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM Pipeline</h1>
          <p className="text-muted-foreground text-sm">Manage your leads and sales pipeline</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone... try 'today' or 'score:80+'"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-64"
              aria-label="Search leads"
            />
          </div>
          {/* CRM-S04: Source filter dropdown */}
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="AI_FOUND">AI Found</SelectItem>
              <SelectItem value="REFERRAL">Referral</SelectItem>
              <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
            </SelectContent>
          </Select>
          {/* CRM-S04: Status filter dropdown */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {LEAD_COLUMNS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* CRM-006: Sort dropdown */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "name" | "createdAt")}>
            <SelectTrigger className="w-36 h-9 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Newest First</SelectItem>
              <SelectItem value="score">Highest Score</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (open) setFormErrors({}); }}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={adding}>
                <Plus className="h-4 w-4 mr-1" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                {/* CRM-013: Add DialogDescription */}
                <DialogDescription>Enter the details for the new lead.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddLead} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input name="name" required />
                    {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Email *</Label>
                    <Input name="email" type="email" required />
                    {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company</Label>
                    <Input name="company" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input name="phone" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Website</Label>
                    <Input name="website" placeholder="https://example.com" />
                    {formErrors.website && <p className="text-xs text-destructive">{formErrors.website}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score</Label>
                    <Input name="score" type="number" defaultValue="0" min={0} max={100} />
                    {formErrors.score && <p className="text-xs text-destructive">{formErrors.score}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Source</Label>
                  <Select name="source" defaultValue="MANUAL">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual</SelectItem>
                      <SelectItem value="AI_FOUND">AI Found</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea name="notes" rows={2} />
                </div>
                {/* CRM-010: Disable button during operation */}
                <Button type="submit" className="w-full" disabled={adding}>
                  {adding ? "Adding..." : "Add Lead"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* CRM-S03: Date quick filter buttons + Clear All */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {dateQuickFilters.map((f) => (
            <Button
              key={f.value}
              variant={dateFilter === f.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDateFilter(dateFilter === f.value ? "" : f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setDateFilter("");
              setFilterSource("all");
              setFilterStatus("all");
            }}
          >
            Clear All
          </Button>
        )}
      </div>

      {/* CRM-023 + CRM-001: Summary stats cards — clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearch("")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Leads</p>
              <p className="text-lg font-semibold">{safeNumber(stats.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearch("")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">New This Week</p>
              <p className="text-lg font-semibold">{safeNumber(stats.newThisWeek)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSortBy("createdAt")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversion Rate</p>
              <p className="text-lg font-semibold">{safeText(stats.conversionRate, "0")}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSortBy("score")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Star className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-lg font-semibold">{safeNumber(stats.avgScore)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CRM-021: Board-level empty state */}
      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 border-2 border-dashed rounded-lg">
          <Building2 className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No leads yet</p>
            <p className="text-sm text-muted-foreground">Add your first lead to get started!</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Lead
          </Button>
        </div>
      ) : leads.length > 0 && totalFiltered === 0 ? (
        /* CRM-007: Empty search results state */
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
          <Search className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No leads match your filters</p>
          <Button variant="outline" size="sm" onClick={() => { setSearch(""); setDateFilter(""); setFilterSource("all"); setFilterStatus("all"); }}>
            Clear All Filters
          </Button>
        </div>
      ) : (
        /* Kanban Board */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {LEAD_COLUMNS.map((status) => (
              <DroppableColumn
                key={status}
                status={status}
                leads={groupedLeads[status]}
                onLeadClick={setSelectedLead}
              />
            ))}
          </div>
          {/* CRM-018: Guard non-null assertion in DragOverlay */}
          <DragOverlay>
            {activeId ? (() => {
              const lead = leads.find((l) => l.id === activeId);
              return lead ? <LeadCard lead={lead} onClick={() => {}} /> : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* CRM-005 + CRM-S05: Sheet with edit mode */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => { if (!open) { setSelectedLead(null); setEditMode(false); } }}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>{safeText(selectedLead?.name, "Lead")}</SheetTitle>
              <Button
                size="sm"
                variant={editMode ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={toggleEditMode}
              >
                {editMode ? "View Mode" : "Edit"}
              </Button>
            </div>
          </SheetHeader>
          {selectedLead && (
            <div className="space-y-4">
              {editMode ? (
                /* CRM-S05: Edit mode form */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email *</Label>
                      <Input
                        value={editForm.email || ""}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Company</Label>
                      <Input
                        value={editForm.company || ""}
                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={editForm.phone || ""}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Website</Label>
                      <Input
                        value={editForm.website || ""}
                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Source</Label>
                      <Select
                        value={editForm.source || "MANUAL"}
                        onValueChange={(v) => setEditForm({ ...editForm, source: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="AI_FOUND">AI Found</SelectItem>
                          <SelectItem value="REFERRAL">Referral</SelectItem>
                          <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea
                        value={editForm.notes || ""}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={handleSaveEdit} disabled={updating}>
                      {updating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {updating ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* View mode: existing static display */
                <div className="space-y-3">
                  {/* CRM-027: Email as mailto: link */}
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${safeText(selectedLead.email, "")}`} className="hover:underline">{safeText(selectedLead.email, "")}</a>
                  </div>
                  {/* CRM-026: Phone as tel: link */}
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${safeText(selectedLead.phone, "")}`} className="hover:underline">{safeText(selectedLead.phone, "")}</a>
                    </div>
                  )}
                  {selectedLead.company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{safeText(selectedLead.company, "")}</span>
                    </div>
                  )}
                  {/* CRM-008: Website as clickable link */}
                  {selectedLead.website && (
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {safeText(selectedLead.website, "")}
                      </a>
                    </div>
                  )}
                  {/* CRM-024: Display createdAt */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Added {safeText(new Date(selectedLead.createdAt).toLocaleDateString(), "")}</span>
                  </div>
                </div>
              )}

              {/* CRM-002: Inline score editing (visible in view mode only) */}
              {!editMode && (
                <div className="flex items-center gap-2">
                  {editingScore ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={scoreInput}
                        onChange={(e) => setScoreInput(parseInt(e.target.value) || 0)}
                        className="w-20 h-8 text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => {
                          handleUpdateLead({ score: scoreInput });
                          setEditingScore(false);
                        }}
                        disabled={updating}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setEditingScore(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Badge
                        variant="outline"
                        className={cn("cursor-pointer hover:opacity-80 transition-opacity", getScoreBadgeClass(selectedLead.score))}
                        onClick={() => { setEditingScore(true); setScoreInput(selectedLead.score); }}
                      >
                        Score: {safeNumber(selectedLead.score)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">Click to edit</span>
                    </>
                  )}
                  <Badge variant="secondary">{safeText(selectedLead.source, "")}</Badge>
                </div>
              )}

              {/* Notes display (view mode only) */}
              {!editMode && selectedLead.notes && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{safeText(selectedLead.notes, "")}</p>
                  </CardContent>
                </Card>
              )}

              {/* Move to Stage dropdown (view mode only) */}
              {!editMode && (
                <div className="space-y-2">
                  <Label className="text-xs">Move to Stage</Label>
                  <Select
                    value={selectedLead.status}
                    onValueChange={(value) => handleUpdateLead({ status: value })}
                    disabled={updating}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_COLUMNS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* CRM-004: Functional Quick Email with state (view mode only) */}
              {!editMode && (
                <div className="space-y-2">
                  <Label className="text-xs">Quick Email</Label>
                  <Input
                    placeholder="Subject"
                    aria-label="Email subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                  <Textarea
                    placeholder="Write your email..."
                    rows={3}
                    aria-label="Email body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!emailSubject.trim() || !emailBody.trim() || sendingEmail}
                    onClick={handleQuickEmail}
                  >
                    {sendingEmail ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </Button>
                </div>
              )}

              <Separator />

              {/* Action buttons (view mode only) */}
              {!editMode && (
                <div className="space-y-2">
                  {!selectedLead.clientId && selectedLead.status !== "WON" && (
                    <Button
                      size="sm"
                      className="w-full"
                      variant="default"
                      disabled={converting}
                      onClick={handleConvertLead}
                    >
                      {converting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <UserCheck className="h-3 w-3 mr-1" />}
                      {converting ? "Converting..." : "Convert to Client"}
                    </Button>
                  )}
                  {selectedLead.clientId && (
                    <Button
                      size="sm"
                      className="w-full"
                      variant="outline"
                      onClick={() => router.push("/dashboard/clients")}
                    >
                      <Building2 className="h-3 w-3 mr-1" /> View Client
                    </Button>
                  )}
                  {/* CRM-005: Improved dark mode contrast */}
                  <Button
                    size="sm"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/40"
                    variant="outline"
                    onClick={() => setDeleteTarget(selectedLead)}
                    disabled={deleting}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Delete Lead
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Lead Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{safeText(deleteTarget?.name, "")}&quot; and all associated emails. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLead} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
