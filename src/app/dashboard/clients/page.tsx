"use client";

import { useEffect, useState, useCallback, useRef, useDeferredValue } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Briefcase, Plus, Search, Users, DollarSign, FileText, Phone, Mail,
  Building2, Globe, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown,
  FolderKanban, HeadphonesIcon, StickyNote, ExternalLink, AlertCircle, UserCheck,
  ChevronLeft, ChevronRight, X, Calendar, Link2, UserCircle, ChevronDown, ChevronUp,
  Settings, Eye, EyeOff,
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
import { safeText, safeNumber } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";

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
  projectMethodId: string | null;
  projectMethod?: { id: string; name: string } | null;
  projectStartDate: string | null;
  deliveryDate: string | null;
  mediatorName: string | null;
  mediatorPhone: string | null;
  mediatorEmail: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { projects: number; invoices: number; tickets: number };
  // CLI-017: revenue may be undefined from API
  revenue: number | undefined;
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
  RETAIL: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
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
  REVIEW: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
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
  PROPOSAL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
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
  PROPOSAL: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
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

// CLI-013: TODO - Replace hardcoded "en-IN" locale with user/session locale context
function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

// CLI-013: TODO - Replace hardcoded "en-IN" locale with user/session locale context
function formatDate(d: string | null) {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
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
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // CLI-005: searchInput for the input, debouncedSearch for the fetch
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDeferredValue(searchInput);
  const [statusFilter, setStatusFilter] = useState("ALL");
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
    projectMethodId: "",
    projectStartDate: "",
    deliveryDate: "",
    mediatorName: "",
    mediatorPhone: "",
    mediatorEmail: "",
    notes: "",
    createdAt: "",
  });

  const [showMediator, setShowMediator] = useState(false);

  // Feature 1: Project methods state
  const [projectMethods, setProjectMethods] = useState<{ id: string; name: string }[]>([]);
  const [manageMethodsOpen, setManageMethodsOpen] = useState(false);
  const [newMethodName, setNewMethodName] = useState("");
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [editingMethodName, setEditingMethodName] = useState("");
  const [deleteMethodTarget, setDeleteMethodTarget] = useState<{id: string, name: string} | null>(null);
  const [methodSaving, setMethodSaving] = useState(false);
  const [methodLoading, setMethodLoading] = useState(false);

  // CLI-008: 401 handling helper
  const handleFetchError = useCallback((res: Response): boolean => {
    if (res.status === 401) {
      router.push("/login");
      return true;
    }
    return false;
  }, [router]);

  // ━━ Delete method handler (L2) ━━
  const handleDeleteMethod = async () => {
    if (!deleteMethodTarget) return;
    setMethodSaving(true);
    try {
      const res = await fetch(`/api/project-methods?id=${deleteMethodTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Method deleted successfully");
        fetchProjectMethods();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete method");
      }
    } catch {
      toast.error("Failed to delete method");
    } finally {
      setMethodSaving(false);
      setDeleteMethodTarget(null);
    }
  };

  // ━━ Fetch project methods ━━
  const fetchProjectMethods = useCallback(async () => {
    setMethodLoading(true);
    try {
      const res = await fetch("/api/project-methods", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProjectMethods(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    } finally {
      setMethodLoading(false);
    }
  }, []);

  // Seed default project methods if empty (M-CLI-5: Promise.all)
  const seedDefaultMethods = useCallback(async () => {
    try {
      const res = await fetch("/api/project-methods", { credentials: "include" });
      if (res.ok) {
        const existing: { id: string; name: string }[] = await res.json();
        if (!Array.isArray(existing) || existing.length === 0) {
          const defaults = ["JAVA", "PHP", "HTML", "Other"];
          await Promise.all(defaults.map((name) =>
            fetch("/api/project-methods", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ name }),
            })
          ));
          fetchProjectMethods();
        } else {
          setProjectMethods(existing);
        }
      }
    } catch {
      // silently fail
    }
  }, [fetchProjectMethods]);

  // Redirect non-admin users away from this page
  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  // Fetch project methods on mount
  useEffect(() => {
    if (status === "authenticated" && isAdminUser) {
      seedDefaultMethods();
    }
  }, [status, isAdminUser, seedDefaultMethods]);

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
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load clients");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Failed to load clients");
      setError(err instanceof Error ? err.message : "Failed to load clients");
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

  // Shared handlers for method CRUD (M-CLI-9 + L-CLI-7)
  const handleSaveNewMethod = useCallback(async () => {
    if (!newMethodName.trim() || methodSaving) return;
    setMethodSaving(true);
    try {
      const res = await fetch("/api/project-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newMethodName.trim() }),
      });
      if (res.ok) {
        setNewMethodName("");
        fetchProjectMethods();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to add method");
      }
    } catch {
      toast.error("Failed to add method");
    } finally {
      setMethodSaving(false);
    }
  }, [newMethodName, methodSaving, fetchProjectMethods]);

  const handleSaveEditMethod = useCallback(async (methodId: string, name: string) => {
    if (!name.trim() || methodSaving) return;
    setMethodSaving(true);
    try {
      const res = await fetch("/api/project-methods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: methodId, name: name.trim() }),
      });
      if (res.ok) {
        setEditingMethodId(null);
        fetchProjectMethods();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update method");
      }
    } catch {
      toast.error("Failed to update method");
    } finally {
      setMethodSaving(false);
    }
  }, [methodSaving, fetchProjectMethods]);

  // ━━ Open add dialog ━━
  const handleAdd = () => {
    setEditingClient(null);
    setFormErrors({});
    setShowMediator(false);
    setFormData({
      name: "", email: "", phone: "", company: "", website: "",
      websites: [""],
      status: "ACTIVE",
      projectType: "",
      projectMethodId: "",
      projectStartDate: "",
      deliveryDate: "",
      mediatorName: "", mediatorPhone: "", mediatorEmail: "",
      notes: "", createdAt: "",
    });
    setDialogOpen(true);
  };

  // ━━ Open edit dialog ━━
  const handleEdit = (client: ClientRow | ClientDetail) => {
    setEditingClient(client);
    setFormErrors({});
    setShowMediator(!!(client.mediatorName || client.mediatorPhone));
    // Read websites — prefer full websites array from ClientDetail (H-CLI-3 + L-CLI-4)
    let parsedWebsites: string[] = [""];
    if ('websites' in client && Array.isArray(client.websites) && client.websites.length > 0) {
      parsedWebsites = client.websites.map((w: ClientWebsite) => w.url);
    } else if (client.primaryWebsite) {
      parsedWebsites = [client.primaryWebsite.url];
    } else if (client.website) {
      parsedWebsites = [client.website];
    }
    setFormData({
      name: client.name, email: client.email,
      phone: client.phone || "", company: client.company || "",
      website: client.website || "",
      websites: parsedWebsites,
      status: (client.status as ClientStatus) || "ACTIVE",
      projectType: client.projectType || "",
      projectMethodId: client.projectMethodId || "",
      projectStartDate: client.projectStartDate ? client.projectStartDate.split("T")[0] : "",
      deliveryDate: client.deliveryDate ? client.deliveryDate.split("T")[0] : "",
      mediatorName: client.mediatorName || "",
      mediatorPhone: client.mediatorPhone || "",
      mediatorEmail: client.mediatorEmail || "",
      notes: client.notes || "",
      createdAt: "",
    });
    setDialogOpen(true);
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
            projectMethodId: formData.projectMethodId || null,
            projectStartDate: formData.projectStartDate || null,
            deliveryDate: formData.deliveryDate || null,
            // Transform string array to API-expected object array
            websites: formData.websites.filter(w => w.trim()).map((url, idx) => ({
              url,
              label: null,
              isPrimary: idx === 0,
            })),
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
          toast.error(data.error || "Failed to update client");
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
          projectMethodId: formData.projectMethodId || undefined,
          projectStartDate: formData.projectStartDate || undefined,
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
          toast.error(data.error || "Failed to create client");
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // ━━ Delete client ━━
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/clients/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (handleFetchError(res)) return;
      if (res.ok) {
        toast.success("Client deactivated successfully");
        fetchClients();
        if (detailClient?.id === deleteTarget.id) {
          setDetailClient(null);
        }
      } else {
        // CLI-020: try/catch around res.json() in error branch
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to deactivate client");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeleteTarget(null);
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
        const data = await res.json();
        setDetailClient(data);
      } else {
        // CLI-003: clear detailClient on non-ok response
        setDetailClient(null);
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to load client details");
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
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        toast.success("Notes saved");
        fetchDetail(detailClient.id);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save notes");
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

  // ━━ Early return for non-authenticated / non-admin ━━
  // NOTE: All hooks must be called before any early returns (react-hooks/rules-of-hooks)
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (status !== "authenticated" || !isAdminUser) return null;

  // ━━ Loading state ━━
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
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
    <div className="space-y-6">
      {/* ━━ Header ━━ */}
      <PageHeader title="Client Management" description="Manage your clients and track relationships">
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </PageHeader>

      {/* ━━ Search & Filter ━━ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="client-search"
            placeholder="Search by name, email, phone, company, or website..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            aria-label="Search clients"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="ONBOARDING">Onboarding</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CHURNED">Churned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* CLI-032: Date quick filter buttons */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Today", value: "today" },
          { label: "This Week", value: "this week" },
          { label: "This Month", value: "this month" },
          { label: "This Year", value: "this year" },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={isDateFilterActive(filter.value) ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSearchInput(isDateFilterActive(filter.value) ? "" : filter.value)}
          >
            <Calendar className="h-3 w-3 mr-1" />
            {filter.label}
          </Button>
        ))}
      </div>

      {/* ━━ Stats Cards ━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Clients</p>
                <p className="text-2xl font-bold mt-1">{safeNumber(stats.total)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active Clients</p>
                <p className="text-2xl font-bold mt-1">{safeNumber(stats.active)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
                <p className="text-2xl font-bold mt-1">{stats.revenue != null ? formatCurrency(stats.revenue) : "—"}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* CLI-010: Renamed "Invoices" to "Total Invoices", variable to totalInvoices */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Invoices</p>
                <p className="text-2xl font-bold mt-1">{safeNumber(stats.invoices)}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ━━ Clients Table ━━ */}
      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            searchInput || statusFilter !== "ALL" ? (
              <div className="text-center py-16">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No clients found matching your filters</p>
                <Button variant="outline" className="mt-4" onClick={() => { setSearchInput(""); setStatusFilter("ALL"); }}>
                  <X className="h-4 w-4 mr-2" /> Clear Filters
                </Button>
              </div>
            ) : (
              <div className="text-center py-16">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No clients found</p>
                <Button variant="outline" className="mt-4" onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" /> Add your first client
                </Button>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* CLI-025: aria-sort on sortable headers, CLI-023: sort direction indicator */}
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                      aria-sort={sortBy === "name" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div className="flex items-center gap-1">
                        Company / Name
                        <SortIcon field="name" sortBy={sortBy} sortOrder={sortOrder} />
                      </div>
                    </TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell text-center">Type</TableHead>
                    <TableHead className="text-center">Projects</TableHead>
                    <TableHead
                      className="cursor-pointer select-none text-right"
                      onClick={() => toggleSort("revenue")}
                      aria-sort={sortBy === "revenue" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Revenue
                        <SortIcon field="revenue" sortBy={sortBy} sortOrder={sortOrder} />
                      </div>
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead
                      className="cursor-pointer select-none hidden lg:table-cell"
                      onClick={() => toggleSort("createdAt")}
                      aria-sort={sortBy === "createdAt" ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <div className="flex items-center gap-1">
                        Created
                        <SortIcon field="createdAt" sortBy={sortBy} sortOrder={sortOrder} />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(client)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-semibold text-primary">
                              {safeText(client.company || client.name).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {safeText(client.company || client.name)}
                            </p>
                            {client.company && (
                              <p className="text-xs text-muted-foreground truncate">{safeText(client.name)}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{safeText(client.email)}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{safeText(client.phone) || "—"}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        {client.projectType ? (
                          <Badge className={`text-[10px] ${projectTypeBadgeColors[client.projectType] || defaultBadgeColor}`}>
                            {projectTypeOptions.find(p => p.value === client.projectType)?.label || safeText(client.projectType)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          {safeNumber(client._count?.projects ?? 0)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">
                          {(client.revenue ?? 0) > 0 ? formatCurrency(client.revenue ?? 0) : "—"}
                        </span>
                      </TableCell>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Client actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(client); }}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            {/* CLI-012: Changed "Delete" to "Deactivate" to match dialog */}
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(client); }}
                              className="text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CLI-036: Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} to {Math.min(currentPage * PAGE_SIZE, totalResults)} of {totalResults}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ━━ Add/Edit Client Dialog ━━ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
            <DialogDescription>{editingClient ? "Update client information and settings." : "Add a new client to your organization."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-name" className="text-xs font-medium">Name *</Label>
                <Input id="client-name" placeholder="Client name" value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }}
                  className={formErrors.name ? "border-red-500" : ""} />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-xs font-medium">Email *</Label>
                <Input id="client-email" placeholder="email@example.com" type="email" value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors({ ...formErrors, email: undefined }); }}
                  className={formErrors.email ? "border-red-500" : ""} />
                {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
              </div>
            </div>

            {/* Contact & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-phone" className="text-xs font-medium">Phone</Label>
                <Input id="client-phone" placeholder="+1 (555) 000-0000" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-company" className="text-xs font-medium">Company</Label>
                <Input id="client-company" placeholder="Company name" value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
              </div>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-status" className="text-xs font-medium">Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ClientStatus })}>
                  <SelectTrigger id="client-status"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger id="client-project-type"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    {projectTypeOptions.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="client-project-method" className="text-xs font-medium">Method of Project</Label>
                  {isAdminUser && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground"
                      onClick={() => setManageMethodsOpen(true)}>
                      <Settings className="h-3 w-3" /> Manage
                    </Button>
                  )}
                </div>
                <Select value={formData.projectMethodId} onValueChange={(v) => setFormData({ ...formData, projectMethodId: v })}>
                  <SelectTrigger id="client-project-method"><SelectValue placeholder="Select method..." /></SelectTrigger>
                  <SelectContent>
                    {projectMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-start-date" className="text-xs font-medium">Project Start Date</Label>
                <Input id="client-start-date" type="date" value={formData.projectStartDate}
                  onChange={(e) => setFormData({ ...formData, projectStartDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-delivery-date" className="text-xs font-medium">Delivery Date</Label>
                <Input id="client-delivery-date" type="date" value={formData.deliveryDate}
                  onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })} />
              </div>
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
              <Button type="button" variant="outline" size="sm" className="mt-1"
                onClick={() => setFormData({ ...formData, websites: [...formData.websites, ""] })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Website
              </Button>
            </div>

            {/* Mediator Section — collapsible */}
            <div className="border rounded-lg">
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

      {/* ━━ Delete Confirmation ━━ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Client</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate &quot;{safeText(deleteTarget?.name)}&quot; (mark as churned). This is a terminal status and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Deactivate
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

      {/* ━━ Manage Project Methods Dialog ━━ */}
      <Dialog open={manageMethodsOpen} onOpenChange={setManageMethodsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Project Methods</DialogTitle>
            <DialogDescription>Add, edit, or remove project method options.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add New */}
            <div className="flex gap-2">
              <Input
                placeholder="New method name..."
                value={newMethodName}
                onChange={(e) => setNewMethodName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveNewMethod();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={!newMethodName.trim() || methodSaving}
                onClick={handleSaveNewMethod}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Existing Methods */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {methodLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-muted/50 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <>
                  {projectMethods.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No methods defined</p>
                  )}
                  {projectMethods.map((pm) => (
                    <div key={pm.id} className="flex items-center gap-2">
                      {editingMethodId === pm.id ? (
                        <>
                          <Input
                            className="h-8 text-sm"
                            value={editingMethodName}
                            onChange={(e) => setEditingMethodName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); handleSaveEditMethod(pm.id, editingMethodName); }
                              if (e.key === "Escape") setEditingMethodId(null);
                            }}
                          />
                          <Button type="button" variant="ghost" size="sm" className="h-8"
                            disabled={methodSaving}
                            onClick={() => handleSaveEditMethod(pm.id, editingMethodName)}>
                            ✓
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-8"
                            onClick={() => setEditingMethodId(null)}>
                            ✕
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{pm.name}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7"
                            onClick={() => { setEditingMethodId(pm.id); setEditingMethodName(pm.name); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500"
                            onClick={() => setDeleteMethodTarget({ id: pm.id, name: pm.name })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ━━ Delete Method Confirmation (L2) ━━ */}
      <AlertDialog open={!!deleteMethodTarget} onOpenChange={(open) => !open && setDeleteMethodTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project Method</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{safeText(deleteMethodTarget?.name)}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={methodSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMethod} className="bg-red-600 hover:bg-red-700" disabled={methodSaving}>
              {methodSaving ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ━━ Client Detail Drawer ━━ */}
      <Sheet
        open={!!detailClient}
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
        <SheetContent className="w-full sm:max-w-[520px] p-0">
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Separator />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : detailClient ? (
            /* CLI-027: aria-live on detail drawer content */
            <div className="flex flex-col h-full" aria-live="polite">
              {/* Header */}
              <SheetHeader className="p-6 pb-4 border-b">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <SheetTitle className="text-lg">{safeText(detailClient.company || detailClient.name)}</SheetTitle>
                    {detailClient.company && (
                      <p className="text-sm text-muted-foreground">{safeText(detailClient.name)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* CLI-030: default gray fallback */}
                    <Badge className={statusColors[detailClient.status] || defaultBadgeColor}>
                      {statusLabels[detailClient.status] || safeText(detailClient.status)}
                    </Badge>
                    {/* CLI-035: Edit button in detail drawer */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const client = detailClient;
                        setDetailClient(null);
                        handleEdit(client);
                      }}
                      aria-label="Edit client"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
                  {detailClient.projectMethod && (
                    <div className="flex items-center gap-1.5">
                      <Badge className="text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                        {safeText(detailClient.projectMethod.name)}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-muted-foreground">Revenue: <span className="font-medium text-foreground">{(detailClient.revenue ?? 0) > 0 ? formatCurrency(detailClient.revenue ?? 0) : "—"}</span></span>
                  <span className="text-muted-foreground">Since: <span className="font-medium text-foreground">{formatDate(detailClient.createdAt)}</span></span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {detailClient.projectStartDate && (
                    <span>Start: <span className="text-foreground font-medium">{formatDate(detailClient.projectStartDate)}</span></span>
                  )}
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
              </SheetHeader>

              {/* Tabs */}
              <Tabs defaultValue="projects" className="flex-1 flex flex-col min-h-0">
                <div className="px-6 pt-3">
                  <TabsList className="w-full">
                    <TabsTrigger value="projects" className="flex-1 text-xs">
                      <FolderKanban className="h-3 w-3 mr-1" /> Projects
                    </TabsTrigger>
                    <TabsTrigger value="invoices" className="flex-1 text-xs">
                      <FileText className="h-3 w-3 mr-1" /> Invoices
                    </TabsTrigger>
                    {/* CLI-018: Leads tab */}
                    <TabsTrigger value="leads" className="flex-1 text-xs">
                      <UserCheck className="h-3 w-3 mr-1" /> Leads
                    </TabsTrigger>
                    <TabsTrigger value="tickets" className="flex-1 text-xs">
                      <HeadphonesIcon className="h-3 w-3 mr-1" /> Support
                    </TabsTrigger>
                    <TabsTrigger value="deals" className="flex-1 text-xs">
                      <DollarSign className="h-3 w-3 mr-1" /> Deals
                    </TabsTrigger>
                    <TabsTrigger value="contacts" className="flex-1 text-xs">
                      <Users className="h-3 w-3 mr-1" /> Contacts
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="flex-1 text-xs">
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
                        <Card key={project.id} className="py-0">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{safeText(project.name)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {project.budget ? formatCurrency(project.budget) : "No budget"} • Due: {formatDate(project.deadline)}
                                </p>
                              </div>
                              <Badge className={`text-[10px] shrink-0 ${projectStatusColors[project.status] || defaultBadgeColor}`}>
                                {projectStatusLabels[project.status] || safeText(project.status)}
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
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
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* Invoices Tab */}
                  <TabsContent value="invoices" className="mt-3 space-y-2">
                    {detailClient.invoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet</p>
                    ) : (
                      detailClient.invoices.map((inv) => (
                        <Card key={inv.id} className="py-0">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{safeText(inv.invoiceNumber)}</p>
                                <p className="text-xs text-muted-foreground">
                                  Due: {formatDate(inv.dueDate)}
                                  {inv.paidAt && ` • Paid: ${formatDate(inv.paidAt)}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold">{formatCurrency(inv.total)}</p>
                                <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || defaultBadgeColor}`}>
                                  {invoiceStatusLabels[inv.status] || safeText(inv.status)}
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* CLI-018: Leads Tab */}
                  <TabsContent value="leads" className="mt-3 space-y-2">
                    {detailClient.leads.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No leads yet</p>
                    ) : (
                      detailClient.leads.map((lead) => (
                        <Card key={lead.id} className="py-0">
                          <CardContent className="p-3">
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
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* Tickets Tab */}
                  <TabsContent value="tickets" className="mt-3 space-y-2">
                    {detailClient.tickets.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No support tickets</p>
                    ) : (
                      detailClient.tickets.map((ticket) => (
                        <Card key={ticket.id} className="py-0">
                          <CardContent className="p-3">
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
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* Deals Tab */}
                  <TabsContent value="deals" className="mt-3 space-y-2">
                    {detailClient.deals.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No deals yet</p>
                    ) : (
                      detailClient.deals.map((deal) => (
                        <Card key={deal.id} className="py-0">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{safeText(deal.title)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {deal.value ? formatCurrency(deal.value) : "No value"} • Close: {formatDate(deal.expectedCloseDate)}
                                </p>
                              </div>
                              <Badge className={`text-[10px] shrink-0 ${dealStageColors[deal.stage] || defaultBadgeColor}`}>
                                {dealStageLabels[deal.stage] || safeText(deal.stage)}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </TabsContent>

                  {/* Contacts Tab */}
                  <TabsContent value="contacts" className="mt-3 space-y-2">
                    {detailClient.contacts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">No contacts yet</p>
                    ) : (
                      detailClient.contacts.map((contact) => (
                        <Card key={contact.id} className="py-0">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {safeText(contact.firstName)}{contact.lastName ? ` ${safeText(contact.lastName)}` : ""}
                                  {contact.isPrimary && <Badge variant="secondary" className="text-[10px] ml-1.5">Primary</Badge>}
                                </p>
                                <p className="text-xs text-muted-foreground">{safeText(contact.email)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
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
                <div className="p-4 border-t bg-muted/30">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => {
                      router.push(`/dashboard/projects?clientId=${detailClient.id}`);
                    }}>
                      <FolderKanban className="h-3 w-3 mr-1" /> Create Project
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => {
                      router.push(`/dashboard/finance/invoices?clientId=${detailClient.id}`);
                    }}>
                      <FileText className="h-3 w-3 mr-1" /> Create Invoice
                    </Button>
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
