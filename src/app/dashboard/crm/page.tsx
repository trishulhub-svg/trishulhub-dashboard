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
  Users, TrendingUp, Calendar, Trash2, UserCheck, Loader2, LayoutGrid, List, Filter,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { LEAD_COLUMNS } from "@/lib/types";
import type { LeadStatus } from "@/lib/types";
import { cn, safeText, safeNumber } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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

// ━━ Kanban column configuration (array-based, like Projects page) ━━
const KANBAN_COLUMNS = [
  { key: "NEW",         label: "New Lead",    dot: "bg-blue-400",    glowColor: "hover:shadow-blue-500/5 dark:hover:shadow-blue-400/10",    accentBar: "bg-blue-400",    accentRing: "ring-blue-400/20" },
  { key: "CONTACTED",   label: "Contacted",   dot: "bg-cyan-400",    glowColor: "hover:shadow-cyan-500/5 dark:hover:shadow-cyan-400/10",    accentBar: "bg-cyan-400",    accentRing: "ring-cyan-400/20" },
  { key: "INTERESTED",  label: "Interested",   dot: "bg-green-400",   glowColor: "hover:shadow-green-500/5 dark:hover:shadow-green-400/10",   accentBar: "bg-green-400",   accentRing: "ring-green-400/20" },
  { key: "PROPOSAL",    label: "Proposal",     dot: "bg-yellow-400",  glowColor: "hover:shadow-yellow-500/5 dark:hover:shadow-yellow-400/10",  accentBar: "bg-yellow-400",  accentRing: "ring-yellow-400/20" },
  { key: "NEGOTIATING", label: "Negotiating",  dot: "bg-orange-400",  glowColor: "hover:shadow-orange-500/5 dark:hover:shadow-orange-400/10",  accentBar: "bg-orange-400",  accentRing: "ring-orange-400/20" },
  { key: "WON",         label: "Won",          dot: "bg-emerald-400", glowColor: "hover:shadow-emerald-500/5 dark:hover:shadow-emerald-400/10", accentBar: "bg-emerald-400", accentRing: "ring-emerald-400/20" },
  { key: "LOST",        label: "Lost",         dot: "bg-red-400",     glowColor: "hover:shadow-red-500/5 dark:hover:shadow-red-400/10",       accentBar: "bg-red-400",     accentRing: "ring-red-400/20" },
] as const;

// Column display order
const COLUMN_DISPLAY_ORDER: Record<string, number> = {
  NEW: 0, CONTACTED: 1, INTERESTED: 2, PROPOSAL: 3, NEGOTIATING: 4, WON: 5, LOST: 6,
};

// Lookup map for quick access by key
const COLUMN_LOOKUP: Record<string, typeof KANBAN_COLUMNS[number]> = {};
for (const col of KANBAN_COLUMNS) COLUMN_LOOKUP[col.key] = col;

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

// CRM-008: Status badge color coding map
const statusBadgeColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  INTERESTED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  PROPOSAL: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  NEGOTIATING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  WON: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  LOST: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

