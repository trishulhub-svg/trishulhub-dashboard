"use client";
// TODO: Extract sub-components (NotesEditor, ClientForm) to separate files for maintainability

import { useEffect, useState, useCallback, useRef, useDeferredValue, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Briefcase, Plus, Search, Users, DollarSign, FileText, Phone, Mail,
  Building2, Globe, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown,
  FolderKanban, HeadphonesIcon, StickyNote, ExternalLink, AlertCircle, UserCheck,
  ChevronLeft, ChevronRight, X, Calendar, Link2, UserCircle, ChevronDown, ChevronUp,
  Settings, Eye, EyeOff, Loader2, Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { ClientStatus } from "@/lib/types";
import { safeText, safeNumber, deepSanitize } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { useUrlState } from "@/hooks/use-url-state";

// ━━ Types ━━
interface ClientWebsite {
  id: string;
  url: string;
  label: string | null;
  isPrimary: boolean;
  createdAt: string;
}

interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  website: string | null;
  primaryWebsite: ClientWebsite | null;
  status: string;
  userId: string | null;
  notes: string | null;
  projectType: string | null;
  // projectStartDate removed from client — now managed per-project
  deliveryDate: string | null;
  mediatorName: string | null;
  mediatorPhone: string | null;
  mediatorEmail: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { projects: number; invoices: number; tickets: number };
  // CLI-017: revenue may be undefined from API
  revenue: number | undefined;
  contractUrl?: string | null;
}

interface ClientDetail extends ClientRow {
  websites: ClientWebsite[];
  projects: {
    id: string; name: string; status: string; progress: number;
    deadline: string | null; budget: number | null; createdAt: string;
  }[];
  invoices: {
    id: string; invoiceNumber: string; total: number; status: string;
    dueDate: string | null; paidAt: string | null; createdAt: string;
  }[];
  leads: {
    id: string; name: string; status: string; score: number; createdAt: string;
  }[];
  deals: {
    id: string; title: string; value: number; stage: string;
    expectedCloseDate: string | null; createdAt: string;
  }[];
  contacts: {
    id: string; firstName: string; lastName: string | null;
    email: string; isPrimary: boolean;
  }[];
  tickets: {
    id: string; subject: string; status: string; priority: string; createdAt: string;
  }[];
  portalUser: { id: string; name: string; email: string; isActive: boolean } | null;
}

// ━━ Helpers ━━
const defaultBadgeColor = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  INACTIVE: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  ONBOARDING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAUSED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  COMPLETED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  CHURNED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ONBOARDING: "Onboarding",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CHURNED: "Churned",
};

// Status dot colors for pill buttons
const statusDotColors: Record<string, string> = {
  ACTIVE: "bg-green-500",
  INACTIVE: "bg-gray-400",
  ONBOARDING: "bg-blue-500",
  PAUSED: "bg-yellow-500",
  COMPLETED: "bg-cyan-500",
  CHURNED: "bg-red-500",
};

// M-CLI-7 + L-CLI-3: Status label mappings for detail drawer
const invoiceStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  UNPAID: "Unpaid",
};

const projectStatusLabels: Record<string, string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  APPROVAL: "Approval",
  DEPLOYED: "Deployed",
  COMPLETED: "Completed",
};

const leadStatusLabelMap: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  PROPOSAL: "Proposal",
  NEGOTIATING: "Negotiating",
  WON: "Won",
  LOST: "Lost",
};

const ticketStatusLabelMap: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const projectTypeOptions = [
  { value: "ENGINEERING", label: "Engineering" },
  { value: "MEDICAL", label: "Medical / Healthcare" },
  { value: "RETAIL", label: "Retail / E-Commerce" },
  { value: "REAL_ESTATE", label: "Real Estate" },
  { value: "FINANCE", label: "Finance / FinTech" },
  { value: "EDUCATION", label: "Education / EdTech" },
  { value: "LEGAL", label: "Legal" },
  { value: "FOOD_BEVERAGE", label: "Food & Beverage" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "IT_SERVICES", label: "IT Services / Tech" },
  { value: "OTHER", label: "Other" },
];

const projectTypeBadgeColors: Record<string, string> = {
  ENGINEERING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  MEDICAL: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  RETAIL: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  REAL_ESTATE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  FINANCE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  EDUCATION: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  LEGAL: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
  FOOD_BEVERAGE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  MANUFACTURING: "bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300",
  IT_SERVICES: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

const projectStatusColors: Record<string, string> = {
  PLANNING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  REVIEW: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary",
  APPROVAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEPLOYED: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  UNPAID: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const leadStatusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  INTERESTED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  PROPOSAL: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary",
  NEGOTIATING: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  WON: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  LOST: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const ticketStatusColors: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

const priorityColors: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const dealStageColors: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  QUALIFIED: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  PROPOSAL: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary",
  NEGOTIATION: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CLOSED_WON: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CLOSED_LOST: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const dealStageLabels: Record<string, string> = {
  LEAD: "Lead",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

// TODO: Replace hardcoded "₹" with user/session locale currency setting
// CLI-013: TODO - Replace hardcoded "en-IN" locale with user/session locale context
function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

// CLI-032: Smart date search parser
function parseSmartSearch(input: string): { textSearch: string; dateFrom: Date | null; dateTo: Date | null } {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return { textSearch: "", dateFrom: null, dateTo: null };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (trimmed === "today") return { textSearch: "", dateFrom: today, dateTo: endOfToday };

  if (trimmed === "yesterday") {
    const start = new Date(today); start.setDate(start.getDate() - 1);
    const end = new Date(today.getTime() - 1);
    return { textSearch: "", dateFrom: start, dateTo: end };
  }

  if (trimmed === "this week" || trimmed === "week") {
    const dayOfWeek = today.getDay();
    const monday = new Date(today); monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return { textSearch: "", dateFrom: monday, dateTo: sunday };
  }

  const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  if (trimmed === "this month" || trimmed === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { textSearch: "", dateFrom: start, dateTo: end };
  }

  const monthIdx = monthNames.indexOf(trimmed);
  if (monthIdx !== -1) {
    const start = new Date(now.getFullYear(), monthIdx, 1);
    const end = new Date(now.getFullYear(), monthIdx + 1, 0, 23, 59, 59, 999);
    return { textSearch: "", dateFrom: start, dateTo: end };
  }

  if (trimmed === "this year" || trimmed === "year") {
    return { textSearch: "", dateFrom: new Date(now.getFullYear(), 0, 1), dateTo: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999) };
  }

  const lastDaysMatch = trimmed.match(/^last\s+(\d+)\s+days?$/);
  if (lastDaysMatch) {
    const n = parseInt(lastDaysMatch[1]);
    const start = new Date(today); start.setDate(start.getDate() - n + 1);
    return { textSearch: "", dateFrom: start, dateTo: endOfToday };
  }

  const monthYearMatch = trimmed.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})$/);
  if (monthYearMatch) {
    const fullMonth = monthNames.find(m => m.startsWith(monthYearMatch[1]));
    if (fullMonth) {
      const mi = monthNames.indexOf(fullMonth);
      const year = parseInt(monthYearMatch[2]);
      const start = new Date(year, mi, 1);
      const end = new Date(year, mi + 1, 0, 23, 59, 59, 999);
      return { textSearch: "", dateFrom: start, dateTo: end };
    }
  }

  if (/^\d{4}$/.test(trimmed)) {
    const year = parseInt(trimmed);
    if (year >= 2000 && year <= 2100) {
      return { textSearch: "", dateFrom: new Date(year, 0, 1), dateTo: new Date(year, 11, 31, 23, 59, 59, 999) };
    }
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) {
      return { textSearch: "", dateFrom: d, dateTo: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) };
    }
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(d.getTime())) {
      return { textSearch: "", dateFrom: d, dateTo: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) };
    }
  }

  return { textSearch: input.trim(), dateFrom: null, dateTo: null };
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ━━ Form Errors ━━
interface FormErrors {
  name?: string;
  email?: string;
  website?: string;
  createdAt?: string;
  [key: string]: string | undefined;
}

