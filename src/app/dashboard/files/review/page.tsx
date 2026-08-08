"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArchiveRestore, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { safeText } from "@/lib/utils";

type ReviewItem = {
  id: string;
  name: string;
  deletedAt?: string | null;
  deletedById?: string | null;
  mimeType?: string | null;
};

export default function FilesReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files/items?review=1", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Failed to load Review");
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const restore = async (id: string) => {
    const res = await fetch("/api/files/items", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Restore failed");
      return;
    }
    toast.success("File restored");
    void load();
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/files"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ArchiveRestore className="h-6 w-6 text-amber-600" />
            Review
          </h1>
          <p className="text-sm text-muted-foreground">
            Soft-deleted files. Super Admin / Admin see all; you can restore files you deleted.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Review folder is empty.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-amber-200/50 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{safeText(item.name)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.mimeType || "file"}
                  {item.deletedAt ? ` · deleted ${String(item.deletedAt).slice(0, 10)}` : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void restore(item.id)}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
