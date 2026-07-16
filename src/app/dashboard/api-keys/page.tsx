"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus, Trash2, Key, AlertTriangle, CheckCircle2, Loader2,
  Edit2, Eye, EyeOff, Copy, Shield, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  EXHAUSTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ERROR: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const PROVIDERS: Record<string, { name: string; hint: string }> = {
  OPENROUTER: { name: "OpenRouter", hint: "sk-or-v1-..." },
  ZAI: { name: "Z.ai", hint: "Z.ai API key" },
  GOOGLE_AI: { name: "Google AI", hint: "AIza..." },
  NVIDIA: { name: "NVIDIA", hint: "nvapi-..." },
  OTHER: { name: "Other", hint: "Your API key..." },
};

interface ApiKeyData {
  id: string;
  provider: string;
  keyName: string;
  keyValue: string;
  monthlyBudget: number;
  currentSpend: number;
  status: string;
  priority: number;
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

export default function ApiKeysPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSessionLoading = status === "loading";
  const userRole = session?.user?.role || "DEVELOPER";

  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyData | null>(null);
  const [saving, setSaving] = useState(false);
  const [showKeyValues, setShowKeyValues] = useState<Record<string, boolean>>({});
  const [revealedKeyValues, setRevealedKeyValues] = useState<Record<string, string>>({});
  const [revealingKey, setRevealingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Form state
  const [formProvider, setFormProvider] = useState("OPENROUTER");
  const [formKeyName, setFormKeyName] = useState("");
  const [formKeyValue, setFormKeyValue] = useState("");
  const [formBudget, setFormBudget] = useState("18");
  const [formPriority, setFormPriority] = useState("1");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const resetForm = () => {
    setFormProvider("OPENROUTER");
    setFormKeyName("");
    setFormKeyValue("");
    setFormBudget("18");
    setFormPriority("1");
    setAdvancedOpen(false);
  };

  const fetchKeys = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/api-keys", { credentials: "include" });
      if (res.status === 401) {
        setKeys([]);
        setError("Your session has expired. Please sign in again.");
        setTimeout(() => { router.push("/login"); }, 1500);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setKeys(data);
        } else {
          setKeys([]);
          setError(data.error || "Unexpected response from server");
        }
      } else {
        let errorMsg = "Failed to fetch API keys";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status}). Please try again.`;
        }
        setKeys([]);
        setError(errorMsg);
      }
    } catch {
      setKeys([]);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKeyName.trim() || !formKeyValue.trim()) {
      toast.error("Name and API key value are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formProvider,
          keyName: formKeyName.trim(),
          keyValue: formKeyValue.trim(),
          monthlyBudget: parseFloat(formBudget) || 18,
          priority: parseInt(formPriority) || 1,
          status: "ACTIVE",
        }),
      });
      if (res.ok) {
        toast.success("API key stored in vault");
        setAddOpen(false);
        resetForm();
        fetchKeys();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to add API key" }));
        toast.error(errorData.error || "Failed to add API key");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    if (!formKeyName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        id: editingKey.id,
        keyName: formKeyName.trim(),
        provider: formProvider,
      };
      if (formKeyValue.trim() && formKeyValue.trim() !== "••••••••") {
        updateData.keyValue = formKeyValue.trim();
      }
      if (advancedOpen) {
        updateData.monthlyBudget = parseFloat(formBudget) || 18;
        updateData.priority = parseInt(formPriority) || 1;
      }
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        toast.success("API key updated");
        setEditOpen(false);
        setEditingKey(null);
        setRevealedKeyValues((prev) => {
          const next = { ...prev };
          delete next[editingKey.id];
          return next;
        });
        setShowKeyValues((prev) => ({ ...prev, [editingKey.id]: false }));
        fetchKeys();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to update API key" }));
        toast.error(errorData.error || "Failed to update API key");
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
      const res = await fetch(`/api/api-keys?id=${deleteTarget}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("API key deleted");
        fetchKeys();
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

  const openEditDialog = (key: ApiKeyData) => {
    setEditingKey(key);
    setFormProvider(key.provider in PROVIDERS ? key.provider : "OTHER");
    setFormKeyName(key.keyName);
    setFormKeyValue("••••••••");
    setFormBudget(String(key.monthlyBudget ?? 18));
    setFormPriority(String(key.priority ?? 1));
    setAdvancedOpen(false);
    setEditOpen(true);
  };

  const revealKeyValue = useCallback(async (keyId: string): Promise<string | null> => {
    if (revealedKeyValues[keyId]) return revealedKeyValues[keyId];
    setRevealingKey(keyId);
    try {
      const res = await fetch("/api/api-keys/reveal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: keyId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to reveal key" }));
        toast.error(errData.error || "Failed to reveal key");
        return null;
      }
      const data = await res.json();
      const plain = data.keyValue as string;
      setRevealedKeyValues((prev) => ({ ...prev, [keyId]: plain }));
      return plain;
    } catch {
      toast.error("Failed to reveal key");
      return null;
    } finally {
      setRevealingKey(null);
    }
  }, [revealedKeyValues]);

  const handleToggleKeyVisibility = useCallback(async (keyId: string) => {
    const turningOn = !showKeyValues[keyId];
    setShowKeyValues((prev) => ({ ...prev, [keyId]: turningOn }));
    if (turningOn && !revealedKeyValues[keyId]) {
      await revealKeyValue(keyId);
    }
  }, [showKeyValues, revealedKeyValues, revealKeyValue]);

  const handleCopyKeyValue = useCallback(async (key: ApiKeyData) => {
    let plain: string | null = revealedKeyValues[key.id] || null;
    if (!plain) plain = await revealKeyValue(key.id);
    if (!plain) return;
    try {
      await navigator.clipboard.writeText(plain);
      toast.success("Key copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [revealedKeyValues, revealKeyValue]);

  if (isSessionLoading) {
    return (
      <div className="space-y-4 th-page-enter">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (userRole !== "SUPER_ADMIN") {
    router.push("/dashboard");
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-4 th-page-enter">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 th-page-enter">
      <PageHeader title="API Keys" description="Encrypted vault for provider credentials used by agents">
        <Button onClick={() => { resetForm(); setAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Key
        </Button>
      </PageHeader>

      {/* Compact summary */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 rounded-xl border border-border bg-card/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="th-stat-icon !h-8 !w-8">
            <Key className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stored</p>
            <p className="text-sm font-semibold tabular-nums">{keys.length}</p>
          </div>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2">
          <div className="th-stat-icon !h-8 !w-8 !bg-emerald-500/15 !text-emerald-600 dark:!text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Active</p>
            <p className="text-sm font-semibold tabular-nums">{keys.filter((k) => k.status === "ACTIVE").length}</p>
          </div>
        </div>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          Keys are encrypted at rest. Reveal is audited.
        </div>
      </div>

      {error && keys.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
          <h3 className="text-base font-semibold mb-1">Could not load vault</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">{error}</p>
          <Button size="sm" variant="outline" onClick={fetchKeys}>Retry</Button>
        </div>
      )}

      {!error && keys.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center text-center">
          <div className="th-stat-icon mb-4 !h-12 !w-12">
            <Key className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No keys in vault</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-5">
            Store OpenRouter, Z.ai, Google AI, NVIDIA, or custom provider keys. Values are encrypted and never returned in list responses.
          </p>
          <Button onClick={() => { resetForm(); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Your First Key
          </Button>
        </div>
      )}

      {keys.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => {
                  const provider = PROVIDERS[key.provider] || PROVIDERS.OTHER;
                  const visible = showKeyValues[key.id];
                  const revealing = revealingKey === key.id;
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.keyName || "Unnamed"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{provider.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                            {visible
                              ? (revealedKeyValues[key.id] || (revealing ? "…" : key.keyValue))
                              : key.keyValue}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleToggleKeyVisibility(key.id)}
                            disabled={revealing}
                            aria-label={visible ? "Hide key" : "Reveal key"}
                          >
                            {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleCopyKeyValue(key)}
                            aria-label="Copy key"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-[10px] font-medium", STATUS_STYLES[key.status] || "")}>
                          {key.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground" title={key.updatedAt ? formatDateTime(key.updatedAt) : undefined}>
                        {formatRelative(key.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(key)} aria-label="Edit key">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(key.id)} aria-label="Delete key">
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
            {keys.map((key) => {
              const provider = PROVIDERS[key.provider] || PROVIDERS.OTHER;
              const visible = showKeyValues[key.id];
              const revealing = revealingKey === key.id;
              return (
                <div key={key.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{key.keyName || "Unnamed"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{provider.name}</Badge>
                        <Badge className={cn("text-[10px]", STATUS_STYLES[key.status] || "")}>{key.status}</Badge>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatRelative(key.updatedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                      {visible
                        ? (revealedKeyValues[key.id] || (revealing ? "…" : key.keyValue))
                        : key.keyValue}
                    </code>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleKeyVisibility(key.id)} disabled={revealing}>
                      {revealing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyKeyValue(key)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(key)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteTarget(key.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add API Key</DialogTitle>
            <DialogDescription>Store an encrypted provider credential in the vault</DialogDescription>
          </DialogHeader>
          <KeyForm
            formProvider={formProvider}
            setFormProvider={setFormProvider}
            formKeyName={formKeyName}
            setFormKeyName={setFormKeyName}
            formKeyValue={formKeyValue}
            setFormKeyValue={setFormKeyValue}
            formBudget={formBudget}
            setFormBudget={setFormBudget}
            formPriority={formPriority}
            setFormPriority={setFormPriority}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            onSubmit={handleAddKey}
            saving={saving}
            submitLabel="Add to Vault"
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditingKey(null); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>Rename the key or rotate the secret value</DialogDescription>
          </DialogHeader>
          <KeyForm
            formProvider={formProvider}
            setFormProvider={setFormProvider}
            formKeyName={formKeyName}
            setFormKeyName={setFormKeyName}
            formKeyValue={formKeyValue}
            setFormKeyValue={setFormKeyValue}
            formBudget={formBudget}
            setFormBudget={setFormBudget}
            formPriority={formPriority}
            setFormPriority={setFormPriority}
            advancedOpen={advancedOpen}
            setAdvancedOpen={setAdvancedOpen}
            onSubmit={handleEditKey}
            saving={saving}
            submitLabel="Save Changes"
            isEdit={true}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Remove this key from the vault? Agents referencing it will stop using it. This cannot be undone.
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

function KeyForm({
  formProvider, setFormProvider,
  formKeyName, setFormKeyName,
  formKeyValue, setFormKeyValue,
  formBudget, setFormBudget,
  formPriority, setFormPriority,
  advancedOpen, setAdvancedOpen,
  onSubmit, saving, submitLabel, isEdit,
}: {
  formProvider: string;
  setFormProvider: (v: string) => void;
  formKeyName: string;
  setFormKeyName: (v: string) => void;
  formKeyValue: string;
  setFormKeyValue: (v: string) => void;
  formBudget: string;
  setFormBudget: (v: string) => void;
  formPriority: string;
  setFormPriority: (v: string) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  submitLabel: string;
  isEdit: boolean;
}) {
  const provider = PROVIDERS[formProvider] || PROVIDERS.OTHER;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Provider</Label>
        <Select value={formProvider} onValueChange={setFormProvider}>
          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
            <SelectItem value="ZAI">Z.ai</SelectItem>
            <SelectItem value="GOOGLE_AI">Google AI</SelectItem>
            <SelectItem value="NVIDIA">NVIDIA</SelectItem>
            <SelectItem value="OTHER">Other (custom)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          value={formKeyName}
          onChange={(e) => setFormKeyName(e.target.value)}
          required
          placeholder={`e.g., ${provider.name} Primary`}
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
          placeholder={provider.hint}
          autoComplete="off"
        />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground -ml-2">
            <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", advancedOpen && "rotate-180")} />
            Advanced (runtime)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Monthly budget (USD)</Label>
              <Input type="number" value={formBudget} onChange={(e) => setFormBudget(e.target.value)} step="0.01" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority (1 = highest)</Label>
              <Input type="number" value={formPriority} onChange={(e) => setFormPriority(e.target.value)} min="1" max="10" />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <DialogFooter>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