// CLI-023: SortIcon extracted outside component to avoid re-creation on every render
function SortIcon({ field, sortBy, sortOrder }: { field: "name" | "createdAt" | "revenue"; sortBy: string; sortOrder: string }) {
  if (sortBy !== field) return <ArrowUpDown className="h-3 w-3" />;
  return sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

// ━━ Main Component ━━
const PAGE_SIZE = 50;

export default function ClientsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading clients…</div>}>
      <ClientsPageInner />
    </Suspense>
  );
}

function ClientsPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  // PROJECT_MANAGER has the same client-management capabilities as ADMIN
  // per requirements ("Clients: ✅ Full (like admin) — Can manage clients").
  // Finance + contracts remain ADMIN/SUPER_ADMIN only.
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";
  const isFinanceAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // CLI-005: searchInput for the input, debouncedSearch for the fetch
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDeferredValue(searchInput);
  const [statusFilter, setStatusFilter] = useUrlState("status", "ALL");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "revenue">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // CLI-036: Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  // CLI-033: Stats from API (aggregated across all pages, not current page slice)
  const [stats, setStats] = useState({ total: 0, active: 0, revenue: 0 as number | undefined, invoices: 0 });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // Detail drawer state
  const [detailClient, setDetailClient] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  // Unsaved notes warning (H-CLI-5 + L-CLI-8)
  const [unsavedNotesClient, setUnsavedNotesClient] = useState<ClientRow | null>(null);

  // CLI-007: submitting state to prevent double-submit
  const [submitting, setSubmitting] = useState(false);

  // CLI-011: track NotesEditor dirty state from parent
  const [notesDirty, setNotesDirty] = useState(false);

  // CLI-002: AbortController ref for fetchDetail
  const detailAbortRef = useRef<AbortController | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    website: "",
    websites: [] as string[],
    status: "ACTIVE" as ClientStatus,
    projectType: "",
    deliveryDate: "",
    mediatorName: "",
    mediatorPhone: "",
    mediatorEmail: "",
    notes: "",
    createdAt: "",
  });

  const [showMediator, setShowMediator] = useState(false);
  const [websitesFullyLoaded, setWebsitesFullyLoaded] = useState(false);

  // Contract link (external URL) — replaces legacy generate-contract system
  const [contractLinkClient, setContractLinkClient] = useState<ClientRow | null>(null);
  const [contractLinkOpen, setContractLinkOpen] = useState(false);
  const [contractLinkInput, setContractLinkInput] = useState("");
  const [contractLinkSaving, setContractLinkSaving] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealStage, setDealStage] = useState("LEAD");
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [permanentDelete, setPermanentDelete] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // CLI-008: 401 handling helper
  const handleFetchError = useCallback((res: Response): boolean => {
    if (res.status === 401) {
      router.push("/login");
      return true;
    }
    return false;
  }, [router]);

  // Redirect non-admin users away from this page
  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  // ━━ Fetch clients ━━
  const fetchClients = useCallback(async (signal?: AbortSignal, page: number = 1) => {
    try {
      const params = new URLSearchParams();
      // CLI-032: Smart date parsing
      const parsed = parseSmartSearch(debouncedSearch);
      if (parsed.textSearch) params.set("search", parsed.textSearch);
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      // CLI-036: Pagination
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      // CLI-032: Date range params
      if (parsed.dateFrom) params.set("dateFrom", toDateString(parsed.dateFrom));
      if (parsed.dateTo) params.set("dateTo", toDateString(parsed.dateTo));

      const res = await fetch(`/api/clients?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res)) return;
      if (res.ok) {
        const result = await res.json();
        const data: ClientRow[] = Array.isArray(result) ? result : (result.data || []);
        // CLI-036: Store pagination info
        setTotalResults(result.total || 0);
        setCurrentPage(result.page || 1);
        setTotalPages(result.totalPages || 1);
        // CLI-033: Store aggregate stats from API
        if (result.stats) setStats(result.stats);
        setClients(data);
        // Clear any previous error on success
        setError(null);
      } else if (res.status >= 500) {
        // Transient server error (timeout/cold start): show inline error UI with retry.
        // Avoid toast spam — the inline retry button is the recovery path.
        const errData = await res.json().catch(() => ({}));
        setError((errData?.error as string) || "Server is taking too long to respond. Please retry.");
        setClients([]);
      } else {
        // 4xx errors are real validation/permission issues — toast them.
        const errData = await res.json().catch(() => ({}));
        toast.error((errData.error || "Failed to load clients").slice(0, 100));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Network error (offline, DNS, etc.) — show inline error UI with retry.
      // Don't toast spam; the inline error state has a "Try Again" button.
      setError(err instanceof Error ? err.message : "Network error. Please check your connection and retry.");
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, sortBy, sortOrder, handleFetchError]);

  useEffect(() => {
    setCurrentPage(1);
    const controller = new AbortController();
    fetchClients(controller.signal);
    return () => controller.abort();
  }, [fetchClients]);

  // ━━ Pagination helper (CLI-036) ━━
  const goToPage = (page: number) => {
    const controller = new AbortController();
    fetchClients(controller.signal, page);
  };

  // ━━ Open add dialog ━━
  const handleAdd = () => {
    setEditingClient(null);
    setFormErrors({});
    setShowMediator(false);
    setWebsitesFullyLoaded(true);
    setFormData({
      name: "", email: "", phone: "", company: "", website: "",
      websites: [""],
      status: "ACTIVE",
      projectType: "",
      deliveryDate: "",
      mediatorName: "", mediatorPhone: "", mediatorEmail: "",
      notes: "", createdAt: "",
    });
    setDialogOpen(true);
  };

  // ━━ Open edit dialog (instant open + lite fetch for websites) ━━
  const handleEdit = async (client: ClientRow | ClientDetail) => {
    setEditingClient(client);
    setFormErrors({});
    setShowMediator(!!(client.mediatorName || client.mediatorPhone));
    const seedWebsites =
      ('websites' in client && Array.isArray(client.websites) && client.websites.length > 0)
        ? client.websites.map((w: ClientWebsite) => w.url)
        : client.primaryWebsite ? [client.primaryWebsite.url]
        : client.website ? [client.website]
        : [""];
    setWebsitesFullyLoaded('websites' in client && Array.isArray(client.websites) && client.websites.length > 0);
    setFormData({
      name: client.name, email: client.email,
      phone: client.phone || "", company: client.company || "",
      website: client.website || "",
      websites: seedWebsites,
      status: (client.status as ClientStatus) || "ACTIVE",
      projectType: client.projectType || "",
      deliveryDate: client.deliveryDate ? client.deliveryDate.split("T")[0] : "",
      mediatorName: client.mediatorName || "",
      mediatorPhone: client.mediatorPhone || "",
      mediatorEmail: client.mediatorEmail || "",
      notes: client.notes || "",
      createdAt: "",
    });
    setDialogOpen(true);

    if (!('websites' in client && Array.isArray(client.websites) && client.websites.length > 0)) {
      setEditLoading(true);
      try {
        const res = await fetch(`/api/clients/${client.id}?lite=1`, { credentials: "include" });
        if (res.ok) {
          const detail = await res.json() as ClientDetail;
          const parsedWebsites = detail.websites?.length > 0
            ? detail.websites.map((w: ClientWebsite) => w.url)
            : seedWebsites;
          setWebsitesFullyLoaded(true);
          setFormData((prev) => ({
            ...prev,
            name: detail.name, email: detail.email,
            phone: detail.phone || "", company: detail.company || "",
            website: detail.website || "",
            websites: parsedWebsites,
            status: (detail.status as ClientStatus) || prev.status,
            projectType: detail.projectType || "",
            deliveryDate: detail.deliveryDate ? detail.deliveryDate.split("T")[0] : "",
            mediatorName: detail.mediatorName || "",
            mediatorPhone: detail.mediatorPhone || "",
            mediatorEmail: detail.mediatorEmail || "",
            notes: detail.notes || "",
          }));
          setEditingClient(detail);
        }
      } catch {
        /* keep seeded row data */
      } finally {
        setEditLoading(false);
      }
    }
  };

  // ━━ Validate form ━━
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    if (!formData.name.trim()) errors.name = "Client name is required";
    if (!formData.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Valid email is required";
    // CLI-015: website URL validation
    if (formData.website.trim() && !/^https?:\/\/.+\..+/.test(formData.website.trim())) {
      errors.website = "Website must be a valid URL (e.g., https://example.com)";
    }
    // CLI-016: createdAt date validation - not in the future
    if (formData.createdAt) {
      const createdDate = new Date(formData.createdAt);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (createdDate > today) {
        errors.createdAt = "Created date cannot be in the future";
      }
    }
    // L4: Validate additional websites
    if (formData.websites && formData.websites.length > 0) {
      for (const w of formData.websites) {
        if (w && w.trim() && !w.trim().match(/^https?:\/\/.+\..+/)) {
          toast.error(`Invalid website URL: ${w}`);
          return false;
        }
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ━━ Submit form (add or edit) ━━
  const handleSubmit = async () => {
    if (!validateForm()) return;
    // CLI-007: prevent double-submit
    if (submitting) return;
    setSubmitting(true);

    try {
      if (editingClient) {
        // Update
        const res = await fetch(`/api/clients/${editingClient.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            phone: formData.phone || null,
            company: formData.company || null,
            website: formData.website || null,
            status: formData.status,
            notes: formData.notes || null,
            projectType: formData.projectType || null,
            deliveryDate: formData.deliveryDate || null,
            // Only include websites when we loaded the full list — omitting key prevents API deleteMany wipe
            ...(websitesFullyLoaded ? {
              websites: formData.websites.filter(w => w.trim()).map((url, idx) => ({
                url,
                label: null,
                isPrimary: idx === 0,
              })),
            } : {}),
            mediatorName: formData.mediatorName || null,
            mediatorPhone: formData.mediatorPhone || null,
            mediatorEmail: formData.mediatorEmail || null,
          }),
        });
        if (handleFetchError(res)) return;
        if (res.ok) {
          toast.success("Client updated successfully");
          setDialogOpen(false);
          fetchClients();
          // Refresh detail if open
          if (detailClient?.id === editingClient.id) {
            fetchDetail(editingClient.id);
          }
        } else {
          // CLI-020: try/catch around res.json() in error branch
          const data = await res.json().catch(() => ({}));
          toast.error((data.error || "Failed to update client").slice(0, 100));
        }
      } else {
        // Create
        const body: Record<string, unknown> = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          company: formData.company || undefined,
          website: formData.website || undefined,
          status: formData.status,
          notes: formData.notes || undefined,
          projectType: formData.projectType || undefined,
          deliveryDate: formData.deliveryDate || undefined,
          // Transform string array to API-expected object array
          websites: formData.websites.filter(w => w.trim()).map((url, idx) => ({
            url,
            label: null,
            isPrimary: idx === 0,
          })),
          mediatorName: formData.mediatorName || undefined,
          mediatorPhone: formData.mediatorPhone || undefined,
          mediatorEmail: formData.mediatorEmail || undefined,
        };
        if (formData.createdAt) {
          body.createdAt = formData.createdAt;
        }
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (handleFetchError(res)) return;
        if (res.ok) {
          toast.success("Client created successfully");
          setDialogOpen(false);
          fetchClients();
        } else {
          // CLI-020: try/catch around res.json() in error branch
          const data = await res.json().catch(() => ({}));
          toast.error((data.error || "Failed to create client").slice(0, 100));
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ━━ Deactivate or permanently delete client ━━
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const isPermanent = permanentDelete || deleteTarget.status === "CHURNED";
    try {
      const url = isPermanent
        ? `/api/clients/${deleteTarget.id}?permanent=1`
        : `/api/clients/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (handleFetchError(res)) return;
      if (res.ok) {
        toast.success(isPermanent ? "Client permanently deleted" : "Client deactivated successfully");
        fetchClients();
        if (detailClient?.id === deleteTarget.id) setDetailClient(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data.error || "Failed to delete client").slice(0, 100));
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeleteTarget(null);
      setPermanentDelete(false);
    }
  };

  // ━━ Fetch detail ━━
  // CLI-002: Use AbortController to prevent race condition
  const fetchDetail = async (id: string) => {
    // Abort previous fetch
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}`, { credentials: "include", signal: controller.signal });
      if (handleFetchError(res)) return;
      if (res.ok) {
        const data = deepSanitize<ClientDetail>(await res.json());
        setDetailClient(data);
      } else {
        // CLI-003: clear detailClient on non-ok response
        setDetailClient(null);
        const errData = await res.json().catch(() => ({}));
        toast.error((errData.error || "Failed to load client details").slice(0, 100));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to load client details");
    } finally {
      setDetailLoading(false);
    }
  };

  // ━━ Open detail drawer ━━
  const handleRowClick = (client: ClientRow) => {
    // H-CLI-5 + L-CLI-8: warn about unsaved notes using AlertDialog
    if (notesDirty) {
      setUnsavedNotesClient(client);
      return;
    }
    fetchDetail(client.id);
  };

  // ━━ Save notes ━━
  // CLI-006: check res.ok, remove redundant fetchClients()
  const handleSaveNotes = async (notes: string) => {
    if (!detailClient) return;
    try {
      const res = await fetch(`/api/clients/${detailClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: safeText(notes) }),
      });
      if (res.ok) {
        toast.success("Notes saved");
        fetchDetail(detailClient.id);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data.error || "Failed to save notes").slice(0, 100));
      }
    } catch {
      toast.error("Failed to save notes");
    }
  };

  // ━━ Toggle sort ━━
  const toggleSort = (field: "name" | "createdAt" | "revenue") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  // CLI-032: Check if a date quick filter is active
  const isDateFilterActive = (value: string) => debouncedSearch.toLowerCase().trim() === value;

  // ━━ Contract link (Add / Open) ━━
  const openAddContract = (client: ClientRow) => {
    if (!isFinanceAdmin) {
      toast.error("Contracts are available to admins only");
      return;
    }
    setContractLinkClient(client);
    setContractLinkInput(client.contractUrl || "");
    setContractLinkOpen(true);
  };

  const openSavedContract = (client: ClientRow) => {
    if (!isFinanceAdmin) {
      toast.error("Only admins can open contract links");
      return;
    }
    const url = (client.contractUrl || "").trim();
    if (!url) {
      toast.error("No contract link saved yet — use Add Contract first");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSaveContractLink = async () => {
    if (!contractLinkClient) return;
    const raw = contractLinkInput.trim();
    if (raw) {
      try {
        const u = new URL(raw);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          toast.error("Contract link must start with http:// or https://");
          return;
        }
      } catch {
        toast.error("Please enter a valid URL");
        return;
      }
    }
    setContractLinkSaving(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          clientId: contractLinkClient.id,
          contractUrl: raw || "",
        }),
      });
      if (handleFetchError(res)) return;
      if (res.ok) {
        const data = await res.json();
        const saved = (data.contractUrl as string | null) || null;
        setClients((prev) =>
          prev.map((c) =>
            c.id === contractLinkClient.id ? { ...c, contractUrl: saved } : c
          )
        );
        if (detailClient?.id === contractLinkClient.id) {
          setDetailClient({ ...detailClient, contractUrl: saved });
        }
        toast.success(saved ? "Contract link saved" : "Contract link cleared");
        setContractLinkOpen(false);
        setContractLinkClient(null);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error((err.error || "Failed to save contract link").slice(0, 100));
      }
    } catch {
      toast.error("Failed to save contract link");
    } finally {
      setContractLinkSaving(false);
    }
  };

  const handleCreateDeal = async () => {
    if (!detailClient || !dealTitle.trim()) {
      toast.error("Deal title is required");
      return;
    }
    setDealSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: dealTitle.trim(),
          value: dealValue ? Number(dealValue) : 0,
          stage: dealStage,
          clientId: detailClient.id,
        }),
      });
      if (handleFetchError(res)) return;
      if (res.ok) {
        toast.success("Deal created");
        setDealTitle("");
        setDealValue("");
        setDealStage("LEAD");
        fetchDetail(detailClient.id);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error((err.error || "Failed to create deal").slice(0, 100));
      }
    } catch {
      toast.error("Failed to create deal");
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleCreateContact = async () => {
    if (!detailClient || !contactFirstName.trim() || !contactEmail.trim()) {
      toast.error("First name and email are required");
      return;
    }
    setContactSubmitting(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: contactFirstName.trim(),
          email: contactEmail.trim(),
          clientId: detailClient.id,
        }),
      });
      if (handleFetchError(res)) return;
      if (res.ok) {
        toast.success("Contact created");
        setContactFirstName("");
        setContactEmail("");
        fetchDetail(detailClient.id);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error((err.error || "Failed to create contact").slice(0, 100));
      }
    } catch {
      toast.error("Failed to create contact");
    } finally {
      setContactSubmitting(false);
    }
  };

  // ━━ Early return for non-authenticated / non-admin ━━
  if (status === "loading") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
          <Skeleton className="h-10 w-full rounded-t-xl" />
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || !isAdminUser) return null;

  // ━━ Loading state ━━
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-5 w-8" />
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
          <Skeleton className="h-10 w-full rounded-t-xl" />
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        {/* CLI-019: set setLoading(true) before fetchClients() */}
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchClients(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ━━ Header + Search + Actions ━━ */}
      <PageHeader title="Client Management" description="Manage your clients and track relationships" showBack>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            id="client-search"
            placeholder="Search clients..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 w-full max-w-[13rem] sm:w-52 h-8 text-sm bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border-gray-200/80 dark:border-gray-700/50 focus:bg-white dark:focus:bg-white/[0.06] transition-all"
            aria-label="Search clients"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-2 text-muted-foreground/60 hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button onClick={handleAdd} className="h-8 px-3 text-sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Client
        </Button>
      </PageHeader>

      {/* ━━ Stats Bar — Glassmorphism pills ━━ */}
      <div className={`grid grid-cols-2 gap-3 ${isFinanceAdmin ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <div className="rounded-xl p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Clients</span>
          </div>
          <p className="text-xl font-bold tracking-tight">{safeNumber(stats.total)}</p>
        </div>
        <div className="rounded-xl p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-green-200/40 dark:border-green-500/20 hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <Briefcase className="h-3.5 w-3.5 text-green-500" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Active</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-green-600 dark:text-green-400">{safeNumber(stats.active)}</p>
        </div>
        {isFinanceAdmin && (
          <div className="rounded-xl p-3 transition-all bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-amber-200/40 dark:border-amber-500/20 hover:shadow-md">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Revenue</span>
            </div>
            <p className="text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{stats.revenue != null ? formatCurrency(stats.revenue) : "—"}</p>
          </div>
        )}
        {/* CLI-010: Renamed "Invoices" to "Total Invoices" */}
        <div className="rounded-xl p-3 transition-all bg-card border border-border hover:shadow-md">
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Invoices</span>
          </div>
          <p className="text-xl font-bold tracking-tight text-primary">{safeNumber(stats.invoices)}</p>
        </div>
      </div>

      {/* ━━ Filters — Status pills + Date quick filters ━━ */}
      <div className="space-y-3">
        {/* Status filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { value: "ALL", label: "All" },
            { value: "ACTIVE", label: "Active" },
            { value: "ONBOARDING", label: "Onboarding" },
            { value: "PAUSED", label: "Paused" },
            { value: "COMPLETED", label: "Completed" },
            { value: "INACTIVE", label: "Inactive" },
            { value: "CHURNED", label: "Churned" },
          ].map((s) => {
            const isActive = statusFilter === s.value;
            const dotColor = statusDotColors[s.value] || "bg-gray-400";
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50 text-muted-foreground hover:bg-white dark:hover:bg-white/[0.07] hover:text-foreground"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-primary-foreground/80" : dotColor)} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Date quick filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider shrink-0 mr-1">Quick:</span>
          {[
            { label: "Today", value: "today" },
            { label: "This Week", value: "this week" },
            { label: "This Month", value: "this month" },
            { label: "This Year", value: "this year" },
          ].map((filter) => {
            const isActive = isDateFilterActive(filter.value);
            return (
              <button
                key={filter.value}
                onClick={() => setSearchInput(isActive ? "" : filter.value)}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all duration-200 shrink-0",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-white/60 dark:bg-white/[0.04] backdrop-blur-md border border-gray-200/80 dark:border-gray-700/50 text-muted-foreground hover:bg-white dark:hover:bg-white/[0.07] hover:text-foreground"
                )}
              >
                <Calendar className="h-2.5 w-2.5" />
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ━━ Clients Table — Glassmorphism card ━━ */}
      <div className="rounded-xl bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10 overflow-hidden">
        {clients.length === 0 ? (
          searchInput || statusFilter !== "ALL" ? (
            <div className="text-center py-16">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/80 ring-1 ring-border/60">
                <Search className="h-7 w-7 text-muted-foreground/70" />
              </div>
              <p className="text-sm text-muted-foreground">No clients found matching your filters</p>
              <Button variant="outline" className="mt-4 text-xs" onClick={() => { setSearchInput(""); setStatusFilter("ALL"); }}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Clear Filters
              </Button>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <Briefcase className="h-7 w-7 text-primary/70" />
              </div>
              <p className="text-sm text-muted-foreground">No clients yet</p>
              <Button variant="outline" className="mt-4 text-xs" onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first client
              </Button>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 dark:border-white/5 hover:bg-transparent">
                  {/* CLI-025: aria-sort on sortable headers, CLI-023: sort direction indicator */}
                  <TableHead
                    className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                    onClick={() => toggleSort("name")}
                    aria-sort={sortBy === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1">
                      Client
                      <SortIcon field="name" sortBy={sortBy} sortOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Type</TableHead>
                  <TableHead className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projects</TableHead>
                  {isFinanceAdmin && (
                    <TableHead
                      className="cursor-pointer select-none text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                      onClick={() => toggleSort("revenue")}
                      aria-sort={sortBy === "revenue" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Revenue
                        <SortIcon field="revenue" sortBy={sortBy} sortOrder={sortOrder} />
                      </div>
                    </TableHead>
                  )}
                  <TableHead className="text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  <TableHead
                    className="cursor-pointer select-none hidden lg:table-cell text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                    onClick={() => toggleSort("createdAt")}
                    aria-sort={sortBy === "createdAt" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <div className="flex items-center gap-1">
                      Created
                      <SortIcon field="createdAt" sortBy={sortBy} sortOrder={sortOrder} />
                    </div>
                  </TableHead>
                  <TableHead className="text-right w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer border-white/10 dark:border-white/5 hover:bg-white/40 dark:hover:bg-white/[0.02] transition-colors"
                    onClick={() => handleRowClick(client)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                          {safeText(client.company || client.name).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {safeText(client.company || client.name)}
                          </p>
                          {client.company && client.name && client.company !== client.name ? (
                            <p className="text-xs text-muted-foreground truncate">
                              {safeText(client.name)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {client.projectType ? (
                        <Badge className={`text-[10px] ${projectTypeBadgeColors[client.projectType] || defaultBadgeColor}`}>
                          {projectTypeOptions.find(p => p.value === client.projectType)?.label || safeText(client.projectType)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded text-[10px] font-semibold bg-muted/60 text-muted-foreground">
                        {safeNumber(client._count?.projects ?? 0)}
                      </span>
                    </TableCell>
                    {isFinanceAdmin && (
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold tabular-nums">
                          {(client.revenue ?? 0) > 0 ? formatCurrency(client.revenue ?? 0) : "—"}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <Badge className={`text-[10px] ${statusColors[client.status] || defaultBadgeColor}`}>
                        {statusLabels[client.status] || safeText(client.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{formatDate(client.createdAt)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Client actions">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(client); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {isFinanceAdmin && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openAddContract(client); }}>
                                <Link2 className="h-4 w-4 mr-2" /> Add Contract
                              </DropdownMenuItem>
                              {client.contractUrl ? (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openSavedContract(client); }}>
                                  <ExternalLink className="h-4 w-4 mr-2" /> Open Contract
                                </DropdownMenuItem>
                              ) : null}
                            </>
                          )}
                          {isAdminUser && !isFinanceAdmin && client.contractUrl ? (
                            <DropdownMenuItem disabled className="opacity-70">
                              <FileText className="h-4 w-4 mr-2" /> Contract on file
                            </DropdownMenuItem>
                          ) : null}
                          {client.status === "CHURNED" && isFinanceAdmin ? (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setPermanentDelete(true); setDeleteTarget(client); }}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
                            </DropdownMenuItem>
                          ) : client.status !== "CHURNED" ? (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setPermanentDelete(false); setDeleteTarget(client); }}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Deactivate
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* CLI-036: Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 dark:border-white/5">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalResults)} of {totalResults}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ━━ Add/Edit Client Dialog — Glassmorphism ━━ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border border-white/20 dark:border-white/10 sm:p-6 p-4">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              {editingClient ? "Edit Client" : "Add New Client"}
              {editLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  Loading…
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm">{editingClient ? "Update client information and settings." : "Add a new client to your organization."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-name" className="text-xs font-medium">Name *</Label>
                <Input id="client-name" placeholder="Client name" value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }}
                  className={cn("h-11 text-base sm:text-sm", formErrors.name ? "border-red-500" : "")} />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-xs font-medium">Email *</Label>
                <Input id="client-email" placeholder="email@example.com" type="email" value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors({ ...formErrors, email: undefined }); }}
                  className={cn("h-11 text-base sm:text-sm", formErrors.email ? "border-red-500" : "")} />
                {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
              </div>
            </div>

            {/* Contact & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-phone" className="text-xs font-medium">Phone</Label>
                <Input id="client-phone" placeholder="+1 (555) 000-0000" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-11 text-base sm:text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-company" className="text-xs font-medium">Company</Label>
                <Input id="client-company" placeholder="Company name" value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="h-11 text-base sm:text-sm" />
              </div>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-status" className="text-xs font-medium">Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ClientStatus })}>
                  <SelectTrigger id="client-status" className="h-11 text-base sm:text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="ONBOARDING">Onboarding</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CHURNED">Churned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-project-type" className="text-xs font-medium">Project Type</Label>
                <Select value={formData.projectType} onValueChange={(v) => setFormData({ ...formData, projectType: v })}>
                  <SelectTrigger id="client-project-type" className="h-11 text-base sm:text-sm"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    {projectTypeOptions.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery Date */}
            <div className="space-y-2">
              <Label htmlFor="client-delivery-date" className="text-xs font-medium">Delivery Date</Label>
              <Input id="client-delivery-date" type="date" value={formData.deliveryDate}
                onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                className="h-11 text-base sm:text-sm" />
            </div>

            {/* Websites — dynamic list */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Websites</Label>
              {formData.websites.map((ws, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder={i === 0 ? "https://example.com" : "Additional website URL"} value={ws}
                    onChange={(e) => {
                      const updated = [...formData.websites];
                      updated[i] = e.target.value;
                      setFormData({ ...formData, websites: updated });
                    }} />
                  {formData.websites.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                      onClick={() => setFormData({ ...formData, websites: formData.websites.filter((_, idx) => idx !== i) })}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="mt-1 text-xs"
                onClick={() => setFormData({ ...formData, websites: [...formData.websites, ""] })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Website
              </Button>
            </div>

            {/* Mediator Section — collapsible */}
            <div className="rounded-xl border border-white/20 dark:border-white/10 bg-white/40 dark:bg-white/[0.02]">
              <button type="button" className="flex items-center justify-between w-full p-3 text-left"
                onClick={() => setShowMediator(!showMediator)}>
                <div className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-xs font-medium cursor-pointer">Mediator Details (Optional)</Label>
                </div>
                {showMediator ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showMediator && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="mediator-name" className="text-xs">Mediator Name</Label>
                      <Input id="mediator-name" placeholder="Full name" value={formData.mediatorName}
                        onChange={(e) => setFormData({ ...formData, mediatorName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mediator-phone" className="text-xs">Mediator Phone</Label>
                      <Input id="mediator-phone" placeholder="+1 (555) 000-0000" value={formData.mediatorPhone}
                        onChange={(e) => setFormData({ ...formData, mediatorPhone: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mediator-email" className="text-xs">Mediator Email</Label>
                    <Input id="mediator-email" placeholder="mediator@example.com" type="email" value={formData.mediatorEmail}
                      onChange={(e) => setFormData({ ...formData, mediatorEmail: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {/* Created At — only for new clients */}
            {!editingClient && (
              <div className="space-y-2">
                <Label htmlFor="client-created-at" className="text-xs font-medium">Created At (Optional)</Label>
                <Input id="client-created-at" type="date" value={formData.createdAt}
                  onChange={(e) => { setFormData({ ...formData, createdAt: e.target.value }); setFormErrors({ ...formErrors, createdAt: undefined }); }}
                  className={formErrors.createdAt ? "border-red-500" : ""} />
                {formErrors.createdAt && <p className="text-xs text-red-500">{formErrors.createdAt}</p>}
                <p className="text-xs text-muted-foreground">Override date for adding historical data</p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="client-notes" className="text-xs font-medium">Notes</Label>
              <Textarea id="client-notes" placeholder="Add any notes about this client..." value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Saving..." : editingClient ? "Update Client" : "Create Client"}
              </Button>
            </div>


          </div>
        </DialogContent>
      </Dialog>

      {/* ━━ Deactivate / Permanent Delete Confirmation ━━ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setPermanentDelete(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {permanentDelete || deleteTarget?.status === "CHURNED" ? "Delete Permanently" : "Deactivate Client"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {permanentDelete || deleteTarget?.status === "CHURNED"
                ? <>This will permanently remove &quot;{safeText(deleteTarget?.name)}&quot; and related client records from the system. This cannot be undone.</>
                : <>This will set &quot;{safeText(deleteTarget?.name)}&quot; to Churned status. You can reactivate the client later via Edit.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {permanentDelete || deleteTarget?.status === "CHURNED" ? "Delete permanently" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Notes Warning (H-CLI-5 + L-CLI-8) */}
      <AlertDialog open={!!unsavedNotesClient} onOpenChange={(open) => {
        if (!open) setUnsavedNotesClient(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved notes. Discard changes and switch client?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={false}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const client = unsavedNotesClient;
              setUnsavedNotesClient(null);
              setNotesDirty(false);
              if (client) fetchDetail(client.id);
            }}>
              Discard &amp; Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* ━━ Client Detail Drawer ━━ */}
      <Sheet
        open={detailLoading || !!detailClient}
        onOpenChange={(open) => {
          if (!open) {
            // CLI-002: abort fetchDetail on Sheet close
            detailAbortRef.current?.abort();
            detailAbortRef.current = null;
            setDetailClient(null);
            setNotesDirty(false);
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-[580px] p-0 overflow-y-auto">
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Separator />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detailClient ? (
            /* CLI-027: aria-live on detail drawer content */
            <div className="flex flex-col min-h-0" aria-live="polite">
              {/* Header */}
              <SheetHeader className="p-5 sm:p-6 pb-4 border-b border-white/10 dark:border-white/5 pr-10">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <SheetTitle className="text-base sm:text-lg pr-2">{safeText(detailClient.company || detailClient.name)}</SheetTitle>
                      {detailClient.company && (
                        <p className="text-sm text-muted-foreground">{safeText(detailClient.name)}</p>
                      )}
                    </div>
                    <Badge className={(statusColors[detailClient.status] || defaultBadgeColor) + " shrink-0"}>
                      {statusLabels[detailClient.status] || safeText(detailClient.status)}
                    </Badge>
                  </div>
                  {/* Edit button — placed in contact row, well separated from close (X) button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 mt-1"
                    onClick={() => {
                      const client = detailClient;
                      setDetailClient(null);
                      handleEdit(client);
                    }}
                    aria-label="Edit client"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Client
                  </Button>
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {safeText(detailClient.email)}
                  </div>
                  {detailClient.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {safeText(detailClient.phone)}
                    </div>
                  )}
                  {detailClient.company && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" /> {safeText(detailClient.company)}
                    </div>
                  )}
                  {detailClient.website && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" /> {safeText(detailClient.website)}
                    </div>
                  )}
                  {detailClient.projectType && (
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] ${projectTypeBadgeColors[detailClient.projectType] || defaultBadgeColor}`}>
                        {projectTypeOptions.find(p => p.value === detailClient.projectType)?.label || safeText(detailClient.projectType)}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  {isFinanceAdmin && (
                    <span className="text-muted-foreground">Revenue: <span className="font-semibold text-foreground">{(detailClient.revenue ?? 0) > 0 ? formatCurrency(detailClient.revenue ?? 0) : "—"}</span></span>
                  )}
                  <span className="text-muted-foreground">Since: <span className="font-medium text-foreground">{formatDate(detailClient.createdAt)}</span></span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {detailClient.deliveryDate && (
                    <span>Delivery: <span className="text-foreground font-medium">{formatDate(detailClient.deliveryDate)}</span></span>
                  )}
                  {detailClient.mediatorName && (
                    <span>Mediator: <span className="text-foreground font-medium">{safeText(detailClient.mediatorName)}</span>
                      {detailClient.mediatorPhone && <span> ({safeText(detailClient.mediatorPhone)})</span>}
                    </span>
                  )}
                </div>
                {(() => {
                  // Read from relation array (not legacy JSON string)
                  const sites = (detailClient.websites || [])
                    .map((w: ClientWebsite) => w.url)
                    .filter((s: string) => s.trim());
                  if (detailClient.website && !sites.includes(detailClient.website)) sites.unshift(detailClient.website);
                  if (sites.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sites.map((site: string, i: number) => (
                        <a key={i} href={site.startsWith("http") ? site : `https://${site}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          <Link2 className="h-3 w-3" /> {safeText(site.replace(/^https?:\/\//, ""))}
                        </a>
                      ))}
                    </div>
                  );
                })()}
                {detailClient.portalUser && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <ExternalLink className="h-3 w-3" />
                    Portal: {safeText(detailClient.portalUser.name)} ({safeText(detailClient.portalUser.email)})
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      {detailClient.portalUser.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                )}
                {detailClient.contractUrl && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <FileText className="h-3 w-3" />
                    {isFinanceAdmin ? (
                      <a
                        href={detailClient.contractUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open contract
                      </a>
                    ) : (
                      <span>Contract on file (admin can open)</span>
                    )}
                  </div>
                )}
              </SheetHeader>

              {/* Tabs */}
              <Tabs defaultValue="projects" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-3">
                  <TabsList className="w-full flex-wrap h-auto gap-1">
                    <TabsTrigger value="projects" className="text-xs shrink-0">
                      <FolderKanban className="h-3 w-3 mr-1" /> Projects
                    </TabsTrigger>
                    <TabsTrigger value="invoices" className="text-xs shrink-0">
                      <FileText className="h-3 w-3 mr-1" /> Invoices
                    </TabsTrigger>
                    {/* CLI-018: Leads tab */}
                    <TabsTrigger value="leads" className="text-xs shrink-0">
                      <UserCheck className="h-3 w-3 mr-1" /> Leads
                    </TabsTrigger>
                    <TabsTrigger value="tickets" className="text-xs shrink-0">
                      <HeadphonesIcon className="h-3 w-3 mr-1" /> Support
                    </TabsTrigger>
                    <TabsTrigger value="deals" className="text-xs shrink-0">
                      <DollarSign className="h-3 w-3 mr-1" /> Deals
                    </TabsTrigger>
                    <TabsTrigger value="contacts" className="text-xs shrink-0">
                      <Users className="h-3 w-3 mr-1" /> Contacts
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="text-xs shrink-0">
                      <StickyNote className="h-3 w-3 mr-1" /> Notes
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="flex-1 px-6">
                  {/* Projects Tab */}
                  <TabsContent value="projects" className="mt-3 space-y-2">
                    {detailClient.projects.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No projects yet</p>
                    ) : (
                      detailClient.projects.map((project) => (
                        <div key={project.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{safeText(project.name)}</p>
                              <p className="text-xs text-muted-foreground">
                                {project.budget ? formatCurrency(project.budget) : "No budget"} · Due: {formatDate(project.deadline)}
                              </p>
                            </div>
                            <Badge className={`text-[10px] shrink-0 ${projectStatusColors[project.status] || defaultBadgeColor}`}>
                              {projectStatusLabels[project.status] || safeText(project.status)}
                            </Badge>
                          </div>
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                              <span>Progress</span>
                              {/* CLI-022: clamp progress bar */}
                              <span>{safeNumber(Math.min(100, Math.max(0, project.progress)))}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${safeNumber(Math.min(100, Math.max(0, project.progress)))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* Invoices Tab */}
                  <TabsContent value="invoices" className="mt-3 space-y-2">
                    {detailClient.invoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet</p>
                    ) : (
                      detailClient.invoices.map((inv) => (
                        <div key={inv.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{safeText(inv.invoiceNumber)}</p>
                              <p className="text-xs text-muted-foreground">
                                Due: {formatDate(inv.dueDate)}
                                {inv.paidAt && ` · Paid: ${formatDate(inv.paidAt)}`}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold">{formatCurrency(inv.total)}</p>
                              <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || defaultBadgeColor}`}>
                                {invoiceStatusLabels[inv.status] || safeText(inv.status)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* CLI-018: Leads Tab */}
                  <TabsContent value="leads" className="mt-3 space-y-2">
                    {detailClient.leads.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No leads yet</p>
                    ) : (
                      detailClient.leads.map((lead) => (
                        <div key={lead.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{safeText(lead.name)}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge className={`text-[10px] ${leadStatusColors[lead.status] || defaultBadgeColor}`}>
                                {leadStatusLabelMap[lead.status] || safeText(lead.status)}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                Score: {safeNumber(lead.score)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* Tickets Tab */}
                  <TabsContent value="tickets" className="mt-3 space-y-2">
                    {detailClient.tickets.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No support tickets</p>
                    ) : (
                      detailClient.tickets.map((ticket) => (
                        <div key={ticket.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{safeText(ticket.subject)}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge className={`text-[10px] ${priorityColors[ticket.priority] || defaultBadgeColor}`}>
                                {safeText(ticket.priority)}
                              </Badge>
                              <Badge className={`text-[10px] ${ticketStatusColors[ticket.status] || defaultBadgeColor}`}>
                                {ticketStatusLabelMap[ticket.status] || safeText(ticket.status)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* Deals Tab */}
                  <TabsContent value="deals" className="mt-3 space-y-2">
                    {isAdminUser && (
                      <div className="rounded-xl p-3 bg-muted/30 border border-border/50 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Add deal</p>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            placeholder="Title"
                            value={dealTitle}
                            onChange={(e) => setDealTitle(e.target.value)}
                            className="h-8 text-xs flex-1 min-w-[120px]"
                          />
                          <Input
                            type="number"
                            placeholder="Value"
                            value={dealValue}
                            onChange={(e) => setDealValue(e.target.value)}
                            className="h-8 text-xs w-24"
                          />
                          <Select value={dealStage} onValueChange={setDealStage}>
                            <SelectTrigger className="h-8 text-xs w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(dealStageLabels).map(([k, v]) => (
                                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="h-8 text-xs" onClick={handleCreateDeal} disabled={dealSubmitting}>
                            {dealSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                    {detailClient.deals.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No deals yet</p>
                    ) : (
                      detailClient.deals.map((deal) => (
                        <div key={deal.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{safeText(deal.title)}</p>
                              <p className="text-xs text-muted-foreground">
                                {deal.value ? formatCurrency(deal.value) : "No value"} · Close: {formatDate(deal.expectedCloseDate)}
                              </p>
                            </div>
                            <Badge className={`text-[10px] shrink-0 ${dealStageColors[deal.stage] || defaultBadgeColor}`}>
                              {dealStageLabels[deal.stage] || safeText(deal.stage)}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* Contacts Tab */}
                  <TabsContent value="contacts" className="mt-3 space-y-2">
                    {isAdminUser && (
                      <div className="rounded-xl p-3 bg-muted/30 border border-border/50 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Add contact</p>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            placeholder="First name"
                            value={contactFirstName}
                            onChange={(e) => setContactFirstName(e.target.value)}
                            className="h-8 text-xs flex-1 min-w-[100px]"
                          />
                          <Input
                            type="email"
                            placeholder="Email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            className="h-8 text-xs flex-1 min-w-[140px]"
                          />
                          <Button size="sm" className="h-8 text-xs" onClick={handleCreateContact} disabled={contactSubmitting}>
                            {contactSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                    {detailClient.contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No contacts yet</p>
                    ) : (
                      detailClient.contacts.map((contact) => (
                        <div key={contact.id} className="rounded-xl p-3 bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {safeText(contact.firstName)}{contact.lastName ? ` ${safeText(contact.lastName)}` : ""}
                                {contact.isPrimary && <Badge variant="secondary" className="text-[10px] ml-1.5">Primary</Badge>}
                              </p>
                              <p className="text-xs text-muted-foreground">{safeText(contact.email)}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  {/* Notes Tab */}
                  <TabsContent value="notes" className="mt-3">
                    {/* key forces remount on client switch, avoiding stale state */}
                    <NotesEditor
                      key={detailClient.id}
                      initialValue={detailClient.notes || ""}
                      onSave={handleSaveNotes}
                      onDirtyChange={setNotesDirty}
                    />
                  </TabsContent>
                </ScrollArea>

                {/* Quick Actions */}
                {/* CLI-024: Fix Quick Action buttons - navigate instead of toast */}
                <div className="p-4 border-t border-white/10 dark:border-white/5 bg-muted/20">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => {
                      router.push(`/dashboard/projects?clientId=${detailClient.id}`);
                    }}>
                      <FolderKanban className="h-3 w-3 mr-1" /> Create Project
                    </Button>
                    {isFinanceAdmin && (
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => {
                      router.push(`/dashboard/finance/invoices?clientId=${detailClient.id}`);
                    }}>
                      <FileText className="h-3 w-3 mr-1" /> Create Invoice
                    </Button>
                    )}
                    {/* CLI-024: Open Portal disabled with tooltip "Coming soon" */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="flex-1">
                          <Button variant="outline" size="sm" className="flex-1 text-xs w-full" disabled>
                            <ExternalLink className="h-3 w-3 mr-1" /> Open Portal
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Coming soon</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ━━ Add Contract Link ━━ */}
      <Dialog open={contractLinkOpen} onOpenChange={(open) => { setContractLinkOpen(open); if (!open) setContractLinkClient(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Add Contract
            </DialogTitle>
            <DialogDescription>
              Paste Google Drive / Docx link — opens in new tab. Leave empty to clear the link for {safeText(contractLinkClient?.company || contractLinkClient?.name)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="contract-url" className="text-xs">Contract URL</Label>
              <Input
                id="contract-url"
                placeholder="https://…"
                value={contractLinkInput}
                onChange={(e) => setContractLinkInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setContractLinkOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSaveContractLink} disabled={contractLinkSaving}>
                {contractLinkSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                {contractLinkSaving ? "Saving…" : "Save link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━ Notes Editor Sub-component ━━
// CLI-011: Added onDirtyChange callback for parent to track dirty state
// NOTE: Parent should use key={clientId} to force remount on client switch
function NotesEditor({ initialValue, onSave, onDirtyChange }: {
  initialValue: string;
  onSave: (notes: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [notes, setNotes] = useState(initialValue);
  const [dirty, setDirty] = useState(false);

  const handleChange = (value: string) => {
    setNotes(value);
    const isDirty = value !== initialValue;
    setDirty(isDirty);
    onDirtyChange?.(isDirty);
  };

  const handleSave = () => {
    onSave(notes);
    setDirty(false);
    onDirtyChange?.(false);
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add notes about this client..."
        aria-label="Client notes"
        rows={8}
        className="text-sm"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={handleSave}
        >
          Save Notes
        </Button>
      </div>
    </div>
  );
}

// Helper for className merging
function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
