"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { handleFetchError } from "@/lib/fetch-utils";
import {
  Plus, Send, CheckCircle2, FileText, AlertCircle, Trash2, X, Pencil,
  Eye, Search, DollarSign, Clock, TrendingUp, ChevronLeft, ChevronRight,
  ChevronDown,
} from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, safeText, safeNumber } from "@/lib/utils";
import { useRef } from "react";

// ━━ Configurable Constants ━━
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "TrishulHub";
const COMPANY_TAGLINE = process.env.NEXT_PUBLIC_COMPANY_TAGLINE || "AI-Powered Web Development";
const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "₹";

// TODO: Make default line item configurable via settings
const PAYMENT_METHODS = [
  { value: "", label: "None" },
  { value: "UPI", label: "UPI" },
  { value: "CREDIT_DEBIT_CARD", label: "Credit/Debit Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
] as const;

// ━━ Constants ━━
const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const paymentStatusColors: Record<string, string> = {
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  UNPAID: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  DUE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const paymentMethodLabels: Record<string, string> = {
  UPI: "UPI",
  CREDIT_DEBIT_CARD: "Credit/Debit Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

const statusIconMap: Record<string, { icon: typeof FileText; color: string }> = {
  DRAFT: { icon: FileText, color: "text-gray-400" },
  SENT: { icon: Send, color: "text-blue-500" },
  PAID: { icon: CheckCircle2, color: "text-green-500" },
  OVERDUE: { icon: AlertCircle, color: "text-red-500" },
};

const ITEMS_PER_PAGE = 8;

const formatCurrency = (n: number) =>
  `${CURRENCY_SYMBOL}${new Intl.NumberFormat("en-IN").format(n)}`;

const formatDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

// ━━ Line Item Type ━━
interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

// ━━ Typed Invoice ━━
interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  client: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  dueDate: string | null;
  createdAt: string;
  paidAt?: string;
  items: string;
  paymentMethod?: string;
  paymentStatus?: string;
  gst?: number;
  gstPercent?: number;
  notes?: string;
}

// ━━ Line Items Sub-component (shared between create & edit) ━━
function LineItemsEditor({
  items,
  onChange,
  currencyFormatter,
}: {
  items: LineItem[];
  onChange: (updated: LineItem[]) => void;
  currencyFormatter: (n: number) => string;
}) {
  const add = () =>
    onChange([...items, { description: "", quantity: 1, rate: 0, amount: 0 }]);
  const remove = (idx: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== idx));
  };
  const update = (idx: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === "quantity" || field === "rate") {
      updated[idx].amount = updated[idx].quantity * updated[idx].rate;
    }
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Line Items</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={add}>
          <Plus className="h-3 w-3 mr-1" /> Add Item
        </Button>
      </div>
      <div className="border rounded-md overflow-hidden overflow-x-auto">
        <div className="grid grid-cols-12 gap-1 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
          <div className="col-span-5">Description</div>
          <div className="col-span-2 text-right">Qty</div>
          <div className="col-span-2 text-right">Rate ({CURRENCY_SYMBOL})</div>
          <div className="col-span-2 text-right">Amount</div>
          <div className="col-span-1" />
        </div>
        <div className="max-h-48 overflow-y-auto">
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1 p-2 border-t">
              <input
                className="col-span-5 border rounded px-2 py-1 text-sm bg-background"
                placeholder="Description"
                value={item.description}
                onChange={(e) => update(idx, "description", e.target.value)}
              />
              <input
                className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  update(idx, "quantity", parseInt(e.target.value) || 0)
                }
              />
              <input
                className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                type="number"
                min={0}
                value={item.rate}
                onChange={(e) =>
                  update(idx, "rate", parseFloat(e.target.value) || 0)
                }
              />
              <div className="col-span-2 flex items-center justify-end text-sm font-medium pr-2">
                {currencyFormatter(item.amount)}
              </div>
              <button
                type="button"
                className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
                onClick={() => remove(idx)}
                disabled={items.length <= 1}
                title="Remove item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ━━ Totals Sub-component ━━
