"use client"

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  HardDrive,
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  Upload,
  FolderPlus,
  Search,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Star,
  StarOff,
  MoreVertical,
  Download,
  Trash2,
  Pencil,
  FolderInput,
  Share2,
  RefreshCw,
  ChevronRight,
  X,
  Check,
  Eye,
  Shield,
  AlertTriangle,
  Cloud,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ── Types ──
interface FileItem {
  id: string
  driveFileId: string
  name: string
  mimeType: string
  size: number
  parentId: string | null
  trashed: boolean
  starred: boolean
  description: string | null
  thumbnailLink: string | null
  webViewLink: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  permissions?: FilePermission[]
}

interface FilePermission {
  id: string
  userId: string
  accessLevel: string
  grantedBy: string | null
  user?: { id: string; name: string; email: string; role: string } | null
}

interface StorageInfo {
  usedBytes: number
  totalBytes: number
}

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
}

interface BreadcrumbItem {
  id: string | null
  name: string
}

type ViewMode = "grid" | "list"
type SortField = "name" | "updatedAt" | "size" | "mimeType"
type FilterMode = "all" | "starred" | "trashed"

// ── Helpers ──
function isFolder(mimeType: string): boolean {
  return mimeType === "application/vnd.google-apps.folder"
}

function getFileIcon(mimeType: string) {
  if (isFolder(mimeType)) return Folder
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.startsWith("video/")) return FileVideo
  if (mimeType.startsWith("audio/")) return FileAudio
  if (mimeType.includes("pdf")) return FileText
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel")) return FileSpreadsheet
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar") || mimeType.includes("gz")) return FileArchive
  if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("python") || mimeType.includes("json") || mimeType.includes("html") || mimeType.includes("css")) return FileCode2
  if (mimeType.startsWith("text/")) return FileText
  return File
}

function getFileIconColor(mimeType: string) {
  if (isFolder(mimeType)) return "text-amber-500"
  if (mimeType.startsWith("image/")) return "text-pink-500"
  if (mimeType.startsWith("video/")) return "text-red-500"
  if (mimeType.startsWith("audio/")) return "text-purple-500"
  if (mimeType.includes("pdf")) return "text-red-400"
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv") || mimeType.includes("excel")) return "text-green-500"
  if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("tar")) return "text-orange-500"
  if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("python") || mimeType.includes("json") || mimeType.includes("html") || mimeType.includes("css")) return "text-blue-500"
  return "text-muted-foreground"
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function formatStorageBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let unitIndex = 0
  let size = bytes
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

