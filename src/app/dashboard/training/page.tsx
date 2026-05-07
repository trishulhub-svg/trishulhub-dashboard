"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  GraduationCap,
  Plus,
  Search,
  Trash2,
  Eye,
  FileText,
  BookOpen,
  Clock,
  Users,
  Loader2,
  Filter,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { cn, safeDateStr, safeArray } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

interface TrainingDocument {
  id: string
  topic: string
  content: string
  summary: string | null
  imageUrl: string | null
  imageUrls: string
  status: string
  generatedBy: string
  createdAt: string
  updatedAt: string
  generator: { id: string; name: string }
  _count: { tests: number; assignments: number }
  tests?: TrainingTest[]
}

interface TrainingTest {
  id: string
  documentId: string
  level: string
  timeLimit: number
  createdAt: string
  generator: { id: string; name: string }
  _count: { assignments: number }
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  DRAFT: { label: "Draft", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: AlertCircle },
  READY: { label: "Ready", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  ARCHIVED: { label: "Archived", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: XCircle },
}

const LEVEL_CONFIG: Record<string, { label: string; className: string }> = {
  LOW: { label: "Easy", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  HIGH: { label: "Hard", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

export default function TrainingLibraryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<TrainingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newTopic, setNewTopic] = useState("")

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter)
      const res = await fetch(`/api/training/documents?${params.toString()}`, { credentials: "include" })
      if (res.ok) setDocuments(safeArray<TrainingDocument>(await res.json()))
    } catch (err) {
      console.error("Failed to fetch documents:", err)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    if (status === "loading") return
    if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user?.role || "")) {
      router.push("/dashboard")
      return
    }
    fetchDocuments()
  }, [session, status, router, fetchDocuments])

  const handleCreate = async () => {
    if (!newTopic.trim()) return
    setGenerating(true)
    setCreateOpen(false)
    toast.info("Generating training document with AI...", { description: "This may take a moment" })
    try {
      const res = await fetch("/api/training/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ topic: newTopic.trim() }),
      })
      if (res.ok) {
        toast.success("Training document generated successfully!")
        setNewTopic("")
        fetchDocuments()
      } else {
        const data = await res.json()
        const errMsg = data.error || "Failed to generate document"
        toast.error(errMsg, { duration: 8000, description: `Status: ${res.status}` })
      }
    } catch (_e) {
      toast.error("Network error — check your connection", { duration: 8000 })
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/training/documents/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success("Document deleted")
        setDocuments((prev) => prev.filter((d) => d.id !== deleteId))
      } else {
        toast.error("Failed to delete document")
      }
    } catch (_e) {
      toast.error("Failed to delete document")
    } finally {
      setDeleteId(null)
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-muted/50 animate-pulse rounded" />
          </div>
          <div className="h-10 w-48 bg-muted/50 animate-pulse rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const totalDocs = documents.length
  const readyDocs = documents.filter((d) => d.status === "READY").length
  const totalAssignments = documents.reduce((sum, d) => sum + d._count.assignments, 0)

  return (
    <div className="space-y-6">
      {/* Generating overlay */}
      {generating && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <Card className="w-96 p-8 text-center">
            <CardContent className="flex flex-col items-center gap-4 pt-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Generating Training</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI is creating your training document and illustrations...
                </p>
              </div>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            Training Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage AI-generated training materials
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Generate Training
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Training</DialogTitle>
              <DialogDescription>
                Enter a topic and AI will generate a comprehensive training document with illustrations.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="e.g., React Hooks, SEO Basics, Project Management..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newTopic.trim() && handleCreate()}
              />
              <p className="text-xs text-muted-foreground mt-2">
                AI will generate a complete training document with sections, examples, and illustrations.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newTopic.trim() || generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate with AI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{totalDocs}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total Documents</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{readyDocs}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Ready to Assign</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold">{totalAssignments}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Total Assignments</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="READY">Ready</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Documents Grid */}
      {documents.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Training Documents</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search || (statusFilter && statusFilter !== "ALL") ? "No documents match your filters. Try adjusting them." : "Create your first AI-generated training document to get started."}
              </p>
            </div>
            {!search && (!statusFilter || statusFilter === "ALL") && (
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Generate First Training
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT
            return (
              <Card
                key={doc.id}
                className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-border"
                onClick={() => router.push(`/dashboard/training/${doc.id}`)}
              >
                {doc.imageUrl && (
                  <div className="h-32 sm:h-36 w-full overflow-hidden rounded-t-xl relative">
                    <img
                      src={doc.imageUrl}
                      alt={doc.topic}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 right-2">
                      <Badge className={cn("text-xs", statusCfg.className)}>
                        <statusCfg.icon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </div>
                )}
                <CardHeader className="pb-2">
                  {!doc.imageUrl && (
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base font-semibold line-clamp-1">{doc.topic}</CardTitle>
                      <Badge className={cn("text-xs shrink-0 ml-2", statusCfg.className)}>
                        <statusCfg.icon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  )}
                  {doc.imageUrl && <CardTitle className="text-base font-semibold line-clamp-1">{doc.topic}</CardTitle>}
                  {doc.summary && (
                    <CardDescription className="text-xs line-clamp-2">{doc.summary}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {doc._count.tests} test{doc._count.tests !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {doc._count.assignments}
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {safeDateStr(new Date(doc.createdAt))}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1 h-8 text-xs"
                      onClick={() => router.push(`/dashboard/training/${doc.id}`)}
                    >
                      <Eye className="h-3 w-3" /> View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteId(doc.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Document</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this document, all its tests, and any associated assignments. This action cannot be undone.
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
  )
}
