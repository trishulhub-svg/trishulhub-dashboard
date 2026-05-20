"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { handleFetchError } from "@/lib/fetch-utils";
import {
  Plus, Send, CheckCircle2, FileText, AlertCircle, Trash2, X, Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// ━━ Line Item Type ━━
interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export default function InvoicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // Redirect non-admin users away from this page
  useEffect(() => {
    if (status === "authenticated" && !isAdminUser) {
      router.push("/dashboard");
    }
  }, [status, router, isAdminUser]);

  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("ALL");

  const { data: invoicesPageData, isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ["invoices-page"],
    queryFn: async () => {
      const [invRes, clientRes, projRes] = await Promise.all([
        fetch("/api/invoices", { credentials: 'include' }),
        fetch("/api/clients", { credentials: 'include' }),
        fetch("/api/projects", { credentials: 'include' }),
      ]);
      if (handleFetchError(invRes, router)) throw new Error("Unauthorized");
      if (!invRes.ok) throw new Error("Failed to load invoices");
      const invData = await invRes.json().catch(() => null);
      const invoices = Array.isArray(invData) ? invData : invData.data || [];

      if (handleFetchError(clientRes, router)) throw new Error("Unauthorized");
      const clientData = clientRes.ok ? await clientRes.json().catch(() => null) : null;
      const clients = Array.isArray(clientData) ? clientData : clientData?.data || [];

      if (handleFetchError(projRes, router)) throw new Error("Unauthorized");
      const projData = projRes.ok ? await projRes.json().catch(() => null) : null;
      const projects = Array.isArray(projData) ? projData : projData?.data || [];

      return { invoices, clients, projects };
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
  const invoices = invoicesPageData?.invoices || [];
  const clients = invoicesPageData?.clients || [];
  const projects = invoicesPageData?.projects || [];
  const loading = invoicesLoading;
  const error = invoicesError ? (invoicesError instanceof Error ? invoicesError.message : "Failed to load invoices") : null;
  const [previewInvoice, setPreviewInvoice] = useState<Record<string, unknown> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Feature 4: Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Web Development", quantity: 1, rate: 50000, amount: 50000 },
  ]);

  // Feature 5: New invoice fields
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("UNPAID");
  const [invoiceNotes, setInvoiceNotes] = useState<string>("");

  // Edit invoice state
  const [editOpen, setEditOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<{
    id: string; clientId: string; projectId?: string | null;
    items: string; subtotal: number; tax: number; total: number;
    dueDate?: string | null; gstPercent?: number | null; gst?: number | null;
    paymentMethod?: string | null; paymentStatus?: string | null; notes?: string | null;
  } | null>(null);
  const [editClientId, setEditClientId] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  if (status === "loading") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (status !== "authenticated" || !isAdminUser) return null;


  // ━━ Line item helpers ━━
  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "quantity" || field === "rate") {
      updated[index].amount = updated[index].quantity * updated[index].rate;
    }
    setLineItems(updated);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gstAmount = subtotal * (gstPercent / 100);
  const totalAmount = subtotal + gstAmount;

  const resetInvoiceForm = () => {
    setLineItems([{ description: "Web Development", quantity: 1, rate: 50000, amount: 50000 }]);
    setGstPercent(18);
    setPaymentMethod("");
    setPaymentStatus("UNPAID");
    setInvoiceNotes("");
  };

  // ━━ Open Edit Dialog ━━
  const openEditDialog = (inv: { id: string; clientId: string; projectId?: string | null; items: string; subtotal: number; tax: number; total: number; dueDate?: string | null; gstPercent?: number | null; gst?: number | null; paymentMethod?: string | null; paymentStatus?: string | null; notes?: string | null }) => {
    try {
      const parsed = JSON.parse(inv.items || "[]") as LineItem[];
      setLineItems(parsed.length > 0 ? parsed : [{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    } catch {
      setLineItems([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    }
    setGstPercent(inv.gstPercent ?? 18);
    setPaymentMethod(inv.paymentMethod || "");
    setPaymentStatus(inv.paymentStatus || "UNPAID");
    setInvoiceNotes(inv.notes || "");
    setEditClientId(inv.clientId);
    setEditProjectId(inv.projectId || "NONE");
    setEditDueDate(inv.dueDate ? inv.dueDate.split("T")[0] : "");
    setEditInvoice(inv);
    setEditOpen(true);
  };

  const handleEditInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editInvoice) return;

    if (!editClientId) {
      toast.error("Please select a client");
      return;
    }

    const validItems = lineItems.filter((item) => item.description.trim() && item.quantity > 0 && item.rate >= 0);
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
      id: editInvoice.id,
      clientId: editClientId,
      projectId: editProjectId === "NONE" ? null : editProjectId || null,
      items: JSON.stringify(items),
      subtotal,
      tax: gstAmount,
      total: totalAmount,
      dueDate: editDueDate || null,
      gstPercent,
      gst: gstAmount,
      paymentMethod: paymentMethod || null,
      paymentStatus,
      notes: invoiceNotes || null,
    };

    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Invoice updated");
        setEditOpen(false);
        setEditInvoice(null);
        resetInvoiceForm();
        queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update invoice");
      }
    } catch {
      toast.error("Failed to update invoice.");
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const clientId = form.get("clientId") as string;

    if (!clientId) {
      toast.error("Please select a client");
      return;
    }

    const validItems = lineItems.filter((item) => item.description.trim() && item.quantity > 0 && item.rate >= 0);
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
      projectId: (form.get("projectId") as string) === "NONE" ? null : (form.get("projectId") as string) || null,
      items: JSON.stringify(items),
      subtotal,
      tax: gstAmount,
      total: totalAmount,
      dueDate: form.get("dueDate") as string || null,
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
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success("Invoice created");
        setAddOpen(false);
        resetInvoiceForm();
        queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to create invoice");
      }
    } catch {
      toast.error("Failed to create invoice.");
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    setPendingDelete(id);
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch("/api/invoices", { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: 'include', body: JSON.stringify({ id: pendingDelete }) });
      if (handleFetchError(res, router)) return;
      if (res.ok) { toast.success("Invoice deleted"); queryClient.invalidateQueries({ queryKey: ["invoices-page"] }); }
      else { const data = await res.json().catch(() => ({})); toast.error(data.error || "Failed to delete invoice"); }
    } catch { toast.error("Failed to delete invoice"); }
    setPendingDelete(null);
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const body: Record<string, string> = { id, status };
      // When marking invoice as PAID, also set paymentStatus to PAID
      if (status === "PAID") body.paymentStatus = "PAID";
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success(`Invoice marked as ${status}`);
        queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to update invoice status`);
      }
    } catch {
      toast.error("Failed to update invoice");
    }
  };

  const handleUpdatePaymentStatus = async (id: string, paymentStatus: string) => {
    const label = paymentStatus === "UNPAID" ? "Unpaid" : paymentStatus === "PAID" ? "Paid" : paymentStatus === "DUE" ? "Due" : paymentStatus;
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id, paymentStatus }),
      });
      if (handleFetchError(res, router)) return;
      if (res.ok) {
        toast.success(`Payment status updated to ${label}`);
        queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update payment status");
      }
    } catch {
      toast.error("Failed to update payment status");
    }
  };

  const filtered = filter === "ALL"
    ? invoices
    : (invoices as { status: string }[]).filter((i) => i.status === filter);

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["invoices-page"] }); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" description="Create and manage invoices">
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetInvoiceForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle><DialogDescription>Create a new invoice for a client.</DialogDescription></DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Client *</Label>
                  <Select name="clientId" required>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {(clients as { id: string; name: string }[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Project</Label>
                  <Select name="projectId">
                    <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No Project</SelectItem>
                      {(projects as { id: string; name: string }[]).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Feature 4: Dynamic Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Line Items</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addLineItem}>
                    <Plus className="h-3 w-3 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-12 gap-1 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                    <div className="col-span-5">Description</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Rate (₹)</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1"></div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {lineItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1 p-2 border-t">
                        <input
                          className="col-span-5 border rounded px-2 py-1 text-sm bg-background"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                        />
                        <input
                          className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, "quantity", parseInt(e.target.value) || 0)}
                        />
                        <input
                          className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                          type="number"
                          min={0}
                          value={item.rate}
                          onChange={(e) => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                        />
                        <div className="col-span-2 flex items-center justify-end text-sm font-medium pr-2">
                          {formatCurrency(item.amount)}
                        </div>
                        <button
                          type="button"
                          className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
                          onClick={() => removeLineItem(idx)}
                          disabled={lineItems.length <= 1}
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="border rounded-md p-3 space-y-1 text-sm bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
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
                      onChange={(e) => setGstPercent(parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <span className="font-medium">{formatCurrency(gstAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment Method</Label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="border rounded px-3 py-2 text-sm bg-background w-full"
                  >
                    <option value="">None</option>
                    <option value="UPI">UPI</option>
                    <option value="CREDIT_DEBIT_CARD">Credit/Debit Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
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

              <Button type="submit" className="w-full">Create Invoice</Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Edit Invoice Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditInvoice(null); resetInvoiceForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Invoice</DialogTitle><DialogDescription>Edit an existing invoice.</DialogDescription></DialogHeader>
          <form onSubmit={handleEditInvoice} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Client *</Label>
                <Select value={editClientId} onValueChange={setEditClientId} required>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {(clients as { id: string; name: string }[]).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Project</Label>
                <Select value={editProjectId} onValueChange={setEditProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Project</SelectItem>
                    {(projects as { id: string; name: string }[]).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Line Items</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addLineItem}>
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-12 gap-1 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Rate (₹)</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-1 p-2 border-t">
                      <input
                        className="col-span-5 border rounded px-2 py-1 text-sm bg-background"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      />
                      <input
                        className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, "quantity", parseInt(e.target.value) || 0)}
                      />
                      <input
                        className="col-span-2 border rounded px-2 py-1 text-sm bg-background text-right"
                        type="number"
                        min={0}
                        value={item.rate}
                        onChange={(e) => updateLineItem(idx, "rate", parseFloat(e.target.value) || 0)}
                      />
                      <div className="col-span-2 flex items-center justify-end text-sm font-medium pr-2">
                        {formatCurrency(item.amount)}
                      </div>
                      <button
                        type="button"
                        className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
                        onClick={() => removeLineItem(idx)}
                        disabled={lineItems.length <= 1}
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Totals */}
            <div className="border rounded-md p-3 space-y-1 text-sm bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
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
                    onChange={(e) => setGstPercent(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <span className="font-medium">{formatCurrency(gstAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment Method</Label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="border rounded px-3 py-2 text-sm bg-background w-full"
                >
                  <option value="">None</option>
                  <option value="UPI">UPI</option>
                  <option value="CREDIT_DEBIT_CARD">Credit/Debit Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
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

            <Button type="submit" className="w-full">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 flex-wrap">
        {["ALL", "DRAFT", "SENT", "PAID", "OVERDUE"].map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "ALL" ? "All" : s}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {(filtered as { id: string; invoiceNumber: string; status: string; total: number; subtotal: number; tax: number; client: { name: string }; project?: { name: string }; dueDate: string; paidAt?: string; items: string; paymentMethod?: string; paymentStatus?: string; gst?: number; gstPercent?: number; notes?: string }[]).map((inv) => (
          <Card key={inv.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">{inv.client?.name} {inv.project ? `• ${inv.project.name}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatCurrency(inv.total)}</p>
                    <p className="text-xs text-muted-foreground">Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "N/A"}</p>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>{inv.status}</Badge>
                    {inv.paymentStatus && (
                      <Badge className={`text-[10px] ${paymentStatusColors[inv.paymentStatus] || ""}`}>{inv.paymentStatus === "UNPAID" ? "Unpaid" : inv.paymentStatus === "PAID" ? "Paid" : inv.paymentStatus === "DUE" ? "Due" : inv.paymentStatus}</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {(inv.status === "DRAFT" || inv.status === "SENT") && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(inv as any)} aria-label="Edit invoice">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {inv.status === "DRAFT" && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteInvoice(inv.id)} aria-label="Delete invoice">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setPreviewInvoice(inv as unknown as Record<string, unknown>)}>
                      Preview
                    </Button>
                    {inv.status === "DRAFT" && (
                      <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(inv.id, "SENT")}>
                        <Send className="h-3 w-3 mr-1" /> Send
                      </Button>
                    )}
                    {inv.status === "SENT" && (
                      <Button variant="ghost" size="sm" className="text-green-600" onClick={() => handleUpdateStatus(inv.id, "PAID")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Paid
                      </Button>
                    )}
                    {(inv.status === "SENT" || inv.status === "PAID") && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        const newPaymentStatus = inv.paymentStatus === "UNPAID" ? "DUE" : inv.paymentStatus === "DUE" ? "PAID" : "UNPAID";
                        handleUpdatePaymentStatus(inv.id, newPaymentStatus);
                      }} title="Toggle payment status">
                        <span className="text-[10px]">Payment: {inv.paymentStatus === "UNPAID" ? "Unpaid" : inv.paymentStatus === "DUE" ? "Due" : inv.paymentStatus === "PAID" ? "Paid" : inv.paymentStatus}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invoice Preview */}
      {previewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setPreviewInvoice(null)}>
          <div className="fixed right-0 top-0 h-full w-[500px] bg-background border-l shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Invoice Preview</h2>
                <Button variant="ghost" size="icon" onClick={() => setPreviewInvoice(null)} aria-label="Close preview">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="border rounded-lg p-6 space-y-4">
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-bold text-lg">TrishulHub</h3>
                    <p className="text-xs text-muted-foreground">AI-Powered Web Development</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{(previewInvoice as { invoiceNumber: string }).invoiceNumber}</p>
                    <Badge className={`text-xs ${invoiceStatusColors[(previewInvoice as { status: string }).status]}`}>
                      {(previewInvoice as { status: string }).status}
                    </Badge>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium">Bill To: {(previewInvoice as { client?: { name: string } }).client?.name || "Client"}</p>
                  <p className="text-xs text-muted-foreground">Due: {(previewInvoice as { dueDate: string }).dueDate ? new Date((previewInvoice as { dueDate: string }).dueDate).toLocaleDateString() : "N/A"}</p>
                  {(previewInvoice as { paymentMethod?: string }).paymentMethod && (
                    <p className="text-xs text-muted-foreground">Payment: {paymentMethodLabels[(previewInvoice as { paymentMethod: string }).paymentMethod] || (previewInvoice as { paymentMethod: string }).paymentMethod}</p>
                  )}
                  {(previewInvoice as { paymentStatus?: string }).paymentStatus && (
                    <p className="text-xs text-muted-foreground">Payment Status: {(previewInvoice as { paymentStatus: string }).paymentStatus === "UNPAID" ? "Unpaid" : (previewInvoice as { paymentStatus: string }).paymentStatus === "PAID" ? "Paid" : (previewInvoice as { paymentStatus: string }).paymentStatus === "DUE" ? "Due" : (previewInvoice as { paymentStatus: string }).paymentStatus}</p>
                  )}
                </div>
                <div className="border-t pt-4">
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
                      {(JSON.parse((previewInvoice as { items: string }).items || "[]") as { description: string; quantity: number; rate: number; amount: number }[]).map((item, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-2">{item.description}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">₹{item.rate.toLocaleString()}</td>
                          <td className="text-right py-2">₹{item.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t pt-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency((previewInvoice as { subtotal: number }).subtotal)}</span></div>
                  {(previewInvoice as { gst?: number; gstPercent?: number }).gstPercent ? (
                    <div className="flex justify-between"><span>GST ({(previewInvoice as { gstPercent: number }).gstPercent}%)</span><span>{formatCurrency((previewInvoice as { gst: number }).gst || 0)}</span></div>
                  ) : (
                    <div className="flex justify-between"><span>Tax</span><span>{formatCurrency((previewInvoice as { tax: number }).tax)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>{formatCurrency((previewInvoice as { total: number }).total)}</span></div>
                </div>
                {(previewInvoice as { notes?: string }).notes && (
                  <div className="border-t pt-4">
                    <p className="text-xs text-muted-foreground font-medium">Notes:</p>
                    <p className="text-sm">{(previewInvoice as { notes: string }).notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This DRAFT invoice will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
