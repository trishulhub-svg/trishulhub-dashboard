"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText, Upload, Download, Trash2, Loader2,
  FileUp, CheckCircle2, AlertCircle, Clock,
  Shield, Ban, Save, Eye, EyeOff,
  Copy, Check, KeyRound, Info,
  Users, RefreshCw, Settings,
  Plus, Edit3, Globe, Search, Key,
  Link2, Unlink, ArrowRightLeft, Zap, XCircle,
  CheckCircle2 as CheckCircleIcon,
  Activity, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { safeText, safeDate, safeArray, cn } from "@/lib/utils";

const authFetch = (url: string, options?: RequestInit) => fetch(url, { credentials: "include", ...options });
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

/* ═══════════════════════════════════════════════════════════════
   INTERFACES — from both protocol & credentials pages
   ═══════════════════════════════════════════════════════════════ */

interface ProtocolFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  downloadEnabled: boolean;
}

interface WorkspaceConfigState {
  id: string | null;
  configToken: string;
  configTokenMasked: string;
  configTokenLabel: string;
  hasToken: boolean;
}

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

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function AccessHubPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <AccessHubContent />
    </Suspense>
  );
}

function AccessHubContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const effectiveTab = (() => {
    const raw = searchParams.get("tab") || "credentials";
    const superAdmin = session?.user?.role === "SUPER_ADMIN";
    return (!superAdmin && raw === "system") ? "credentials" : raw;
  })();
  const isSuperAdmin = session?.user?.role === "SUPER_ADMIN";
  const isAdmin = session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFetchDone = useRef(false);

  // ── Protocol state ──
  const [protocol, setProtocol] = useState<ProtocolFile | null>(null);
  const [protocolLoading, setProtocolLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(true);

  // ── Credential encryption key state ──
  const [credEncKeyForm, setCredEncKeyForm] = useState("");
  const [showCredEncKey, setShowCredEncKey] = useState(false);
  const [credEncKeySaving, setCredEncKeySaving] = useState(false);
  const [hasCredEncKey, setHasCredEncKey] = useState(false);
  const [credEncKeyMasked, setCredEncKeyMasked] = useState("");

  // ── Workspace Config Token state ──
  const [wsConfig, setWsConfig] = useState<WorkspaceConfigState | null>(null);
  const [wsTokenForm, setWsTokenForm] = useState("");
  const [wsLabelForm, setWsLabelForm] = useState("");
  const [wsSaving, setWsSaving] = useState(false);
  const [showWsToken, setShowWsToken] = useState(false);

  // ── Copied states ──
  const [copiedWsToken, setCopiedWsToken] = useState(false);

  // ── Credentials state ──
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credsLoading, setCredsLoading] = useState(true);
  const [credsError, setCredsError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deleteProtocolDialogOpen, setDeleteProtocolDialogOpen] = useState(false);
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

  /* ═══════════════════════════════════════════════════════════════
     DATA FETCHING
     ═══════════════════════════════════════════════════════════════ */

  // ── Fetch protocol/init data (protocol page data) ──
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    authFetch("/api/protocol/init")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        if (data.protocol?.id) {
          setProtocol(data.protocol);
          setDownloadEnabled(data.protocol.downloadEnabled !== false);
        } else {
          setDownloadEnabled(true);
        }
        if (data.wsConfig) {
          setWsConfig(data.wsConfig);
          if (data.wsConfig.configTokenLabel) setWsLabelForm(data.wsConfig.configTokenLabel);
        }
        fetchCredEncKeyStatus();
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setProtocolLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  // ── Fetch credentials ──
  const fetchCredentials = useCallback(async () => {
    setCredsLoading(true);
    setCredsError("");
    try {
      const params = new URLSearchParams();
      if (isAdmin && selectedUserId && selectedUserId !== "all") {
        params.set("userId", selectedUserId);
      }
      const res = await fetch(`/api/credentials?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const creds = Array.isArray(data) ? data : data.data;
        setCredentials(safeArray<Credential>(creds));
      } else {
        setCredsError("Failed to load credentials");
        toast.error("Failed to load credentials");
      }
    } catch {
      setCredsError("Failed to load credentials");
      toast.error("Failed to load credentials");
    } finally {
      setCredsLoading(false);
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
    if (!session) return;
    fetchCredentials();
    fetchUsers();
    initialFetchDone.current = true;
  }, [session, status, fetchCredentials, fetchUsers]);

  // Re-fetch when admin changes user filter (skip initial mount)
  useEffect(() => {
    if (!isAdmin || !session || !initialFetchDone.current) return;
    fetchCredentials();
  }, [selectedUserId]);

  /* ═══════════════════════════════════════════════════════════════
     PROTOCOL HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Only PDF files are allowed"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
      const res = await authFetch("/api/protocol", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type || "application/pdf", data: base64 }),
      });
      if (res.ok) {
        toast.success("Protocol PDF uploaded successfully");
        await refetchProtocol();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Upload failed"));
      }
    } catch { toast.error("Failed to upload file"); }
    setUploading(false);
  };

  const handleDownload = useCallback(async () => {
    if (!protocol) return;
    try {
      const res = await authFetch("/api/protocol?download=true");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = protocol.fileName || "trishul-protocol.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Download started");
      } else { toast.error("Failed to download protocol"); }
    } catch { toast.error("Download failed"); }
  }, [protocol]);

  const handleDeleteProtocol = async () => {
    if (!protocol) return;
    setDeleteProtocolDialogOpen(true);
  };

  const confirmDeleteProtocol = async () => {
    setDeleteProtocolDialogOpen(false);
    try {
      const res = await authFetch("/api/protocol", { method: "DELETE" });
      if (res.ok) { toast.success("Protocol PDF deleted"); setProtocol(null); }
      else { toast.error("Failed to delete"); }
    } catch { toast.error("Failed to delete"); }
  };

  const handleToggleDownload = async () => {
    try {
      const res = await authFetch("/api/protocol", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadEnabled: !downloadEnabled }),
      });
      if (res.ok) {
        setDownloadEnabled(!downloadEnabled);
        toast.success(!downloadEnabled ? "Downloads enabled" : "Downloads disabled");
      } else { toast.error("Failed to toggle download"); }
    } catch { toast.error("Failed to toggle download"); }
  };

  /* ═══════════════════════════════════════════════════════════════
     CREDENTIAL ENCRYPTION KEY HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleSaveCredEncKey = async () => {
    if (!credEncKeyForm.trim()) return;
    if (!/^[0-9a-fA-F]{64}$/.test(credEncKeyForm.trim())) {
      toast.error("Key must be exactly 64 hex characters");
      return;
    }
    setCredEncKeySaving(true);
    try {
      const res = await fetch("/api/settings/credential-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: credEncKeyForm.trim() }),
      });
      if (res.ok) {
        toast.success("Credential encryption key saved");
        setCredEncKeyForm("");
        fetchCredEncKeyStatus();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as Record<string, string>).error?.slice(0, 100) || "Failed to save key");
      }
    } catch {
      toast.error("Failed to save key");
    }
    setCredEncKeySaving(false);
  };

  const fetchCredEncKeyStatus = async () => {
    try {
      const res = await fetch("/api/settings/credential-key", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHasCredEncKey(data.hasKey);
        setCredEncKeyMasked(data.maskedKey || "");
      }
    } catch { /* silent */ }
  };

  /* ═══════════════════════════════════════════════════════════════
     WORKSPACE TOKEN HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleSaveWsConfig = async () => {
    if (!wsTokenForm.trim() && !wsLabelForm.trim()) { toast.error("Enter a token or label to save"); return; }
    setWsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (wsTokenForm.trim()) body.configToken = wsTokenForm.trim();
      if (wsLabelForm.trim()) body.configTokenLabel = wsLabelForm.trim();
      const res = await authFetch("/api/workspace-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { toast.success("Workspace config updated"); setWsTokenForm(""); await refetchWsConfig(); }
      else { const data = await res.json(); toast.error(safeText(data.error, "Failed to update")); }
    } catch { toast.error("Failed to update"); }
    setWsSaving(false);
  };

  const handleCopyWsToken = async () => {
    const tokenToCopy = wsConfig?.configToken || null;
    if (!tokenToCopy) { toast.error("Token not available to copy"); return; }
    try {
      await navigator.clipboard.writeText(tokenToCopy);
      setCopiedWsToken(true);
      toast.success("Token copied to clipboard");
      setTimeout(() => setCopiedWsToken(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  /* ═══════════════════════════════════════════════════════════════
     CREDENTIALS HANDLERS
     ═══════════════════════════════════════════════════════════════ */

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
    if (!formLabel || !formUsername || (!formPassword && !editingCredential)) return;
    if (isAdmin && !formTargetUserId) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {
        label: formLabel,
        username: formUsername,
        ...(formPassword && { password: formPassword }),
        url: formUrl,
        notes: formNotes,
      };
      if (editingCredential) {
        body.id = editingCredential.id;
        const res = await fetch("/api/credentials", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
        if (res.ok) { setShowAddDialog(false); resetCredForm(); fetchCredentials(); }
      } else {
        const userId = isAdmin ? formTargetUserId : session?.user?.id;
        if (!userId) {
          toast.error("No user session found");
          return;
        }
        body.userId = userId;
        const res = await fetch("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
        if (res.ok) { setShowAddDialog(false); resetCredForm(); fetchCredentials(); }
      }
    } catch { toast.error("Failed to save credential"); }
    finally { setSaving(false); }
  };

  const handleDeleteCred = async (id: string) => {
    try {
      const res = await fetch(`/api/credentials?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { setDeleteId(null); fetchCredentials(); }
    } catch { toast.error("Failed to delete credential"); }
  };

  /* ═══════════════════════════════════════════════════════════════
     REFETCH HELPERS
     ═══════════════════════════════════════════════════════════════ */

  const refetchProtocol = useCallback(async () => {
    try {
      const res = await authFetch("/api/protocol");
      if (res.ok) {
        const data = await res.json();
        if (data?.id) { setProtocol(data); setDownloadEnabled(data.downloadEnabled !== false); }
        else { setProtocol(null); setDownloadEnabled(true); }
      }
    } catch { /* silent */ }
  }, []);

  const refetchWsConfig = useCallback(async () => {
    try {
      const res = await authFetch("/api/workspace-config");
      if (res.ok) { const data = await res.json(); setWsConfig(data); if (data.configTokenLabel) setWsLabelForm(data.configTokenLabel); }
    } catch { /* silent */ }
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     UTILITY
     ═══════════════════════════════════════════════════════════════ */

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
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

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); };

  const filteredCredentials = credentials.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      safeText(c.label, "").toLowerCase().includes(q) ||
      safeText(c.username, "").toLowerCase().includes(q) ||
      safeText(c.notes, "").toLowerCase().includes(q)
    );
  });

  /* ═══════════════════════════════════════════════════════════════
     RENDER GUARD
     ═══════════════════════════════════════════════════════════════ */

  if (status === "loading") return null;
  if (!session) return null;

  const hasCredentials = filteredCredentials.length > 0;

  /* ═══════════════════════════════════════════════════════════════
     SHARED UI COMPONENTS (to reduce duplication)
     ═══════════════════════════════════════════════════════════════ */

  // Protocol PDF card (read-only)
  const ProtocolPdfCard = ({ canManage }: { canManage?: boolean }) => (
    <Card className="overflow-hidden border-border/60">
      <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
      <CardContent className="p-5">
        {protocol ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{safeText(protocol.fileName)}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="secondary" className="text-xs bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-0">PDF</Badge>
                    <span className="text-xs text-muted-foreground">{formatSize(protocol.fileSize)}</span>
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-xs flex items-center gap-1 flex-shrink-0 text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <Clock className="h-3 w-3" />
              Uploaded: {safeDate(protocol.uploadedAt)}
              {protocol.uploadedBy && (<> &middot; by {safeText(protocol.uploadedBy)}</>)}
            </div>
            <div className="flex items-center gap-2 pt-3 border-t border-border/50">
              {canManage || isAdmin ? (
                <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm">
                  <Download className="h-4 w-4 mr-2" /> Download PDF
                </Button>
              ) : !downloadEnabled ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg w-full">
                  <Ban className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">Download disabled by administration</span>
                </div>
              ) : (
                <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm">
                  <Download className="h-4 w-4 mr-2" /> Download PDF
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-sm">No protocol uploaded</p>
              <p className="text-xs text-muted-foreground">No protocol is available yet. Contact your admin.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Workspace Token card (all users can view/copy)
  const WorkspaceTokenCard = ({ canManage }: { canManage?: boolean }) => (
    <Card className="overflow-hidden border-border/60">
      <div className="h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <KeyRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <CardTitle className="text-sm">{safeText(wsConfig?.configTokenLabel, "Workspace Token")}</CardTitle>
            <CardDescription className="text-xs">Shared workspace configuration token</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {wsConfig?.hasToken ? (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showWsToken ? "text" : "password"}
                value={showWsToken ? (wsConfig?.configToken || "") : (wsConfig?.configTokenMasked || "••••••••")}
                readOnly
                className="pr-20 font-mono text-xs bg-muted/50"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <button type="button" onClick={() => setShowWsToken(!showWsToken)} aria-label={showWsToken ? "Hide workspace token" : "Show workspace token"} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  {showWsToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={handleCopyWsToken} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      {copiedWsToken ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy token</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No workspace token configured yet.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6 max-w-5xl mx-auto px-3 sm:px-4 lg:px-0">
      <PageHeader
        title="Access Hub"
        description="Credentials, protocol documents, workspace tokens, and system configuration."
      />

      {isAdmin ? (
        <Tabs value={effectiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 w-full sm:w-auto overflow-x-auto flex-nowrap">
            <TabsTrigger value="credentials" className="gap-1.5 text-xs sm:text-sm shrink-0" onClick={() => router.replace("/dashboard/access-hub?tab=credentials")}>
              <KeyRound className="h-3.5 w-3.5" />
              Credentials
            </TabsTrigger>
            <TabsTrigger value="protocol" className="gap-1.5 text-xs sm:text-sm shrink-0" onClick={() => router.replace("/dashboard/access-hub?tab=protocol")}>
              <FileText className="h-3.5 w-3.5" />
              Protocol &amp; Resources
            </TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="system" className="gap-1.5 text-xs sm:text-sm shrink-0" onClick={() => router.replace("/dashboard/access-hub?tab=system")}>
                <Settings className="h-3.5 w-3.5" />
                System Config
              </TabsTrigger>
            )}
          </TabsList>

          {/* ═══════════ TAB 1: CREDENTIALS ═══════════ */}
          <TabsContent value="credentials" className="space-y-5 mt-2">
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

            {/* Add button */}
            {isAdmin && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button size="sm" onClick={openAddCredDialog} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-1" /> Add Credential
                </Button>
              </div>
            )}

            {/* Error state */}
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

            {/* Loading state */}
            {credsLoading && (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i}><CardContent className="p-6"><div className="space-y-3"><div className="h-4 w-24 bg-muted rounded animate-pulse" /><div className="h-8 bg-muted rounded animate-pulse" /><div className="h-8 bg-muted rounded animate-pulse" /></div></CardContent></Card>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!credsLoading && !hasCredentials && !credsError && (
              <Card>
                <CardContent className="pt-8 pb-8">
                  <div className="text-center">
                    <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery
                        ? "No credentials match your search"
                        : "No credentials found. Click 'Add Credential' to create one."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Credentials Grid */}
            {!credsLoading && hasCredentials && (
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
                        {isAdmin && (
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
                      {isAdmin && cred.user && (
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
            )}
          </TabsContent>

          {/* ═══════════ TAB 2: PROTOCOL & RESOURCES ═══════════ */}
          <TabsContent value="protocol" className="space-y-5 mt-2">
            {/* Protocol v12 Card — the new OTP-based protocol */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Protocol v12
                      <Badge variant="default" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">OTP-based, dashboard-integrated workspace protocol</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">GitHub Repository</p>
                      <a href="https://github.com/trishulhub-svg/trishul-protocol-v12" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono">
                        trishulhub-svg/trishul-protocol-v12
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">Activation Flow</p>
                      <p className="text-xs text-muted-foreground">OTP via email → JWT → /api/agent/* calls</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">Self-Healing</p>
                      <p className="text-xs text-muted-foreground">Type /resume if GLM forgets — rebuilds full state</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">Commands</p>
                      <p className="text-xs text-muted-foreground">/start, /end, /endproject, /resume, /refresh, /docu, /demo, +4 more</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => window.open("https://github.com/trishulhub-svg/trishul-protocol-v12/blob/main/README.md", "_blank")} variant="outline" size="sm" className="flex-1 min-w-[120px]">
                    <FileText className="h-3.5 w-3.5 mr-1.5" /> View README
                  </Button>
                  <Button onClick={() => window.open("https://github.com/trishulhub-svg/trishul-protocol-v12/blob/main/commands/start.md", "_blank")} variant="outline" size="sm" className="flex-1 min-w-[120px]">
                    <FileText className="h-3.5 w-3.5 mr-1.5" /> View /start
                  </Button>
                  <Button onClick={() => window.open("https://github.com/trishulhub-svg/trishul-protocol-v12/blob/main/rules.json", "_blank")} variant="outline" size="sm" className="flex-1 min-w-[120px]">
                    <FileText className="h-3.5 w-3.5 mr-1.5" /> View Rules
                  </Button>
                </div>
                <div className="pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    <strong>How to use:</strong> In any GLM session, tell the AI to read the Protocol v12 README.
                    It will ask for your email, send an OTP, authenticate you, and auto clock-in.
                    Type /end to clock out. Type /resume if the GLM forgets.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Legacy Protocol PDF Card (for historical reference) */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-rose-500 to-red-600" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm">Protocol PDF</CardTitle>
                    <CardDescription className="text-xs">Upload, manage, and control access to the protocol document</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {protocol ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{safeText(protocol.fileName)}</p>
                        <p className="text-xs text-muted-foreground">{formatSize(protocol.fileSize)} &middot; {safeDate(protocol.uploadedAt)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400 flex-shrink-0">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button onClick={handleDownload} variant="outline" size="sm" className="flex-1 min-w-[100px]">
                        <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                      </Button>
                      <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="flex-1 min-w-[100px]">
                        <Upload className="h-3.5 w-3.5 mr-1.5" /> Replace
                      </Button>
                      <Button onClick={handleDeleteProtocol} variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No protocol uploaded yet.</p>
                    <div
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-all duration-200 ${dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-200 ${dragOver ? "bg-primary/10" : "bg-muted"}`}>
                        <FileUp className={`h-5 w-5 transition-colors duration-200 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-sm font-medium">{dragOver ? "Drop your PDF here" : "Click to upload or drag & drop"}</p>
                      <p className="text-xs text-muted-foreground">PDF files only, max 10MB</p>
                    </div>
                  </div>
                )}
                {protocol && (
                  <div className="pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch checked={downloadEnabled} onCheckedChange={handleToggleDownload} />
                        <span className="text-sm font-medium">Allow downloads</span>
                      </div>
                      <Badge variant={downloadEnabled ? "outline" : "secondary"} className={`text-xs ${downloadEnabled ? "text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400" : "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400"}`}>
                        {downloadEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Control whether team members can download the protocol PDF</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Workspace Config Token Management (admin) */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <KeyRound className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm">Workspace Config Token</CardTitle>
                    <CardDescription className="text-xs">Set a shared workspace token visible to all team members</CardDescription>
                  </div>
                  {wsConfig?.hasToken && (
                    <Badge variant="outline" className="text-xs text-violet-600 border-violet-200 dark:border-violet-800 dark:text-violet-400 flex-shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="ws-token-label" className="text-xs">Token Label</Label>
                  <Input id="ws-token-label" placeholder="e.g. ZAI Workspace Token" value={wsLabelForm} onChange={(e) => setWsLabelForm(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-token-value" className="text-xs">Token Value</Label>
                  <div className="relative">
                    <Input id="ws-token-value" type={showWsToken ? "text" : "password"} placeholder={wsConfig?.configTokenMasked || "Enter workspace token..."} value={wsTokenForm} onChange={(e) => setWsTokenForm(e.target.value)} className="pr-20 font-mono text-xs" />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button type="button" onClick={() => setShowWsToken(!showWsToken)} aria-label={showWsToken ? "Hide workspace token" : "Show workspace token"} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        {showWsToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {isAdmin && wsConfig?.configToken && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={handleCopyWsToken} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              {copiedWsToken ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copy token</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  {wsConfig?.configTokenMasked && !wsTokenForm && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep the existing token</p>
                  )}
                </div>
                <Button onClick={handleSaveWsConfig} disabled={wsSaving || (!wsTokenForm.trim() && !wsLabelForm.trim())} className="w-full" size="sm">
                  {wsSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save Configuration
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 4: SYSTEM CONFIG (SUPER_ADMIN only) ═══════════ */}
          <TabsContent value="system" className="space-y-5 mt-2">
            {!isSuperAdmin ? (
              <Card>
                <CardContent className="pt-8 pb-8">
                  <div className="text-center">
                    <Shield className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">System configuration is only available to Super Admins.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Workspace Sync Status — live connection to Protocol v12 + Agent API */}
                <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm">Workspace Sync Status</CardTitle>
                      </div>
                      <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <Wifi className="h-3 w-3 mr-1" /> Live
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      The dashboard is the source of truth for all workspace data. GLM sessions authenticate via OTP and read project/infrastructure data in real time — no manual sync needed.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/50">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <div>
                          <p className="font-semibold">Agent API</p>
                          <p className="text-[10px] text-muted-foreground">/api/agent/* active</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/50">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <div>
                          <p className="font-semibold">OTP Auth</p>
                          <p className="text-[10px] text-muted-foreground">/api/agent-auth/* active</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/50">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <div>
                          <p className="font-semibold">Auto Attendance</p>
                          <p className="text-[10px] text-muted-foreground">Clock-in/out via OTP</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 rounded-md bg-muted/50">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        <div>
                          <p className="font-semibold">UK Timezone</p>
                          <p className="text-[10px] text-muted-foreground">All times UK (Europe/London)</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground">
                        Protocol v12: <code className="font-mono text-primary">trishulhub-svg/trishul-protocol-v12</code>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Tasks managed in Lark. Devs see tasks in Lark app. Admins use chat.z.ai Connect IM for task queries.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Credential Encryption Key — for project credentials (separate from SMTP/Git) */}
                <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm">Credential Encryption Key</CardTitle>
                      </div>
                      <Badge variant={hasCredEncKey ? "default" : "secondary"} className={hasCredEncKey ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}>
                        {hasCredEncKey ? "Configured" : "Not set"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">Separate key for encrypting project credentials (logins, passwords). Independent from the main encryption key used for SMTP and Git sync.</p>
                    {credEncKeyMasked && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs font-mono text-muted-foreground">
                        <span>{credEncKeyMasked}</span>
                        <span className="text-[10px]">(stored in database)</span>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showCredEncKey ? "text" : "password"}
                          placeholder="Paste 64-char hex key or generate below"
                          value={credEncKeyForm}
                          onChange={(e) => setCredEncKeyForm(e.target.value)}
                          className="h-8 text-xs font-mono pr-16 w-full"
                        />
                        <button
                          type="button"
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowCredEncKey(!showCredEncKey)}
                        >
                          {showCredEncKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const bytes = new Uint8Array(32);
                            crypto.getRandomValues(bytes);
                            setCredEncKeyForm(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
                            setShowCredEncKey(true);
                          }}
                          title="Generate random key"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Button size="sm" onClick={handleSaveCredEncKey} disabled={credEncKeySaving || !credEncKeyForm.trim()} className="h-8 w-full sm:w-auto">
                        {credEncKeySaving ? "Saving..." : "Save Key"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        /* ═══════════ NON-ADMIN VIEW ═══════════ */
        <div className="space-y-5">
          {/* Their credentials */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Credentials</h2>
            {!credsLoading && !hasCredentials && !credsError && (
              <Card>
                <CardContent className="pt-8 pb-8">
                  <div className="text-center">
                    <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No credentials assigned to you yet. Contact your admin.</p>
                  </div>
                </CardContent>
              </Card>
            )}
            {!credsLoading && hasCredentials && (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredCredentials.map((cred) => (
                  <Card key={cred.id}>
                    <CardHeader className="pb-3">
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
            )}
          </div>

          {/* Protocol PDF */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Protocol</h2>
            <ProtocolPdfCard />
          </div>

          {/* Workspace Token */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Workspace Token</h2>
            <WorkspaceTokenCard />
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      {/* Upload overlay spinner */}
      {uploading && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-background rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Uploading protocol...</p>
          </div>
        </div>
      )}

      {/* Add/Edit Credential Dialog */}
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
            {isAdmin && (
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
              <Select value={formLabel} onValueChange={setFormLabel}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
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

      {/* Delete Credential Dialog */}
      {/* ── Delete Protocol Confirmation Dialog ── */}
      <AlertDialog open={deleteProtocolDialogOpen} onOpenChange={setDeleteProtocolDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Protocol PDF</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this protocol PDF? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteProtocol}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Credential Confirmation Dialog ── */}
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