// CRM-008: Source badge color coding map
const sourceColors: Record<string, string> = {
  AI_FOUND: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary",
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

// ━━ LeadCard — Glassmorphism card with left accent bar ━━
function LeadCard({ lead, onClick, isDragging }: { lead: Lead; onClick: () => void; isDragging?: boolean }) {
  const scoreColors = getScoreColors(lead.score);
  return (
    <div
      className={cn(
        "group/card relative rounded-lg border-l-[3px] p-3 cursor-pointer transition-all duration-200",
        "bg-white/70 dark:bg-white/[0.05] backdrop-blur-sm",
        "border border-gray-200/60 dark:border-gray-700/40 border-l-gray-300 dark:border-l-gray-600",
        "hover:border-gray-300 dark:hover:border-gray-600",
        "hover:shadow-md hover:shadow-black/[0.04] dark:hover:shadow-black/20",
        !isDragging && "hover:-translate-y-0.5",
        isDragging && "shadow-xl shadow-black/10 dark:shadow-black/40 ring-2 ring-primary/20 scale-105",
        lead.status === "NEW" && "border-l-blue-400 dark:border-l-blue-500",
        lead.status === "CONTACTED" && "border-l-cyan-400 dark:border-l-cyan-500",
        lead.status === "INTERESTED" && "border-l-green-400 dark:border-l-green-500",
        lead.status === "PROPOSAL" && "border-l-yellow-400 dark:border-l-yellow-500",
        lead.status === "NEGOTIATING" && "border-l-orange-400 dark:border-l-orange-500",
        lead.status === "WON" && "border-l-emerald-400 dark:border-l-emerald-500",
        lead.status === "LOST" && "border-l-red-400 dark:border-l-red-500",
      )}
      onClick={onClick}
      style={isDragging ? { pointerEvents: "none" as const } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{safeText(lead.name, "Lead")}</p>
          {lead.company && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Building2 className="h-3 w-3 shrink-0" /> {safeText(lead.company, "")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Star className={cn("h-3 w-3", scoreColors.star)} />
          <span className={cn("text-xs font-bold tabular-nums", scoreColors.text)}>{safeNumber(lead.score)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Badge className={cn("text-[10px] font-medium", sourceColors[lead.source] || "bg-gray-100 text-gray-700")}>
          {safeText(lead.source, "")}
        </Badge>
      </div>
    </div>
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

// ━━ DroppableKanbanColumn — Glassmorphism kanban column (like Projects) ━━
function DroppableKanbanColumn({ col, leads, onLeadClick, activeId, isDimmed }: {
  col: typeof KANBAN_COLUMNS[number];
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
  activeId: string | null;
  isDimmed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div
      className={cn(
        "flex-shrink-0 w-[260px] sm:w-[280px] rounded-xl border transition-all duration-300 snap-start relative overflow-hidden",
        "bg-gradient-to-b from-white/80 to-white/50 dark:from-gray-900/60 dark:to-gray-900/30 backdrop-blur-xl",
        "border-gray-200/80 dark:border-gray-700/50",
        "hover:border-gray-300 dark:hover:border-gray-600",
        col.glowColor,
        isDimmed && "opacity-40 pointer-events-none",
        isOver && !isDimmed && `ring-2 ${col.accentRing} border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.08] shadow-lg`,
      )}
      style={{ minHeight: "calc(100vh - 300px)" }}
    >
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl", col.accentBar, isOver && !isDimmed ? "opacity-100" : "opacity-60")} />

      {/* Column Header */}
      <div className="px-3 py-2.5 border-b border-gray-200/50 dark:border-gray-700/40 pl-4">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", col.dot, col.dot.replace("bg-", "ring-"))} />
          <h3 className="font-bold text-[12px] tracking-tight">{col.label}</h3>
          <Badge
            variant="secondary"
            className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] font-bold justify-center bg-muted/80"
          >
            {leads.length}
          </Badge>
        </div>
      </div>

      {/* Card List */}
      <div
        ref={setNodeRef}
        className={cn(
          "p-2 space-y-2 overflow-y-auto transition-all duration-300 pl-4",
          isOver && !isDimmed && "bg-primary/[0.03] dark:bg-primary/[0.05]"
        )}
        style={{ maxHeight: "calc(100vh - 380px)" }}
      >
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => {
            // Don't render the actively dragged card in the list
            if (activeId === lead.id) return null;
            return (
              <SortableLeadCard key={lead.id} lead={lead} onClick={() => onLeadClick(lead)} />
            );
          })}
        </SortableContext>
        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center mb-2">
              <Users className="h-4 w-4 text-muted-foreground/30" />
            </div>
            <p className="text-[11px] text-muted-foreground/50 font-medium">No leads</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ━━ LeadListViewRow — List view row with glassmorphism styling ━━
function LeadListViewRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const scoreColors = getScoreColors(lead.score);
  const config = COLUMN_LOOKUP[lead.status];
  const createdDate = new Date(lead.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdDate.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  let dateStr: string;
  if (diffDays === 0) dateStr = "Today";
  else if (diffDays === 1) dateStr = "Yesterday";
  else if (diffDays < 7) dateStr = `${diffDays}d ago`;
  else if (diffDays < 30) dateStr = `${Math.floor(diffDays / 7)}w ago`;
  else dateStr = createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
      onClick={onClick}
    >
      {/* Status dot + Name + Company */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-950", config?.dot, config?.dot.replace("bg-", "ring-"))} />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate" title={safeText(lead.name, "Lead")}>{safeText(lead.name, "Lead")}</h4>
          <p className="text-[11px] text-muted-foreground truncate">
            {lead.company ? safeText(lead.company, "") : safeText(lead.email, "")}
          </p>
        </div>
      </div>

      {/* Score */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        <Star className={cn("h-3.5 w-3.5", scoreColors.star)} />
        <span className={cn("text-xs font-bold tabular-nums", scoreColors.text)}>{safeNumber(lead.score)}</span>
      </div>

      {/* Source Badge */}
      <div className="hidden sm:block shrink-0">
        <Badge className={cn("text-[10px] font-medium", sourceColors[lead.source] || "bg-gray-100 text-gray-700")}>
          {safeText(lead.source, "")}
        </Badge>
      </div>

      {/* Status Badge */}
      <div className="hidden md:block shrink-0">
        <Badge className={cn("text-[10px] px-2 py-0.5 font-medium", statusBadgeColors[lead.status] || "bg-gray-100 text-gray-700")}>
          {lead.status}
        </Badge>
      </div>

      {/* Created date */}
      <div className="hidden lg:block shrink-0 min-w-[70px]">
        <p className="text-[12px] text-muted-foreground">{dateStr}</p>
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
  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<"board" | "list">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("crm-view-mode") as "board" | "list") || "board";
    }
    return "board";
  });
  const handleViewModeChange = useCallback((mode: "board" | "list") => {
    setViewMode(mode);
    localStorage.setItem("crm-view-mode", mode);
  }, []);

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
      setError("Failed to load leads. Please try again.");
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

  // Ordered columns for kanban display
  const orderedColumns = useMemo(() => {
    return [...KANBAN_COLUMNS].sort((a, b) => (COLUMN_DISPLAY_ORDER[a.key] ?? 99) - (COLUMN_DISPLAY_ORDER[b.key] ?? 99));
  }, []);

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
      <div className="space-y-4 sm:space-y-5">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-[420px] w-[220px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // CRM-002: Don't render if not authenticated or not admin
  if (status !== "authenticated" || !isAdminUser) return null;

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-3 overflow-x-auto">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-[420px] w-[220px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-500/10 to-red-500/5 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-red-500/60" />
        </div>
        <p className="text-sm text-muted-foreground/80">{error}</p>
        {/* CRM-020: Set loading before fetchLeads on retry */}
        <Button variant="outline" className="shadow-sm" onClick={() => { setError(null); setLoading(true); fetchLeads(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5 h-full">
      {/* ━━━━ Page Header ━━━━ */}
      <PageHeader title="CRM Pipeline" description="Manage your leads and sales pipeline">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* View Mode Toggle */}
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && handleViewModeChange(v as "board" | "list")} className="ml-auto">
            <ToggleGroupItem value="board" size="sm" className="gap-1.5 h-8 px-3">
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </ToggleGroupItem>
            <ToggleGroupItem value="list" size="sm" className="gap-1.5 h-8 px-3">
              <List className="h-3.5 w-3.5" /> List
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Search */}
          <div className="relative flex-1 min-w-[120px] sm:min-w-[160px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full h-8 text-xs bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50"
              aria-label="Search leads"
            />
          </div>
          {/* Secondary filters — Source / Status / Sort */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 text-[11px] bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50",
                  (filterSource !== "all" || filterStatus !== "all" || sortBy !== "createdAt") && "border-primary/40 text-primary"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {(filterSource !== "all" || filterStatus !== "all" || sortBy !== "createdAt") && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-3 p-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</Label>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="w-full h-8 text-[11px]">
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
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full h-8 text-[11px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {KANBAN_COLUMNS.map((col) => (
                      <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Sort</Label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "name" | "createdAt")}>
                  <SelectTrigger className="w-full h-8 text-[11px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Newest First</SelectItem>
                    <SelectItem value="score">Highest Score</SelectItem>
                    <SelectItem value="name">Name A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          {/* Add Lead Dialog */}
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (open) setFormErrors({}); }}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={adding} className="shadow-sm">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/60 dark:border-gray-700/50">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                {/* CRM-013: Add DialogDescription */}
                <DialogDescription>Enter the details for the new lead.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddLead} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Name *</Label>
                    <Input name="name" required className="h-8 text-sm" />
                    {formErrors.name && <p className="text-[11px] text-destructive">{formErrors.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email *</Label>
                    <Input name="email" type="email" required className="h-8 text-sm" />
                    {formErrors.email && <p className="text-[11px] text-destructive">{formErrors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Company</Label>
                    <Input name="company" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Phone</Label>
                    <Input name="phone" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Website</Label>
                    <Input name="website" placeholder="https://example.com" className="h-8 text-sm" />
                    {formErrors.website && <p className="text-[11px] text-destructive">{formErrors.website}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Score</Label>
                    <Input name="score" type="number" defaultValue="0" min={0} max={100} className="h-8 text-sm" />
                    {formErrors.score && <p className="text-[11px] text-destructive">{formErrors.score}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Source</Label>
                  <Select name="source" defaultValue="MANUAL">
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANUAL">Manual</SelectItem>
                      <SelectItem value="AI_FOUND">AI Found</SelectItem>
                      <SelectItem value="REFERRAL">Referral</SelectItem>
                      <SelectItem value="SOCIAL_MEDIA">Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Notes</Label>
                  <Textarea name="notes" rows={2} className="text-sm" />
                </div>
                {/* CRM-010: Disable button during operation */}
                <Button type="submit" className="w-full shadow-sm" disabled={adding}>
                  {adding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                  {adding ? "Adding..." : "Add Lead"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      {/* ━━━━ Stats Bar — Glassmorphism pill-style ━━━━ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div
          className="rounded-xl p-2.5 sm:p-3 transition-all cursor-pointer bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 hover:shadow-md"
          onClick={() => setSearch("")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Leads</span>
          </div>
          <p className="text-xl font-bold tracking-tight">{safeNumber(stats.total)}</p>
        </div>
        <div
          className="rounded-xl p-2.5 sm:p-3 transition-all cursor-pointer bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-cyan-200/40 dark:border-cyan-500/20 hover:shadow-md"
          onClick={() => setSearch("")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-cyan-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">New This Week</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-cyan-600 dark:text-cyan-400">{safeNumber(stats.newThisWeek)}</p>
        </div>
        <div
          className="rounded-xl p-2.5 sm:p-3 transition-all cursor-pointer bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-emerald-200/40 dark:border-emerald-500/20 hover:shadow-md"
          onClick={() => setSortBy("createdAt")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Conversion</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{safeText(stats.conversionRate, "0")}%</p>
        </div>
        <div
          className="rounded-xl p-2.5 sm:p-3 transition-all cursor-pointer bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-yellow-200/40 dark:border-yellow-500/20 hover:shadow-md"
          onClick={() => setSortBy("score")}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Avg Score</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-yellow-600 dark:text-yellow-400">{safeNumber(stats.avgScore)}</p>
        </div>
      </div>

      {/* ━━━━ Filter Bar — Date pills + Clear All ━━━━ */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {dateQuickFilters.map((f) => {
          const isActive = dateFilter === f.value;
          return (
            <button
              key={f.value}
              className={cn(
                "inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50 text-muted-foreground hover:bg-white dark:hover:bg-white/[0.07] hover:text-foreground"
              )}
              onClick={() => setDateFilter(dateFilter === f.value ? "" : f.value)}
            >
              <Calendar className="h-3 w-3 mr-1" />
              {f.label}
            </button>
          );
        })}
        {hasActiveFilters && (
          <button
            className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            onClick={() => {
              setSearch("");
              setDateFilter("");
              setFilterSource("all");
              setFilterStatus("all");
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* ━━━━ Main Content Area ━━━━ */}
      {/* CRM-021: Board-level empty state */}
      {leads.length === 0 ? (
        <div className="text-center py-24">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-primary/40" />
          </div>
          <p className="text-lg font-bold text-foreground/80">No leads yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-sm mx-auto">
            Add your first lead to get started!
          </p>
          <Button size="sm" className="mt-5 gap-2 shadow-sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        </div>
      ) : leads.length > 0 && totalFiltered === 0 ? (
        /* CRM-007: Empty search results state */
        <div className="text-center py-20">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground/60">No leads match your filters</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Try adjusting your search or filter criteria</p>
          <Button variant="outline" size="sm" className="mt-4 shadow-sm" onClick={() => { setSearch(""); setDateFilter(""); setFilterSource("all"); setFilterStatus("all"); }}>
            Clear All Filters
          </Button>
        </div>
      ) : viewMode === "board" ? (
        /* Kanban Board */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
            {orderedColumns.map((col) => {
              const isDimmed = activeId !== null;
              return (
                <DroppableKanbanColumn
                  key={col.key}
                  col={col}
                  leads={groupedLeads[col.key as LeadStatus] || []}
                  onLeadClick={setSelectedLead}
                  activeId={activeId}
                  isDimmed={isDimmed}
                />
              );
            })}
          </div>
          <DragOverlay>
            {activeId ? (() => {
              const lead = leads.find((l) => l.id === activeId);
              return lead ? <LeadCard lead={lead} onClick={() => {}} isDragging /> : null;
            })() : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* List View */
        <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto custom-scrollbar">
          {Object.values(groupedLeads).flat().map((lead) => (
            <LeadListViewRow key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
          ))}
        </div>
      )}

      {/* ━━━━ Lead Detail Sheet ━━━━ */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => { if (!open) { setSelectedLead(null); setEditMode(false); } }}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/60 dark:border-gray-700/50">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base font-bold">{safeText(selectedLead?.name, "Lead")}</SheetTitle>
              <Button
                size="sm"
                variant={editMode ? "default" : "outline"}
                className="h-7 text-[11px] shadow-sm"
                onClick={toggleEditMode}
              >
                {editMode ? "View Mode" : "Edit"}
              </Button>
            </div>
          </SheetHeader>
          {selectedLead && (
            <div className="space-y-5 mt-2">
              {editMode ? (
                /* CRM-S05: Edit mode form */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Name *</Label>
                      <Input
                        value={editForm.name || ""}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Email *</Label>
                      <Input
                        value={editForm.email || ""}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Company</Label>
                      <Input
                        value={editForm.company || ""}
                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Phone</Label>
                      <Input
                        value={editForm.phone || ""}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs font-medium">Website</Label>
                      <Input
                        value={editForm.website || ""}
                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs font-medium">Source</Label>
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
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs font-medium">Notes</Label>
                      <Textarea
                        value={editForm.notes || ""}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 shadow-sm" onClick={handleSaveEdit} disabled={updating}>
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
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <a href={`mailto:${safeText(selectedLead.email, "")}`} className="hover:underline text-sm">{safeText(selectedLead.email, "")}</a>
                  </div>
                  {/* CRM-026: Phone as tel: link */}
                  {selectedLead.phone && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <a href={`tel:${safeText(selectedLead.phone, "")}`} className="hover:underline text-sm">{safeText(selectedLead.phone, "")}</a>
                    </div>
                  )}
                  {selectedLead.company && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm">{safeText(selectedLead.company, "")}</span>
                    </div>
                  )}
                  {/* CRM-008: Website as clickable link */}
                  {selectedLead.website && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <a
                        href={selectedLead.website.startsWith('http') ? selectedLead.website : `https://${selectedLead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm"
                      >
                        {safeText(selectedLead.website, "")}
                      </a>
                    </div>
                  )}
                  {/* CRM-024: Display createdAt */}
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm">Added {safeText(new Date(selectedLead.createdAt).toLocaleDateString(), "")}</span>
                  </div>
                </div>
              )}

              {/* CRM-002: Inline score editing (visible in view mode only) */}
              {!editMode && (
                <div className="flex items-center gap-2 flex-wrap">
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
                        className="h-7 text-[11px]"
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
                        className="h-7 text-[11px]"
                        onClick={() => setEditingScore(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Badge
                        variant="outline"
                        className={cn("cursor-pointer hover:opacity-80 transition-opacity text-[11px]", getScoreBadgeClass(selectedLead.score))}
                        onClick={() => { setEditingScore(true); setScoreInput(selectedLead.score); }}
                      >
                        Score: {safeNumber(selectedLead.score)}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/60">Click to edit</span>
                    </>
                  )}
                  <Badge variant="secondary" className="text-[11px]">{safeText(selectedLead.source, "")}</Badge>
                </div>
              )}

              {/* Notes display (view mode only) */}
              {!editMode && selectedLead.notes && (
                <div className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/40">
                  <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">Notes</p>
                  <p className="text-sm leading-relaxed">{safeText(selectedLead.notes, "")}</p>
                </div>
              )}

              {/* Move to Stage dropdown (view mode only) */}
              {!editMode && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Move to Stage</Label>
                  <Select
                    value={selectedLead.status}
                    onValueChange={(value) => handleUpdateLead({ status: value })}
                    disabled={updating}
                  >
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KANBAN_COLUMNS.map((col) => (
                        <SelectItem key={col.key} value={col.key}>{col.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator className="bg-gray-200/60 dark:bg-gray-700/40" />

              {/* CRM-004: Functional Quick Email with state (view mode only) */}
              {!editMode && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Quick Email</Label>
                  <Input
                    placeholder="Subject"
                    aria-label="Email subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Textarea
                    placeholder="Write your email..."
                    rows={3}
                    aria-label="Email body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    className="w-full shadow-sm"
                    disabled={!emailSubject.trim() || !emailBody.trim() || sendingEmail}
                    onClick={handleQuickEmail}
                  >
                    {sendingEmail ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Send className="h-3 w-3 mr-1.5" />}
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </Button>
                </div>
              )}

              <Separator className="bg-gray-200/60 dark:bg-gray-700/40" />

              {/* Action buttons (view mode only) */}
              {!editMode && (
                <div className="space-y-2">
                  {!selectedLead.clientId && selectedLead.status !== "WON" && (
                    <Button
                      size="sm"
                      className="w-full shadow-sm"
                      variant="default"
                      disabled={converting}
                      onClick={handleConvertLead}
                    >
                      {converting ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <UserCheck className="h-3 w-3 mr-1.5" />}
                      {converting ? "Converting..." : "Convert to Client"}
                    </Button>
                  )}
                  {selectedLead.clientId && (
                    <Button
                      size="sm"
                      className="w-full shadow-sm"
                      variant="outline"
                      onClick={() => router.push("/dashboard/clients")}
                    >
                      <Building2 className="h-3 w-3 mr-1.5" /> View Client
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
                    <Trash2 className="h-3 w-3 mr-1.5" /> Delete Lead
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ━━━━ Delete Lead Confirmation ━━━━ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-gray-200/60 dark:border-gray-700/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{safeText(deleteTarget?.name, "")}&quot; and all associated emails. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLead} className="bg-red-600 hover:bg-red-700 shadow-sm">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
