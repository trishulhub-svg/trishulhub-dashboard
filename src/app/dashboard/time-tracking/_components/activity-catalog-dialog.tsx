"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Settings2, Trash2, Users, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, safeArray, safeText } from "@/lib/utils";
import type { TimeActivityItem } from "./types";

type EditRow = {
  key: string;
  label: string;
  enabled: boolean;
  builtin: boolean;
  /** Empty = all clock-in roles */
  roles: string[];
  /** Users who get yellow-dot blink */
  userIds: string[];
};

type TeamUser = { id: string; name: string; email?: string; role?: string };

interface ActivityCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: TimeActivityItem[];
  onSaved: (catalog: TimeActivityItem[]) => void;
}

const BUILTIN = new Set(["TRAINING", "SUPERVISION", "HR_ADMIN", "RD_SA"]);

const ROLE_OPTIONS = [
  { id: "SUPER_ADMIN", label: "Super Admin" },
  { id: "ADMIN", label: "Admin" },
  { id: "PROJECT_MANAGER", label: "PM" },
  { id: "DEVELOPER", label: "Developer" },
] as const;

function rowsFromCatalog(catalog: TimeActivityItem[]): EditRow[] {
  return catalog.map((c) => ({
    key: c.key,
    label: c.label,
    enabled: c.enabled,
    builtin: BUILTIN.has(c.key),
    roles: Array.isArray(c.roles) ? [...c.roles] : [],
    userIds: Array.isArray(c.userIds) ? [...c.userIds] : [],
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

function toggleRole(roles: string[], roleId: string): string[] {
  if (roles.includes(roleId)) return roles.filter((r) => r !== roleId);
  return [...roles, roleId];
}

function UserMultiPicker({
  users,
  selectedIds,
  onChange,
  loading,
  disabled,
}: {
  users: TeamUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        (u.email || "").toLowerCase().includes(needle) ||
        (u.role || "").toLowerCase().includes(needle)
    );
  }, [users, q]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedSet.has(u.id)),
    [users, selectedSet]
  );

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || loading}
            className="h-9 w-full justify-between font-normal"
          >
            <span className="inline-flex items-center gap-1.5 truncate text-xs">
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {loading
                ? "Loading team…"
                : selectedIds.length === 0
                  ? "Select users for yellow-dot alert"
                  : `${selectedIds.length} user${selectedIds.length === 1 ? "" : "s"} selected`}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,340px)] p-0" align="start">
          <div className="p-2 border-b space-y-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, role…"
              className="h-8 text-xs"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={() => onChange(filtered.map((u) => u.id))}
                disabled={filtered.length === 0}
              >
                Select shown
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={() => onChange([])}
                disabled={selectedIds.length === 0}
              >
                Clear
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[220px]">
            <div className="p-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No matching users
                </p>
              ) : (
                filtered.map((u) => {
                  const on = selectedSet.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        on ? "bg-primary/10" : "hover:bg-muted/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        )}
                      >
                        {on ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{safeText(u.name, "User")}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {[u.role?.replace(/_/g, " "), u.email].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          {selectedUsers.slice(0, 8).map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px]"
            >
              <span className="truncate max-w-[100px]">{safeText(u.name, "User")}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${u.name}`}
                onClick={() => onChange(selectedIds.filter((id) => id !== u.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedUsers.length > 8 && (
            <span className="text-[10px] text-muted-foreground px-1 py-0.5">
              +{selectedUsers.length - 8} more
            </span>
          )}
        </div>
      )}
    </div>
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
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  const loadTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (!res.ok) {
        setTeamUsers([]);
        return;
      }
      const data = await res.json();
      const list = safeArray<TeamUser>(Array.isArray(data) ? data : data?.users || data?.data);
      setTeamUsers(
        list
          .map((u) => ({
            id: String(u.id || ""),
            name: String(u.name || "User"),
            email: u.email ? String(u.email) : undefined,
            role: u.role ? String(u.role) : undefined,
          }))
          .filter((u) => u.id)
      );
    } catch {
      setTeamUsers([]);
    } finally {
      setTeamLoading(false);
    }
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setRows(rowsFromCatalog(catalog));
      setNewLabel("");
      setDraftKey((k) => k + 1);
      void loadTeam();
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (open) void loadTeam();
  }, [open, loadTeam]);

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
    setRows((prev) => [
      ...prev,
      {
        key,
        label: label.slice(0, 60),
        enabled: true,
        builtin: false,
        roles: [],
        userIds: [],
      },
    ]);
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
          items: rows.map(({ key, label, enabled, roles, userIds }) => ({
            key,
            label,
            enabled,
            roles,
            userIds,
          })),
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
      <DialogContent className="sm:max-w-[600px]" key={draftKey}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Edit activity list
          </DialogTitle>
          <DialogDescription>
            Roles control who can clock the activity. Yellow-dot users get a blink alert when they
            have assigned work (e.g. Supervision). Projects stay on Projects.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1 max-h-[min(58vh,460px)] overflow-y-auto overscroll-contain pr-1">
          {rows.map((row, i) => {
            const showUserPicker = row.key === "SUPERVISION" || row.userIds.length > 0 || !row.builtin;
            return (
              <div
                key={row.key}
                className="rounded-lg border border-border/70 bg-muted/20 px-2.5 sm:px-3 py-2.5 space-y-2.5"
              >
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
                  <label className="inline-flex items-center gap-1.5 shrink-0 pt-2 sm:pt-0">
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
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden sm:inline">
                      On
                    </span>
                  </label>
                  <div className="flex-1 min-w-0 space-y-1">
                    <Label className="text-[10px] text-muted-foreground truncate block">
                      {row.key}
                    </Label>
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
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive mt-5 sm:mt-0"
                      aria-label={`Remove ${row.label}`}
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className={cn("space-y-2", !row.enabled && "opacity-50 pointer-events-none")}>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                      Visible to roles
                      {row.roles.length === 0 ? (
                        <span className="ml-1.5 normal-case tracking-normal text-foreground/70">
                          · All roles
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!row.enabled}
                        onClick={() =>
                          setRows((prev) =>
                            prev.map((r, idx) => (idx === i ? { ...r, roles: [] } : r))
                          )
                        }
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                          row.roles.length === 0
                            ? "border-foreground/30 bg-foreground text-background"
                            : "border-border/70 bg-background hover:bg-muted/50"
                        )}
                      >
                        All
                      </button>
                      {ROLE_OPTIONS.map((opt) => {
                        const on = row.roles.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={!row.enabled}
                            onClick={() =>
                              setRows((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, roles: toggleRole(r.roles, opt.id) } : r
                                )
                              )
                            }
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                              on
                                ? "border-primary/40 bg-primary/15 text-foreground"
                                : "border-border/70 bg-background hover:bg-muted/50"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {showUserPicker && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Yellow-dot users
                        {row.key === "SUPERVISION" ? (
                          <span className="ml-1.5 normal-case tracking-normal text-foreground/70">
                            · only selected people see the Supervision blink
                          </span>
                        ) : null}
                      </p>
                      <UserMultiPicker
                        users={teamUsers}
                        selectedIds={row.userIds}
                        loading={teamLoading}
                        disabled={!row.enabled}
                        onChange={(userIds) =>
                          setRows((prev) =>
                            prev.map((r, idx) => (idx === i ? { ...r, userIds } : r))
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 pt-1 border-t border-border/60">
          <div className="flex-1 min-w-0 space-y-1">
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
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full sm:w-auto shrink-0"
            onClick={addCustom}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void save()}
            disabled={saving || rows.length === 0}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
