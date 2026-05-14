"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  KeyRound,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Plus,
  Trash2,
  Edit3,
  X,
  Save,
  Globe,
  Search,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, safeText, safeArray } from "@/lib/utils";

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

export default function CredentialsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // UI state
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Admin state
  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formTargetUserId, setFormTargetUserId] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (isAdmin && selectedUserId && selectedUserId !== "all") {
        params.set("userId", selectedUserId);
      }
      const res = await fetch(`/api/credentials?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCredentials(safeArray<Credential>(data));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedUserId]);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/team", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const users = safeArray<UserOption>(data.users || data);
        setAllUsers(users);
      }
    } catch {
      // silent
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    fetchCredentials();
    fetchUsers();
  }, [session, status, router, fetchCredentials, fetchUsers]);

  // Re-fetch when admin changes user filter
  useEffect(() => {
    if (isAdmin && session) {
      setLoading(true);
      setError(false);
      fetchCredentials();
    }
  }, [selectedUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // fallback
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setFormLabel("");
    setFormUsername("");
    setFormPassword("");
    setFormUrl("");
    setFormNotes("");
    setFormTargetUserId(session?.user?.id || "");
    setEditingCredential(null);
  };

  const openAddDialog = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const openEditDialog = (cred: Credential) => {
    setEditingCredential(cred);
    setFormLabel(cred.label);
    setFormUsername(cred.username);
    setFormPassword(cred.password);
    setFormUrl(cred.url || "");
    setFormNotes(cred.notes || "");
    setFormTargetUserId(cred.user?.id || session?.user?.id || "");
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!formLabel || !formUsername || !formPassword) return;
    if (isAdmin && !formTargetUserId) return;

    setSaving(true);
    try {
      const body: Record<string, string> = {
        label: formLabel,
        username: formUsername,
        password: formPassword,
        url: formUrl,
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
          setShowAddDialog(false);
          resetForm();
          fetchCredentials();
        }
      } else {
        body.userId = isAdmin ? formTargetUserId : session!.user.id;
        const res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setShowAddDialog(false);
          resetForm();
          fetchCredentials();
        }
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this credential?")) return;
    try {
      const res = await fetch(`/api/credentials?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        fetchCredentials();
      }
    } catch {
      // silent
    }
  };

  // Filter credentials for search
  const filteredCredentials = credentials.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      safeText(c.label, "").toLowerCase().includes(q) ||
      safeText(c.username, "").toLowerCase().includes(q) ||
      safeText(c.notes, "").toLowerCase().includes(q)
    );
  });

  const labelColor = (label: string) =>
    LABEL_COLORS[label] || LABEL_COLORS.Default;

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) return null;

  const hasCredentials = filteredCredentials.length > 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="h-6 w-6" />
            {isAdmin ? "Credential Manager" : "My Credentials"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAdmin
              ? "Manage ID & Password credentials for all team members"
              : "Your assigned credentials — keep them secure"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1" /> Add Credential
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => router.push("/dashboard/agents")}
            aria-label="Back to workspace"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Admin: User filter */}
      {isAdmin && allUsers.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium whitespace-nowrap">Filter by user:</Label>
              </div>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-[220px]">
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by label, username, or notes..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Credentials Grid */}
      {!hasCredentials && (
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "No credentials match your search"
                  : isAdmin
                    ? "No credentials found. Click 'Add Credential' to create one."
                    : "No credentials assigned to you yet. Contact your admin."}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push("/dashboard/agents")}
                >
                  Back to Workspace
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasCredentials && (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredCredentials.map((cred) => {
            const isRevealed = revealedIds.has(cred.id);
            const maskedPassword = "••••••••••••";
            return (
              <Card key={cred.id} className="group">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", labelColor(cred.label))}>
                        {safeText(cred.label, "Credential")}
                      </Badge>
                      {cred.url && (
                        <a
                          href={cred.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(cred)}
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(cred.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isAdmin && cred.user && (
                    <CardDescription className="text-xs">
                      For: {safeText(cred.user.name, "")} ({safeText(cred.user.email, "")})
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Username / ID */}
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
                        onClick={() =>
                          copyToClipboard(cred.username, `user-${cred.id}`)
                        }
                      >
                        {copiedField === `user-${cred.id}` ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Password
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
                        {isRevealed ? safeText(cred.password, "") : maskedPassword}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => toggleReveal(cred.id)}
                      >
                        {isRevealed ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          copyToClipboard(cred.password, `pass-${cred.id}`)
                        }
                      >
                        {copiedField === `pass-${cred.id}` ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Notes */}
                  {cred.notes && (
                    <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                      {safeText(cred.notes, "")}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
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
            {/* Admin: User selector */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Assign to User</Label>
                <Select value={formTargetUserId} onValueChange={setFormTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
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
              <Select value={formLabel} onValueChange={setFormLabel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Workspace">Workspace</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Portal">Portal</SelectItem>
                  <SelectItem value="Hosting">Hosting</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                  <SelectItem value="Database">Database</SelectItem>
                </SelectContent>
              </Select>
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
                type="text"
                placeholder="Enter the password"
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
              onClick={handleSave}
              disabled={!formLabel || !formUsername || !formPassword || saving}
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
    </div>
  );
}
