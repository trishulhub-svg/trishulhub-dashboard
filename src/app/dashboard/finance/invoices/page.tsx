"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Plus, Send, CheckCircle2, FileText, Search, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PAID: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

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

  if (status !== "authenticated" || !isAdminUser) return null;

  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [clients, setClients] = useState<unknown[]>([]);
  const [projects, setProjects] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [previewInvoice, setPreviewInvoice] = useState<Record<string, unknown> | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [invRes, clientRes, projRes] = await Promise.all([
        fetch("/api/invoices", { credentials: 'include', signal }),
        fetch("/api/clients", { credentials: 'include', signal }),
        fetch("/api/projects", { credentials: 'include', signal }),
      ]);
      if (invRes.ok) {
        const invData = await invRes.json();
        setInvoices(Array.isArray(invData) ? invData : invData.data || []);
      }
      if (clientRes.ok) {
        const clientData = await clientRes.json();
        setClients(Array.isArray(clientData) ? clientData : clientData.data || []);
      }
      if (projRes.ok) {
        const projData = await projRes.json();
        setProjects(Array.isArray(projData) ? projData : projData.data || []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const itemsStr = form.get("items") as string;

    try {
      const items = JSON.parse(itemsStr || "[]");
      if (!Array.isArray(items) || items.length === 0) {
        toast.error("At least one line item is required");
        return;
      }
      const subtotal = items.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
      const taxRate = parseFloat(form.get("taxRate") as string) || 18;
      const tax = subtotal * (taxRate / 100);

      const data = {
        clientId: form.get("clientId") as string,
        projectId: (form.get("projectId") as string) === "NONE" ? null : (form.get("projectId") as string) || null,
        items: JSON.stringify(items),
        subtotal,
        tax,
        total: subtotal + tax,
        dueDate: form.get("dueDate") as string || null,
      };

      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("Invoice created");
        setAddOpen(false);
        fetchData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to create invoice");
      }
    } catch {
      toast.error("Failed to create invoice. Check JSON format for items.");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        toast.success(`Invoice marked as ${status}`);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to update invoice status`);
      }
    } catch {
      toast.error("Failed to update invoice");
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
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground text-sm">Create and manage invoices</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-3">
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
              <div className="space-y-1">
                <Label className="text-xs">Line Items (JSON)</Label>
                <Textarea
                  name="items"
                  rows={4}
                  defaultValue='[{"description":"Web Development","quantity":1,"rate":50000,"amount":50000}]'
                  className="text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tax Rate (%)</Label>
                  <Input name="taxRate" type="number" defaultValue="18" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input name="dueDate" type="date" />
                </div>
              </div>
              <Button type="submit" className="w-full">Create Invoice</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["ALL", "DRAFT", "SENT", "PAID", "OVERDUE"].map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
            {s === "ALL" ? "All" : s}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {(filtered as { id: string; invoiceNumber: string; status: string; total: number; subtotal: number; tax: number; client: { name: string }; project?: { name: string }; dueDate: string; paidAt?: string; items: string }[]).map((inv) => (
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
                  <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>{inv.status}</Badge>
                  <div className="flex gap-1">
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
                <Button variant="ghost" onClick={() => setPreviewInvoice(null)}>✕</Button>
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
                  <div className="flex justify-between"><span>Tax</span><span>{formatCurrency((previewInvoice as { tax: number }).tax)}</span></div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>{formatCurrency((previewInvoice as { total: number }).total)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
