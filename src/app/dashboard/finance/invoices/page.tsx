"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { handleFetchError } from "@/lib/fetch-utils";
import {
  Plus, Send, CheckCircle2, FileText, AlertCircle, Trash2, X, Pencil,
  Eye, Search, DollarSign, Clock, TrendingUp, ChevronLeft, ChevronRight,
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
import { emitFinanceChanged, useFinanceLiveRefresh } from "@/lib/finance-events";
import { PageHeader } from "@/components/page-header";
import { CollapsibleStatStrip } from "@/components/collapsible-stat-strip";
import { useUrlState } from "@/hooks/use-url-state";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, safeText, safeNumber } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { FinanceReportSection } from "@/components/dashboard/finance/finance-report-section";

// ━━ Configurable Constants ━━
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || "TrishulHub";
const COMPANY_TAGLINE = process.env.NEXT_PUBLIC_COMPANY_TAGLINE || "AI-Powered Web Development";
const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || "£";

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

const ITEMS_PER_PAGE = 12;

const formatCurrency = (n: number) =>
  `${CURRENCY_SYMBOL}${new Intl.NumberFormat("en-IN").format(n)}`;

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
  gstEnabled = true,
  onGstEnabledChange,
  currencyFormatter,
}: {
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
  onGstPercentChange: (v: number) => void;
  gstEnabled?: boolean;
  onGstEnabledChange?: (enabled: boolean) => void;
  currencyFormatter: (n: number) => string;
}) {
  return (
    <div className="border rounded-md p-3 space-y-2 text-sm bg-muted/30">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{currencyFormatter(subtotal)}</span>
      </div>
      {onGstEnabledChange && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-emerald-600"
            checked={!gstEnabled}
            onChange={(e) => onGstEnabledChange(!e.target.checked)}
          />
          No GST — exclude GST from this invoice
        </label>
      )}
      {gstEnabled ? (
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
      ) : (
        <div className="flex justify-between text-muted-foreground">
          <span>GST</span>
          <span className="font-medium">Excluded</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-lg pt-2 border-t">
        <span>Total</span>
        <span>{currencyFormatter(total)}</span>
      </div>
    </div>
  );
}

// ━━ Main Page ━━
export default function InvoicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading invoices…</div>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [statusFilter, setStatusFilter] = useUrlState("status", "ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);

  // ━━ Line items state (create) ━━
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Web Development", quantity: 1, rate: 0, amount: 0 },
  ]);
  // GST optional — default on at 18%; "No GST" sets 0
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("UNPAID");
  const [invoiceNotes, setInvoiceNotes] = useState<string>("");

  // ━━ Edit invoice state ━━
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [editGstEnabled, setEditGstEnabled] = useState(true);
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
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

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

  const clientOptions = useMemo(
    () => clients.map((c) => ({ id: c.id, label: safeText(c.name) })),
    [clients]
  );
  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, label: safeText(p.name) })),
    [projects]
  );

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

  useFinanceLiveRefresh(() => {
    void fetchData();
  });

  // Deep-link from Clients: /dashboard/finance/invoices?clientId=xxx → open create with client prefilled
  useEffect(() => {
    if (!isAdminUser || status !== "authenticated") return;
    const clientId = searchParams.get("clientId");
    if (!clientId) return;
    setCreateClientId(clientId);
    const match = clients.find((c) => c.id === clientId);
    if (match) setClientSearch(match.name);
    setAddOpen(true);
    router.replace("/dashboard/finance/invoices", { scroll: false });
  }, [isAdminUser, status, searchParams, router, clients]);

  // ━━ Create form helpers ━━
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const effectiveGstPercent = gstEnabled ? gstPercent : 0;
  const gstAmount = subtotal * (effectiveGstPercent / 100);
  const totalAmount = subtotal + gstAmount;

  const resetInvoiceForm = () => {
    setLineItems([
      { description: "Web Development", quantity: 1, rate: 0, amount: 0 },
    ]);
    setGstEnabled(true);
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
      currency: "GBP",
      dueDate: (form.get("dueDate") as string) || null,
      gstPercent: effectiveGstPercent,
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
        emitFinanceChanged();
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
        emitFinanceChanged();
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
        emitFinanceChanged();
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
        emitFinanceChanged();
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

  const openPaymentDialog = (inv: Invoice) => {
    setPaymentInvoice(inv);
    setPaymentAmount(String(inv.total ?? ""));
    setPaymentMethodInput(inv.paymentMethod || "");
    setPaymentNote("");
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoice) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setPaymentSubmitting(true);
    try {
      const res = await fetch("/api/invoices/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          invoiceId: paymentInvoice.id,
          amount,
          method: paymentMethodInput || null,
          note: paymentNote || null,
        }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Payment recorded");
        emitFinanceChanged();
        setPaymentInvoice(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(safeText(data.error, "Failed to record payment"));
      }
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setPaymentSubmitting(false);
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
    setEditGstEnabled((inv.gstPercent ?? 0) > 0);
    setEditGstPercent(inv.gstPercent && inv.gstPercent > 0 ? inv.gstPercent : 18);
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
  const effectiveEditGstPercent = editGstEnabled ? editGstPercent : 0;
  const editGstAmount = editSubtotal * (effectiveEditGstPercent / 100);
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
          gstPercent: effectiveEditGstPercent,
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
        emitFinanceChanged();
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
      <div className="space-y-4">
        {/* Loading skeletons matching final layout */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-3.5 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2.5 animate-pulse">
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2.5 animate-pulse"
            >
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3 mt-2" />
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
    <div className="space-y-4">
      {/* ━━ Page Header ━━ */}
      <PageHeader title="Invoices" description="Create and manage invoices">
        <Dialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) resetInvoiceForm();
            // Refetch clients if empty — fixes intermittent "No clients found" (L4)
            if (open && clients.length === 0) {
              void fetch("/api/clients", { credentials: "include" })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                  if (!data) return;
                  setClients(Array.isArray(data) ? data : data?.data || []);
                })
                .catch(() => {});
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent
            formGuardKey="invoice-create"
            className="flex max-h-[calc(100dvh-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
            onPointerDownOutside={(e) => {
              const t = e.target as HTMLElement | null
              if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
            }}
            onFocusOutside={(e) => {
              const t = e.target as HTMLElement | null
              if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
            }}
            onInteractOutside={(e) => {
              const t = e.target as HTMLElement | null
              if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
            }}
          >
            <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4 pr-12">
              <DialogTitle>Create Invoice</DialogTitle>
              <DialogDescription>
                Create a new invoice for a client.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <input type="hidden" name="clientId" value={createClientId} required />
                  <SearchableCombobox
                    valueId={createClientId}
                    search={clientSearch}
                    onSearchChange={setClientSearch}
                    open={clientDropdownOpen}
                    onOpenChange={setClientDropdownOpen}
                    options={clientOptions}
                    placeholder="Search client..."
                    emptyLabel="No clients found"
                    recentLimit={3}
                    onSelect={(opt) => {
                      setCreateClientId(opt.id);
                      setClientSearch(opt.label);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Project</Label>
                  <input type="hidden" name="projectId" value={createProjectId} />
                  <SearchableCombobox
                    valueId={createProjectId}
                    search={projectSearch}
                    onSearchChange={setProjectSearch}
                    open={projectDropdownOpen}
                    onOpenChange={setProjectDropdownOpen}
                    options={projectOptions}
                    placeholder="Search project..."
                    emptyLabel="No projects found"
                    recentLimit={3}
                    leadingOption={{ id: "NONE", label: "No Project" }}
                    onSelect={(opt) => {
                      setCreateProjectId(opt.id);
                      setProjectSearch(opt.label);
                    }}
                  />
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
                gstEnabled={gstEnabled}
                onGstEnabledChange={setGstEnabled}
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

      <FinanceReportSection />

      <CollapsibleStatStrip
        title="Invoice summary"
        storageKey="finance-invoices-stats-open"
        defaultOpen={false}
        items={[
          {
            key: "total",
            label: "Total",
            value: formatCurrency(summaryStats.total),
            hint: `${invoices.length} invoice(s)`,
            icon: <DollarSign className="h-4 w-4 text-primary" />,
          },
          {
            key: "paid",
            label: "Paid",
            value: formatCurrency(summaryStats.paid),
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
          },
          {
            key: "pending",
            label: "Pending",
            value: formatCurrency(summaryStats.pending),
            icon: <Clock className="h-4 w-4 text-amber-600" />,
          },
          {
            key: "overdue",
            label: "Overdue",
            value: formatCurrency(summaryStats.overdue),
            icon: <AlertCircle className="h-4 w-4 text-red-600" />,
          },
        ]}
      />

      {/* ━━ 2. Filter Bar ━━ */}
      <div
        className={cn(
          "bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl px-3 py-2.5"
        )}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search invoices by number, client, or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9 text-sm rounded-lg"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44 h-9 text-sm rounded-lg">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
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
            "bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-8",
            "flex flex-col items-center justify-center gap-2"
          )}
        >
          <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-sm font-medium text-muted-foreground">No invoices found</p>
            <p className="text-xs text-muted-foreground">
              {searchQuery || statusFilter !== "ALL"
                ? "Try adjusting your search or filters"
                : "Create your first invoice to get started"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
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
                  "bg-card/50 backdrop-blur-sm border rounded-xl px-3 py-2.5",
                  "hover:shadow-md hover:border-primary/20 transition-all duration-150",
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Icon + Details */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
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
                          "h-4 w-4",
                          statusInfo.color
                        )}
                      />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold truncate">
                          {safeText(inv.invoiceNumber, "—")}
                        </p>
                        <Badge
                          className={cn(
                            "text-[10px] px-1.5 py-0 h-5",
                            invoiceStatusColors[inv.status] || ""
                          )}
                        >
                          {safeText(inv.status, "—")}
                        </Badge>
                        {inv.paymentStatus && (
                          <Badge
                            className={cn(
                              "text-[10px] px-1.5 py-0 h-5",
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
                      <p className="text-xs text-muted-foreground truncate">
                        <span className="font-medium text-foreground/70">
                          {safeText(inv.client?.name, "Unknown Client")}
                        </span>
                        {inv.project
                          ? ` · ${safeText(inv.project.name, "")}`
                          : ""}
                        <span className="text-muted-foreground/50"> · </span>
                        Due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                  </div>

                  {/* Right: Amount + Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap pl-10 sm:pl-0">
                    <div className="text-right sm:min-w-[88px]">
                      <p className="text-base font-semibold tabular-nums tracking-tight">
                        {formatCurrency(safeNumber(inv.total))}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setPreviewInvoice(inv)}
                        aria-label="Preview invoice"
                        title="Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEditDialog(inv)}
                        aria-label="Edit invoice"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteInvoice(inv.id)}
                        aria-label="Delete invoice"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={sendingInvoiceId === inv.id}
                        onClick={() => handleSendInvoiceEmail(inv)}
                        title="Email this invoice to the client"
                      >
                        <Send className="h-3 w-3 mr-1" />
                        {sendingInvoiceId === inv.id ? "Sending…" : "Send"}
                      </Button>
                      {inv.status !== "PAID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-green-600"
                          onClick={() =>
                            handleUpdateStatus(inv.id, "PAID")
                          }
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Mark
                          Paid
                        </Button>
                      )}
                      {(inv.status === "SENT" || inv.paymentStatus === "UNPAID") && inv.status !== "PAID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openPaymentDialog(inv)}
                          title="Record a partial or full payment"
                        >
                          <DollarSign className="h-3 w-3 mr-1" /> Pay
                        </Button>
                      )}
                      {(inv.status === "SENT" || inv.status === "PAID") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
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
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={page === safeCurrentPage ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 p-0 text-xs"
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
            className="h-7 w-7 p-0"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
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
        <DialogContent
          formGuardKey="invoice-edit"
          className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onPointerDownOutside={(e) => {
            const t = e.target as HTMLElement | null
            if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
          }}
          onFocusOutside={(e) => {
            const t = e.target as HTMLElement | null
            if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            const t = e.target as HTMLElement | null
            if (t?.closest?.('[data-slot="popover-content"]')) e.preventDefault()
          }}
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>Modify invoice details.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-6">
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
                <SearchableCombobox
                  valueId={editClientId}
                  search={editClientSearch}
                  onSearchChange={setEditClientSearch}
                  open={editClientDropdownOpen}
                  onOpenChange={setEditClientDropdownOpen}
                  options={clientOptions}
                  placeholder="Search client..."
                  emptyLabel="No clients found"
                  recentLimit={3}
                  onSelect={(opt) => {
                    setEditClientId(opt.id);
                    setEditClientSearch(opt.label);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <SearchableCombobox
                  valueId={editProjectId}
                  search={editProjectSearch}
                  onSearchChange={setEditProjectSearch}
                  open={editProjectDropdownOpen}
                  onOpenChange={setEditProjectDropdownOpen}
                  options={projectOptions}
                  placeholder="Search project..."
                  emptyLabel="No projects found"
                  recentLimit={3}
                  leadingOption={{ id: "NONE", label: "No Project" }}
                  onSelect={(opt) => {
                    setEditProjectId(opt.id);
                    setEditProjectSearch(opt.label);
                  }}
                />
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
              gstEnabled={editGstEnabled}
              onGstEnabledChange={setEditGstEnabled}
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

      {/* ━━ Record Payment ━━ */}
      <Dialog open={!!paymentInvoice} onOpenChange={(open) => { if (!open) setPaymentInvoice(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {paymentInvoice ? `Invoice ${safeText(paymentInvoice.invoiceNumber)} · ${formatCurrency(paymentInvoice.total)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method (optional)</Label>
              <Select value={paymentMethodInput || "NONE"} onValueChange={(v) => setPaymentMethodInput(v === "NONE" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent portal position="popper" className="max-h-[min(18rem,var(--radix-select-content-available-height))]">
                  <SelectItem value="NONE">None</SelectItem>
                  {PAYMENT_METHODS.filter((m) => m.value).map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                rows={2}
                placeholder="Transaction ref, UPI ID, etc."
              />
            </div>
            <Button className="w-full" onClick={handleRecordPayment} disabled={paymentSubmitting}>
              {paymentSubmitting ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
