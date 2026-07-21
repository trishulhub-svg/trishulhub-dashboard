"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Shield, Save,
  Copy, Check, KeyRound,
  Plus, Edit3, Globe, Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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

const LABEL_COLORS: Record<string, string> = {
  Workspace: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  Email: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Portal: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Hosting: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  API: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Database: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function AccessHubPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <AccessHubContent />
    </Suspense>
  );
}

function AccessHubContent() {
  const { data: session, status } = useSession();
  // canManageCredentials = SUPER_ADMIN, ADMIN, or PROJECT_MANAGER. Used to gate the
  // admin credentials view (full credential management UI). PROJECT_MANAGER has
  // admin-like credential access per requirements.
  const canManageCredentials = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN" || session?.user?.role === "PROJECT_MANAGER";
  const initialFetchDone = useRef(false);

  // ── Credentials state ──
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credsLoading, setCredsLoading] = useState(true);
  const [credsError, setCredsError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

  // ── Credential form state ──
  const [formLabel, setFormLabel] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTargetUserId, setFormTargetUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCredentials = useCallback(async () => {
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
          const res = await fetch(`/api/credentials?${pageParams.toString()}`, { credentials: "include" });
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
        const res = await fetch(`/api/credentials?${params.toString()}`, { credentials: "include" });
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
    fetchCredentials();
    fetchUsers();
    initialFetchDone.current = true;
  }, [session, status, fetchCredentials, fetchUsers]);

  // Re-fetch when admin/PM changes user filter (skip initial mount)
  useEffect(() => {
    if (!canManageCredentials || !session || !initialFetchDone.current) return;
    fetchCredentials();
  }, [selectedUserId]);

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch { /* fallback */ }
  };

  const handleCopyPassword = async (credId: string, fieldId: string) => {
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`, { credentials: "include" });
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
    setFormTargetUserId(session?.user?.id || "");
    setEditingCredential(null);
  };

  const openAddCredDialog = () => { resetCredForm(); setShowAddDialog(true); };

  const openEditCredDialog = (cred: Credential) => {
    setEditingCredential(cred);
    setFormLabel(cred.label);
    setFormUsername(cred.username);
    setFormPassword("");
    setFormUrl(cred.url || "");
    setFormNotes(cred.notes || "");
    setFormTargetUserId(cred.user?.id || session?.user?.id || "");
    setShowAddDialog(true);
  };

  const handleSaveCred = async () => {
    if (!formLabel.trim() || !formUsername.trim() || (!formPassword && !editingCredential)) {
      toast.error("Label, username, and password are required");
      return;
    }
    if (canManageCredentials && !formTargetUserId) {
      toast.error("Select a user to assign this credential to");
      return;
    }
    setSaving(true);
    try {
      // Normalize optional URL — empty is fine; bare domains get https://
      let normalizedUrl = formUrl.trim();
      if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      const body: Record<string, string> = {
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
          toast.error(d?.error || d?.details?.formErrors?.[0] || "Failed to update credential");
        }
      } else {
        const userId = canManageCredentials ? formTargetUserId : session?.user?.id;
        if (!userId) {
          toast.error("No user session found");
          return;
        }
        body.userId = userId;
        const res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("Credential created");
          setShowAddDialog(false);
          resetCredForm();
          fetchCredentials();
        } else {
          const d = await res.json().catch(() => null);
          const detail =
            d?.error ||
            (Array.isArray(d?.details?.fieldErrors?.url) ? d.details.fieldErrors.url[0] : null) ||
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
      const res = await fetch(`/api/credentials?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setDeleteId(null); fetchCredentials(); }
    } catch { toast.error("Failed to delete credential"); }
  };

  const labelColor = (label: string) => LABEL_COLORS[label] || LABEL_COLORS.Default;

  const safeUrl = (url: string | null | undefined): string => {
    if (!url) return "#";
    try {
      const parsed = new URL(url);
      if (["http:", "https:"].includes(parsed.protocol)) return url;
      return "#";
    } catch { return "#"; }
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

  if (status === "loading") return null;
  if (!session) return null;

  const hasCredentials = filteredCredentials.length > 0;

  const credentialsGrid = (
    <div className="grid gap-4 md:grid-cols-2">
      {filteredCredentials.map((cred) => (
        <Card key={cred.id} className="group">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={cn("text-xs", labelColor(cred.label))}>
                  {safeText(cred.label, "Credential")}
                </Badge>
                {cred.url && (
                  <a href={safeUrl(cred.url)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Globe className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {canManageCredentials && (
                <div className="flex items-center gap-1 opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCredDialog(cred)} aria-label="Edit credential">
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(cred.id)} aria-label="Delete credential">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            {canManageCredentials && cred.user && (
              <CardDescription className="text-xs truncate">
                For: {safeText(cred.user.name, "")} ({safeText(cred.user.email, "")})
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">ID / Username</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">{safeText(cred.username, "")}</code>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(cred.username, `user-${cred.id}`)} aria-label="Copy username">
                  {copiedField === `user-${cred.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Password</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">{safeText(cred.password, "••••••••••••")}</code>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopyPassword(cred.id, `pass-${cred.id}`)} aria-label="Copy password">
                  {copiedField === `pass-${cred.id}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            {cred.notes && (
              <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">{safeText(cred.notes, "")}</p>
            )}
          </CardContent>
        </Card>
      ))}
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
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Credentials</h2>
        )}

        {canManageCredentials && allUsers.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium whitespace-nowrap">Filter by user:</Label>
                </div>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="All users" />
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
            </CardContent>
          </Card>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by label, username, or notes..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {canManageCredentials && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button size="sm" onClick={openAddCredDialog} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1" /> Add Credential
            </Button>
          </div>
        )}

        {credsError && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 pb-6">
              <div className="text-center">
                <p className="text-sm text-destructive">{credsError}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setCredsError(""); fetchCredentials(); }}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {credsLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-6"><div className="space-y-3"><div className="h-4 w-24 bg-muted rounded animate-pulse" /><div className="h-8 bg-muted rounded animate-pulse" /><div className="h-8 bg-muted rounded animate-pulse" /></div></CardContent></Card>
            ))}
          </div>
        )}

        {!credsLoading && !hasCredentials && !credsError && (
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? "No credentials match your search"
                    : canManageCredentials
                      ? "No credentials found. Click 'Add Credential' to create one."
                      : "No credentials assigned to you yet. Contact your admin."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!credsLoading && hasCredentials && credentialsGrid}
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
                : "Create a new ID & Password credential for a team member."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {canManageCredentials && (
              <div className="space-y-2">
                <Label>Assign to User</Label>
                <Select value={formTargetUserId} onValueChange={setFormTargetUserId}>
                  <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {safeText(u.name, "")} ({safeText(u.email, "")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <Input placeholder="e.g., john@company.com" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder={editingCredential ? "Leave blank to keep current password" : "Enter the password"} value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Login URL (optional)</Label>
              <Input placeholder="https://example.com/login" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Any additional instructions..." value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCred} disabled={!formLabel || !formUsername || (!formPassword && !editingCredential) || saving}>
              {saving ? "Saving..." : (
                <><Save className="h-4 w-4 mr-1" />{editingCredential ? "Update" : "Create"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this credential? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && handleDeleteCred(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
