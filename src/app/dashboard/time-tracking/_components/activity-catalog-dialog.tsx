"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TimeActivityItem } from "./types";

type EditRow = { key: TimeActivityItem["key"]; label: string; enabled: boolean };

interface ActivityCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: TimeActivityItem[];
  onSaved: (catalog: TimeActivityItem[]) => void;
}

function rowsFromCatalog(catalog: TimeActivityItem[]): EditRow[] {
  return catalog.map((c) => ({
    key: c.key,
    label: c.label,
    enabled: c.enabled,
  }));
}

export function ActivityCatalogDialog({
  open,
  onOpenChange,
  catalog,
  onSaved,
}: ActivityCatalogDialogProps) {
  const [rows, setRows] = useState<EditRow[]>(() => rowsFromCatalog(catalog));
  const [draftKey, setDraftKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setRows(rowsFromCatalog(catalog));
      setDraftKey((k) => k + 1);
    }
    onOpenChange(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/time-tracking/activity-catalog", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to save activity list");
        return;
      }
      const next = Array.isArray(data?.catalog) ? data.catalog : [];
      onSaved(next);
      toast.success("Activity list updated");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save activity list");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]" key={draftKey}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Edit activity list
          </DialogTitle>
          <DialogDescription>
            Rename or hide Training, Supervision, and other non-project activities. Project
            names (including demo projects) always come from the Projects section and cannot be
            edited here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5"
            >
              <label className="inline-flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={row.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setRows((prev) =>
                      prev.map((r, idx) => (idx === i ? { ...r, enabled } : r))
                    );
                  }}
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  On
                </span>
              </label>
              <div className="flex-1 min-w-0 space-y-1">
                <Label className="text-[10px] text-muted-foreground">{row.key}</Label>
                <Input
                  value={row.label}
                  maxLength={60}
                  disabled={!row.enabled}
                  onChange={(e) => {
                    const label = e.target.value;
                    setRows((prev) =>
                      prev.map((r, idx) => (idx === i ? { ...r, label } : r))
                    );
                  }}
                  className="h-9"
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
