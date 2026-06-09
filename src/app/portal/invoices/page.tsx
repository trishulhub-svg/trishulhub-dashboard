"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** Paginated API response shape */
interface PaginatedResponse<T> {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

/** Unwrap paginated { data: [...] } or plain array response */
function unwrapResponse<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw;
  const resp = raw as PaginatedResponse<T>;
  return Array.isArray(resp?.data) ? resp.data : [];
}

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800",
  SENT: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
};

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

/** Safely parse invoice items — handles string, array, or malformed data */
function safeParseItems(items: unknown): InvoiceItem[] {
  if (Array.isArray(items)) return items as InvoiceItem[];
  if (typeof items === "string") {
    try { return JSON.parse(items) as InvoiceItem[]; } catch { /* ignore */ }
  }
  return [];
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices?page=1&limit=20", { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setInvoices(unwrapResponse(data));
      } else {
        setError("Failed to load invoices");
      }
    } catch (err) {
      console.error("[portal/invoices] Failed to load invoices:", err);
      setError("Failed to load invoices. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

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
        <Button variant="outline" onClick={() => { setError(null); fetchInvoices(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Invoices</h1>

      {(invoices as unknown[]).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-1">No Invoices</h3>
            <p className="text-muted-foreground">Your invoices will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(invoices as { id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string; items: unknown }[]).map((inv) => {
            const items = safeParseItems(inv.items);
            return (
              <Card key={inv.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "N/A"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">₹{Number(inv.total || 0).toLocaleString("en-IN")}</span>
                      <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>{inv.status}</Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{item.description}</span>
                        <span>₹{Number(item.amount || 0).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
