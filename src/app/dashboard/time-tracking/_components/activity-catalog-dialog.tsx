"use client";

import { useState } from "react";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
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

type EditRow = { key: string; label: string; enabled: boolean; builtin: boolean };

interface ActivityCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: TimeActivityItem[];
  onSaved: (catalog: TimeActivityItem[]) => void;
}

const BUILTIN = new Set(["TRAINING", "SUPERVISION", "HR_ADMIN", "RD_SA"]);

function rowsFromCatalog(catalog: TimeActivityItem[]): EditRow[] {
  return catalog.map((c) => ({
    key: c.key,
    label: c.label,
    enabled: c.enabled,
    builtin: BUILTIN.has(c.key),
  }));
}

function slugKey(label: string): string {
  return (
    label
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "CUSTOM"
  );
}

export function ActivityCatalogDialog({
  open,
  onOpenChange,
  catalog,
  onSaved,
}: ActivityCatalogDialogProps) {
  const [rows, setRows] = useState<EditRow[]>(() => rowsFromCatalog(catalog));
  const [newLabel, setNewLabel] = useState("");
  const [draftKey, setDraftKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setRows(rowsFromCatalog(catalog));
      setNewLabel("");
      setDraftKey((k) => k + 1);
    }
    onOpenChange(next);
  };

  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Enter an activity name");
      return;
    }
    let key = slugKey(label);
    if (BUILTIN.has(key) || key === "PROJECT") {
      key = `${key}_CUSTOM`.slice(0, 40);
    }
    const existing = new Set(rows.map((r) => r.key));
    if (existing.has(key)) {
      let n = 2;
      while (existing.has(`${key}_${n}`.slice(0, 40)) && n < 99) n += 1;
      key = `${key}_${n}`.slice(0, 40);
    }
    setRows((prev) => [...prev, { key, label: label.slice(0, 60), enabled: true, builtin: false }]);
    setNewLabel("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/time-tracking/activity-catalog", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map(({ key, label, enabled }) => ({ key, label, enabled })),
        }),
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
      <DialogContent className="sm:max-w-[520px]" key={draftKey}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Edit activity list
          </DialogTitle>
          <DialogDescription>
            Rename, hide, or add non-project activities. Project names always come from Projects
            and cannot be edited here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1 max-h-[50vh] overflow-y-auto pr-1">
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
              {!row.builtin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${row.label}`}
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 pt-1 border-t border-border/60">
          <div className="flex-1 space-y-1">
            <Label className="text-[10px] text-muted-foreground">Add activity</Label>
            <Input
              value={newLabel}
              maxLength={60}
              placeholder="e.g. Client call, Documentation…"
              className="h-9"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" className="h-9 shrink-0" onClick={addCustom}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || rows.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