function TotalsDisplay({
  subtotal,
  gstPercent,
  gstAmount,
  total,
  onGstPercentChange,
  currencyFormatter,
}: {
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  onGstPercentChange: (v: number) => void;
  currencyFormatter: (n: number) => string;
}) {
  return (
    <div className="border rounded-md p-3 space-y-1 text-sm bg-muted/30">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{currencyFormatter(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">GST</span>
          <input
            className="w-16 border rounded px-2 py-0.5 text-xs bg-background text-right"
            type="number"
            min={0}
            max={100}
            value={gstPercent}
            onChange={(e) => onGstPercentChange(parseFloat(e.target.value) || 0)}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
        <span className="font-medium">{currencyFormatter(gstAmount)}</span>
      </div>
      <div className="flex justify-between font-bold text-lg pt-2 border-t">
        <span>Total</span>
        <span>{currencyFormatter(total)}</span>
      </div>
    </div>
  );
}

// ━━ Main Page ━━
export default function InvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  // ━━ State ━━
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);

  // ━━ Line items state (create) ━━
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Web Development", quantity: 1, rate: 50000, amount: 50000 },
  ]);
  // TODO: Make GST percent configurable via system settings
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("UNPAID");
  const [invoiceNotes, setInvoiceNotes] = useState<string>("");

  // ━━ Edit invoice state ━━
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editGstPercent, setEditGstPercent] = useState<number>(18);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("");
  const [editPaymentStatus, setEditPaymentStatus] = useState<string>("UNPAID");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editClientId, setEditClientId] = useState<string>("");
  const [editProjectId, setEditProjectId] = useState<string>("");
  // P7A: Allow editing status (even on PAID invoices) and invoice number — user must
  // be able to edit ANY field on ANY invoice regardless of status.
  const [editStatus, setEditStatus] = useState<string>("DRAFT");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState<string>("");
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const [editDueDate, setEditDueDate] = useState<string>("");

  // ━━ Searchable combobox state (create) ━━
  const [createClientId, setCreateClientId] = useState<string>("");
  const [createProjectId, setCreateProjectId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState<string>("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState<string>("");
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);

  // ━━ Searchable combobox state (edit) ━━
  const [editClientSearch, setEditClientSearch] = useState<string>("");
  const [editClientDropdownOpen, setEditClientDropdownOpen] = useState(false);
  const [editProjectSearch, setEditProjectSearch] = useState<string>("");
  const [editProjectDropdownOpen, setEditProjectDropdownOpen] = useState(false);

  // ━━ Click-outside & Escape key handlers for combobox dropdowns ━━
  const createClientRef = useRef<HTMLDivElement>(null);
  const createProjectRef = useRef<HTMLDivElement>(null);
  const editClientRef = useRef<HTMLDivElement>(null);
  const editProjectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClientDropdownOpen(false);
        setProjectDropdownOpen(false);
        setEditClientDropdownOpen(false);
        setEditProjectDropdownOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (createClientRef.current && !createClientRef.current.contains(target)) {
        setClientDropdownOpen(false);
      }
      if (createProjectRef.current && !createProjectRef.current.contains(target)) {
        setProjectDropdownOpen(false);
      }
      if (editClientRef.current && !editClientRef.current.contains(target)) {
        setEditClientDropdownOpen(false);
      }
      if (editProjectRef.current && !editProjectRef.current.contains(target)) {
        setEditProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ━━ Fetch data ━━
  const fetchData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [invRes, clientRes, projRes] = await Promise.all([
          fetch("/api/invoices", { credentials: "include", signal }),
          fetch("/api/clients", { credentials: "include", signal }),
          fetch("/api/projects", { credentials: "include", signal }),
        ]);
        if (handleFetchError(invRes, router)) return;
        if (invRes.ok) {
          const invData = await invRes.json().catch(() => null);
          setInvoices(Array.isArray(invData) ? invData : invData?.data || []);
        }
        if (handleFetchError(clientRes, router)) return;
        if (clientRes.ok) {
          const clientData = await clientRes.json().catch(() => null);
          setClients(Array.isArray(clientData) ? clientData : clientData?.data || []);
        }
        if (handleFetchError(projRes, router)) return;
        if (projRes.ok) {
          const projData = await projRes.json().catch(() => null);
          setProjects(Array.isArray(projData) ? projData : projData?.data || []);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(err);
        setError("Failed to load invoices. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // ━━ Create form helpers ━━
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gstAmount = subtotal * (gstPercent / 100);
  const totalAmount = subtotal + gstAmount;

  const resetInvoiceForm = () => {
    setLineItems([
      { description: "Web Development", quantity: 1, rate: 50000, amount: 50000 },
    ]);
    setGstPercent(18);
    setPaymentMethod("");
    setPaymentStatus("UNPAID");
    setInvoiceNotes("");
    setCreateClientId("");
    setCreateProjectId("");
    setClientSearch("");
    setProjectSearch("");
  };

  // ━━ Create Invoice ━━
  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clientId = form.get("clientId") as string;

    if (!clientId) {
      toast.error("Please select a client");
      return;
    }

    const validItems = lineItems.filter(
      (item) => item.description.trim() && item.quantity > 0 && item.rate >= 0
    );
    if (validItems.length === 0) {
      toast.error("At least one line item with a description is required");
      return;
    }

    const items = validItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
    }));

    const data = {
      clientId,
      projectId:
        (form.get("projectId") as string) === "NONE"
          ? null
          : (form.get("projectId") as string) || null,
      items: JSON.stringify(items),
      subtotal,
      // P7A: This system uses GST as its only tax line. Sending tax: 0 (not
      // gstAmount) prevents the totals from being double-counted — the backend
      // recomputes total = subtotal + tax + gst, and validation requires
      // total === subtotal + tax + gst, so tax MUST be 0 here.
      tax: 0,
      total: totalAmount,
      dueDate: (form.get("dueDate") as string) || null,
      gstPercent,
      gst: gstAmount,
      paymentMethod: paymentMethod || null,
      paymentStatus,
      notes: invoiceNotes || null,
    };

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Invoice created");
        setAddOpen(false);
        resetInvoiceForm();
        fetchData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(safeText(errData.error, "Failed to create invoice"));
      }
    } catch {
      toast.error("Failed to create invoice.");
    }
  };

  // ━━ Delete Invoice ━━
  const handleDeleteInvoice = async (id: string) => setPendingDelete(id);

  const executeDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/invoices?id=${pendingDelete}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Invoice deleted");
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, "Failed to delete invoice"));
      }
    } catch {
      toast.error("Failed to delete invoice");
    }
    setPendingDelete(null);
  };

  // ━━ Update Invoice Status ━━
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const body: Record<string, string> = { id, status: newStatus };
      if (newStatus === "PAID") body.paymentStatus = "PAID";
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success(`Invoice marked as ${newStatus}`);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, `Failed to update invoice status`));
      }
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  const handleUpdatePaymentStatus = async (
    id: string,
    newPaymentStatus: string
  ) => {
    const label =
      newPaymentStatus === "UNPAID"
        ? "Unpaid"
        : newPaymentStatus === "PAID"
          ? "Paid"
          : newPaymentStatus === "DUE"
            ? "Due"
            : newPaymentStatus;
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, paymentStatus: newPaymentStatus }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success(`Payment status updated to ${label}`);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          safeText(data.error, "Failed to update payment status")
        );
      }
    } catch {
      toast.error("Failed to update payment status");
    }
  };

  // ━━ Send Invoice Email ━━
  // Calls /api/invoices/send which delivers the invoice to the client's email via
  // the configured SMTP servers (with failover) AND marks the invoice as SENT.
  // The user must be able to email ANY invoice regardless of current status
  // (e.g., to resend a paid invoice as a receipt).
  const handleSendInvoiceEmail = async (inv: Invoice) => {
    if (sendingInvoiceId) return; // Prevent double-clicks
    setSendingInvoiceId(inv.id);
    try {
      const res = await fetch("/api/invoices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invoiceId: inv.id }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.success(safeText(data.message, "Invoice emailed to client"));
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, "Failed to send invoice email"));
      }
    } catch {
      toast.error("Failed to send invoice email");
    } finally {
      setSendingInvoiceId(null);
    }
  };

  // ━━ Edit Invoice ━━
  const openEditDialog = (inv: Invoice) => {
    let items: LineItem[];
    try {
      items = JSON.parse(inv.items || "[]") as LineItem[];
    } catch {
      items = [];
    }
    setEditInvoice(inv);
    setEditLineItems(
      items.length > 0
        ? items
        : [{ description: "", quantity: 1, rate: 0, amount: 0 }]
    );
    setEditGstPercent(inv.gstPercent || 18);
    setEditPaymentMethod(inv.paymentMethod || "");
    setEditPaymentStatus(inv.paymentStatus || "UNPAID");
    setEditNotes(inv.notes || "");
    setEditClientId(inv.client?.id || "");
    setEditClientSearch(inv.client?.name || "");
    setEditProjectId(inv.project?.id || "");
    setEditProjectSearch(inv.project?.name || "");
    setEditDueDate(
      inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : ""
    );
    // P7A: Initialize status + invoice number so they're editable for ALL invoices
    setEditStatus(inv.status || "DRAFT");
    setEditInvoiceNumber(inv.invoiceNumber || "");
  };

  const editSubtotal = editLineItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );
  const editGstAmount = editSubtotal * (editGstPercent / 100);
  const editTotalAmount = editSubtotal + editGstAmount;

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    const validItems = editLineItems.filter(
      (item) => item.description.trim() && item.quantity > 0 && item.rate >= 0
    );
    if (validItems.length === 0) {
      toast.error("At least one line item with a description is required");
      return;
    }
    if (!editClientId) {
      toast.error("Please select a client");
      return;
    }
    if (!editInvoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }

    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: editInvoice.id,
          invoiceNumber: editInvoiceNumber.trim(),
          status: editStatus,
          clientId: editClientId,
          projectId: editProjectId === "NONE" ? null : (editProjectId || null),
          items: JSON.stringify(
            validItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
            }))
          ),
          subtotal: editSubtotal,
          // P7A: This system uses GST as its only tax line. Sending tax: 0 (not
          // gstAmount) prevents the totals from being double-counted — the backend
          // recomputes total = subtotal + tax + gst, and validation requires
          // total === subtotal + tax + gst, so tax MUST be 0 here.
          tax: 0,
          total: editTotalAmount,
          gstPercent: editGstPercent,
          gst: editGstAmount,
          paymentMethod: editPaymentMethod || null,
          paymentStatus: editPaymentStatus,
          notes: editNotes || null,
          dueDate: editDueDate || null,
        }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Invoice updated");
        setEditInvoice(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, "Failed to update invoice"));
      }
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  // TODO: Implement server-side pagination for large invoice datasets
  // ━━ Filtering & Pagination ━━
  const filtered = useMemo(() => {
    let result = invoices;

    if (statusFilter !== "ALL") {
      result = result.filter((i) => i.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          safeText(i.invoiceNumber, "").toLowerCase().includes(q) ||
          safeText(i.client?.name, "").toLowerCase().includes(q) ||
          safeText(i.project?.name, "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [invoices, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedInvoices = filtered.slice(
    (safeCurrentPage - 1) * ITEMS_PER_PAGE,
    safeCurrentPage * ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // ━━ Summary Stats ━━
  const summaryStats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + safeNumber(i.total), 0);
    const paid = invoices
      .filter((i) => i.status === "PAID")
      .reduce((s, i) => s + safeNumber(i.total), 0);
    const pending = invoices
      .filter((i) => i.status === "SENT")
      .reduce((s, i) => s + safeNumber(i.total), 0);
    const overdue = invoices
      .filter((i) => i.status === "OVERDUE")
      .reduce((s, i) => s + safeNumber(i.total), 0);
    return { total, paid, pending, overdue };
  }, [invoices]);

  // ━━ Auth guard ━━
  if (status === "loading") {
    return (
      <div className="space-y-6">
        {/* Loading skeletons matching final layout */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 animate-pulse">
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1 rounded-xl" />
            <Skeleton className="h-10 w-40 rounded-xl" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5 animate-pulse"
            >
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4 mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || !isAdminUser) return null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <AlertCircle className="h-7 w-7 text-red-500" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium text-red-600">Failed to load invoices</p>
          <p className="text-sm text-muted-foreground">{safeText(error)}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            fetchData();
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ━━ Page Header ━━ */}
      <PageHeader title="Invoices" description="Create and manage invoices">
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetInvoiceForm();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
              <DialogDescription>
                Create a new invoice for a client.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <input type="hidden" name="clientId" value={createClientId} required />
                  <div className="relative" ref={createClientRef}>
                    <input
                      type="text"
                      className="border rounded px-3 py-2 text-sm bg-background w-full pr-8"
                      placeholder="Search client..."
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setClientDropdownOpen(true);
                      }}
                      onFocus={() => setClientDropdownOpen(true)}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setClientDropdownOpen(!clientDropdownOpen)}>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {clientDropdownOpen && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {(() => {
                          const filtered = clientSearch.trim()
                            ? clients.filter((c) => safeText(c.name, "").toLowerCase().includes(clientSearch.trim().toLowerCase()))
                            : clients.slice(0, 10);
                          return filtered.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-2">No clients found</p>
                          ) : (
                            <>
                              {!clientSearch.trim() && <p className="text-xs text-muted-foreground p-2 font-medium">Recent</p>}
                              {filtered.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${createClientId === c.id ? "bg-muted" : ""}`}
                                  onClick={() => {
                                    setCreateClientId(c.id);
                                    setClientSearch(safeText(c.name));
                                    setClientDropdownOpen(false);
                                  }}
                                >
                                  {safeText(c.name)}
                                </button>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Project</Label>
                  <input type="hidden" name="projectId" value={createProjectId} />
                  <div className="relative" ref={createProjectRef}>
                    <input
                      type="text"
                      className="border rounded px-3 py-2 text-sm bg-background w-full pr-8"
                      placeholder="Search project..."
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(e.target.value);
                        setProjectDropdownOpen(true);
                      }}
                      onFocus={() => setProjectDropdownOpen(true)}
                    />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {projectDropdownOpen && (
                      <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {(() => {
                          const filtered = projectSearch.trim()
                            ? projects.filter((p) => safeText(p.name, "").toLowerCase().includes(projectSearch.trim().toLowerCase()))
                            : projects.slice(0, 10);
                          return filtered.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-2">No projects found</p>
                          ) : (
                            <>
                              {!projectSearch.trim() && <p className="text-xs text-muted-foreground p-2 font-medium">Recent</p>}
                              <button
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${createProjectId === "NONE" ? "bg-muted" : ""}`}
                                onClick={() => {
                                  setCreateProjectId("NONE");
                                  setProjectSearch("No Project");
                                  setProjectDropdownOpen(false);
                                }}
                              >
                                No Project
                              </button>
                              {filtered.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${createProjectId === p.id ? "bg-muted" : ""}`}
                                  onClick={() => {
                                    setCreateProjectId(p.id);
                                    setProjectSearch(safeText(p.name));
                                    setProjectDropdownOpen(false);
                                  }}
                                >
                                  {safeText(p.name)}
                                </button>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <LineItemsEditor
                items={lineItems}
                onChange={setLineItems}
                currencyFormatter={formatCurrency}
              />

              <TotalsDisplay
                subtotal={subtotal}
                gstPercent={gstPercent}
                gstAmount={gstAmount}
                total={totalAmount}
                onGstPercentChange={setGstPercent}
                currencyFormatter={formatCurrency}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="border rounded px-3 py-2 text-sm bg-background w-full"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input name="dueDate" type="date" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Status</Label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="border rounded px-3 py-2 text-sm bg-background w-full"
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PAID">Paid</option>
                    <option value="DUE">Due</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes (optional)"
                />
              </div>

              <Button type="submit" className="w-full">
                Create Invoice
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* ━━ 1. Summary Stats Cards ━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-primary"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total
              </p>
              <p className="text-2xl font-bold">
                {formatCurrency(summaryStats.total)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {invoices.length} invoice(s)
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>

        {/* Paid */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-green-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Paid
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summaryStats.paid)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        {/* Pending */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-amber-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pending
              </p>
              <p className="text-2xl font-bold text-amber-600">
                {formatCurrency(summaryStats.pending)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-5",
            "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
            "border-t-2 border-t-red-500"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Overdue
              </p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summaryStats.overdue)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* ━━ 2. Filter Bar ━━ */}
      <div
        className={cn(
          "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4"
        )}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices by number, client, or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 rounded-xl">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ━━ 3. Invoice Cards ━━ */}
      {paginatedInvoices.length === 0 && !loading ? (
        <div
          className={cn(
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-12",
            "flex flex-col items-center justify-center gap-3"
          )}
        >
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-medium text-muted-foreground">No invoices found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your search or filters"
                : "Create your first invoice to get started"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedInvoices.map((inv) => {
            const statusInfo = statusIconMap[inv.status] || {
              icon: FileText,
              color: "text-muted-foreground",
            };
            const StatusIcon = statusInfo.icon;

            return (
              <div
                key={safeText(inv.id)}
                className={cn(
                  "bg-card/50 backdrop-blur-sm border rounded-2xl p-5",
                  "hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200",
                  "cursor-pointer group",
                  inv.status === "OVERDUE"
                    ? "border-red-200 dark:border-red-900/40"
                    : "border-border/50"
                )}
                onClick={() => setPreviewInvoice(inv)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreviewInvoice(inv);
                  }
                }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Icon + Details */}
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                        inv.status === "OVERDUE"
                          ? "bg-red-100 dark:bg-red-900/30"
                          : inv.status === "PAID"
                            ? "bg-green-100 dark:bg-green-900/30"
                            : inv.status === "SENT"
                              ? "bg-blue-100 dark:bg-blue-900/30"
                              : "bg-gray-100 dark:bg-gray-800/50"
                      )}
                    >
                      <StatusIcon
                        className={cn(
                          "h-5 w-5",
                          statusInfo.color
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">
                          {safeText(inv.invoiceNumber, "—")}
                        </p>
                        <Badge
                          className={cn(
                            "text-[10px] px-2 py-0.5",
                            invoiceStatusColors[inv.status] || ""
                          )}
                        >
                          {safeText(inv.status, "—")}
                        </Badge>
                        {inv.paymentStatus && (
                          <Badge
                            className={cn(
                              "text-[10px] px-2 py-0.5",
                              paymentStatusColors[inv.paymentStatus] || ""
                            )}
                          >
                            {inv.paymentStatus === "UNPAID"
                              ? "Unpaid"
                              : inv.paymentStatus === "PAID"
                                ? "Paid"
                                : inv.paymentStatus === "DUE"
                                  ? "Due"
                                  : safeText(inv.paymentStatus)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {safeText(inv.client?.name, "Unknown Client")}
                        {inv.project
                          ? ` · ${safeText(inv.project.name, "")}`
                          : ""}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Created: {formatDate(inv.createdAt)}</span>
                        <span>Due: {formatDate(inv.dueDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount + Actions */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
                    <div className="text-right sm:min-w-[100px]">
                      <p className="text-xl font-bold">
                        {formatCurrency(safeNumber(inv.total))}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPreviewInvoice(inv)}
                        aria-label="Preview invoice"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(inv)}
                        aria-label="Edit invoice"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteInvoice(inv.id)}
                        aria-label="Delete invoice"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={sendingInvoiceId === inv.id}
                        onClick={() => handleSendInvoiceEmail(inv)}
                        title="Email this invoice to the client"
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        {sendingInvoiceId === inv.id ? "Sending…" : "Send"}
                      </Button>
                      {inv.status !== "PAID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-green-600"
                          onClick={() =>
                            handleUpdateStatus(inv.id, "PAID")
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark
                          Paid
                        </Button>
                      )}
                      {(inv.status === "SENT" || inv.status === "PAID") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            const newPaymentStatus =
                              inv.paymentStatus === "UNPAID"
                                ? "DUE"
                                : inv.paymentStatus === "DUE"
                                  ? "PAID"
                                  : "UNPAID";
                            handleUpdatePaymentStatus(inv.id, newPaymentStatus);
                          }}
                          title="Toggle payment status"
                        >
                          <span className="text-[10px]">
                            Payment:{" "}
                            {inv.paymentStatus === "UNPAID"
                              ? "Unpaid"
                              : inv.paymentStatus === "DUE"
                                ? "Due"
                                : inv.paymentStatus === "PAID"
                                  ? "Paid"
                                  : safeText(inv.paymentStatus)}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ━━ 4. Pagination ━━ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === safeCurrentPage ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setCurrentPage(page)}
                aria-label={`Page ${page}`}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            {filtered.length} invoice(s)
          </span>
        </div>
      )}

      {/* ━━ Invoice Preview Panel ━━ */}
      {previewInvoice && (() => {
        let previewItems: {
          description: string;
          quantity: number;
          rate: number;
          amount: number;
        }[];
        try {
          previewItems = JSON.parse(previewInvoice.items || "[]");
        } catch {
          previewItems = [];
        }
        return (
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setPreviewInvoice(null)}
          >
            <div
              className="fixed right-0 top-0 h-full w-full sm:w-[520px] bg-background border-l shadow-xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Invoice Preview</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewInvoice(null)}
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="border rounded-xl p-6 space-y-4">
                  <div className="flex justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{COMPANY_NAME}</h3>
                      <p className="text-xs text-muted-foreground">
                        {COMPANY_TAGLINE}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        {safeText(previewInvoice.invoiceNumber)}
                      </p>
                      <Badge
                        className={cn(
                          "text-xs",
                          invoiceStatusColors[previewInvoice.status] || ""
                        )}
                      >
                        {safeText(previewInvoice.status)}
                      </Badge>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium">
                      Bill To:{" "}
                      {safeText(previewInvoice.client?.name, "Client")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due: {formatDate(previewInvoice.dueDate)}
                    </p>
                    {previewInvoice.paymentMethod && (
                      <p className="text-xs text-muted-foreground">
                        Payment:{" "}
                        {paymentMethodLabels[previewInvoice.paymentMethod] ||
                          safeText(previewInvoice.paymentMethod)}
                      </p>
                    )}
                    {previewInvoice.paymentStatus && (
                      <p className="text-xs text-muted-foreground">
                        Payment Status:{" "}
                        {previewInvoice.paymentStatus === "UNPAID"
                          ? "Unpaid"
                          : previewInvoice.paymentStatus === "PAID"
                            ? "Paid"
                            : previewInvoice.paymentStatus === "DUE"
                              ? "Due"
                              : safeText(previewInvoice.paymentStatus)}
                      </p>
                    )}
                  </div>
                  <div className="border-t pt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left py-2">Description</th>
                          <th className="text-right py-2">Qty</th>
                          <th className="text-right py-2">Rate</th>
                          <th className="text-right py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((item, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-2">
                              {safeText(item.description)}
                            </td>
                            <td className="text-right py-2">
                              {safeNumber(item.quantity)}
                            </td>
                            <td className="text-right py-2">
                              {CURRENCY_SYMBOL}{safeNumber(item.rate).toLocaleString()}
                            </td>
                            <td className="text-right py-2">
                              {CURRENCY_SYMBOL}{safeNumber(item.amount).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t pt-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>
                        {formatCurrency(
                          safeNumber(previewInvoice.subtotal)
                        )}
                      </span>
                    </div>
                    {previewInvoice.gstPercent ? (
                      <div className="flex justify-between">
                        <span>
                          GST ({safeNumber(previewInvoice.gstPercent)}%)
                        </span>
                        <span>
                          {formatCurrency(
                            safeNumber(previewInvoice.gst)
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between">
                        <span>Tax</span>
                        <span>
                          {formatCurrency(
                            safeNumber(previewInvoice.tax)
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span>
                        {formatCurrency(
                          safeNumber(previewInvoice.total)
                        )}
                      </span>
                    </div>
                  </div>
                  {previewInvoice.notes && (
                    <div className="border-t pt-4">
                      <p className="text-xs text-muted-foreground font-medium">
                        Notes:
                      </p>
                      <p className="text-sm">
                        {safeText(previewInvoice.notes)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ━━ Delete Confirmation Dialog ━━ */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This invoice will be permanently deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ━━ Edit Invoice Dialog ━━ */}
      <Dialog
        open={!!editInvoice}
        onOpenChange={(open) => {
          if (!open) setEditInvoice(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>Modify invoice details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* P7A: Invoice Number + Status — editable for ALL invoices (incl. PAID) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Invoice Number *</Label>
                <Input
                  value={editInvoiceNumber}
                  onChange={(e) => setEditInvoiceNumber(e.target.value)}
                  placeholder="INV-XXXX"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background w-full"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="SENT">Sent</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Client *</Label>
                <div className="relative" ref={editClientRef}>
                  <input
                    type="text"
                    className="border rounded px-3 py-2 text-sm bg-background w-full pr-8"
                    placeholder="Search client..."
                    value={editClientSearch}
                    onChange={(e) => {
                      setEditClientSearch(e.target.value);
                      setEditClientDropdownOpen(true);
                    }}
                    onFocus={() => setEditClientDropdownOpen(true)}
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setEditClientDropdownOpen(!editClientDropdownOpen)}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {editClientDropdownOpen && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {(() => {
                        const filtered = editClientSearch.trim()
                          ? clients.filter((c) => safeText(c.name, "").toLowerCase().includes(editClientSearch.trim().toLowerCase()))
                          : clients.slice(0, 10);
                        return filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">No clients found</p>
                        ) : (
                          <>
                            {!editClientSearch.trim() && <p className="text-xs text-muted-foreground p-2 font-medium">Recent</p>}
                            {filtered.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${editClientId === c.id ? "bg-muted" : ""}`}
                                onClick={() => {
                                  setEditClientId(c.id);
                                  setEditClientSearch(safeText(c.name));
                                  setEditClientDropdownOpen(false);
                                }}
                              >
                                {safeText(c.name)}
                              </button>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <div className="relative" ref={editProjectRef}>
                  <input
                    type="text"
                    className="border rounded px-3 py-2 text-sm bg-background w-full pr-8"
                    placeholder="Search project..."
                    value={editProjectSearch}
                    onChange={(e) => {
                      setEditProjectSearch(e.target.value);
                      setEditProjectDropdownOpen(true);
                    }}
                    onFocus={() => setEditProjectDropdownOpen(true)}
                  />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setEditProjectDropdownOpen(!editProjectDropdownOpen)}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {editProjectDropdownOpen && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {(() => {
                        const filtered = editProjectSearch.trim()
                          ? projects.filter((p) => safeText(p.name, "").toLowerCase().includes(editProjectSearch.trim().toLowerCase()))
                          : projects.slice(0, 10);
                        return filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">No projects found</p>
                        ) : (
                          <>
                            {!editProjectSearch.trim() && <p className="text-xs text-muted-foreground p-2 font-medium">Recent</p>}
                            <button
                              type="button"
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${editProjectId === "NONE" ? "bg-muted" : ""}`}
                              onClick={() => {
                                setEditProjectId("NONE");
                                setEditProjectSearch("No Project");
                                setEditProjectDropdownOpen(false);
                              }}
                            >
                              No Project
                            </button>
                            {filtered.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${editProjectId === p.id ? "bg-muted" : ""}`}
                                onClick={() => {
                                  setEditProjectId(p.id);
                                  setEditProjectSearch(safeText(p.name));
                                  setEditProjectDropdownOpen(false);
                                }}
                              >
                                {safeText(p.name)}
                              </button>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <LineItemsEditor
              items={editLineItems}
              onChange={setEditLineItems}
              currencyFormatter={formatCurrency}
            />

            <TotalsDisplay
              subtotal={editSubtotal}
              gstPercent={editGstPercent}
              gstAmount={editGstAmount}
              total={editTotalAmount}
              onGstPercentChange={setEditGstPercent}
              currencyFormatter={formatCurrency}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background w-full"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Status</Label>
                <select
                  value={editPaymentStatus}
                  onChange={(e) => setEditPaymentStatus(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background w-full"
                >
                  <option value="UNPAID">Unpaid</option>
                  <option value="PAID">Paid</option>
                  <option value="DUE">Due</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                placeholder="Additional notes (optional)"
              />
            </div>

            <Button onClick={handleSaveEdit} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
