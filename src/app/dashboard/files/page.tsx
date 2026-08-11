"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  FolderOpen,
  FolderPlus,
  FilePlus2,
  ChevronRight,
  ChevronDown,
  Trash2,
  ExternalLink,
  RefreshCw,
  Settings,
  ArchiveRestore,
  Upload,
  Share2,
  Lock,
  FolderInput,
  MoreHorizontal,
  PanelLeft,
  Info,
  Home,
  File,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

type MoveTarget =
  | { type: "file"; item: FileItem }
  | { type: "node"; node: FileNode };

function formatSize(bytes?: number) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPrivateNode(n: Pick<FileNode, "isPrivate">) {
  return n.isPrivate === true || n.isPrivate === 1;
}

function usePersistedOpen(key: string, defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === "1") setOpen(true);
      if (stored === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, value ? "1" : "0");
        } catch {
          /* ignore */
        }
        return value;
      });
    },
    [key]
  );
  return [open, set] as const;
}

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
  const [aboutOpen, setAboutOpen] = usePersistedOpen("files-about-open", false);
  const [createOpen, setCreateOpen] = usePersistedOpen("files-create-open", false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [shareUserId, setShareUserId] = useState("");
  const [shareGrants, setShareGrants] = useState<
    Array<{ id: string; userId: string | null; name: string | null; email: string | null }>
  >([]);
  const [sharing, setSharing] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState<FileItem[]>([]);

  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [movePath, setMovePath] = useState<FileNode[]>([]);
  const [moveNodes, setMoveNodes] = useState<FileNode[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  const [treeRoots, setTreeRoots] = useState<FileNode[]>([]);
  const [treeChildren, setTreeChildren] = useState<Record<string, FileNode[]>>({});
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});

  const parentId = path.length ? path[path.length - 1].id : null;
  const current = path.length ? path[path.length - 1] : null;

  const nextKind = useMemo(() => {
    if (!current) return "DEPARTMENT" as const;
    if (current.kind === "DEPARTMENT" || current.kind === "CATEGORY") return "CATEGORY" as const;
    return "FOLDER" as const;
  }, [current]);

  const canCreateFolderHere = current?.kind === "CATEGORY" || current?.kind === "FOLDER";
  const canUpload = current?.kind === "FOLDER";
  const inPrivateTree = path.some((p) => isPrivateNode(p));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      const res = await fetch(`/api/files/nodes${qs}`, { credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Access denied");
        setNodes([]);
        return;
      }
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      const nextNodes: FileNode[] = Array.isArray(data.nodes) ? data.nodes : [];
      setNodes(nextNodes);
      setDriveConnected(!!data.driveConnected);
      setDriveRootUrl(typeof data.driveRootFolderUrl === "string" ? data.driveRootFolderUrl : null);

      if (!parentId) {
        setTreeRoots(nextNodes);
      } else if (parentId) {
        setTreeChildren((prev) => ({ ...prev, [parentId]: nextNodes }));
      }

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

  useEffect(() => {
    void load();
  }, [load]);

  const loadMoveLevel = useCallback(async (pid: string | null) => {
    setMoveLoading(true);
    try {
      const qs = pid ? `?parentId=${encodeURIComponent(pid)}` : "";
      const res = await fetch(`/api/files/nodes${qs}`, { credentials: "include" });
      if (!res.ok) {
        setMoveNodes([]);
        return;
      }
      const data = await res.json();
      setMoveNodes(Array.isArray(data.nodes) ? data.nodes : []);
    } finally {
      setMoveLoading(false);
    }
  }, []);

  const openMove = (target: MoveTarget) => {
    setMoveTarget(target);
    setMovePath([]);
    void loadMoveLevel(null);
  };

  const expandTreeNode = async (node: FileNode) => {
    const next = !treeExpanded[node.id];
    setTreeExpanded((prev) => ({ ...prev, [node.id]: next }));
    if (next && !treeChildren[node.id]) {
      try {
        const res = await fetch(`/api/files/nodes?parentId=${encodeURIComponent(node.id)}`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setTreeChildren((prev) => ({
            ...prev,
            [node.id]: Array.isArray(data.nodes) ? data.nodes : [],
          }));
        }
      } catch {
        /* ignore */
      }
    }
  };

  const navigateToNode = (crumbs: FileNode[]) => {
    setPath(crumbs);
    setSidebarOpen(false);
  };

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

  const confirmMove = async () => {
    if (!moveTarget) return;
    const dest = movePath.length ? movePath[movePath.length - 1] : null;

    if (moveTarget.type === "file") {
      if (!dest || dest.kind !== "FOLDER") {
        toast.error("Choose a folder as the destination");
        return;
      }
      setMoving(true);
      try {
        const res = await fetch("/api/files/items", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: moveTarget.item.id,
            action: "move",
            targetNodeId: dest.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Move failed");
          return;
        }
        toast.success(`Moved to ${dest.name}`);
        setMoveTarget(null);
        void load();
      } finally {
        setMoving(false);
      }
      return;
    }

    // Moving a folder/category
    if (moveTarget.node.kind === "DEPARTMENT") {
      toast.error("Departments cannot be moved");
      return;
    }
    if (!dest) {
      toast.error("Choose a destination");
      return;
    }
    if (moveTarget.node.kind === "CATEGORY" && !["DEPARTMENT", "CATEGORY"].includes(dest.kind)) {
      toast.error("Categories must move under a department or category");
      return;
    }
    if (moveTarget.node.kind === "FOLDER" && !["CATEGORY", "FOLDER"].includes(dest.kind)) {
      toast.error("Folders must move under a category or folder");
      return;
    }
    setMoving(true);
    try {
      const res = await fetch("/api/files/nodes", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: moveTarget.node.id, parentId: dest.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Move failed");
        return;
      }
      toast.success(`Moved to ${dest.name}`);
      setMoveTarget(null);
      // If we moved the current path node, trim path
      setPath((prev) => {
        const idx = prev.findIndex((p) => p.id === moveTarget.node.id);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
      void load();
    } finally {
      setMoving(false);
    }
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
      const grantsRes = await fetch(`/api/files/access?itemId=${encodeURIComponent(shareFile.id)}`, {
        credentials: "include",
      });
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

  const moveDest = movePath.length ? movePath[movePath.length - 1] : null;
  const canConfirmMove = (() => {
    if (!moveTarget || !moveDest) return false;
    if (moveTarget.type === "file") return moveDest.kind === "FOLDER";
    if (moveTarget.node.kind === "CATEGORY") return moveDest.kind === "DEPARTMENT" || moveDest.kind === "CATEGORY";
    if (moveTarget.node.kind === "FOLDER") return moveDest.kind === "CATEGORY" || moveDest.kind === "FOLDER";
    return false;
  })();

  const TreeBranch = ({
    list,
    crumbs,
    depth = 0,
  }: {
    list: FileNode[];
    crumbs: FileNode[];
    depth?: number;
  }) => (
    <ul className="space-y-0.5">
      {list.map((n) => {
        const active = path.some((p) => p.id === n.id) && path[path.length - 1]?.id === n.id;
        const expanded = !!treeExpanded[n.id];
        const kids = treeChildren[n.id];
        const priv = isPrivateNode(n);
        return (
          <li key={n.id}>
            <div
              className={cn(
                "group flex items-center gap-0.5 rounded-md pr-1",
                active && "bg-teal-500/10 text-teal-800 dark:text-teal-200"
              )}
              style={{ paddingLeft: Math.min(depth, 6) * 10 }}
            >
              <button
                type="button"
                className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted/60"
                onClick={() => void expandTreeNode(n)}
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 flex items-center gap-1.5 py-1 px-1 text-left text-xs font-medium truncate hover:bg-muted/40 rounded"
                onClick={() => navigateToNode([...crumbs, n])}
                title={safeText(n.name)}
              >
                {priv ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                )}
                <span className="truncate">{safeText(n.name)}</span>
              </button>
            </div>
            {expanded && kids && kids.length > 0 && (
              <TreeBranch list={kids} crumbs={[...crumbs, n]} depth={depth + 1} />
            )}
            {expanded && kids && kids.length === 0 && (
              <p
                className="text-[10px] text-muted-foreground py-0.5"
                style={{ paddingLeft: (Math.min(depth, 6) + 1) * 10 + 24 }}
              >
                Empty
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );

  const SidebarNav = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2.5 py-2 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={() => navigateToNode([])}
          className={cn(
            "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold hover:bg-muted/50",
            path.length === 0 && "bg-teal-500/10 text-teal-800 dark:text-teal-200"
          )}
        >
          <Home className="h-3.5 w-3.5" />
          All departments
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {treeRoots.length === 0 ? (
          <p className="text-[11px] text-muted-foreground px-2 py-3">No departments yet</p>
        ) : (
          <TreeBranch list={treeRoots} crumbs={[]} />
        )}
      </div>
    </div>
  );

  return (
    <DesktopOnlyGate>
      <div className="flex flex-col gap-3 h-[calc(100dvh-5.5rem)] min-h-[420px] max-w-[1400px] mx-auto">
        {/* Compact title bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 md:hidden shrink-0" aria-label="Folders">
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetHeader className="px-3 py-3 border-b">
                  <SheetTitle className="text-sm">Folders</SheetTitle>
                </SheetHeader>
                {SidebarNav}
              </SheetContent>
            </Sheet>
            <FolderOpen className="h-5 w-5 text-teal-600 shrink-0" />
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">Files</h1>
            {!driveConnected && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
                Drive offline
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href="/dashboard/files/review">
                <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> Review
              </Link>
            </Button>
            {isSuper && (
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link href="/dashboard/files/settings">
                  <Settings className="h-3.5 w-3.5 mr-1" /> Settings
                </Link>
              </Button>
            )}
            {driveRootUrl && (
              <Button variant="outline" size="sm" className="h-8" asChild>
                <a href={driveRootUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Drive
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible about section — collapsed by default */}
        <Collapsible open={aboutOpen} onOpenChange={setAboutOpen} className="shrink-0">
          <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground/85">About Files & Drive</p>
                  {!aboutOpen && (
                    <p className="text-[11px] text-muted-foreground truncate">
                      Mirrored under Trishulhub Files
                      {driveConnected ? " · Drive connected" : " · Connect Drive in Settings"}
                      {canReview ? " · Private dept = Admin only" : ""}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                    aboutOpen && "rotate-180"
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-border/40">
                <p className="text-xs text-muted-foreground leading-relaxed pt-2">
                  Every department / category / folder / file is created on the connected Drive under{" "}
                  <span className="font-medium text-foreground">Trishulhub Files</span>
                  {driveConnected ? " (info@)." : "."} Open a file to edit in your personal Gmail.
                </p>
                {canReview && (
                  <p className="text-[11px] text-muted-foreground">
                    Private department is Admin / Super Admin only. Use Share on a file to grant one user access.
                  </p>
                )}
                {!driveConnected && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Drive is not connected yet — Super Admin can connect it in Settings.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Explorer shell */}
        <div className="flex-1 min-h-0 rounded-xl border border-border/60 bg-card/30 overflow-hidden flex">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex w-[240px] lg:w-[260px] shrink-0 border-r border-border/50 bg-muted/15 flex-col min-h-0">
            {SidebarNav}
          </aside>

          {/* Main pane */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* Address / breadcrumb bar */}
            <div className="shrink-0 border-b border-border/50 bg-muted/20 px-2.5 py-1.5 flex flex-wrap items-center gap-1 text-xs">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-500/10"
                onClick={() => setPath([])}
              >
                <Home className="h-3 w-3" />
                Root
              </button>
              {path.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-0.5 min-w-0">
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    className={cn(
                      "truncate max-w-[140px] sm:max-w-[200px] rounded px-1.5 py-1 hover:bg-muted/60 inline-flex items-center gap-1",
                      i === path.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                    onClick={() => setPath(path.slice(0, i + 1))}
                  >
                    {isPrivateNode(p) && <Lock className="h-3 w-3 text-amber-600 shrink-0" />}
                    {safeText(p.name)}
                  </button>
                </span>
              ))}
              {current?.driveFolderUrl && (
                <a
                  href={current.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-300 hover:underline px-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in Drive
                </a>
              )}
            </div>

            {inPrivateTree && (
              <div className="shrink-0 text-[11px] border-b border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-1.5 flex items-center gap-1.5">
                <Lock className="h-3 w-3 shrink-0" />
                Private department — Admin / Super Admin only
              </div>
            )}

            {/* Create / upload toolbar — compact, collapsible */}
            <Collapsible open={createOpen} onOpenChange={setCreateOpen} className="shrink-0 border-b border-border/40">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background/40">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <FolderPlus className="h-3.5 w-3.5 mr-1" />
                    New
                    <ChevronDown className={cn("h-3.5 w-3.5 ml-1 transition-transform", createOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                {canUpload && (
                  <>
                    <Label
                      htmlFor="file-upload"
                      className={cn(
                        "inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs font-medium cursor-pointer",
                        uploading ? "opacity-50 pointer-events-none" : "hover:bg-muted"
                      )}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? "Uploading…" : "Upload"}
                    </Label>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(e) => void onUpload(e.target.files)}
                    />
                  </>
                )}
                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline ml-auto">
                  {current
                    ? `${current.kind.toLowerCase()} · ${nodes.length} folder${nodes.length === 1 ? "" : "s"}${
                        canUpload ? ` · ${items.length} file${items.length === 1 ? "" : "s"}` : ""
                      }`
                    : `${nodes.length} department${nodes.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <CollapsibleContent>
                <div className="px-2.5 pb-2.5 space-y-2 bg-muted/10">
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="space-y-1 flex-1 min-w-[160px]">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
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
                        className="h-8 text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newName.trim()) {
                            void createNode(nextKind === "DEPARTMENT" ? "DEPARTMENT" : nextKind);
                          }
                        }}
                      />
                    </div>
                    {!current ? (
                      canReview && (
                        <>
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground pb-1.5">
                            <input
                              type="checkbox"
                              checked={createPrivate}
                              onChange={(e) => setCreatePrivate(e.target.checked)}
                              className="h-3.5 w-3.5"
                            />
                            Private
                          </label>
                          <Button
                            size="sm"
                            className="h-8"
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
                          className="h-8"
                          disabled={creating || !newName.trim()}
                          onClick={() => void createNode("CATEGORY")}
                        >
                          <FolderPlus className="h-3.5 w-3.5 mr-1" /> Category
                        </Button>
                        {current.kind === "CATEGORY" && (
                          <Button
                            size="sm"
                            className="h-8"
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
                        className="h-8"
                        disabled={creating || !newName.trim()}
                        onClick={() => void createNode("FOLDER")}
                      >
                        <FolderPlus className="h-3.5 w-3.5 mr-1" /> Subfolder
                      </Button>
                    )}
                  </div>
                  {current && current.kind !== "FOLDER" && (
                    <p className="text-[10px] text-muted-foreground">
                      Tip: open a folder to upload files. Uploads are blocked on departments/categories.
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* File list */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Column headers — desktop */}
              <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_110px_100px_44px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/40 sticky top-0 bg-card/90 backdrop-blur-sm z-10">
                <span>Name</span>
                <span>Type</span>
                <span className="text-right">Size</span>
                <span />
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground px-4 py-10 text-center">Loading…</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {nodes.map((n) => {
                    const priv = isPrivateNode(n);
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "group grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_100px_44px] gap-1 sm:gap-2 items-center px-2.5 py-1.5 hover:bg-teal-500/[0.06] transition-colors",
                          priv && "bg-amber-500/[0.04]"
                        )}
                      >
                        <button
                          type="button"
                          onDoubleClick={() => setPath([...path, n])}
                          onClick={() => setPath([...path, n])}
                          className="min-w-0 flex items-center gap-2.5 text-left px-0.5 py-0.5"
                        >
                          {priv ? (
                            <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                          ) : (
                            <FolderOpen className="h-4 w-4 text-teal-600 shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate">
                            {safeText(n.name)}
                            {priv && (
                              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                Private
                              </span>
                            )}
                          </span>
                        </button>
                        <span className="hidden sm:block text-[11px] text-muted-foreground uppercase tracking-wide px-0.5">
                          {n.kind}
                        </span>
                        <span className="hidden sm:block text-[11px] text-muted-foreground text-right px-0.5">—</span>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setPath([...path, n])}>
                                <FolderOpen className="h-3.5 w-3.5 mr-2" /> Open
                              </DropdownMenuItem>
                              {n.driveFolderUrl && (
                                <DropdownMenuItem asChild>
                                  <a href={n.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open in Drive
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {n.kind !== "DEPARTMENT" && (
                                <DropdownMenuItem onClick={() => openMove({ type: "node", node: n })}>
                                  <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to…
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => void softDeleteNode(n.id, n.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Move to Review
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}

                  {items.map((f) => (
                    <div
                      key={f.id}
                      className="group grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_100px_44px] gap-1 sm:gap-2 items-center px-2.5 py-1.5 hover:bg-sky-500/[0.05] transition-colors"
                    >
                      <button
                        type="button"
                        onDoubleClick={() => void openFile(f.id)}
                        onClick={() => void openFile(f.id)}
                        className="min-w-0 flex items-center gap-2.5 text-left px-0.5 py-0.5"
                      >
                        <File className="h-4 w-4 text-sky-600 shrink-0" />
                        <span className="text-sm font-medium truncate">{safeText(f.name)}</span>
                      </button>
                      <span className="hidden sm:block text-[11px] text-muted-foreground truncate px-0.5">
                        {f.mimeType?.split("/").pop() || "file"}
                      </span>
                      <span className="hidden sm:block text-[11px] text-muted-foreground text-right tabular-nums px-0.5">
                        {formatSize(f.sizeBytes)}
                      </span>
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => void openFile(f.id)}>
                              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openMove({ type: "file", item: f })}>
                              <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to…
                            </DropdownMenuItem>
                            {canReview && !inPrivateTree && (
                              <DropdownMenuItem onClick={() => void openShare(f)}>
                                <Share2 className="h-3.5 w-3.5 mr-2" /> Share
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => void softDeleteFile(f.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Move to Review
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}

                  {!parentId && sharedWithMe.length > 0 && (
                    <div className="pt-3 pb-1">
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Shared with you
                      </div>
                      {sharedWithMe.map((f) => (
                        <div
                          key={`shared-${f.id}`}
                          className="group grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_100px_44px] gap-1 sm:gap-2 items-center px-2.5 py-1.5 bg-sky-500/[0.04] hover:bg-sky-500/[0.08]"
                        >
                          <button
                            type="button"
                            onClick={() => void openFile(f.id)}
                            className="min-w-0 flex items-center gap-2.5 text-left px-0.5 py-0.5"
                          >
                            <FilePlus2 className="h-4 w-4 text-sky-600 shrink-0" />
                            <span className="text-sm font-medium truncate">{safeText(f.name)}</span>
                          </button>
                          <span className="hidden sm:block text-[11px] text-muted-foreground px-0.5">shared</span>
                          <span className="hidden sm:block text-[11px] text-muted-foreground text-right px-0.5">—</span>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void openFile(f.id)}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!nodes.length && !items.length && !sharedWithMe.length && (
                    <p className="text-sm text-muted-foreground py-12 text-center px-4">
                      Empty here. Use <span className="font-medium text-foreground">New</span> to create a{" "}
                      {nextKind.toLowerCase()}.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Move dialog */}
        <Dialog
          open={!!moveTarget}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-[480px] max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FolderInput className="h-4 w-4" />
                Move to…
              </DialogTitle>
              <DialogDescription>
                {moveTarget?.type === "file"
                  ? `Choose a folder for “${safeText(moveTarget.item.name)}”.`
                  : `Choose a destination for “${safeText(moveTarget?.node.name)}”.`}
              </DialogDescription>
            </DialogHeader>
            <div className="px-4 pb-2 shrink-0 flex flex-wrap items-center gap-1 text-xs border-b">
              <button
                type="button"
                className="rounded px-1.5 py-1 font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-500/10"
                onClick={() => {
                  setMovePath([]);
                  void loadMoveLevel(null);
                }}
              >
                Root
              </button>
              {movePath.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-0.5">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-1 hover:bg-muted/60",
                      i === movePath.length - 1 ? "font-semibold" : "text-muted-foreground"
                    )}
                    onClick={() => {
                      const next = movePath.slice(0, i + 1);
                      setMovePath(next);
                      void loadMoveLevel(next[next.length - 1].id);
                    }}
                  >
                    {safeText(p.name)}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex-1 min-h-[220px] overflow-y-auto px-2 py-2">
              {moveLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
              ) : moveNodes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No folders here</p>
              ) : (
                <ul className="space-y-0.5">
                  {moveNodes
                    .filter((n) => !(moveTarget?.type === "node" && n.id === moveTarget.node.id))
                    .map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            const next = [...movePath, n];
                            setMovePath(next);
                            void loadMoveLevel(n.id);
                          }}
                        >
                          <FolderOpen className="h-4 w-4 text-teal-600 shrink-0" />
                          <span className="truncate flex-1 font-medium">{safeText(n.name)}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">{n.kind}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <DialogFooter className="px-4 py-3 border-t shrink-0 gap-2 sm:gap-2">
              <p className="text-[11px] text-muted-foreground mr-auto hidden sm:block">
                {canConfirmMove
                  ? `Move into “${safeText(moveDest?.name)}”`
                  : moveTarget?.type === "file"
                    ? "Open a folder, then confirm"
                    : "Select a valid parent, then confirm"}
              </p>
              <Button variant="outline" onClick={() => setMoveTarget(null)}>
                Cancel
              </Button>
              <Button disabled={!canConfirmMove || moving} onClick={() => void confirmMove()}>
                {moving ? "Moving…" : "Move here"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share dialog */}
        <Dialog open={shareOpen} onOpenChange={setShareOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Share file with user
              </DialogTitle>
              <DialogDescription>
                Grant access to <strong>{safeText(shareFile?.name)}</strong> only — not the whole department. They
                still need Files module access enabled.
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
                        <span className="truncate">{safeText(g.name || g.email || g.userId)}</span>
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
