"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FolderOpen, FolderPlus, FilePlus2, ChevronRight, Trash2, ExternalLink,
  RefreshCw, Settings, ArchiveRestore, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn, safeText } from "@/lib/utils";

type FileNode = {
  id: string;
  kind: "DEPARTMENT" | "CATEGORY" | "FOLDER";
  name: string;
  parentId?: string | null;
  driveFolderId?: string | null;
};

type FileItem = {
  id: string;
  name: string;
  mimeType?: string | null;
  sizeBytes?: number;
  webViewLink?: string | null;
};

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
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const parentId = path.length ? path[path.length - 1].id : null;
  const current = path.length ? path[path.length - 1] : null;

  const nextKind = useMemo(() => {
    if (!current) return "DEPARTMENT" as const;
    if (current.kind === "DEPARTMENT" || current.kind === "CATEGORY") return "CATEGORY" as const;
    return "FOLDER" as const;
  }, [current]);

  const canCreateFolderHere = current?.kind === "CATEGORY" || current?.kind === "FOLDER";
  const canUpload = current?.kind === "FOLDER";

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

      if (parentId && current?.kind === "FOLDER") {
        const ir = await fetch(`/api/files/items?nodeId=${encodeURIComponent(parentId)}`, {
          credentials: "include",
        });
        if (ir.ok) {
          const idata = await ir.json();
          setItems(Array.isArray(idata.items) ? idata.items : []);
        } else setItems([]);
      } else {
        setItems([]);
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
        body: JSON.stringify({ name: newName.trim(), kind, parentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Create failed");
        return;
      }
      toast.success(`${kind.toLowerCase()} created`);
      setNewName("");
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
          toast.success(`Uploaded ${file.name}`);
        }
      }
      void load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-teal-600" />
            Files
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Operate Google Drive from Trishulhub — departments → categories → folders → files.
            {!driveConnected && (
              <span className="text-amber-600 dark:text-amber-400"> Drive not connected yet.</span>
            )}
          </p>
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
                "hover:underline",
                i === path.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setPath(path.slice(0, i + 1))}
            >
              {safeText(p.name)}
            </button>
          </span>
        ))}
      </div>

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
              <Button
                size="sm"
                disabled={creating || !newName.trim()}
                onClick={() => void createNode("DEPARTMENT")}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1" /> Department
              </Button>
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
              Uploads only inside folders. Opens in Google Docs / Drive.
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
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setPath([...path, n])}
              className="w-full flex items-center gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2.5 text-left hover:border-teal-500/40 hover:bg-teal-500/5 transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{safeText(n.name)}</p>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{n.kind}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}

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
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => void openFile(f.id)}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => void softDeleteFile(f.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {!nodes.length && !items.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Empty here. Create a {nextKind.toLowerCase()} to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
