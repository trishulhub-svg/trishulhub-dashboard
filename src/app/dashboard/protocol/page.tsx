"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText, Upload, Download, Trash2, Loader2,
  FileUp, CheckCircle2, AlertCircle, Clock,
  Shield, GitBranch, Ban, RefreshCw, Save, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function ProtocolPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "SUPER_ADMIN";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [protocol, setProtocol] = useState<ProtocolFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(true);

  // ── Git config state ──
  const [gitConfig, setGitConfig] = useState<{
    repoUrl: string;
    tokenMasked: string;
    branch: string;
    isEnabled: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  } | null>(null);
  const [gitForm, setGitForm] = useState({ repoUrl: "", token: "" });
  const [gitSaving, setGitSaving] = useState(false);
  const [gitSyncing, setGitSyncing] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // ── Encryption key state ──
  const [encKeyForm, setEncKeyForm] = useState("");
  const [showEncKey, setShowEncKey] = useState(false);
  const [encKeySaving, setEncKeySaving] = useState(false);
  const [hasEncryptionKey, setHasEncryptionKey] = useState(false);

  // ── Fetch current protocol PDF ──
  const fetchProtocol = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol");
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          setProtocol(data);
          setDownloadEnabled(data.downloadEnabled !== false);
        } else {
          setProtocol(null);
          setDownloadEnabled(true);
        }
      }
    } catch {
      console.error("Failed to fetch protocol");
    }
  }, []);

  // ── Fetch git config ──
  const fetchGitConfig = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/task-git-config");
      if (res.ok) {
        const data = await res.json();
        setGitConfig(data);
        setHasEncryptionKey(!!data.hasEncryptionKey);
        setGitForm({
          repoUrl: data.repoUrl || "",
          token: "",
        });
      }
    } catch {
      /* silent */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      Promise.all([fetchProtocol(), fetchGitConfig()]).finally(() => setLoading(false));
    }
  }, [status, fetchProtocol, fetchGitConfig]);

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
      // Convert to base64
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
        await fetchProtocol();
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
    if (!gitForm.repoUrl.trim()) {
      toast.error("Repository URL is required");
      return;
    }
    if (!gitForm.token.trim()) {
      toast.error("Access token is required");
      return;
    }

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
        await fetchGitConfig();
        setGitForm((prev) => ({ ...prev, token: "" }));
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to save configuration"));
      }
    } catch {
      toast.error("Failed to save configuration");
    }
    setGitSaving(false);
  };

  // ── Toggle git sync ──
  const handleToggleGitSync = async () => {
    if (!gitConfig) return;
    try {
      const res = await fetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !gitConfig.isEnabled }),
      });
      if (res.ok) {
        setGitConfig({ ...gitConfig, isEnabled: !gitConfig.isEnabled });
        toast.success(!gitConfig.isEnabled ? "Git sync enabled" : "Git sync disabled");
      } else {
        toast.error("Failed to toggle git sync");
      }
    } catch {
      toast.error("Failed to toggle git sync");
    }
  };

  // ── Trigger manual sync ──
  const handleManualSync = async () => {
    setGitSyncing(true);
    try {
      const res = await fetch("/api/task-git-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerSync: true }),
      });
      if (res.ok) {
        toast.success("Task sync triggered");
        // Poll for status update
        const pollInterval = setInterval(async () => {
          try {
            const pollRes = await fetch("/api/task-git-config");
            if (pollRes.ok) {
              const data = await pollRes.json();
              setGitConfig(data);
              if (data.lastSyncStatus && data.lastSyncStatus !== "PENDING") {
                clearInterval(pollInterval);
                setGitSyncing(false);
                if (data.lastSyncStatus === "SUCCESS" || data.lastSyncStatus === "NO_CHANGES") {
                  toast.success(data.lastSyncStatus === "SUCCESS" ? "Sync completed" : "No changes to sync");
                } else if (data.lastSyncStatus === "FAILED") {
                  toast.error("Sync failed: " + (data.lastSyncError || "Unknown error"));
                }
              }
            }
          } catch {
            clearInterval(pollInterval);
            setGitSyncing(false);
          }
        }, 3000);
        // Safety timeout: stop polling after 60 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
          setGitSyncing(false);
        }, 60000);
      } else {
        toast.error("Failed to trigger sync");
        setGitSyncing(false);
      }
    } catch {
      toast.error("Failed to trigger sync");
      setGitSyncing(false);
    }
  };

  // ── Save encryption key ──
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
    } catch {
      toast.error("Failed to update encryption key");
    }
    setEncKeySaving(false);
  };

  // ── Generate new encryption key ──
  const handleGenerateKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    setEncKeyForm(hex);
    toast.success("New key generated. Click 'Save Key' to apply.");
  };

  // ── Drag & Drop handlers ──
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

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

  // ── Loading ──
  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <PageHeader
        title="Protocol"
        description={isAdmin
          ? "Upload and manage your protocol PDF. Team members can download it."
          : "Download the latest TrishulHub protocol PDF."}
      />

      {/* Current Protocol Card */}
      <Card>
        <CardContent className="p-6">
          {protocol ? (
            /* ── Protocol exists ── */
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {safeText(protocol.fileName)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs">
                        PDF
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(protocol.fileSize)}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs flex items-center gap-1 flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Active
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Uploaded: {safeDate(protocol.uploadedAt)}
                {protocol.uploadedBy && (
                  <> &middot; by {safeText(protocol.uploadedBy)}</>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t">
                {!isAdmin && protocol && !downloadEnabled ? (
                  <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg w-full">
                    <Ban className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">Download disabled by administration</span>
                  </div>
                ) : (
                  <Button onClick={handleDownload} className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                )}
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── No protocol uploaded ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No protocol uploaded</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin
                      ? "Upload your protocol PDF to get started."
                      : "No protocol is available yet. Contact your admin."}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <>
                  {/* Drop zone */}
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative flex flex-col items-center justify-center gap-3
                      rounded-xl border-2 border-dashed p-8 cursor-pointer
                      transition-all duration-200
                      ${dragOver
                        ? "border-primary bg-primary/5 scale-[1.01]"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                  >
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center
                      transition-colors duration-200
                      ${dragOver ? "bg-primary/10" : "bg-muted"}
                    `}>
                      <FileUp className={`h-5 w-5 transition-colors duration-200 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {dragOver ? "Drop your PDF here" : "Click to upload or drag & drop"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF files only, max 10MB
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* ── Download Control (SUPER_ADMIN only) ── */}
      {isAdmin && protocol && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Download Control</CardTitle>
              </div>
              <Switch
                checked={downloadEnabled}
                onCheckedChange={handleToggleDownload}
              />
            </div>
            <CardDescription>Control whether team members can download the protocol PDF</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              {downloadEnabled ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">Downloads enabled for all users</span>
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600 dark:text-red-400">Downloads disabled by administration</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Save Task System - Git Config (SUPER_ADMIN only) ── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Save Task System</CardTitle>
            </div>
            <CardDescription>Bind a Git repository to automatically sync task status. Another system can read live task data from this repo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Repo URL */}
            <div className="space-y-2">
              <Label htmlFor="git-repo-url">Repository URL</Label>
              <Input
                id="git-repo-url"
                type="url"
                placeholder="https://github.com/owner/repo"
                value={gitForm.repoUrl}
                onChange={(e) => setGitForm((prev) => ({ ...prev, repoUrl: e.target.value }))}
              />
            </div>

            {/* Token */}
            <div className="space-y-2">
              <Label htmlFor="git-token">Access Token</Label>
              <div className="relative">
                <Input
                  id="git-token"
                  type={showToken ? "text" : "password"}
                  placeholder={gitConfig?.tokenMasked || "ghp_xxxxxxxxxxxx"}
                  value={gitForm.token}
                  onChange={(e) => setGitForm((prev) => ({ ...prev, token: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {gitConfig?.tokenMasked && !gitForm.token && (
                <p className="text-xs text-muted-foreground">Leave blank to keep the existing token</p>
              )}
            </div>

            {/* Save button */}
            <Button
              onClick={handleSaveGitConfig}
              disabled={gitSaving || !gitForm.repoUrl.trim() || (!gitForm.token && !gitConfig?.tokenMasked)}
              className="w-full"
            >
              {gitSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Configuration
            </Button>

            {/* Detected branch info */}
            {gitConfig?.branch && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span>Branch: <span className="font-medium text-foreground">{gitConfig.branch}</span> (auto-detected)</span>
              </div>
            )}

            {/* Enable/Disable toggle + Manual sync */}
            {gitConfig && (
              <div className="pt-3 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={gitConfig.isEnabled}
                      onCheckedChange={handleToggleGitSync}
                      disabled={!gitConfig.repoUrl}
                    />
                    <span className="text-sm font-medium">
                      Auto-sync on task changes
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualSync}
                    disabled={gitSyncing || !gitConfig.repoUrl}
                  >
                    {gitSyncing ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                    )}
                    Sync Now
                  </Button>
                </div>

                {/* Sync status */}
                {gitConfig.lastSyncStatus && (
                  <div className="flex items-center gap-2">
                    {gitConfig.lastSyncStatus === "SUCCESS" || gitConfig.lastSyncStatus === "NO_CHANGES" ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-emerald-600 dark:text-emerald-400">
                          {gitConfig.lastSyncStatus === "SUCCESS" ? "Last sync successful" : "No changes since last sync"}
                        </span>
                      </>
                    ) : gitConfig.lastSyncStatus === "FAILED" ? (
                      <>
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-600 dark:text-red-400">
                          Last sync failed{gitConfig.lastSyncError ? `: ${gitConfig.lastSyncError}` : ""}
                        </span>
                      </>
                    ) : gitConfig.lastSyncStatus === "PENDING" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        <span className="text-sm text-amber-600 dark:text-amber-400">Sync in progress...</span>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Last sync time */}
                {gitConfig.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {formatRelativeTime(gitConfig.lastSyncAt)}
                    {gitConfig.lastSyncAt && (
                      <> ({safeDate(gitConfig.lastSyncAt)})</>
                    )}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Encryption Key Management (SUPER_ADMIN only) ── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Encryption Key</CardTitle>
            </div>
            <CardDescription>
              AES-256-GCM key used to encrypt sensitive data (git tokens). Must match your Vercel ENCRYPTION_KEY.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current status */}
            <div className="flex items-center gap-2">
              {hasEncryptionKey ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-emerald-600 dark:text-emerald-400">Encryption key is configured</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-amber-600 dark:text-amber-400">No encryption key set — using environment variable</span>
                </>
              )}
            </div>

            {/* Key input */}
            <div className="space-y-2">
              <Label htmlFor="enc-key">New Encryption Key (64-char hex)</Label>
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
                  {showEncKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  title="Generate random key"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Click the refresh icon to generate a new key. Then save and copy the same value to Vercel.
              </p>
            </div>

            {/* Save button */}
            <Button
              onClick={handleSaveEncKey}
              disabled={encKeySaving || !encKeyForm.trim()}
              variant="outline"
              className="w-full"
            >
              {encKeySaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Key
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