export default function FilesPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const userId = session?.user?.id || ""
  const userRole = session?.user?.role || ""

  // ── State ──
  const [files, setFiles] = useState<FileItem[]>([])
  const [storage, setStorage] = useState<StorageInfo>({ usedBytes: 0, totalBytes: 0 })
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortField, setSortField] = useState<SortField>("updatedAt")
  const [sortAsc, setSortAsc] = useState(false)
  const [filter, setFilter] = useState<FilterMode>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Root" }])

  // Upload state
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number; error?: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dialogs
  const [renameDialog, setRenameDialog] = useState<FileItem | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [newFolderDialog, setNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<FileItem | null>(null)
  const [shareDialog, setShareDialog] = useState<FileItem | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // ── Fetch files ──
  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentFolder) params.set("parentId", currentFolder)
      if (filter === "starred") params.set("starred", "true")
      if (filter === "trashed") params.set("trashed", "true")

      const res = await fetch(`/api/files?${params}`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
        if (data.storage) setStorage(data.storage)
      }
    } catch (err) {
      console.error("Failed to fetch files:", err)
    } finally {
      setLoading(false)
    }
  }, [currentFolder, filter])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // ── Fetch team members for share dialog ──
  useEffect(() => {
    if (shareDialog) {
      fetch("/api/team")
        .then((res) => res.ok ? res.json() : [])
        .then((data) => setTeamMembers(Array.isArray(data) ? data : data.users || data.data || []))
        .catch(() => {})
    }
  }, [shareDialog])

  // ── Sort & filter files ──
  const sortedFiles = useMemo(() => {
    let filtered = [...files]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q))
    }

    filtered.sort((a, b) => {
      // Folders first
      const aIsFolder = isFolder(a.mimeType)
      const bIsFolder = isFolder(b.mimeType)
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1

      let cmp = 0
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name)
          break
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case "size":
          cmp = a.size - b.size
          break
        case "mimeType":
          cmp = a.mimeType.localeCompare(b.mimeType)
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return filtered
  }, [files, sortField, sortAsc, searchQuery])

  // ── Upload handler ──
  const uploadFiles = useCallback(async (fileList: FileList | File[]) => {
    const filesToUpload = Array.from(fileList)
    if (filesToUpload.length === 0) return

    const uploadItems = filesToUpload.map((f) => ({
      name: f.name,
      progress: 0,
    }))
    setUploadingFiles(uploadItems)

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i]
      const formData = new FormData()
      formData.append("file", file)
      formData.append("action", "upload")
      if (currentFolder) formData.append("parentId", currentFolder)

      setUploadingFiles((prev) =>
        prev.map((item, idx) => (idx === i ? { ...item, progress: 20 } : item))
      )

      try {
        // Simulate progress
        const progressInterval = setInterval(() => {
          setUploadingFiles((prev) =>
            prev.map((item, idx) =>
              idx === i && item.progress < 80 ? { ...item, progress: item.progress + 10 } : item
            )
          )
        }, 300)

        const res = await fetch("/api/files", {
          method: "POST",
          body: formData,
        })

        clearInterval(progressInterval)

        if (res.ok) {
          setUploadingFiles((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, progress: 100 } : item))
          )
        } else {
          const data = await res.json()
          setUploadingFiles((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, progress: 0, error: data.error || "Upload failed" } : item))
          )
        }
      } catch (err) {
        setUploadingFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, progress: 0, error: "Upload failed" } : item))
        )
      }
    }

    // Clear upload state after delay
    setTimeout(() => {
      setUploadingFiles([])
      fetchFiles()
    }, 1500)
  }, [currentFolder, fetchFiles])

  // ── Create folder ──
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim() || creatingFolder) return

    setCreatingFolder(true)
    try {
      const formData = new FormData()
      formData.append("action", "folder")
      formData.append("folderName", newFolderName.trim())
      if (currentFolder) formData.append("parentId", currentFolder)

      const res = await fetch("/api/files", { method: "POST", body: formData })
      if (res.ok) {
        toast.success(`Folder "${newFolderName}" created successfully`)
        setNewFolderDialog(false)
        setNewFolderName("")
        fetchFiles()
      } else {
        const data = await res.json()
        const errorMsg = data.error || "Failed to create folder"
        toast.error(errorMsg, { duration: 5000 })
        console.error("[Files] Create folder error:", errorMsg)
      }
    } catch (err: any) {
      const msg = err?.message || "Network error. Please try again."
      toast.error(msg, { duration: 5000 })
      console.error("[Files] Create folder exception:", err)
    } finally {
      setCreatingFolder(false)
    }
  }, [newFolderName, currentFolder, fetchFiles, creatingFolder])

  // ── Navigate to folder ──
  const navigateToFolder = useCallback((file: FileItem) => {
    if (!isFolder(file.mimeType)) return
    setCurrentFolder(file.driveFileId)
    setBreadcrumbs((prev) => [...prev, { id: file.driveFileId, name: file.name }])
  }, [])

  // ── Navigate breadcrumb ──
  const navigateBreadcrumb = useCallback((index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1)
    setBreadcrumbs(newBreadcrumbs)
    setCurrentFolder(newBreadcrumbs[newBreadcrumbs.length - 1].id)
  }, [breadcrumbs])

  // ── Rename file ──
  const handleRename = useCallback(async () => {
    if (!renameDialog || !renameValue.trim()) return

    try {
      const res = await fetch(`/api/files/${renameDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      })

      if (res.ok) {
        toast.success("File renamed")
        setRenameDialog(null)
        fetchFiles()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to rename")
      }
    } catch {
      toast.error("Failed to rename")
    }
  }, [renameDialog, renameValue, fetchFiles])

  // ── Delete file ──
  const handleDelete = useCallback(async (permanent: boolean = false) => {
    if (!deleteDialog) return

    try {
      const res = await fetch(`/api/files/${deleteDialog.id}?permanent=${permanent}`, { method: "DELETE" })
      if (res.ok) {
        toast.success(permanent ? "File permanently deleted" : "File moved to trash")
        setDeleteDialog(null)
        fetchFiles()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to delete")
      }
    } catch {
      toast.error("Failed to delete")
    }
  }, [deleteDialog, fetchFiles])

  // ── Toggle star ──
  const handleToggleStar = useCallback(async (file: FileItem) => {
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !file.starred }),
      })

      if (res.ok) {
        fetchFiles()
      }
    } catch {
      toast.error("Failed to update star")
    }
  }, [fetchFiles])

  // ── Grant permission ──
  const handleGrantPermission = useCallback(async (targetUserId: string, accessLevel: string) => {
    if (!shareDialog) return

    try {
      const res = await fetch("/api/files/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: shareDialog.id,
          targetUserId,
          accessLevel,
        }),
      })

      if (res.ok) {
        toast.success("Permission granted")
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to grant permission")
      }
    } catch {
      toast.error("Failed to grant permission")
    }
  }, [shareDialog])

  // ── Download file ──
  const handleDownload = useCallback((file: FileItem) => {
    window.open(`/api/files/download/${file.id}`, "_blank")
  }, [])

  // ── Drag and drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }, [uploadFiles])

  // ── Storage bar ──
  const storageUsed = storage.usedBytes || 0
  const storageTotal = Math.max(storage.totalBytes || 2 * 1024 * 1024 * 1024 * 1024, storageUsed)
  const storagePercent = storageTotal > 0 ? Math.min((storageUsed / storageTotal) * 100, 100) : 0

  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

  return (
    <div className="min-h-full flex flex-col" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* ── Drop Zone Overlay ── */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex flex-col items-center justify-center gap-4"
          >
            <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-foreground">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">Files will be uploaded to {currentFolder ? "current folder" : "root"}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload Progress Bar ── */}
      <AnimatePresence>
        {uploadingFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 p-4 rounded-xl border bg-card/80 backdrop-blur-sm"
          >
            {uploadingFiles.map((uf, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{uf.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {uf.error ? (
                        <span className="text-destructive">{uf.error}</span>
                      ) : uf.progress >= 100 ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        `${uf.progress}%`
                      )}
                    </span>
                  </div>
                  <Progress value={uf.progress} className="h-1.5" />
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <HardDrive className="h-6 w-6" />
              Files
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cloud className="h-3.5 w-3.5" />
                <span>{formatStorageBytes(storageUsed)} used</span>
              </div>
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdminUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  fetch("/api/files/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  }).then(() => {
                    toast.success("Sync started")
                    fetchFiles()
                  })
                }
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Sync
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
            <Button size="sm" onClick={() => setNewFolderDialog(true)}>
              <FolderPlus className="h-4 w-4 mr-1" />
              New Folder
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </div>
        </div>

        {/* ── Breadcrumbs ── */}
        <div className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || "root"}>
              {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <button
                onClick={() => navigateBreadcrumb(idx)}
                className={cn(
                  "px-2 py-0.5 rounded-md hover:bg-accent transition-colors shrink-0",
                  idx === breadcrumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Filter */}
            <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
              {(["all", "starred", "trashed"] as FilterMode[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-all",
                    filter === f ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "all" ? "All" : f === "starred" ? "Starred" : "Trash"}
                </button>
              ))}
            </div>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  {sortAsc ? <SortAsc className="h-4 w-4 mr-1" /> : <SortDesc className="h-4 w-4 mr-1" />}
                  <span className="hidden sm:inline">
                    {sortField === "name" ? "Name" : sortField === "updatedAt" ? "Date" : sortField === "size" ? "Size" : "Type"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(["name", "updatedAt", "size", "mimeType"] as SortField[]).map((sf) => (
                  <DropdownMenuItem key={sf} onClick={() => { setSortField(sf); if (sortField === sf) setSortAsc(!sortAsc) }}>
                    {sf === "name" ? "Name" : sf === "updatedAt" ? "Date Modified" : sf === "size" ? "Size" : "Type"}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSortAsc(!sortAsc)}>
                  {sortAsc ? "Ascending" : "Descending"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View toggle */}
            <div className="flex items-center rounded-lg border bg-card p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── File Content ── */}
      {loading ? (
        <div className={cn("grid gap-3", viewMode === "grid" ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "grid-cols-1")}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border bg-card">
              <Skeleton className="h-12 w-12 rounded-lg mb-3 mx-auto" />
              <Skeleton className="h-4 w-3/4 mx-auto mb-2" />
              <Skeleton className="h-3 w-1/2 mx-auto" />
            </div>
          ))}
        </div>
      ) : sortedFiles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            {filter === "trashed" ? (
              <Trash2 className="h-10 w-10 text-muted-foreground" />
            ) : filter === "starred" ? (
              <Star className="h-10 w-10 text-muted-foreground" />
            ) : searchQuery ? (
              <Search className="h-10 w-10 text-muted-foreground" />
            ) : (
              <HardDrive className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {filter === "trashed" ? "Trash is empty" : filter === "starred" ? "No starred files" : searchQuery ? "No results found" : "No files yet"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {filter === "trashed" ? "Deleted files will appear here" : filter === "starred" ? "Star files to quickly access them later" : searchQuery ? `No files matching "${searchQuery}"` : "Upload files or create folders to get started"}
          </p>
        </motion.div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <AnimatePresence mode="popLayout">
            {sortedFiles.map((file) => {
              const Icon = getFileIcon(file.mimeType)
              const iconColor = getFileIconColor(file.mimeType)
              const isImageFile = file.mimeType.startsWith("image/") && file.thumbnailLink

              return (
                <ContextMenu key={file.id}>
                  <ContextMenuTrigger>
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => isFolder(file.mimeType) && navigateToFolder(file)}
                      className={cn(
                        "group relative p-4 rounded-xl border bg-card/80 backdrop-blur-sm cursor-pointer transition-all hover:shadow-md hover:border-primary/20",
                        file.trashed && "opacity-60"
                      )}
                    >
                      {file.starred && (
                        <Star className="absolute top-2 right-2 h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                      )}

                      {/* Thumbnail / Icon */}
                      <div className="h-16 w-full flex items-center justify-center mb-3 rounded-lg bg-muted/30 overflow-hidden">
                        {isImageFile ? (
                          <img
                            src={file.thumbnailLink!}
                            alt={file.name}
                            className="h-full w-full object-cover rounded-lg"
                          />
                        ) : (
                          <Icon className={cn("h-10 w-10", iconColor)} />
                        )}
                      </div>

                      {/* Name */}
                      <p className="text-sm font-medium truncate text-center" title={file.name}>
                        {file.name}
                      </p>

                      {/* Meta */}
                      <p className="text-xs text-muted-foreground text-center mt-0.5">
                        {isFolder(file.mimeType) ? "Folder" : formatFileSize(file.size)}
                      </p>
                      {!isFolder(file.mimeType) && (
                        <p className="text-xs text-muted-foreground text-center">
                          {formatDate(file.updatedAt)}
                        </p>
                      )}

                      {/* Hover actions */}
                      <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="h-7 w-7 rounded-md bg-background/80 backdrop-blur-sm border shadow-sm flex items-center justify-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {!isFolder(file.mimeType) && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file) }}>
                                <Download className="h-4 w-4 mr-2" /> Download
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameDialog(file); setRenameValue(file.name) }}>
                              <Pencil className="h-4 w-4 mr-2" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleStar(file) }}>
                              {file.starred ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                              {file.starred ? "Unstar" : "Star"}
                            </DropdownMenuItem>
                            {isAdminUser && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareDialog(file) }}>
                                <Share2 className="h-4 w-4 mr-2" /> Share
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); setDeleteDialog(file) }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </motion.div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => isFolder(file.mimeType) ? navigateToFolder(file) : handleDownload(file)}>
                      {isFolder(file.mimeType) ? "Open" : "Download"}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { setRenameDialog(file); setRenameValue(file.name) }}>
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleToggleStar(file)}>
                      {file.starred ? "Unstar" : "Star"}
                    </ContextMenuItem>
                    {isAdminUser && (
                      <ContextMenuItem onClick={() => setShareDialog(file)}>Share</ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive" onClick={() => setDeleteDialog(file)}>
                      {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* List View */
        <div className="rounded-xl border bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr,100px,100px,140px,60px] px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/30">
            <span>Name</span>
            <span>Size</span>
            <span>Type</span>
            <span>Modified</span>
            <span></span>
          </div>
          <ScrollArea className="max-h-[calc(100vh-360px)]">
            <AnimatePresence mode="popLayout">
              {sortedFiles.map((file) => {
                const Icon = getFileIcon(file.mimeType)
                const iconColor = getFileIconColor(file.mimeType)
                return (
                  <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                      <motion.div
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => isFolder(file.mimeType) && navigateToFolder(file)}
                        className={cn(
                          "grid grid-cols-1 md:grid-cols-[1fr,100px,100px,140px,60px] items-center px-4 py-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors group",
                          file.trashed && "opacity-60"
                        )}
                      >
                        {/* Name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden">
                              {isFolder(file.mimeType) ? "Folder" : formatFileSize(file.size)} · {formatDate(file.updatedAt)}
                            </p>
                          </div>
                          {file.starred && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0 ml-1" />}
                        </div>

                        {/* Size */}
                        <span className="text-sm text-muted-foreground hidden md:block">
                          {isFolder(file.mimeType) ? "—" : formatFileSize(file.size)}
                        </span>

                        {/* Type */}
                        <span className="text-sm text-muted-foreground hidden md:block truncate">
                          {file.mimeType.split("/").pop()}
                        </span>

                        {/* Modified */}
                        <span className="text-sm text-muted-foreground hidden md:block">
                          {formatDate(file.updatedAt)}
                        </span>

                        {/* Actions */}
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {!isFolder(file.mimeType) && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownload(file) }}>
                                  <Download className="h-4 w-4 mr-2" /> Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenameDialog(file); setRenameValue(file.name) }}>
                                <Pencil className="h-4 w-4 mr-2" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleStar(file) }}>
                                {file.starred ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                                {file.starred ? "Unstar" : "Star"}
                              </DropdownMenuItem>
                              {isAdminUser && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShareDialog(file) }}>
                                  <Share2 className="h-4 w-4 mr-2" /> Share
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDialog(file) }}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </motion.div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => isFolder(file.mimeType) ? navigateToFolder(file) : handleDownload(file)}>
                        {isFolder(file.mimeType) ? "Open" : "Download"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => { setRenameDialog(file); setRenameValue(file.name) }}>Rename</ContextMenuItem>
                      <ContextMenuItem onClick={() => handleToggleStar(file)}>{file.starred ? "Unstar" : "Star"}</ContextMenuItem>
                      {isAdminUser && <ContextMenuItem onClick={() => setShareDialog(file)}>Share</ContextMenuItem>}
                      <ContextMenuSeparator />
                      <ContextMenuItem className="text-destructive" onClick={() => setDeleteDialog(file)}>
                        {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </AnimatePresence>
          </ScrollArea>
        </div>
      )}

      {/* ── Rename Dialog ── */}
      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Enter a new name for this item.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Folder Dialog ── */}
      <Dialog open={newFolderDialog} onOpenChange={(open) => { if (!open) { setNewFolderDialog(false); setNewFolderName("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              New Folder
            </DialogTitle>
            <DialogDescription>
              Create a new folder in {currentFolder ? "the current directory" : "root"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              placeholder="Enter folder name"
              autoFocus
              disabled={creatingFolder}
            />
            <p className="text-xs text-muted-foreground">
              Folder will be created in Google Drive and synced automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialog(false)} disabled={creatingFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}>
              {creatingFolder ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4 mr-1" />
                  Create Folder
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
            </DialogTitle>
            <DialogDescription>
              {filter === "trashed"
                ? `This will permanently delete "${deleteDialog?.name}". This action cannot be undone.`
                : `"${deleteDialog?.name}" will be moved to trash. You can restore it later.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDelete(filter === "trashed")}>
              {filter === "trashed" ? "Delete Forever" : "Move to Trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Share Dialog ── */}
      <Dialog open={!!shareDialog} onOpenChange={() => setShareDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share
            </DialogTitle>
            <DialogDescription>
              Manage access for &quot;{shareDialog?.name}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current permissions */}
            <div className="space-y-2">
              <p className="text-sm font-medium">People with access</p>
              <SharePermissionsList fileId={shareDialog?.id || ""} onUpdate={fetchFiles} />
            </div>

            <Separator />

            {/* Add user */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Add people</p>
              <div className="flex gap-2">
                <Select onValueChange={(val) => handleGrantPermission(val, "VIEW")}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers
                      .filter((m) => m.id !== userId)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <span>{m.name}</span>
                            <Badge variant="secondary" className="text-xs">{m.role}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Added with Viewer access. You can change their role in the list above.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShareDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Share Permissions List Component ──
function SharePermissionsList({ fileId, onUpdate }: { fileId: string; onUpdate: () => void }) {
  const [permissions, setPermissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/files/permissions?fileId=${fileId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setPermissions(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fileId])

  if (loading) {
    return <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
  }

  if (permissions.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">Only you have access</p>
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {permissions.map((perm: any) => (
        <div key={perm.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {perm.user?.name?.charAt(0) || "?"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{perm.user?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground truncate">{perm.user?.email || ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={perm.accessLevel}
              onValueChange={(val) => {
                fetch("/api/files/permissions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fileId, targetUserId: perm.userId, accessLevel: val }),
                }).then(() => onUpdate())
              }}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIEW">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> View</span>
                </SelectItem>
                <SelectItem value="EDIT">
                  <span className="flex items-center gap-1"><Pencil className="h-3 w-3" /> Edit</span>
                </SelectItem>
                <SelectItem value="ADMIN">
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Admin</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => {
                fetch("/api/files/permissions", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fileId, targetUserId: perm.userId }),
                }).then(() => onUpdate())
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
