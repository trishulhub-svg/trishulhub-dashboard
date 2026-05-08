"use client";

import { useEffect, useState, useCallback, useRef, useDeferredValue, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Briefcase, Plus, Search, Users, DollarSign, FileText, Phone, Mail,
  Building2, Globe, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, ArrowUpDown,
  FolderKanban, HeadphonesIcon, StickyNote, ExternalLink, AlertCircle, UserCheck,
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

// ━━ Types ━━
interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  website: string | null;
  status: string;
  userId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { projects: number; invoices: number; tickets: number };
  // CLI-017: revenue may be undefined from API
  revenue: number | undefined;
}

interface ClientDetail extends ClientRow {
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
};

const leadStatusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CONTACTED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  QUALIFIED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
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

// CLI-013: TODO - Replace hardcoded "en-IN" locale with user/session locale context
function formatCurrency(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

// CLI-013: TODO - Replace hardcoded "en-IN" locale with user/session locale context
function formatDate(d: string | null) {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRow | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // Detail drawer state
  const [detailClient, setDetailClient] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

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
    status: "ACTIVE" as ClientStatus,
    notes: "",
    createdAt: "",
  });

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
  const fetchClients = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      // CLI-005: use debouncedSearch instead of search
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/clients?${params.toString()}`, { credentials: "include", signal });
      if (handleFetchError(res)) return;
      if (res.ok) {
        const result = await res.json();
        // Handle paginated response format { data, total, page, limit, totalPages }
        const data: ClientRow[] = Array.isArray(result) ? result : (result.data || []);
        // CLI-001: Client-side revenue sort (API now supports it, but keep fallback)
        if (sortBy === "revenue") {
          data.toSorted((a: ClientRow, b: ClientRow) => {
            const diff = (a.revenue || 0) - (b.revenue || 0);
            return sortOrder === "asc" ? diff : -diff;
          });
        }
        setClients(data);
      } else {
        // CLI-020: try/catch around res.json() in error branch
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
    const controller = new AbortController();
    fetchClients(controller.signal);
    return () => controller.abort();
  }, [fetchClients]);

  // ━━ Stats (useMemo to avoid recomputing on every render) ━━
  const { total: totalClients, active: activeClients, revenue: totalRevenue, invoices: totalInvoices } = useMemo(() => ({
    total: clients.length,
    active: clients.filter((c) => c.status === "ACTIVE").length,
    revenue: clients.reduce((sum, c) => sum + (c.revenue || 0), 0),
    invoices: clients.reduce((sum, c) => sum + (c._count?.invoices || 0), 0),
  }), [clients]);

  // ━━ Open add dialog ━━
  const handleAdd = () => {
    setEditingClient(null);
    setFormErrors({});
    setFormData({
      name: "",
      email: "",
      phone: "",
      company: "",
      website: "",
      status: "ACTIVE",
      notes: "",
      createdAt: "",
    });
    setDialogOpen(true);
  };

  // ━━ Open edit dialog ━━
  const handleEdit = (client: ClientRow) => {
    setEditingClient(client);
    setFormErrors({});
    setFormData({
      name: client.name,
      email: client.email,
      phone: client.phone || "",
      company: client.company || "",
      website: client.website || "",
      status: (client.status as ClientStatus) || "ACTIVE",
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
    // CLI-011: warn about unsaved notes before switching clients
    if (notesDirty) {
      const confirmed = window.confirm("You have unsaved notes. Discard changes and switch client?");
      if (!confirmed) return;
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Client Management</h1>
            <p className="text-muted-foreground text-sm">Manage your clients and track relationships</p>
          </div>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      {/* ━━ Search & Filter ━━ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="client-search"
            placeholder="Search by name, email, or company..."
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
          </SelectContent>
        </Select>
      </div>

      {/* ━━ Stats Cards ━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Clients</p>
                <p className="text-2xl font-bold mt-1">{totalClients}</p>
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
                <p className="text-2xl font-bold mt-1">{activeClients}</p>
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
                <p className="text-2xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
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
                <p className="text-2xl font-bold mt-1">{totalInvoices}</p>
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
            <div className="text-center py-16">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No clients found</p>
              <Button variant="outline" className="mt-4" onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-2" /> Add your first client
              </Button>
            </div>
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
                              {(client.company || client.name).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {client.company || client.name}
                            </p>
                            {client.company && (
                              <p className="text-xs text-muted-foreground truncate">{client.name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{client.email}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{client.phone || "—"}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          {client._count?.projects || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-medium">
                          {(client.revenue ?? 0) > 0 ? formatCurrency(client.revenue ?? 0) : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {/* CLI-030: default gray fallback for status badges */}
                        <Badge className={`text-[10px] ${statusColors[client.status] || defaultBadgeColor}`}>
                          {client.status}
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

      {/* ━━ Add/Edit Client Dialog ━━ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
            <DialogDescription>{editingClient ? "Update client information and settings." : "Add a new client to your organization."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CLI-026: id/htmlFor on labels and inputs */}
              <div className="space-y-2">
                <Label htmlFor="client-name" className="text-xs font-medium">Name *</Label>
                <Input
                  id="client-name"
                  placeholder="Client name"
                  value={formData.name}
                  onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setFormErrors({ ...formErrors, name: undefined }); }}
                  className={formErrors.name ? "border-red-500" : ""}
                />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-xs font-medium">Email *</Label>
                <Input
                  id="client-email"
                  placeholder="email@example.com"
                  type="email"
                  value={formData.email}
                  onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setFormErrors({ ...formErrors, email: undefined }); }}
                  className={formErrors.email ? "border-red-500" : ""}
                />
                {formErrors.email && <p className="text-xs text-red-500">{formErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-phone" className="text-xs font-medium">Phone</Label>
                {/* CLI-014: generic phone placeholder */}
                <Input
                  id="client-phone"
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-company" className="text-xs font-medium">Company</Label>
                <Input
                  id="client-company"
                  placeholder="Company name"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-website" className="text-xs font-medium">Website</Label>
                <Input
                  id="client-website"
                  placeholder="https://example.com"
                  value={formData.website}
                  onChange={(e) => { setFormData({ ...formData, website: e.target.value }); setFormErrors({ ...formErrors, website: undefined }); }}
                  className={formErrors.website ? "border-red-500" : ""}
                />
                {formErrors.website && <p className="text-xs text-red-500">{formErrors.website}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-status" className="text-xs font-medium">Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ClientStatus })}>
                  <SelectTrigger id="client-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editingClient && (
              <div className="space-y-2">
                <Label htmlFor="client-created-at" className="text-xs font-medium">Created At (Optional)</Label>
                <Input
                  id="client-created-at"
                  type="date"
                  value={formData.createdAt}
                  onChange={(e) => { setFormData({ ...formData, createdAt: e.target.value }); setFormErrors({ ...formErrors, createdAt: undefined }); }}
                  className={formErrors.createdAt ? "border-red-500" : ""}
                />
                {formErrors.createdAt && <p className="text-xs text-red-500">{formErrors.createdAt}</p>}
                <p className="text-xs text-muted-foreground">Override date for adding historical data</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="client-notes" className="text-xs font-medium">Notes</Label>
              <Textarea
                id="client-notes"
                placeholder="Add any notes about this client..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              {/* CLI-007: disable submit button when submitting */}
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
              This will set &quot;{deleteTarget?.name}&quot; to INACTIVE status. You can reactivate them later.
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
                    <SheetTitle className="text-lg">{detailClient.company || detailClient.name}</SheetTitle>
                    {detailClient.company && (
                      <p className="text-sm text-muted-foreground">{detailClient.name}</p>
                    )}
                  </div>
                  {/* CLI-030: default gray fallback */}
                  <Badge className={statusColors[detailClient.status] || defaultBadgeColor}>
                    {detailClient.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> {detailClient.email}
                  </div>
                  {detailClient.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" /> {detailClient.phone}
                    </div>
                  )}
                  {detailClient.company && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" /> {detailClient.company}
                    </div>
                  )}
                  {detailClient.website && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe className="h-3.5 w-3.5" /> {detailClient.website}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-muted-foreground">Revenue: <span className="font-medium text-foreground">{(detailClient.revenue ?? 0) > 0 ? formatCurrency(detailClient.revenue ?? 0) : "—"}</span></span>
                  <span className="text-muted-foreground">Since: <span className="font-medium text-foreground">{formatDate(detailClient.createdAt)}</span></span>
                </div>
                {detailClient.portalUser && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <ExternalLink className="h-3 w-3" />
                    Portal: {detailClient.portalUser.name} ({detailClient.portalUser.email})
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
                                <p className="text-sm font-medium truncate">{project.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {project.budget ? formatCurrency(project.budget) : "No budget"} • Due: {formatDate(project.deadline)}
                                </p>
                              </div>
                              <Badge className={`text-[10px] shrink-0 ${projectStatusColors[project.status] || defaultBadgeColor}`}>
                                {project.status}
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                <span>Progress</span>
                                {/* CLI-022: clamp progress bar */}
                                <span>{Math.min(100, Math.max(0, project.progress))}%</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
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
                                <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                                <p className="text-xs text-muted-foreground">
                                  Due: {formatDate(inv.dueDate)}
                                  {inv.paidAt && ` • Paid: ${formatDate(inv.paidAt)}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold">{formatCurrency(inv.total)}</p>
                                <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || defaultBadgeColor}`}>
                                  {inv.status}
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
                                <p className="text-sm font-medium truncate">{lead.name}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge className={`text-[10px] ${leadStatusColors[lead.status] || defaultBadgeColor}`}>
                                  {lead.status}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  Score: {lead.score}
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
                                <p className="text-sm font-medium truncate">{ticket.subject}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(ticket.createdAt)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge className={`text-[10px] ${priorityColors[ticket.priority] || defaultBadgeColor}`}>
                                  {ticket.priority}
                                </Badge>
                                <Badge className={`text-[10px] ${ticketStatusColors[ticket.status] || defaultBadgeColor}`}>
                                  {ticket.status}
                                </Badge>
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
