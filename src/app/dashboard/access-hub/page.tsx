"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Shield,
  Save,
  Copy,
  Check,
  KeyRound,
  Plus,
  Edit3,
  Globe,
  Search,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { safeText, safeArray, cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Credential {
  id: string;
  label: string;
  username: string;
  password: string;
  url: string | null;
  notes: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string };
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

type LabelBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "info"
  | "success"
  | "warning"
  | "pending";

const LABEL_VARIANTS: Record<string, LabelBadgeVariant> = {
  Workspace: "info",
  Email: "default",
  Portal: "secondary",
  Hosting: "warning",
  API: "success",
  Database: "outline",
  Default: "pending",
};

export default function AccessHubPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <AccessHubContent />
    </Suspense>
  );
}

function AccessHubContent() {
  const { data: session, status } = useSession();
  // canManageCredentials = SUPER_ADMIN, ADMIN, or PROJECT_MANAGER. Used to gate the
  // admin credentials view (full credential management UI). PROJECT_MANAGER has
  // admin-like credential access per requirements.
  const canManageCredentials =
    session?.user?.role === "SUPER_ADMIN" ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "PROJECT_MANAGER";
  const initialFetchDone = useRef(false);

  // ── Credentials state ──
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  // Managers start with no selection — credentials load only after explicit choice
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  // Collapsible open state for All Users grouping (userId → open)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // ── Credential form state ──
  const [formLabel, setFormLabel] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTargetUserIds, setFormTargetUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchCredentials = useCallback(async () => {
    // Managers must explicitly select a user or "all" before loading
    if (canManageCredentials && !selectedUserId) {
      setCredentials([]);
      setCredsLoading(false);
      setCredsError("");
      return;
    }

    setCredsLoading(true);
    setCredsError("");
    try {
      const params = new URLSearchParams();
      if (canManageCredentials && selectedUserId && selectedUserId !== "all") {
        params.set("userId", selectedUserId);
      }

      // Always request page=1, limit=100; page through while total > accumulated
      if (canManageCredentials && (!selectedUserId || selectedUserId === "all")) {
        const all: Credential[] = [];
        let page = 1;
        let total = Infinity;
        while (all.length < total) {
          const pageParams = new URLSearchParams(params);
          pageParams.set("page", String(page));
          pageParams.set("limit", "100");
          const res = await fetch(`/api/credentials?${pageParams.toString()}`, {
            credentials: "include",
          });
          if (!res.ok) {
            setCredsError("Failed to load credentials");
            toast.error("Failed to load credentials");
            return;
          }
          const data = await res.json();
          const batch = safeArray<Credential>(Array.isArray(data) ? data : data.data);
          total = typeof data.total === "number" ? data.total : batch.length;
          all.push(...batch);
          if (batch.length === 0) break;
          page += 1;
          // Safety: prevent runaway loops
          if (page > 50) break;
        }
        setCredentials(all);
      } else {
        params.set("page", "1");
        params.set("limit", "100");
        const res = await fetch(`/api/credentials?${params.toString()}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const creds = Array.isArray(data) ? data : data.data;
          setCredentials(safeArray<Credential>(creds));
        } else {
          setCredsError("Failed to load credentials");
          toast.error("Failed to load credentials");
        }
      }
    } catch {
      setCredsError("Failed to load credentials");
      toast.error("Failed to load credentials");
    } finally {
      setCredsLoading(false);
    }
  }, [canManageCredentials, selectedUserId]);

  const fetchUsers = useCallback(async () => {
    if (!canManageCredentials) return;
    try {
      // type=users is required so PROJECT_MANAGER receives the user list
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const users = safeArray<UserOption>(data.users || data);
        setAllUsers(users);
      }
    } catch {
      // silent
    }
  }, [canManageCredentials]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) return;
    fetchUsers();
    // Developers auto-load their own credentials; managers wait for selection
    if (!canManageCredentials) {
      fetchCredentials();
    }
    initialFetchDone.current = true;
  }, [session, status, canManageCredentials, fetchCredentials, fetchUsers]);

  // Re-fetch when admin/PM changes user filter (skip initial mount)
  useEffect(() => {
    if (!canManageCredentials || !session || !initialFetchDone.current) return;
    if (!selectedUserId) {
      setCredentials([]);
      setCredsLoading(false);
      setCredsError("");
      setOpenGroups(new Set());
      return;
    }
    // Reset collapse state when filter changes — All Users defaults collapsed
    setOpenGroups(new Set());
    fetchCredentials();
  }, [selectedUserId, canManageCredentials, session, fetchCredentials]);

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      /* fallback */
    }
  };

  const handleCopyPassword = async (credId: string, fieldId: string) => {
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const realPassword = data.password;
        if (realPassword) {
          await copyToClipboard(realPassword, fieldId);
        } else {
          toast.error("Password not found");
        }
      } else {
        toast.error("Failed to fetch password");
      }
    } catch {
      toast.error("Failed to copy password");
    }
  };

  const resetCredForm = () => {
    setFormLabel("");
    setFormUsername("");
    setFormPassword("");
    setFormUrl("");
    setFormNotes("");
    setFormTargetUserIds(session?.user?.id ? [session.user.id] : []);
    setEditingCredential(null);
  };

  const openAddCredDialog = () => {
    resetCredForm();
    setShowAddDialog(true);
  };

  const toggleFormUser = (userId: string) => {
    setFormTargetUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const openEditCredDialog = (cred: Credential) => {
    setEditingCredential(cred);
    setFormLabel(cred.label);
    setFormUsername(cred.username);
    setFormPassword("");
    setFormUrl(cred.url || "");
    setFormNotes(cred.notes || "");
    setFormTargetUserIds(
      cred.user?.id ? [cred.user.id] : session?.user?.id ? [session.user.id] : []
    );
    setShowAddDialog(true);
  };

  const handleSaveCred = async () => {
    if (!formLabel.trim() || !formUsername.trim() || (!formPassword && !editingCredential)) {
      toast.error("Label, username, and password are required");
      return;
    }
    if (canManageCredentials && formTargetUserIds.length === 0) {
      toast.error("Select at least one user to assign this credential to");
      return;
    }
    setSaving(true);
    try {
      // Normalize optional URL — empty is fine; bare domains get https://
      let normalizedUrl = formUrl.trim();
      if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      const body: Record<string, unknown> = {
        label: formLabel.trim(),
        username: formUsername.trim(),
        ...(formPassword && { password: formPassword }),
        url: normalizedUrl,
        notes: formNotes,
      };
      if (editingCredential) {
        body.id = editingCredential.id;
        const res = await fetch("/api/credentials", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Credential updated");
          setShowAddDialog(false);
          resetCredForm();
          fetchCredentials();
        } else {
          const d = await res.json().catch(() => null);
          toast.error(
            d?.error || d?.details?.formErrors?.[0] || "Failed to update credential"
          );
        }
      } else {
        const userIds = canManageCredentials
          ? formTargetUserIds
          : session?.user?.id
            ? [session.user.id]
            : [];
        if (userIds.length === 0) {
          toast.error("No user session found");
          return;
        }
        body.userIds = userIds;
        const res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const d = await res.json().catch(() => null);
          const count = typeof d?.count === "number" ? d.count : userIds.length;
          toast.success(
            count > 1
              ? `Credential assigned to ${count} users`
              : "Credential created"
          );
          setShowAddDialog(false);
          resetCredForm();
          fetchCredentials();
        } else {
          const d = await res.json().catch(() => null);
          const detail =
            d?.error ||
            (Array.isArray(d?.details?.fieldErrors?.url)
              ? d.details.fieldErrors.url[0]
              : null) ||
            (Array.isArray(d?.details?.fieldErrors?.userIds)
              ? d.details.fieldErrors.userIds[0]
              : null) ||
            "Failed to create credential";
          toast.error(detail);
        }
      }
    } catch {
      toast.error("Failed to save credential");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCred = async (id: string) => {
    try {
      const res = await fetch(`/api/credentials?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setDeleteId(null);
        fetchCredentials();
      }
    } catch {
      toast.error("Failed to delete credential");
    }
  };

  const labelVariant = (label: string): LabelBadgeVariant =>
    LABEL_VARIANTS[label] || LABEL_VARIANTS.Default;

  const safeUrl = (url: string | null | undefined): string => {
    if (!url) return "#";
    try {
      const parsed = new URL(url);
      if (["http:", "https:"].includes(parsed.protocol)) return url;
      return "#";
    } catch {
      return "#";
    }
  };

  const filteredCredentials = credentials.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      safeText(c.label, "").toLowerCase().includes(q) ||
      safeText(c.username, "").toLowerCase().includes(q) ||
      safeText(c.notes, "").toLowerCase().includes(q)
    );
  });

  const groupedByUser = useMemo(() => {
    const groups = new Map<
      string,
      { userId: string; name: string; email: string; credentials: Credential[] }
    >();
    for (const cred of filteredCredentials) {
      const userId = cred.user?.id || "unknown";
      const existing = groups.get(userId);
      if (existing) {
        existing.credentials.push(cred);
      } else {
        groups.set(userId, {
          userId,
          name: safeText(cred.user?.name, "Unknown user"),
          email: safeText(cred.user?.email, ""),
          credentials: [cred],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [filteredCredentials]);

  const toggleGroup = (userId: string, open: boolean) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  if (status === "loading") return null;
  if (!session) return null;

  const awaitingUserSelection = canManageCredentials && !selectedUserId;
  const showAllUsersGroups = canManageCredentials && selectedUserId === "all";
  const hasCredentials = filteredCredentials.length > 0;

  const renderCredentialCard = (cred: Credential, showUserMeta = false) => (
    <div
      key={cred.id}
      className="rounded-lg border border-border/60 bg-background p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={labelVariant(cred.label)} className="text-xs">
            {safeText(cred.label, "Credential")}
          </Badge>
          {cred.url && (
            <a
              href={safeUrl(cred.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {canManageCredentials && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openEditCredDialog(cred)}
              aria-label="Edit credential"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setDeleteId(cred.id)}
              aria-label="Delete credential"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {showUserMeta && cred.user && (
        <p className="text-xs text-muted-foreground truncate">
          For: {safeText(cred.user.name, "")} ({safeText(cred.user.email, "")})
        </p>
      )}
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          ID / Username
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
            {safeText(cred.username, "")}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => copyToClipboard(cred.username, `user-${cred.id}`)}
            aria-label="Copy username"
          >
            {copiedField === `user-${cred.id}` ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Password
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
            {safeText(cred.password, "••••••••••••")}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => handleCopyPassword(cred.id, `pass-${cred.id}`)}
            aria-label="Copy password"
          >
            {copiedField === `pass-${cred.id}` ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
      {cred.notes && (
        <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
          {safeText(cred.notes, "")}
        </p>
      )}
    </div>
  );

  const credentialsGrid = (
    <div className="grid gap-4 md:grid-cols-2">
      {filteredCredentials.map((cred) =>
        renderCredentialCard(cred, canManageCredentials)
      )}
    </div>
  );

  const collapsibleGroups = (
    <div className="space-y-3">
      {groupedByUser.map((group) => {
        const isOpen = openGroups.has(group.userId);
        return (
          <Collapsible
            key={group.userId}
            open={isOpen}
            onOpenChange={(open) => toggleGroup(group.userId, open)}
            className="rounded-lg border border-border/60"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors [&[data-state=open]>svg]:rotate-180">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{group.name}</p>
                {group.email && (
                  <p className="text-xs text-muted-foreground truncate">{group.email}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="pending" className="text-[10px]">
                  {group.credentials.length}
                </Badge>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid gap-3 md:grid-cols-2 border-t border-border/40 p-3">
                {group.credentials.map((cred) => renderCredentialCard(cred, false))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-3 sm:px-4 lg:px-0">
      <PageHeader
        title="Access Hub"
        description="Manage team credentials securely."
      />

      <div className="space-y-5">
        {!canManageCredentials && (
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            My Credentials
          </h2>
        )}

        {/* Toolbar: user filter + search + add */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          {canManageCredentials && (
            <div className="flex items-center gap-2 shrink-0">
              <Shield className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select
                value={selectedUserId || undefined}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Select a user…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {allUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {safeText(u.name, "Unknown")} ({safeText(u.email, "")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by label, username, or notes..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={awaitingUserSelection}
            />
          </div>

          {canManageCredentials && (
            <Button size="sm" onClick={openAddCredDialog} className="w-full sm:w-auto shrink-0">
              <Plus className="h-4 w-4 mr-1" /> Add Credential
            </Button>
          )}
        </div>

        {credsError && (
          <div className="rounded-lg border border-destructive/50 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{credsError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setCredsError("");
                fetchCredentials();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {awaitingUserSelection && !credsError && (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
            <KeyRound className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Select a user or All Users to load credentials.
            </p>
          </div>
        )}

        {!awaitingUserSelection && credsLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-border/60 p-6">
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                  <div className="h-8 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!awaitingUserSelection && !credsLoading && !hasCredentials && !credsError && (
          <div className="rounded-lg border border-border/60 px-4 py-8 text-center">
            <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "No credentials match your search"
                : canManageCredentials
                  ? "No credentials found. Click 'Add Credential' to create one."
                  : "No credentials assigned to you yet. Contact your admin."}
            </p>
          </div>
        )}

        {!awaitingUserSelection &&
          !credsLoading &&
          hasCredentials &&
          (showAllUsersGroups ? collapsibleGroups : credentialsGrid)}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCredential ? "Edit Credential" : "Add New Credential"}
            </DialogTitle>
            <DialogDescription>
              {editingCredential
                ? "Update the credential details below."
                : "Create a credential and assign it to one or more team members."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {canManageCredentials && !editingCredential && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Assign to users *</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setFormTargetUserIds(allUsers.map((u) => u.id))}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setFormTargetUserIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Same credential can be given to multiple people at once.
                  {formTargetUserIds.length > 0 && (
                    <>
                      {" "}
                      Selected:{" "}
                      <span className="font-medium text-foreground">
                        {formTargetUserIds.length}
                      </span>
                    </>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto rounded-md border border-border/60 p-2">
                  {allUsers.map((u) => {
                    const selected = formTargetUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleFormUser(u.id)}
                        className={cn(
                          "text-[11px] px-2 py-1 rounded-full border transition-colors",
                          selected
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-muted/40 border-transparent text-muted-foreground hover:border-border"
                        )}
                      >
                        {safeText(u.name, u.email)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {canManageCredentials && editingCredential && (
              <div className="space-y-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
                <Label className="text-xs text-muted-foreground">Assigned to</Label>
                <p className="text-sm font-medium">
                  {safeText(editingCredential.user?.name, "")}{" "}
                  <span className="text-muted-foreground font-normal text-xs">
                    ({safeText(editingCredential.user?.email, "")})
                  </span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g. Workspace, Email, Vault, AWS Console..."
                className="h-9 text-sm"
                list="credential-label-suggestions"
              />
              <datalist id="credential-label-suggestions">
                <option value="Workspace" />
                <option value="Email" />
                <option value="Portal" />
                <option value="Hosting" />
                <option value="API" />
                <option value="Database" />
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>ID / Username</Label>
              <Input
                placeholder="e.g., john@company.com"
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder={
                  editingCredential
                    ? "Leave blank to keep current password"
                    : "Enter the password"
                }
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Login URL (optional)</Label>
              <Input
                placeholder="https://example.com/login"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any additional instructions..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCred}
              disabled={
                !formLabel ||
                !formUsername ||
                (!formPassword && !editingCredential) ||
                saving
              }
            >
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  {editingCredential ? "Update" : "Create"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this credential? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDeleteCred(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
