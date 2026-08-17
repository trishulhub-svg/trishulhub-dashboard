"use client";

import { useState, useCallback, useEffect } from "react";
import { Key, Pencil, Trash2, Plus, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface CredentialForm {
  title: string;
  username: string;
  password: string;
}

interface CredentialItem {
  id: string;
  title: string;
  username: string;
  hasPassword?: boolean;
}

export function ProjectCredentialsDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const [newCred, setNewCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [editingCred, setEditingCred] = useState<CredentialForm>({ title: "", username: "", password: "" });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [deleteCredId, setDeleteCredId] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  const fetchCredentials = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`/api/projects/credentials?projectId=${pid}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCredentials(Array.isArray(data) ? data : []);
        setRevealedPasswords({});
        setShowPasswords({});
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!open || !projectId) return;
    fetchCredentials(projectId);
    setNewCred({ title: "", username: "", password: "" });
    setEditingCredId(null);
    setShowPasswords({});
  }, [open, projectId, fetchCredentials]);

  const revealProjectCredential = useCallback(async (credId: string): Promise<string | null> => {
    if (revealedPasswords[credId]) return revealedPasswords[credId];
    try {
      const res = await fetch("/api/projects/credentials/reveal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: credId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to reveal password");
        return null;
      }
      const data = await res.json();
      const password = typeof data.password === "string" ? data.password : "";
      if (!password) {
        toast.error("Failed to reveal password");
        return null;
      }
      setRevealedPasswords((prev) => ({ ...prev, [credId]: password }));
      return password;
    } catch {
      toast.error("Failed to reveal password");
      return null;
    }
  }, [revealedPasswords]);

  const handleAddCredential = async () => {
    if (!newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()) {
      toast.error("All credential fields are required");
      return;
    }
    try {
      const res = await fetch("/api/projects/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId, ...newCred }),
      });
      if (res.ok) {
        toast.success("Credential added");
        setNewCred({ title: "", username: "", password: "" });
        fetchCredentials(projectId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to add credential");
      }
    } catch {
      toast.error("Failed to add credential");
    }
  };

  const handleUpdateCredential = async () => {
    if (!editingCredId || !editingCred.title.trim() || !editingCred.username.trim()) {
      toast.error("Title and username are required");
      return;
    }
    try {
      const payload: Record<string, unknown> = { id: editingCredId, title: editingCred.title, username: editingCred.username };
      if (passwordChanged && editingCred.password) {
        payload.password = editingCred.password;
      }
      const res = await fetch("/api/projects/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Credential updated");
        setEditingCredId(null);
        fetchCredentials(projectId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to update credential");
      }
    } catch {
      toast.error("Failed to update credential");
    }
  };

  const handleDeleteCredential = async () => {
    if (!deleteCredId) return;
    try {
      const res = await fetch(`/api/projects/credentials?id=${deleteCredId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Credential removed");
        fetchCredentials(projectId);
      }
    } catch {
      toast.error("Failed to delete credential");
    } finally {
      setDeleteCredId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Credentials</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg liquid-glass border p-4 space-y-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Key className="h-3.5 w-3.5" /> Add New Credential
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input placeholder="Title (e.g., Hosting Login)" value={newCred.title} onChange={(e) => setNewCred({ ...newCred, title: e.target.value })} className="h-8 text-sm" />
                <Input placeholder="Username / Email" value={newCred.username} onChange={(e) => setNewCred({ ...newCred, username: e.target.value })} className="h-8 text-sm" />
                <Input placeholder="Password" type="password" value={newCred.password} onChange={(e) => setNewCred({ ...newCred, password: e.target.value })} className="h-8 text-sm" />
              </div>
              <Button type="button" size="sm" onClick={handleAddCredential} disabled={!newCred.title.trim() || !newCred.username.trim() || !newCred.password.trim()} className="h-8">
                <Plus className="h-3 w-3 mr-1" /> Add Credential
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Key className="h-3.5 w-3.5" /> Stored Credentials
              </h3>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {credentials.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No credentials stored</p>
              )}
              {credentials.map((cred) => (
                <div key={cred.id} className="border rounded-lg p-3 space-y-2 bg-white/40 dark:bg-white/[0.02]">
                  {editingCredId === cred.id ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input value={editingCred.title} onChange={(e) => setEditingCred({ ...editingCred, title: e.target.value })} className="h-8 text-sm" />
                        <Input value={editingCred.username} onChange={(e) => setEditingCred({ ...editingCred, username: e.target.value })} className="h-8 text-sm" />
                        <Input value={editingCred.password} onChange={(e) => { setEditingCred({ ...editingCred, password: e.target.value }); setPasswordChanged(true); }} className="h-8 text-sm" placeholder="Enter new password (leave blank to keep)" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" className="h-7" onClick={handleUpdateCredential}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setEditingCredId(null)}>Cancel</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{cred.title}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7" onClick={() => { setEditingCredId(cred.id); setEditingCred({ title: cred.title, username: cred.username, password: "" }); setPasswordChanged(false); }} title="Edit">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 text-red-500" onClick={() => setDeleteCredId(cred.id)} title="Delete">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>Username: <span className="font-mono text-foreground">{cred.username}</span></span>
                        <span className="hidden sm:inline mx-1">&bull;</span>
                        <span>Password: <span className="font-mono text-foreground">{showPasswords[cred.id] && revealedPasswords[cred.id] ? revealedPasswords[cred.id] : "••••••••"}</span></span>
                        <Button type="button" variant="ghost" size="sm" className="h-5 w-5 ml-auto" onClick={async () => {
                          if (showPasswords[cred.id]) {
                            setShowPasswords({ ...showPasswords, [cred.id]: false });
                            return;
                          }
                          const pwd = await revealProjectCredential(cred.id);
                          if (pwd) setShowPasswords({ ...showPasswords, [cred.id]: true });
                        }} title={showPasswords[cred.id] ? "Hide" : "Show"} aria-label={showPasswords[cred.id] ? "Hide password" : "Show password"}>
                          {showPasswords[cred.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-5 w-5" onClick={async () => {
                          const pwd = await revealProjectCredential(cred.id);
                          if (!pwd) return;
                          try { await navigator.clipboard.writeText(pwd); toast.success("Copied"); } catch { toast.error("Failed to copy to clipboard"); }
                        }} title="Copy" aria-label="Copy password">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCredId} onOpenChange={() => setDeleteCredId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Credential</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this credential. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCredential} className="bg-red-600 hover:bg-red-700">
              Delete Credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
