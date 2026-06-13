"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText, Upload, Download, Trash2, Loader2,
  FileUp, CheckCircle2, AlertCircle, Clock,
  Shield, Ban, Save, Eye, EyeOff,
  Copy, Check, KeyRound, UserCog, Info,
  Users, Fingerprint, RefreshCw, Settings, GitBranch, FileLock2,
  Plus, Edit3, Globe, Search, Key,
  Bird, Link2, Unlink, ArrowRightLeft, Zap, UserCheck, XCircle, CircleDot,
  ChevronDown, ChevronRight, Lightbulb, CheckCircle2 as CheckCircleIcon,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface GitConfigState {
  repoUrl: string;
  tokenMasked: string;
  branch: string;
  isEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

interface WorkspaceConfigState {
  id: string | null;
  configToken: string;
  configTokenMasked: string;
  configTokenLabel: string;
  hasToken: boolean;
}

interface UserCodeEntry {
  id: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  codeMasked: string;
  hasCode: boolean;
  updatedAt: string | null;
}

interface MyUserCode {
  hasCode: boolean;
  code: string;
  codeMasked: string;
  updatedAt: string | null;
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
  const urlTab = searchParams.get("tab") || "credentials";
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

  // ── Git config state ──
  const [gitConfig, setGitConfig] = useState<GitConfigState | null>(null);
  const [gitForm, setGitForm] = useState({ repoUrl: "", token: "" });
  const [gitSaving, setGitSaving] = useState(false);
  const [gitSyncing, setGitSyncing] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // ── Encryption key state ──
  const [encKeyForm, setEncKeyForm] = useState("");
  const [showEncKey, setShowEncKey] = useState(false);
  const [encKeySaving, setEncKeySaving] = useState(false);
  const [hasEncryptionKey, setHasEncryptionKey] = useState(false);

  // ── Credential encryption key state ──
  const [credEncKeyForm, setCredEncKeyForm] = useState("");
  const [showCredEncKey, setShowCredEncKey] = useState(false);
  const [credEncKeySaving, setCredEncKeySaving] = useState(false);
  const [hasCredEncKey, setHasCredEncKey] = useState(false);
  const [credEncKeyMasked, setCredEncKeyMasked] = useState("");

  // ── Lark Integration state ──
  const [larkConfig, setLarkConfig] = useState<{
    configured: boolean; enabled: boolean; connected: boolean; error?: string;
    appId: string; encryptKey: string; taskLists: Array<{ id: string; name: string }>;
  } | null>(null);
  const [larkForm, setLarkForm] = useState({ appId: "", appSecret: "", encryptKey: "" });
  const [larkSaving, setLarkSaving] = useState(false);
  const [larkToggling, setLarkToggling] = useState(false);
  const [showLarkSecret, setShowLarkSecret] = useState(false);
  const [showLarkEncrypt, setShowLarkEncrypt] = useState(false);
  const [larkSetupExpanded, setLarkSetupExpanded] = useState(true);

  // ── Workspace Config Token state ──
  const [wsConfig, setWsConfig] = useState<WorkspaceConfigState | null>(null);
  const [wsTokenForm, setWsTokenForm] = useState("");
  const [wsLabelForm, setWsLabelForm] = useState("");
  const [wsSaving, setWsSaving] = useState(false);
  const [showWsToken, setShowWsToken] = useState(false);

  // ── User Code state (admin) ──
  const [allUserCodes, setAllUserCodes] = useState<UserCodeEntry[]>([]);
  const [userCodesLoading, setUserCodesLoading] = useState(false);
  const [setCodeDialogOpen, setSetCodeDialogOpen] = useState(false);
  const [setCodeTarget, setSetCodeTarget] = useState<UserCodeEntry | null>(null);
  const [setCodeValue, setSetCodeValue] = useState("");
  const [setCodeSaving, setSetCodeSaving] = useState(false);

  // ── User Code state (self) ──
  const [myUserCode, setMyUserCode] = useState<MyUserCode | null>(null);
  const [showMyCode, setShowMyCode] = useState(false);

  // ── Copied states ──
  const [copiedWsToken, setCopiedWsToken] = useState(false);
  const [copiedMyCode, setCopiedMyCode] = useState(false);

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

  // ── Lark User Mapping state ──
  const [larkUsers, setLarkUsers] = useState<Array<{ open_id: string; name: string; email?: string }>>([]);
  const [larkUsersLoading, setLarkUsersLoading] = useState(false);
  const [larkUsersError, setLarkUsersError] = useState("");
  const [larkMappings, setLarkMappings] = useState<Record<string, string>>({});
  const [larkMappingsLoading, setLarkMappingsLoading] = useState(false);
  const [larkMappingsSaving, setLarkMappingsSaving] = useState(false);

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
        if (data.myUserCode) setMyUserCode(data.myUserCode);
        if (data.gitConfig) {
          setGitConfig(data.gitConfig);
          setHasEncryptionKey(!!data.gitConfig.hasEncryptionKey);
          setGitForm({ repoUrl: data.gitConfig.repoUrl || "", token: "" });
        }
        if (data.allUserCodes) setAllUserCodes(data.allUserCodes);
        fetchCredEncKeyStatus();
        fetchLarkConfig();
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
     GIT CONFIG HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleSaveGitConfig = async () => {
    if (!gitForm.repoUrl.trim()) { toast.error("Repository URL is required"); return; }
    if (!gitForm.token.trim()) { toast.error("Access token is required"); return; }
    setGitSaving(true);
    try {
      const res = await authFetch("/api/task-git-config", {
        method: gitConfig ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: gitForm.repoUrl.trim(), token: gitForm.token, isEnabled: gitConfig?.isEnabled ?? false }),
      });
      if (res.ok) {
        toast.success("Git configuration saved");
        await refetchGitConfig();
        setGitForm((prev) => ({ ...prev, token: "" }));
      } else { const data = await res.json(); toast.error(safeText(data.error, "Failed to save configuration")); }
    } catch { toast.error("Failed to save configuration"); }
    setGitSaving(false);
  };

  const handleToggleGitSync = async () => {
    if (!gitConfig) return;
    const newValue = !gitConfig.isEnabled;
    try {
      const res = await authFetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: newValue }),
      });
      if (res.ok) {
        setGitConfig({ ...gitConfig, isEnabled: newValue });
        toast.success(newValue ? "Auto-sync enabled — syncing now..." : "Auto-sync disabled");
        if (newValue) {
          setGitSyncing(true);
          authFetch("/api/task-git-sync", { method: "POST", headers: { "Content-Type": "application/json" } })
            .then(async (syncRes) => {
              setGitSyncing(false);
              if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.success) toast.success(`Sync completed — ${syncData.filesUpdated} file(s) updated`);
                else toast.error("Sync failed: " + (syncData.error || "Unknown error"));
              } else { toast.error("Sync request failed"); }
              await refetchGitConfig();
            })
            .catch(() => { setGitSyncing(false); toast.error("Sync request failed"); });
        }
      } else { toast.error("Failed to toggle git sync"); }
    } catch { toast.error("Failed to toggle git sync"); }
  };

  const handleManualSync = async () => {
    setGitSyncing(true);
    try {
      const res = await authFetch("/api/task-git-sync", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        setGitSyncing(false);
        if (data.success) toast.success(`Sync completed — ${data.filesUpdated} file(s) updated`);
        else toast.error("Sync failed: " + (data.error || "Unknown error"));
        await refetchGitConfig();
      } else {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(errData.error || "Failed to trigger sync");
        setGitSyncing(false);
      }
    } catch { toast.error("Failed to trigger sync"); setGitSyncing(false); }
  };

  /* ═══════════════════════════════════════════════════════════════
     ENCRYPTION KEY HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleSaveEncKey = async () => {
    const key = encKeyForm.trim();
    if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
      toast.error("Encryption key must be a 64-character hex string");
      return;
    }
    setEncKeySaving(true);
    try {
      const res = await authFetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptionKey: key }),
      });
      if (res.ok) {
        toast.success("Encryption key updated. Make sure to set the same key in Vercel environment variables.");
        setEncKeyForm("");
        setHasEncryptionKey(true);
      } else { const data = await res.json(); toast.error(safeText(data.error, "Failed to update encryption key")); }
    } catch { toast.error("Failed to update encryption key"); }
    setEncKeySaving(false);
  };

  const handleGenerateKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    setEncKeyForm(hex);
    toast.success("New key generated. Click 'Save Key' to apply.");
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

  // ── Lark Integration handlers ──
  const fetchLarkConfig = async () => {
    try {
      const res = await fetch("/api/lark/settings", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLarkConfig(data);
      }
    } catch { /* silent */ }
  };

  const handleSaveLarkConfig = async () => {
    setLarkSaving(true);
    try {
      const res = await fetch("/api/lark/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...larkForm, testConnection: true }),
      });
      if (res.ok) {
        toast.success("Lark connected successfully");
        await fetchLarkConfig();
        setLarkForm(f => ({ ...f, appSecret: "" }));
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to connect");
      }
    } catch {
      toast.error("Connection failed");
    } finally {
      setLarkSaving(false);
    }
  };

  const handleLarkToggle = async (enabled: boolean) => {
    setLarkToggling(true);
    try {
      const res = await fetch("/api/lark/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? "Lark sync enabled" : "Lark sync disabled");
        await fetchLarkConfig();
      } else {
        toast.error("Failed to toggle");
      }
    } catch {
      toast.error("Failed to toggle");
    } finally {
      setLarkToggling(false);
    }
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
     USER CODE HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  const handleOpenSetCodeDialog = (user: UserCodeEntry) => {
    setSetCodeTarget(user);
    setSetCodeValue("");
    setSetCodeDialogOpen(true);
  };

  const handleSaveUserCode = async () => {
    if (!setCodeTarget || !setCodeValue.trim()) { toast.error("Code is required"); return; }
    setSetCodeSaving(true);
    try {
      const res = await authFetch("/api/user-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: setCodeTarget.userId, code: setCodeValue.trim() }),
      });
      if (res.ok) {
        toast.success(`Code set for ${setCodeTarget.userName}`);
        setSetCodeDialogOpen(false);
        await refetchAllUserCodes();
        await refetchMyUserCode();
      } else { const data = await res.json(); toast.error(safeText(data.error, "Failed to set code")); }
    } catch { toast.error("Failed to set code"); }
    setSetCodeSaving(false);
  };

  const handleCopyMyCode = async () => {
    if (!myUserCode?.code) { toast.error("No code available"); return; }
    try {
      await navigator.clipboard.writeText(myUserCode.code);
      setCopiedMyCode(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopiedMyCode(false), 2000);
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

  const refetchGitConfig = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await authFetch("/api/task-git-config");
      if (res.ok) {
        const data = await res.json();
        setGitConfig(data);
        setHasEncryptionKey(!!data.hasEncryptionKey);
        setGitForm({ repoUrl: data.repoUrl || "", token: "" });
      }
    } catch { /* silent */ }
    fetchCredEncKeyStatus();
  }, [isSuperAdmin]);

  const refetchWsConfig = useCallback(async () => {
    try {
      const res = await authFetch("/api/workspace-config");
      if (res.ok) { const data = await res.json(); setWsConfig(data); if (data.configTokenLabel) setWsLabelForm(data.configTokenLabel); }
    } catch { /* silent */ }
  }, []);

  const refetchAllUserCodes = useCallback(async () => {
    if (!isSuperAdmin) return;
    setUserCodesLoading(true);
    try {
      const res = await authFetch("/api/user-code/all");
      if (res.ok) { const data = await res.json(); setAllUserCodes(data.userCodes || []); }
    } catch { /* silent */ }
    setUserCodesLoading(false);
  }, [isSuperAdmin]);

  const refetchMyUserCode = useCallback(async () => {
    try {
      const res = await authFetch("/api/user-code");
      if (res.ok) setMyUserCode(await res.json());
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

  // My Code card (read-only)
  const MyCodeCard = () => (
    <Card className="overflow-hidden border-border/60">
      <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500" />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Fingerprint className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm">Your Code</CardTitle>
            <CardDescription className="text-xs">Your personal access code assigned by admin</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {myUserCode?.hasCode ? (
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showMyCode ? "text" : "password"}
                value={showMyCode ? (myUserCode.code || "") : (myUserCode.codeMasked || "••••••••")}
                readOnly
                className="pr-20 font-mono text-xs bg-muted/50"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <button type="button" onClick={() => setShowMyCode(!showMyCode)} aria-label={showMyCode ? "Hide your code" : "Show your code"} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  {showMyCode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={handleCopyMyCode} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                      {copiedMyCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy code</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {myUserCode.updatedAt && (
              <p className="text-xs text-muted-foreground">Last updated: {safeDate(myUserCode.updatedAt)}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No code assigned yet. Your admin will assign one.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  /* ═══════════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-1 sm:px-0">
      <PageHeader
        title="Access Hub"
        description="Credentials, protocol documents, workspace tokens, and system configuration."
      />

      {isAdmin ? (
        <Tabs value={urlTab} className="space-y-6">
          <TabsList className="bg-muted/50 w-full sm:w-auto">
            <TabsTrigger value="credentials" className="gap-1.5" onClick={() => router.replace("/dashboard/access-hub?tab=credentials")}>
              <KeyRound className="h-3.5 w-3.5" />
              Credentials
            </TabsTrigger>
            <TabsTrigger value="protocol" className="gap-1.5" onClick={() => router.replace("/dashboard/access-hub?tab=protocol")}>
              <FileText className="h-3.5 w-3.5" />
              Protocol &amp; Resources
            </TabsTrigger>
            <TabsTrigger value="lark-users" className="gap-1.5" onClick={() => router.replace("/dashboard/access-hub?tab=lark-users")}>
              <Bird className="h-3.5 w-3.5" />
              User Mapping
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-1.5" onClick={() => router.replace("/dashboard/access-hub?tab=system")}>
              <Settings className="h-3.5 w-3.5" />
              System Config
            </TabsTrigger>
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

            {/* Add button */}
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={openAddCredDialog}>
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
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        <CardDescription className="text-xs">
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
            {/* Protocol PDF Card */}
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

            {/* User Codes Management (admin) */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <UserCog className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm">User Codes</CardTitle>
                    <CardDescription className="text-xs">Assign unique access codes to each team member</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {allUserCodes.filter((u) => u.hasCode).length}/{allUserCodes.length} assigned
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {userCodesLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : allUserCodes.length > 0 ? (
                  <ScrollArea className="max-h-72">
                    <div className="space-y-1.5">
                      {allUserCodes.map((user) => (
                        <div key={user.userId} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {user.userName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{safeText(user.userName)}</p>
                            <p className="text-xs text-muted-foreground truncate">{safeText(user.userEmail)}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {user.hasCode ? (
                              <Badge variant="secondary" className="text-xs bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Set
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Not set</Badge>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleOpenSetCodeDialog(user)} className="h-7 px-2 text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <Settings className="h-3 w-3 mr-1" />
                              {user.hasCode ? "Edit" : "Set"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">No users found.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 3: USER MAPPING (Lark) ═══════════ */}
          <TabsContent value="lark-users" className="space-y-5 mt-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bird className="h-4 w-4" /> Lark User Mapping
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Match TrishulHub users with their Lark accounts for task sync
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        setLarkUsersLoading(true);
                        setLarkUsersError("");
                        try {
                          // Fetch raw Lark users
                          const larkRes = await fetch("/api/lark/users?allLarkUsers=true", { credentials: "include" });
                          const larkData = await larkRes.json();
                          if (larkData.allLarkUsers) setLarkUsers(larkData.allLarkUsers);
                          if (larkData.larkError) setLarkUsersError(larkData.larkError);
                          if (larkData.larkWarning) setLarkUsersError(larkData.larkWarning);

                          // Fetch existing mappings (TrishulHub users with their lark mapping info)
                          const mapRes = await fetch("/api/lark/users", { credentials: "include" });
                          const mapData = await mapRes.json();
                          if (mapData.users) {
                            const mappings: Record<string, string> = {};
                            for (const u of mapData.users) {
                              if (u.larkOpenId && u.larkMapped) {
                                mappings[u.larkOpenId] = u.id;
                              }
                            }
                            setLarkMappings(mappings);
                          }
                        } catch { setLarkUsersError("Failed to fetch Lark users"); }
                        finally { setLarkUsersLoading(false); }
                      }}
                      disabled={larkUsersLoading}
                      className="h-8 text-xs"
                    >
                      {larkUsersLoading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
                      Refresh Lark Users
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        setLarkMappingsSaving(true);
                        try {
                          const entries = Object.entries(larkMappings).filter(([_, val]) => val && val !== "__none__");
                          let success = 0;
                          for (const [larkOpenId, userId] of entries) {
                            const larkUser = larkUsers.find(u => u.open_id === larkOpenId);
                            const res = await fetch("/api/lark/users", {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                userId,
                                larkOpenId,
                                larkName: larkUser?.name || "",
                                larkEmail: larkUser?.email || "",
                                matchedBy: "manual",
                              }),
                            });
                            const data = await res.json();
                            if (data.success) success++;
                          }
                          toast.success(`${success} mapping${success !== 1 ? 's' : ''} saved successfully`);
                        } catch { toast.error("Failed to save mappings"); }
                        finally { setLarkMappingsSaving(false); }
                      }}
                      disabled={larkMappingsSaving}
                      className="h-8 text-xs"
                    >
                      {larkMappingsSaving ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
                      Save Mappings
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {larkUsersError && (
                  <div className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800/30">
                    <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">{larkUsersError}</p>
                  </div>
                )}
                {larkUsers.length === 0 && !larkUsersLoading && !larkUsersError && (
                  <div className="text-center py-8">
                    <Bird className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No Lark users loaded yet.</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Click "Refresh Lark Users" to fetch from Lark API.</p>
                  </div>
                )}
                {larkUsers.length > 0 && allUsers.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                      Lark Users ({larkUsers.length}) — map each to a TrishulHub user
                    </p>
                    <div className="grid gap-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                      {larkUsers.map((lu) => (
                        <div key={lu.open_id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{lu.name?.[0] || "?"}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{lu.name}</p>
                            {lu.email && <p className="text-[11px] text-muted-foreground truncate">{lu.email}</p>}
                          </div>
                          <Select
                            value={larkMappings[lu.open_id] || ""}
                            onValueChange={(val) => setLarkMappings(m => ({ ...m, [lu.open_id]: val }))}
                          >
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                              <SelectValue placeholder="Not mapped" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Not mapped</SelectItem>
                              {allUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {larkUsersLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Fetching Lark users...</span>
                  </div>
                )}
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
                {/* Save Task System - Git Config */}
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <div className="h-1 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                        <GitBranch className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-sm">Save Task System</CardTitle>
                        <CardDescription className="text-xs">Bind a Git repository for automatic task sync</CardDescription>
                      </div>
                      {gitConfig?.isEnabled && (
                        <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400 flex-shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Syncing
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="git-repo-url" className="text-xs">Repository URL</Label>
                      <Input id="git-repo-url" type="url" placeholder="https://github.com/owner/repo" value={gitForm.repoUrl} onChange={(e) => setGitForm((prev) => ({ ...prev, repoUrl: e.target.value }))} className="text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="git-token" className="text-xs">Access Token</Label>
                      <div className="relative">
                        <Input id="git-token" type={showToken ? "text" : "password"} placeholder={gitConfig?.tokenMasked || "ghp_xxxxxxxxxxxx"} value={gitForm.token} onChange={(e) => setGitForm((prev) => ({ ...prev, token: e.target.value }))} className="pr-10 font-mono text-xs" />
                        <button type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? "Hide access token" : "Show access token"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      {gitConfig?.tokenMasked && !gitForm.token && (
                        <p className="text-xs text-muted-foreground">Leave blank to keep the existing token</p>
                      )}
                    </div>
                    <Button onClick={handleSaveGitConfig} disabled={gitSaving || !gitForm.repoUrl.trim() || (!gitForm.token && !gitConfig?.tokenMasked)} className="w-full" size="sm">
                      {gitSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      Save Configuration
                    </Button>
                    {gitConfig?.repoUrl && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />
                        <span>Branch: <span className="font-medium text-foreground">{gitConfig.branch || "main"}</span> (auto-detected)</span>
                      </div>
                    )}
                    {gitConfig && (
                      <div className="pt-3 border-t border-border/50 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Switch checked={gitConfig.isEnabled} onCheckedChange={handleToggleGitSync} disabled={!gitConfig.repoUrl} />
                            <span className="text-sm font-medium">Auto-sync</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={handleManualSync} disabled={gitSyncing || !gitConfig.repoUrl} className="shrink-0">
                            {gitSyncing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                            Sync Now
                          </Button>
                        </div>
                        {gitConfig.lastSyncStatus && (
                          <div className="flex items-center gap-2">
                            {gitConfig.lastSyncStatus === "SUCCESS" || gitConfig.lastSyncStatus === "NO_CHANGES" ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                  {gitConfig.lastSyncStatus === "SUCCESS" ? "Last sync successful" : "No changes since last sync"}
                                </span>
                              </>
                            ) : gitConfig.lastSyncStatus === "ERROR" || gitConfig.lastSyncStatus === "FAILED" || gitConfig.lastSyncStatus === "PARTIAL" ? (
                              <>
                                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                                <span className="text-xs text-red-600 dark:text-red-400">
                                  Last sync {gitConfig.lastSyncStatus.toLowerCase()}{gitConfig.lastSyncError ? `: ${gitConfig.lastSyncError}` : ""}
                                </span>
                              </>
                            ) : gitConfig.lastSyncStatus === "PENDING" ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                                <span className="text-xs text-amber-600 dark:text-amber-400">Sync in progress...</span>
                              </>
                            ) : null}
                          </div>
                        )}
                        {gitConfig.lastSyncAt && (
                          <p className="text-xs text-muted-foreground">
                            Last synced: {formatRelativeTime(gitConfig.lastSyncAt)}
                            {gitConfig.lastSyncAt && (<> ({safeDate(gitConfig.lastSyncAt)})</>)}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Encryption Key Management */}
                <Card className="overflow-hidden border-border/60 shadow-sm">
                  <div className="h-1 bg-gradient-to-r from-slate-500 via-gray-500 to-zinc-500" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <FileLock2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-sm">Encryption Key</CardTitle>
                        <CardDescription className="text-xs">AES-256-GCM key for encrypting sensitive data (git tokens)</CardDescription>
                      </div>
                      <Badge variant={hasEncryptionKey ? "outline" : "secondary"} className={`text-xs flex-shrink-0 ${hasEncryptionKey ? "text-emerald-600 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400" : "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400"}`}>
                        {hasEncryptionKey ? "Configured" : "Not set"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      {hasEncryptionKey ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Encryption key is configured</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs text-amber-600 dark:text-amber-400">No encryption key set — using environment variable</span>
                        </>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="enc-key" className="text-xs">New Encryption Key (64-char hex)</Label>
                      <div className="relative">
                        <Input id="enc-key" type={showEncKey ? "text" : "password"} placeholder="64-character hex string" value={encKeyForm} onChange={(e) => setEncKeyForm(e.target.value)} className="pr-20 font-mono text-xs" />
                        <button type="button" onClick={() => setShowEncKey(!showEncKey)} aria-label={showEncKey ? "Hide encryption key" : "Show encryption key"} className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showEncKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={handleGenerateKey} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors">
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Generate random key</TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground">Click the refresh icon to generate a new key.</p>
                    </div>
                    <Button onClick={handleSaveEncKey} disabled={encKeySaving || !encKeyForm.trim()} variant="outline" className="w-full" size="sm">
                      {encKeySaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      Save Key
                    </Button>
                  </CardContent>
                </Card>

                {/* Credential Encryption Key — for project credentials (separate from SMTP/Git) */}
                <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
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
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showCredEncKey ? "text" : "password"}
                          placeholder="Paste 64-char hex key or generate below"
                          value={credEncKeyForm}
                          onChange={(e) => setCredEncKeyForm(e.target.value)}
                          className="h-8 text-xs font-mono pr-16"
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
                      <Button size="sm" onClick={handleSaveCredEncKey} disabled={credEncKeySaving || !credEncKeyForm.trim()} className="h-8">
                        {credEncKeySaving ? "Saving..." : "Save Key"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* ━━ Lark Integration ━━ */}
                <Card className="bg-white/60 dark:bg-white/[0.04] backdrop-blur-xl border border-white/20 dark:border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                          <Bird className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <CardTitle className="text-sm">Lark (Feishu) Integration</CardTitle>
                          <CardDescription className="text-[11px]">2-way task sync with Lark</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {larkConfig?.connected && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"><CircleDot className="h-2.5 w-2.5 mr-1" />Connected</Badge>}
                        <Switch
                          checked={larkConfig?.enabled ?? false}
                          onCheckedChange={handleLarkToggle}
                          disabled={larkToggling || !larkConfig?.configured}
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {larkConfig?.connected ? null : larkConfig?.configured ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Connection failed — check App ID and Secret</span>
                      </div>
                    ) : null}

                    {/* ── Setup Guide (collapsible) ── */}
                    <div className="rounded-lg border border-blue-200/60 dark:border-blue-500/20 bg-blue-50/50 dark:bg-blue-500/5 overflow-hidden">
                      <button
                        onClick={() => setLarkSetupExpanded(!larkSetupExpanded)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-blue-100/50 dark:hover:bg-blue-500/10 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Setup Guide — 4 Steps to Connect</span>
                        </div>
                        {larkSetupExpanded ? <ChevronDown className="h-3.5 w-3.5 text-blue-500" /> : <ChevronRight className="h-3.5 w-3.5 text-blue-500" />}
                      </button>

                      {larkSetupExpanded && (
                        <div className="px-3 pb-3 space-y-2.5">
                          {/* Step 1 */}
                          <div className="flex gap-2.5">
                            <div className={cn(
                              "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              larkConfig?.connected ? "bg-emerald-500 text-white" : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                            )}>
                              {larkConfig?.connected ? <Check className="h-3 w-3" /> : "1"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium">Save App ID & Secret</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Paste your Lark App ID and App Secret below, then click <b>Save & Test</b>. This verifies the connection to Lark.
                              </p>
                              {!larkConfig?.connected && (
                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                  Find these in: Lark Developer Console → your app → Credentials
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="flex gap-2.5">
                            <div className={cn(
                              "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              larkConfig?.connected ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                            )}>
                              2
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium">Configure Webhook in Lark</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                In Lark Developer Console → <b>Events & Callbacks</b>, select <b>"Send notifications to developer's server"</b> (second option).
                              </p>
                              <div className="mt-1.5 px-2 py-1.5 rounded bg-background/80 border border-border/50 text-[11px] font-mono break-all">
                                Request URL: <span className="text-blue-600 dark:text-blue-400 font-semibold">https://trishulhub.com/api/lark/webhook</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                Leave <b>Encryption Strategy</b> as "No encryption" (default). Do NOT enable encrypt key unless needed.
                              </p>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="flex gap-2.5">
                            <div className={cn(
                              "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              larkConfig?.connected ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                            )}>
                              3
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium">Add the Event Subscription</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                After the URL is verified, add this event under "Event Subscription":
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Badge variant="secondary" className="text-[10px] font-mono">task.task.updated_v1</Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground/70 mt-1">
                                Path: Event Subscription → Add Event → search "task.task.updated" → select the V1 version
                              </p>
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="flex gap-2.5">
                            <div className={cn(
                              "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                              larkConfig?.connected ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                            )}>
                              4
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium">Map Users & Enable Sync</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Go to <button onClick={() => router.replace("/dashboard/access-hub?tab=lark-users")} className="text-primary hover:underline font-medium">User Mapping</button> tab to match TrishulHub users with their Lark accounts.
                                Then toggle the switch above to <b>Enable</b> 2-way sync.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── Credentials Form ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">App ID</Label>
                        <Input
                          placeholder="cli_xxxxxxxxxxxxx"
                          value={larkForm.appId}
                          onChange={(e) => setLarkForm(f => ({ ...f, appId: e.target.value }))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">App Secret</Label>
                        <Input
                          type={showLarkSecret ? "text" : "password"}
                          placeholder="••••••••••••••••"
                          value={larkForm.appSecret}
                          onChange={(e) => setLarkForm(f => ({ ...f, appSecret: e.target.value }))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Webhook Encrypt Key
                        <span className="ml-1 text-[10px] text-muted-foreground/60">(leave empty unless using encryption in Lark)</span>
                      </Label>
                      <Input
                        type={showLarkEncrypt ? "text" : "password"}
                        placeholder="Leave empty — use 'No encryption' in Lark"
                        value={larkForm.encryptKey}
                        onChange={(e) => setLarkForm(f => ({ ...f, encryptKey: e.target.value }))}
                        className="h-8 text-xs font-mono"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleSaveLarkConfig}
                        disabled={larkSaving || !larkForm.appId.trim() || !larkForm.appSecret.trim()}
                        className="h-8 text-xs"
                      >
                        {larkSaving ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Save className="h-3 w-3 mr-1.5" />}
                        Save & Test
                      </Button>
                      {larkConfig?.configured && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowLarkSecret(!showLarkSecret)}
                          className="h-8 text-xs"
                        >
                          {showLarkSecret ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                          Secret
                        </Button>
                      )}
                    </div>

                    {larkConfig?.taskLists && larkConfig.taskLists.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-[11px] text-muted-foreground font-medium">Lark Task Lists ({larkConfig.taskLists.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {larkConfig.taskLists.map((tl: { id: string; name: string }) => (
                            <Badge key={tl.id} variant="secondary" className="text-[10px] font-normal">
                              {tl.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick links */}
                    <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                      <a href="https://open.larksuite.com/app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                        <Globe className="h-3 w-3" /> Lark Developer Console
                      </a>
                      <span className="text-border">|</span>
                      <button
                        onClick={() => router.replace("/dashboard/access-hub?tab=lark-users")}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                      >
                        <UserCheck className="h-3 w-3" /> User Mapping
                      </button>
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

          {/* Your Code */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Access Code</h2>
            <MyCodeCard />
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

      {/* Set User Code Dialog */}
      <Dialog open={setCodeDialogOpen} onOpenChange={setSetCodeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {setCodeTarget?.hasCode ? "Edit Code" : "Set Code"} for {safeText(setCodeTarget?.userName)}
            </DialogTitle>
            <DialogDescription>
              Assign a unique access code for {safeText(setCodeTarget?.userEmail)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-code-input">Access Code</Label>
              <Input
                id="user-code-input"
                placeholder="Enter access code..."
                value={setCodeValue}
                onChange={(e) => setSetCodeValue(e.target.value)}
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !setCodeSaving && setCodeValue.trim()) handleSaveUserCode();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetCodeDialogOpen(false)} disabled={setCodeSaving}>Cancel</Button>
            <Button onClick={handleSaveUserCode} disabled={setCodeSaving || !setCodeValue.trim()}>
              {setCodeSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {setCodeTarget?.hasCode ? "Update Code" : "Set Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Credential Dialog */}
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
