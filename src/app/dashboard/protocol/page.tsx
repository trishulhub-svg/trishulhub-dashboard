"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText, Upload, Download, Trash2, Loader2,
  FileUp, CheckCircle2, AlertCircle, Clock,
  Shield, Ban, Save, Eye, EyeOff,
  Copy, Check, KeyRound, UserCog, Info,
  Users, Fingerprint, RefreshCw, Settings, GitBranch, FileLock2,
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
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { safeText, safeDate } from "@/lib/utils";

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

export default function ProtocolPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "SUPER_ADMIN";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Protocol state ──
  const [protocol, setProtocol] = useState<ProtocolFile | null>(null);
  const [loading, setLoading] = useState(true);
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

  // ── Fetch all data in ONE combined request ──
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/protocol/init")
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
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  // ── Upload PDF ──
  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      const res = await fetch("/api/protocol", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/pdf",
          data: base64,
        }),
      });
      if (res.ok) {
        toast.success("Protocol PDF uploaded successfully");
        await refetchProtocol();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Upload failed"));
      }
    } catch {
      toast.error("Failed to upload file");
    }
    setUploading(false);
  };

  // ── Download PDF ──
  const handleDownload = useCallback(async () => {
    if (!protocol) return;
    try {
      const res = await fetch("/api/protocol?download=true");
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
      } else {
        toast.error("Failed to download protocol");
      }
    } catch {
      toast.error("Download failed");
    }
  }, [protocol]);

  // ── Delete PDF ──
  const handleDelete = async () => {
    if (!protocol) return;
    if (!confirm("Are you sure you want to delete this protocol PDF?")) return;
    try {
      const res = await fetch("/api/protocol", { method: "DELETE" });
      if (res.ok) {
        toast.success("Protocol PDF deleted");
        setProtocol(null);
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── Toggle download enabled ──
  const handleToggleDownload = async () => {
    try {
      const res = await fetch("/api/protocol", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadEnabled: !downloadEnabled }),
      });
      if (res.ok) {
        setDownloadEnabled(!downloadEnabled);
        toast.success(!downloadEnabled ? "Downloads enabled" : "Downloads disabled");
      } else {
        toast.error("Failed to toggle download");
      }
    } catch {
      toast.error("Failed to toggle download");
    }
  };

  // ── Save git config ──
  const handleSaveGitConfig = async () => {
    if (!gitForm.repoUrl.trim()) { toast.error("Repository URL is required"); return; }
    if (!gitForm.token.trim()) { toast.error("Access token is required"); return; }
    setGitSaving(true);
    try {
      const res = await fetch("/api/task-git-config", {
        method: gitConfig ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: gitForm.repoUrl.trim(),
          token: gitForm.token,
          isEnabled: gitConfig?.isEnabled ?? false,
        }),
      });
      if (res.ok) {
        toast.success("Git configuration saved");
        await refetchGitConfig();
        setGitForm((prev) => ({ ...prev, token: "" }));
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to save configuration"));
      }
    } catch { toast.error("Failed to save configuration"); }
    setGitSaving(false);
  };

  // ── Toggle git sync ──
  const handleToggleGitSync = async () => {
    if (!gitConfig) return;
    const newValue = !gitConfig.isEnabled;
    try {
      const res = await fetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: newValue }),
      });
      if (res.ok) {
        setGitConfig({ ...gitConfig, isEnabled: newValue });
        toast.success(newValue ? "Auto-sync enabled — syncing now..." : "Auto-sync disabled");
        if (newValue) {
          setGitSyncing(true);
          fetch("/api/task-git-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          })
            .then(async (syncRes) => {
              setGitSyncing(false);
              if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.success) {
                  toast.success(`Sync completed — ${syncData.filesUpdated} file(s) updated`);
                } else {
                  toast.error("Sync failed: " + (syncData.error || "Unknown error"));
                }
              } else { toast.error("Sync request failed"); }
              await refetchGitConfig();
            })
            .catch(() => { setGitSyncing(false); toast.error("Sync request failed"); });
        }
      } else { toast.error("Failed to toggle git sync"); }
    } catch { toast.error("Failed to toggle git sync"); }
  };

  // ── Manual sync ──
  const handleManualSync = async () => {
    setGitSyncing(true);
    try {
      const res = await fetch("/api/task-git-sync", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        setGitSyncing(false);
        if (data.success) {
          toast.success(`Sync completed — ${data.filesUpdated} file(s) updated`);
        } else {
          toast.error("Sync failed: " + (data.error || "Unknown error"));
        }
        await refetchGitConfig();
      } else {
        const errData = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(errData.error || "Failed to trigger sync");
        setGitSyncing(false);
      }
    } catch { toast.error("Failed to trigger sync"); setGitSyncing(false); }
  };
  const handleSaveEncKey = async () => {
    const key = encKeyForm.trim();
    if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
      toast.error("Encryption key must be a 64-character hex string");
      return;
    }
    setEncKeySaving(true);
    try {
      const res = await fetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptionKey: key }),
      });
      if (res.ok) {
        toast.success("Encryption key updated. Make sure to set the same key in Vercel environment variables.");
        setEncKeyForm("");
        setHasEncryptionKey(true);
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to update encryption key"));
      }
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

  // ── Workspace Config Token handlers ──
  const handleSaveWsConfig = async () => {
    if (!wsTokenForm.trim() && !wsLabelForm.trim()) {
      toast.error("Enter a token or label to save");
      return;
    }
    setWsSaving(true);
    try {
      const body: Record<string, string> = {};
      if (wsTokenForm.trim()) body.configToken = wsTokenForm.trim();
      if (wsLabelForm.trim()) body.configTokenLabel = wsLabelForm.trim();
      const res = await fetch("/api/workspace-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Workspace config updated");
        setWsTokenForm("");
        await refetchWsConfig();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to update"));
      }
    } catch { toast.error("Failed to update"); }
    setWsSaving(false);
  };

  const handleCopyWsToken = async () => {
    const tokenToCopy = wsConfig?.configToken || null;
    if (!tokenToCopy) {
      toast.error("Token not available to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(tokenToCopy);
      setCopiedWsToken(true);
      toast.success("Token copied to clipboard");
      setTimeout(() => setCopiedWsToken(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  // ── User Code handlers ──
  const handleOpenSetCodeDialog = (user: UserCodeEntry) => {
    setSetCodeTarget(user);
    setSetCodeValue("");
    setSetCodeDialogOpen(true);
  };

  const handleSaveUserCode = async () => {
    if (!setCodeTarget || !setCodeValue.trim()) {
      toast.error("Code is required");
      return;
    }
    setSetCodeSaving(true);
    try {
      const res = await fetch("/api/user-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: setCodeTarget.userId, code: setCodeValue.trim() }),
      });
      if (res.ok) {
        toast.success(`Code set for ${setCodeTarget.userName}`);
        setSetCodeDialogOpen(false);
        await refetchAllUserCodes();
        await refetchMyUserCode();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to set code"));
      }
    } catch { toast.error("Failed to set code"); }
    setSetCodeSaving(false);
  };

  const handleCopyMyCode = async () => {
    if (!myUserCode?.code) {
      toast.error("No code available");
      return;
    }
    try {
      await navigator.clipboard.writeText(myUserCode.code);
      setCopiedMyCode(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopiedMyCode(false), 2000);
    } catch { toast.error("Failed to copy"); }
  };

  // ── Drag & Drop handlers ──
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Refetch helpers (for individual actions) ──
  const refetchProtocol = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol");
      if (res.ok) {
        const data = await res.json();
        if (data?.id) { setProtocol(data); setDownloadEnabled(data.downloadEnabled !== false); }
        else { setProtocol(null); setDownloadEnabled(true); }
      }
    } catch { /* silent */ }
  }, []);

  const refetchGitConfig = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/task-git-config");
      if (res.ok) {
        const data = await res.json();
        setGitConfig(data);
        setHasEncryptionKey(!!data.hasEncryptionKey);
        setGitForm({ repoUrl: data.repoUrl || "", token: "" });
      }
    } catch { /* silent */ }
  }, [isAdmin]);

  const refetchWsConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace-config");
      if (res.ok) {
        const data = await res.json();
        setWsConfig(data);
        if (data.configTokenLabel) setWsLabelForm(data.configTokenLabel);
      }
    } catch { /* silent */ }
  }, []);

  const refetchAllUserCodes = useCallback(async () => {
    if (!isAdmin) return;
    setUserCodesLoading(true);
    try {
      const res = await fetch("/api/user-code/all");
      if (res.ok) {
        const data = await res.json();
        setAllUserCodes(data.userCodes || []);
      }
    } catch { /* silent */ }
    setUserCodesLoading(false);
  }, [isAdmin]);

  const refetchMyUserCode = useCallback(async () => {
    try {
      const res = await fetch("/api/user-code");
      if (res.ok) setMyUserCode(await res.json());
    } catch { /* silent */ }
  }, []);

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

  // ── Loading — render immediately, don't block ──
  if (status === "loading") return null;
  if (!session) return null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto px-1 sm:px-0">
      {/* Header */}
      <PageHeader
        title="Protocol"
        description="Access protocol PDF, workspace tokens, and user codes."
      />

      {isAdmin ? (
        <Tabs defaultValue="user-view" className="space-y-6">
          <TabsList className="bg-muted/50 w-full sm:w-auto">
            <TabsTrigger value="user-view" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Your Access
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Admin Panel
            </TabsTrigger>
          </TabsList>

          {/* ── YOUR ACCESS TAB (visible to all) ── */}
          <TabsContent value="user-view" className="space-y-5 mt-2">
            {/* Protocol PDF Card */}
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
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Clock className="h-3 w-3" />
                      Uploaded: {safeDate(protocol.uploadedAt)}
                      {protocol.uploadedBy && (<> &middot; by {safeText(protocol.uploadedBy)}</>)}
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                      {isAdmin ? (
                        <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                      ) : !downloadEnabled ? (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg w-full">
                          <Ban className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-600 dark:text-red-400">Download disabled by administration</span>
                        </div>
                      ) : (
                        <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">No protocol uploaded</p>
                        <p className="text-xs text-muted-foreground">No protocol is available yet. Contact your admin.</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Workspace Config Token Card (all users can see) */}
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
                        type={showWsToken && isAdmin ? "text" : "password"}
                        value={showWsToken && isAdmin ? (wsConfig?.configToken || "") : (wsConfig?.configTokenMasked || "••••••••")}
                        readOnly
                        className="pr-20 font-mono text-xs bg-muted/50"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setShowWsToken(!showWsToken)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {showWsToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleCopyWsToken}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
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

            {/* My User Code Card (all users can see their own code) */}
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
                        <button
                          type="button"
                          onClick={() => setShowMyCode(!showMyCode)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          {showMyCode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleCopyMyCode}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
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
          </TabsContent>

          {/* ── ADMIN PANEL TAB (SUPER_ADMIN only) ── */}
          <TabsContent value="admin" className="space-y-5 mt-2">
            {/* Protocol Management */}
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
                      <Button onClick={handleDelete} variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
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

                {/* Download Control */}
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
                  <Input
                    id="ws-token-label"
                    placeholder="e.g. ZAI Workspace Token"
                    value={wsLabelForm}
                    onChange={(e) => setWsLabelForm(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-token-value" className="text-xs">Token Value</Label>
                  <div className="relative">
                    <Input
                      id="ws-token-value"
                      type={showWsToken ? "text" : "password"}
                      placeholder={wsConfig?.configTokenMasked || "Enter workspace token..."}
                      value={wsTokenForm}
                      onChange={(e) => setWsTokenForm(e.target.value)}
                      className="pr-20 font-mono text-xs"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setShowWsToken(!showWsToken)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {showWsToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      {isAdmin && wsConfig?.configToken && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleCopyWsToken}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
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
                <Button
                  onClick={handleSaveWsConfig}
                  disabled={wsSaving || (!wsTokenForm.trim() && !wsLabelForm.trim())}
                  className="w-full"
                  size="sm"
                >
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
                        <div
                          key={user.userId}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                        >
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenSetCodeDialog(user)}
                              className="h-7 px-2 text-xs sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
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
                  <Input
                    id="git-repo-url"
                    type="url"
                    placeholder="https://github.com/owner/repo"
                    value={gitForm.repoUrl}
                    onChange={(e) => setGitForm((prev) => ({ ...prev, repoUrl: e.target.value }))}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="git-token" className="text-xs">Access Token</Label>
                  <div className="relative">
                    <Input
                      id="git-token"
                      type={showToken ? "text" : "password"}
                      placeholder={gitConfig?.tokenMasked || "ghp_xxxxxxxxxxxx"}
                      value={gitForm.token}
                      onChange={(e) => setGitForm((prev) => ({ ...prev, token: e.target.value }))}
                      className="pr-10 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {gitConfig?.tokenMasked && !gitForm.token && (
                    <p className="text-xs text-muted-foreground">Leave blank to keep the existing token</p>
                  )}
                </div>
                <Button
                  onClick={handleSaveGitConfig}
                  disabled={gitSaving || !gitForm.repoUrl.trim() || (!gitForm.token && !gitConfig?.tokenMasked)}
                  className="w-full"
                  size="sm"
                >
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
                    <Input
                      id="enc-key"
                      type={showEncKey ? "text" : "password"}
                      placeholder="64-character hex string"
                      value={encKeyForm}
                      onChange={(e) => setEncKeyForm(e.target.value)}
                      className="pr-20 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEncKey(!showEncKey)}
                      className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showEncKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleGenerateKey}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Generate random key</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">Click the refresh icon to generate a new key.</p>
                </div>
                <Button
                  onClick={handleSaveEncKey}
                  disabled={encKeySaving || !encKeyForm.trim()}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {encKeySaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save Key
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        /* ── NON-ADMIN VIEW (single panel, no tabs) ── */
        <div className="space-y-5">
          {/* Protocol PDF Card */}
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
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Uploaded: {safeDate(protocol.uploadedAt)}
                    {protocol.uploadedBy && (<> &middot; by {safeText(protocol.uploadedBy)}</>)}
                  </div>
                  <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                    {!downloadEnabled ? (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg w-full">
                        <Ban className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-600 dark:text-red-400">Download disabled by administration</span>
                      </div>
                    ) : (
                      <Button onClick={handleDownload} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download PDF
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

          {/* Workspace Config Token Card */}
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
                <div className="relative">
                  <Input
                    type="password"
                    value={wsConfig?.configTokenMasked || "••••••••"}
                    readOnly
                    className="pr-10 font-mono text-xs bg-muted/50"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={handleCopyWsToken}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedWsToken ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy token</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">No workspace token configured yet.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* My User Code Card */}
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
                      type="password"
                      value={myUserCode.codeMasked || "••••••••"}
                      readOnly
                      className="pr-20 font-mono text-xs bg-muted/50"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleCopyMyCode}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
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
                  if (e.key === "Enter" && !setCodeSaving && setCodeValue.trim()) {
                    handleSaveUserCode();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetCodeDialogOpen(false)} disabled={setCodeSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveUserCode} disabled={setCodeSaving || !setCodeValue.trim()}>
              {setCodeSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {setCodeTarget?.hasCode ? "Update Code" : "Set Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
