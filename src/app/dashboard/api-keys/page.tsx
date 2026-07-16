"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus, Trash2, Key, AlertTriangle, Loader2,
  Edit2, Eye, EyeOff, Copy, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

const CATEGORIES: Record<string, { name: string; hint: string }> = {
  BREVO: { name: "Brevo", hint: "xkeysib-..." },
  OPENROUTER: { name: "OpenRouter", hint: "sk-or-v1-..." },
  ZAI: { name: "Z.ai", hint: "Z.ai API key" },
  SMTP: { name: "SMTP", hint: "SMTP password / API key" },
  GOOGLE_AI: { name: "Google AI", hint: "AIza..." },
  NVIDIA: { name: "NVIDIA", hint: "nvapi-..." },
  OTHER: { name: "Other", hint: "Your secret value..." },
};

interface VaultSecret {
  id: string;
  name: string;
  category: string;
  keyValue: string;
  notes?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

function formatRelative(dateStr?: string) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDateTime(dateStr);
}

function categoryLabel(category: string) {
  return CATEGORIES[category]?.name || category || "Other";
}

export default function ApiKeysPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSessionLoading = status === "loading";
  const userRole = session?.user?.role || "DEVELOPER";
  const canAccess = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSecret, setEditingSecret] = useState<VaultSecret | null>(null);
  const [saving, setSaving] = useState(false);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [formCategory, setFormCategory] = useState("OTHER");
  const [formName, setFormName] = useState("");
  const [formKeyValue, setFormKeyValue] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const resetForm = () => {
    setFormCategory("OTHER");
    setFormName("");
    setFormKeyValue("");
    setFormNotes("");
  };

  const fetchSecrets = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/vault-secrets", { credentials: "include" });
      if (res.status === 401) {
        setSecrets([]);
        setError("Your session has expired. Please sign in again.");
        setTimeout(() => { router.push("/login"); }, 1500);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSecrets(data);
        } else {
          setSecrets([]);
          setError(data.error || "Unexpected response from server");
        }
      } else {
        let errorMsg = "Failed to load vault";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status}). Please try again.`;
        }
        setSecrets([]);
        setError(errorMsg);
      }
    } catch {
      setSecrets([]);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isSessionLoading && canAccess) {
      fetchSecrets();
    } else if (!isSessionLoading && !canAccess) {
      setLoading(false);
    }
  }, [fetchSecrets, isSessionLoading, canAccess]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formKeyValue.trim()) {
      toast.error("Name and secret value are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vault-secrets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory,
          keyValue: formKeyValue.trim(),
          notes: formNotes.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Secret stored in vault");
        setAddOpen(false);
        resetForm();
        fetchSecrets();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to add secret" }));
        toast.error(errorData.error || "Failed to add secret");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSecret) return;
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        name: formName.trim(),
        category: formCategory,
        notes: formNotes.trim() || null,
      };
      if (formKeyValue.trim() && formKeyValue.trim() !== "••••••••") {
        updateData.keyValue = formKeyValue.trim();
      }
      const res = await fetch(`/api/vault-secrets/${editingSecret.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        toast.success("Secret updated");
        setEditOpen(false);
        setEditingSecret(null);
        setRevealedValues((prev) => {
          const next = { ...prev };
          delete next[editingSecret.id];
          return next;
        });
        setShowValues((prev) => ({ ...prev, [editingSecret.id]: false }));
        resetForm();
        fetchSecrets();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to update secret" }));
        toast.error(errorData.error || "Failed to update secret");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/vault-secrets/${deleteTarget}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Secret deleted");
        setRevealedValues((prev) => {
          const next = { ...prev };
          delete next[deleteTarget];
          return next;
        });
        fetchSecrets();
      } else {
        const data = await res.json().catch(() => ({ error: "Failed to delete" }));
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const openEditDialog = (secret: VaultSecret) => {
    setEditingSecret(secret);
    setFormCategory(secret.category in CATEGORIES ? secret.category : "OTHER");
    setFormName(secret.name);
    setFormKeyValue("••••••••");
    setFormNotes(secret.notes || "");
    setEditOpen(true);
  };

  const revealValue = useCallback(async (id: string): Promise<string | null> => {
    if (revealedValues[id]) return revealedValues[id];
    setRevealingId(id);
    try {
      const res = await fetch("/api/vault-secrets/reveal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to reveal secret" }));
        toast.error(errData.error || "Failed to reveal secret");
        return null;
      }
      const data = await res.json();
      const plain = data.keyValue as string;
      setRevealedValues((prev) => ({ ...prev, [id]: plain }));
      return plain;
    } catch {
      toast.error("Failed to reveal secret");
      return null;
    } finally {
      setRevealingId(null);
    }
  }, [revealedValues]);

  const handleToggleVisibility = useCallback(async (id: string) => {
    const turningOn = !showValues[id];
    setShowValues((prev) => ({ ...prev, [id]: turningOn }));
    if (turningOn && !revealedValues[id]) {
      await revealValue(id);
    }
  }, [showValues, revealedValues, revealValue]);

  const handleCopy = useCallback(async (secret: VaultSecret) => {
    let plain: string | null = revealedValues[secret.id] || null;
    if (!plain) plain = await revealValue(secret.id);
    if (!plain) return;
    try {
      await navigator.clipboard.writeText(plain);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [revealedValues, revealValue]);

  if (isSessionLoading || loading) {
    return (
      <div className="space-y-6 th-page-enter">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!canAccess) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="space-y-6 th-page-enter">
      <PageHeader title="API Keys" description="Secure storage for encrypted API keys and secrets">
        <Button onClick={() => { resetForm(); setAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Secret
        </Button>
      </PageHeader>

      <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span>Values are encrypted at rest. Reveal and copy actions are audited.</span>
      </div>

      {error && secrets.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <h3 className="text-base font-semibold mb-1">Could not load vault</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchSecrets}>Retry</Button>
        </div>
      )}

      {!error && secrets.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 flex flex-col items-center text-center">
          <div className="th-stat-icon mb-4 !h-12 !w-12">
            <Key className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No secrets yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            Store Brevo, OpenRouter, SMTP, Google AI, or any other API keys here. Values stay encrypted and masked until you reveal them.
          </p>
          <Button onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Your First Secret
          </Button>
        </div>
      )}

      {secrets.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => {
                  const visible = showValues[secret.id];
                  const revealing = revealingId === secret.id;
                  return (
                    <TableRow key={secret.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{secret.name || "Unnamed"}</p>
                          {secret.notes ? (
                            <p className="text-xs text-muted-foreground truncate max-w-[220px] mt-0.5">
                              {secret.notes}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {categoryLabel(secret.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                            {visible
                              ? (revealedValues[secret.id] || (revealing ? "…" : secret.keyValue))
                              : secret.keyValue}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleToggleVisibility(secret.id)}
                            disabled={revealing}
                            aria-label={visible ? "Hide secret" : "Reveal secret"}
                          >
                            {revealing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : visible ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleCopy(secret)}
                            aria-label="Copy secret"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground"
                        title={secret.updatedAt ? formatDateTime(secret.updatedAt) : undefined}
                      >
                        {formatRelative(secret.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(secret)}
                            aria-label="Edit secret"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => setDeleteTarget(secret.id)}
                            aria-label="Delete secret"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked list */}
          <div className="md:hidden divide-y divide-border">
            {secrets.map((secret) => {
              const visible = showValues[secret.id];
              const revealing = revealingId === secret.id;
              return (
                <div key={secret.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{secret.name || "Unnamed"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {categoryLabel(secret.category)}
                        </Badge>
                      </div>
                      {secret.notes ? (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {secret.notes}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatRelative(secret.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                      {visible
                        ? (revealedValues[secret.id] || (revealing ? "…" : secret.keyValue))
                        : secret.keyValue}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleToggleVisibility(secret.id)}
                      disabled={revealing}
                      aria-label={visible ? "Hide secret" : "Reveal secret"}
                    >
                      {revealing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : visible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopy(secret)}
                      aria-label="Copy secret"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditDialog(secret)}
                      aria-label="Edit secret"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500"
                      onClick={() => setDeleteTarget(secret.id)}
                      aria-label="Delete secret"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Secret</DialogTitle>
            <DialogDescription>Store an encrypted API key or credential in the vault</DialogDescription>
          </DialogHeader>
          <SecretForm
            formCategory={formCategory}
            setFormCategory={setFormCategory}
            formName={formName}
            setFormName={setFormName}
            formKeyValue={formKeyValue}
            setFormKeyValue={setFormKeyValue}
            formNotes={formNotes}
            setFormNotes={setFormNotes}
            onSubmit={handleAdd}
            saving={saving}
            submitLabel="Add to Vault"
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingSecret(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Secret</DialogTitle>
            <DialogDescription>Rename, recategorize, or rotate the secret value</DialogDescription>
          </DialogHeader>
          <SecretForm
            formCategory={formCategory}
            setFormCategory={setFormCategory}
            formName={formName}
            setFormName={setFormName}
            formKeyValue={formKeyValue}
            setFormKeyValue={setFormKeyValue}
            formNotes={formNotes}
            setFormNotes={setFormNotes}
            onSubmit={handleEdit}
            saving={saving}
            submitLabel="Save Changes"
            isEdit={true}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Secret</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this secret from the vault permanently? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SecretForm({
  formCategory, setFormCategory,
  formName, setFormName,
  formKeyValue, setFormKeyValue,
  formNotes, setFormNotes,
  onSubmit, saving, submitLabel, isEdit,
}: {
  formCategory: string;
  setFormCategory: (v: string) => void;
  formName: string;
  setFormName: (v: string) => void;
  formKeyValue: string;
  setFormKeyValue: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  submitLabel: string;
  isEdit: boolean;
}) {
  const category = CATEGORIES[formCategory] || CATEGORIES.OTHER;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <Select value={formCategory} onValueChange={setFormCategory}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BREVO">Brevo</SelectItem>
            <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
            <SelectItem value="ZAI">Z.ai</SelectItem>
            <SelectItem value="SMTP">SMTP</SelectItem>
            <SelectItem value="GOOGLE_AI">Google AI</SelectItem>
            <SelectItem value="NVIDIA">NVIDIA</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          required
          placeholder={`e.g., ${category.name} Production`}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Secret {isEdit ? "(leave masked to keep current)" : ""}
        </Label>
        <Input
          value={formKeyValue}
          onChange={(e) => setFormKeyValue(e.target.value)}
          required={!isEdit}
          type="password"
          placeholder={category.hint}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder="Where this key is used, rotation notes…"
          rows={2}
          maxLength={2000}
          className="resize-none"
        />
      </div>

      <DialogFooter>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
