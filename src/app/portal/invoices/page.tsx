"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, DollarSign, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeArray } from "@/lib/utils";

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-200 text-gray-800",
  SENT: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
};

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices", { credentials: 'include' });
      if (res.ok) setInvoices(safeArray(await res.json()));
      else setError("Failed to load invoices");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load invoices");
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
          {(invoices as { id: string; invoiceNumber: string; status: string; total: number; client: { name: string }; dueDate: string; items: string }[]).map((inv) => {
            let items: { description: string; quantity: number; rate: number; amount: number }[] = [];
            try { items = JSON.parse(inv.items || "[]"); } catch { /* ignore malformed JSON */ }
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
                      <span className="font-bold">₹{inv.total.toLocaleString("en-IN")}</span>
                      <Badge className={`text-[10px] ${invoiceStatusColors[inv.status] || ""}`}>{inv.status}</Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between py-0.5">
                        <span>{item.description}</span>
                        <span>₹{item.amount.toLocaleString("en-IN")}</span>
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
