"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FolderOpen, FolderPlus, FilePlus2, ChevronRight, Trash2, ExternalLink,
  RefreshCw, Settings, ArchiveRestore, Upload, Share2, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { cn, safeText } from "@/lib/utils";
import { DesktopOnlyGate } from "@/components/dashboard/files/desktop-only-gate";

type FileNode = {
  id: string;
  kind: "DEPARTMENT" | "CATEGORY" | "FOLDER";
  name: string;
  parentId?: string | null;
  driveFolderId?: string | null;
  driveFolderUrl?: string | null;
  isPrivate?: boolean | number | null;
};

type FileItem = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number;
  webViewLink?: string | null;
  driveFileId?: string | null;
};

type TeamUser = { id: string; name: string; email: string };

export default function FilesPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || "";
  const isSuper = role === "SUPER_ADMIN";
  const canReview = role === "SUPER_ADMIN" || role === "ADMIN";

  const [path, setPath] = useState<FileNode[]>([]);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveRootUrl, setDriveRootUrl] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [createPrivate, setCreatePrivate] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [shareGrants, setShareGrants] = useState<
    Array<{ id: string; userId: string | null; name: string | null; email: string | null }>
  >([]);
  const [sharing, setSharing] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<FileItem[]>([]);

  const parentId = path.length ? path[path.length - 1].id : null;
  const current = path.length ? path[path.length - 1] : null;

  const nextKind = useMemo(() => {
    if (!current) return "DEPARTMENT" as const;
    if (current.kind === "DEPARTMENT" || current.kind === "CATEGORY") return "CATEGORY" as const;
    return "FOLDER" as const;
  }, [current]);

  const canCreateFolderHere = current?.kind === "CATEGORY" || current?.kind === "FOLDER";
  const canUpload = current?.kind === "FOLDER";
  const inPrivateTree = path.some((p) => p.isPrivate === true || p.isPrivate === 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      const res = await fetch(`/api/files/nodes${qs}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Access denied");
        setNodes([]);
        return;
      }
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setNodes(Array.isArray(data.nodes) ? data.nodes : []);
      setDriveConnected(!!data.driveConnected);
      setDriveRootUrl(typeof data.driveRootFolderUrl === "string" ? data.driveRootFolderUrl : null);

      if (parentId && current?.kind === "FOLDER") {
        const ir = await fetch(`/api/files/items?nodeId=${encodeURIComponent(parentId)}`, {
          credentials: "include",
        });
        if (ir.ok) {
          const idata = await ir.json();
          setItems(Array.isArray(idata.items) ? idata.items : []);
        } else setItems([]);
        setSharedWithMe([]);
      } else if (!parentId) {
        setItems([]);
        const sr = await fetch("/api/files/items?shared=1", { credentials: "include" });
        if (sr.ok) {
          const sdata = await sr.json();
          setSharedWithMe(Array.isArray(sdata.items) ? sdata.items : []);
        } else setSharedWithMe([]);
      } else {
        setItems([]);
        setSharedWithMe([]);
      }
    } catch {
      toast.error("Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [parentId, current?.kind]);

  useEffect(() => { void load(); }, [load]);

  const createNode = async (kind: "DEPARTMENT" | "CATEGORY" | "FOLDER") => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/files/nodes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          kind,
          parentId,
          isPrivate: kind === "DEPARTMENT" ? createPrivate : false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Create failed");
        return;
      }
      toast.success(
        kind === "DEPARTMENT" && createPrivate
          ? "Private department created on Drive (Admin / Super Admin only)"
          : `${kind.toLowerCase()} created on Google Drive`
      );
      if (data.driveFolderUrl) {
        toast.message("Open the same folder in Drive", {
          action: {
            label: "Open Drive",
            onClick: () => window.open(String(data.driveFolderUrl), "_blank", "noopener,noreferrer"),
          },
        });
      }
      setNewName("");
      setCreatePrivate(false);
      void load();
    } finally {
      setCreating(false);
    }
  };

  const openFile = async (id: string) => {
    const res = await fetch(`/api/files/items?openId=${encodeURIComponent(id)}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.webViewLink) {
      toast.error(data.error || "Could not open file in Google");
      return;
    }
    if (data.shareWarning) {
      toast.warning(String(data.shareWarning));
    } else if (data.sharedWith) {
      toast.success(`Edit access shared to ${String(data.sharedWith)} — open while signed into that Gmail`);
    }
    window.open(data.webViewLink, "_blank", "noopener,noreferrer");
  };

  const softDeleteFile = async (id: string) => {
    if (!confirm("Move this file to Review (soft delete)?")) return;
    const res = await fetch(`/api/files/items?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Delete failed");
      return;
    }
    toast.success("Moved to Review");
    void load();
  };

  const onUpload = async (fileList: FileList | null) => {
    if (!fileList?.length || !parentId || !canUpload) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.set("nodeId", parentId);
        fd.set("file", file);
        const res = await fetch("/api/files/items", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || `Failed: ${file.name}`);
        } else {
          toast.success(`Uploaded ${file.name} to Google Drive`);
          const folderUrl = data.drive?.folderUrl;
          if (folderUrl) {
            toast.message("File is on info@ Drive in this folder path", {
              action: {
                label: "Open folder",
                onClick: () => window.open(String(folderUrl), "_blank", "noopener,noreferrer"),
              },
            });
          }
        }
      }
      void load();
    } finally {
      setUploading(false);
    }
  };

  const softDeleteNode = async (id: string, name: string) => {
    if (!confirm(`Move "${name}" and everything inside to Review?`)) return;
    const res = await fetch(`/api/files/nodes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Delete failed");
      return;
    }
    toast.success("Moved to Review");
    void load();
  };

  const openShare = async (file: FileItem) => {
    setShareFile(file);
    setShareUserId("");
    setShareOpen(true);
    try {
      const [usersRes, grantsRes] = await Promise.all([
        fetch("/api/team?type=users", { credentials: "include" }),
        fetch(`/api/files/access?itemId=${encodeURIComponent(file.id)}`, { credentials: "include" }),
      ]);
      if (usersRes.ok) {
        const u = await usersRes.json();
        const arr = Array.isArray(u) ? u : u?.data || [];
        setTeamUsers(
          arr
            .filter((x: TeamUser) => x?.id && x?.email)
            .map((x: TeamUser) => ({ id: x.id, name: x.name || x.email, email: x.email }))
        );
      }
      if (grantsRes.ok) {
        const g = await grantsRes.json();
        setShareGrants(Array.isArray(g.grants) ? g.grants : []);
      } else {
        setShareGrants([]);
      }
    } catch {
      toast.error("Could not load share options");
    }
  };

  const grantFileAccess = async () => {
    if (!shareFile || !shareUserId) return;
    setSharing(true);
    try {
      const res = await fetch("/api/files/access", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ITEM_USER",
          itemId: shareFile.id,
          userId: shareUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Share failed");
        return;
      }
      toast.success("File access granted — user can open this file in Files");
      setShareUserId("");
      const grantsRes = await fetch(
        `/api/files/access?itemId=${encodeURIComponent(shareFile.id)}`,
        { credentials: "include" }
      );
      if (grantsRes.ok) {
        const g = await grantsRes.json();
        setShareGrants(Array.isArray(g.grants) ? g.grants : []);
      }
    } finally {
      setSharing(false);
    }
  };

  const removeFileGrant = async (removeId: string) => {
    if (!shareFile) return;
    const res = await fetch("/api/files/access", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ITEM_USER",
        itemId: shareFile.id,
        removeId,
      }),
    });
    if (!res.ok) {
      toast.error("Could not remove access");
      return;
    }
    toast.success("File access removed");
    setShareGrants((prev) => prev.filter((g) => g.id !== removeId));
  };

  return (
    <DesktopOnlyGate>
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-teal-600" />
            Files
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every department / category / folder / file is created on the connected Drive
            under <span className="font-medium text-foreground">Trishulhub Files</span>
            {driveConnected ? " (info@)." : "."} Open a file to edit in your personal Gmail.
            {canReview && (
              <span className="block text-[11px] mt-0.5">
                Private department is Admin / Super Admin only. Use Share on a file to grant one user access.
              </span>
            )}
            {!driveConnected && (
              <span className="text-amber-600 dark:text-amber-400"> Drive not connected yet.</span>
            )}
          </p>
          {driveRootUrl && (
            <a
              href={driveRootUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-teal-700 dark:text-teal-300 hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              Open Trishulhub Files in Google Drive
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/files/review">
              <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Review
            </Link>
          </Button>
          {isSuper && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/files/settings">
                <Settings className="h-3.5 w-3.5 mr-1" /> Settings
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className="text-teal-700 dark:text-teal-300 font-medium hover:underline"
          onClick={() => setPath([])}
        >
          All departments
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              className={cn(
                "hover:underline inline-flex items-center gap-1",
                i === path.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setPath(path.slice(0, i + 1))}
            >
              {(p.isPrivate === true || p.isPrivate === 1) && (
                <Lock className="h-3 w-3 text-amber-600" />
              )}
              {safeText(p.name)}
            </button>
          </span>
        ))}
      </div>

      {inPrivateTree && (
        <p className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-2 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          You are in the Private department — visible only to Admin and Super Admin.
        </p>
      )}

      {path.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Drive path:{" "}
          <span className="text-foreground/80">
            Trishulhub Files / {path.map((p) => p.name).join(" / ")}
          </span>
          {current?.driveFolderUrl && (
            <>
              {" · "}
              <a
                href={current.driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 dark:text-teal-300 hover:underline"
              >
                Open this folder in Drive
              </a>
            </>
          )}
        </p>
      )}

      {/* Create controls */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs">
              {!current
                ? "New department"
                : canCreateFolderHere
                  ? "New folder / subcategory"
                  : "New category"}
            </Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="h-9"
            />
          </div>
          {!current ? (
            canReview && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2">
                  <input
                    type="checkbox"
                    checked={createPrivate}
                    onChange={(e) => setCreatePrivate(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Private (Admin only)
                </label>
                <Button
                  size="sm"
                  disabled={creating || !newName.trim()}
                  onClick={() => void createNode("DEPARTMENT")}
                >
                  <FolderPlus className="h-3.5 w-3.5 mr-1" /> Department
                </Button>
              </>
            )
          ) : current.kind === "DEPARTMENT" || current.kind === "CATEGORY" ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={creating || !newName.trim()}
                onClick={() => void createNode("CATEGORY")}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1" /> Category
              </Button>
              {current.kind === "CATEGORY" && (
                <Button
                  size="sm"
                  disabled={creating || !newName.trim()}
                  onClick={() => void createNode("FOLDER")}
                >
                  <FolderPlus className="h-3.5 w-3.5 mr-1" /> Folder
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              disabled={creating || !newName.trim()}
              onClick={() => void createNode("FOLDER")}
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> Subfolder
            </Button>
          )}
        </div>
        {canUpload && (
          <div className="flex items-center gap-2 pt-1">
            <Label
              htmlFor="file-upload"
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium cursor-pointer",
                uploading ? "opacity-50 pointer-events-none" : "hover:bg-muted"
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload file into this folder"}
            </Label>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              multiple
              onChange={(e) => void onUpload(e.target.files)}
            />
            <span className="text-[11px] text-muted-foreground">
              Browse &amp; upload here (no Google login). Open shares that file to your personal Gmail for edit.
            </span>
          </div>
        )}
        {current && current.kind !== "FOLDER" && (
          <p className="text-[11px] text-muted-foreground">
            Tip: create a folder under a category to upload files. Uploads are blocked on departments/categories.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-2">
          {nodes.map((n) => {
            const priv = n.isPrivate === true || n.isPrivate === 1;
            return (
              <div
                key={n.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-2 py-1.5 hover:border-teal-500/40 hover:bg-teal-500/5 transition-colors",
                  priv && "border-amber-500/35 bg-amber-500/5"
                )}
              >
                <button
                  type="button"
                  onClick={() => setPath([...path, n])}
                  className="flex-1 flex items-center gap-3 px-1 py-1.5 text-left min-w-0"
                >
                  {priv ? (
                    <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                  ) : (
                    <FolderOpen className="h-4 w-4 text-teal-600 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {safeText(n.name)}
                      {priv && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          Private
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      {n.kind}
                      {priv ? " · Admin / Super Admin only" : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                {n.driveFolderUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0"
                    asChild
                    title="Open this folder in Google Drive"
                  >
                    <a href={n.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-red-600 shrink-0"
                  onClick={() => void softDeleteNode(n.id, n.name)}
                  title="Move to Review"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          {items.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2.5"
            >
              <FilePlus2 className="h-4 w-4 text-sky-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{safeText(f.name)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {f.mimeType || "file"}
                  {typeof f.sizeBytes === "number" ? ` · ${(f.sizeBytes / 1024).toFixed(1)} KB` : ""}
                  {" · on Drive"}
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => void openFile(f.id)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
              {canReview && !inPrivateTree && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => void openShare(f)}
                  title="Grant this file to one user"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => void softDeleteFile(f.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {!parentId && sharedWithMe.length > 0 && (
            <div className="pt-4 space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Shared with you</h2>
              <p className="text-[11px] text-muted-foreground">
                Single-file access granted by Admin / Super Admin — open here even without the full department.
              </p>
              {sharedWithMe.map((f) => (
                <div
                  key={`shared-${f.id}`}
                  className="flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2.5"
                >
                  <FilePlus2 className="h-4 w-4 text-sky-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{safeText(f.name)}</p>
                    <p className="text-[11px] text-muted-foreground">{f.mimeType || "file"} · shared</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => void openFile(f.id)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!nodes.length && !items.length && !sharedWithMe.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Empty here. Create a {nextKind.toLowerCase()} to get started.
            </p>
          )}
        </div>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Share file with user
            </DialogTitle>
            <DialogDescription>
              Grant access to <strong>{safeText(shareFile?.name)}</strong> only — not the whole department.
              They still need Files module access enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Team member</Label>
              <Select value={shareUserId || undefined} onValueChange={setShareUserId}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose user…" />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {safeText(u.name)} · {safeText(u.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {shareGrants.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Current file access</Label>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {shareGrants.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
                    >
                      <span className="truncate">
                        {safeText(g.name || g.email || g.userId)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-red-600"
                        onClick={() => void removeFileGrant(g.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Close
            </Button>
            <Button disabled={!shareUserId || sharing} onClick={() => void grantFileAccess()}>
              {sharing ? "Saving…" : "Grant access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DesktopOnlyGate>
  );
}
