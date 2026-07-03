"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plus, Search, Trash2, Eye, FileText, BookOpen, Clock, Users,
  Loader2, Filter, Sparkles, AlertCircle, CheckCircle2, XCircle,
  RefreshCw, FileUp, X, ArrowUpDown, ChevronRight, ClipboardList,
  Zap, Info,
} from "lucide-react"
import { cn, safeDateStr, safeArray } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageHeader } from "@/components/page-header"

const MAX_BRIEF_CHARS = 50000

interface TrainingDocument {
  id: string; topic: string; content: string; summary: string | null
  imageUrl: string | null; imageUrls: string; status: string
  generatedBy: string; createdAt: string; updatedAt: string
  generator: { id: string; name: string }
  _count: { tests: number; assignments: number }; tests?: TrainingTest[]
}
interface TrainingTest {
  id: string; documentId: string; level: string; timeLimit: number
  createdAt: string; generator: { id: string; name: string }
  _count: { assignments: number }
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  DRAFT: { label: "Draft", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: AlertCircle },
  GENERATING: { label: "Generating", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Loader2 },
  READY: { label: "Ready", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  GENERATION_FAILED: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  ARCHIVED: { label: "Archived", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: XCircle },
}

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc"

export default function TrainingLibraryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<TrainingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [sortBy, setSortBy] = useState<SortOption>("newest")
  const [createOpen, setCreateOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [newTopic, setNewTopic] = useState("")
  const [newBrief, setNewBrief] = useState("")
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentText, setAttachmentText] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const briefTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setNewTopic(""); setNewBrief(""); setAttachmentFile(null)
    setAttachmentText(null); setUploadError(null); setWizardStep(1)
  }, [])

  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter)
      const res = await fetch(`/api/training/documents?${params.toString()}`, { credentials: "include" })
      if (res.ok) { const data = await res.json(); setDocuments(safeArray<TrainingDocument>(data.documents)) }
    } catch (err) { console.error("[training] Error:", err) } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => {
    if (status === "loading") return
    if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user?.role || "")) { router.push("/dashboard"); return }
    fetchDocuments()
  }, [session, status, router, fetchDocuments])

  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const pollCountRef = useRef(0);
  const MAX_POLLS = 60;

  useEffect(() => {
    const hasPending = documentsRef.current.some(d => d.status === "GENERATING" || d.status === "PENDING");
    if (!hasPending) { pollCountRef.current = 0; return; }
    if (pollCountRef.current >= MAX_POLLS) return;
    pollCountRef.current += 1;
    const interval = setInterval(() => { fetchDocuments() }, 5000);
    return () => clearInterval(interval);
  }, [fetchDocuments]);

  const handleCreate = async () => {
    if (!newTopic.trim()) return
    setGenerating(true); setCreateOpen(false)
    try {
      const body: Record<string, string> = { topic: newTopic.trim() }
      if (newBrief.trim()) body.brief = newBrief.trim()
      if (attachmentText) body.attachmentText = attachmentText
      const res = await fetch("/api/training/documents", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) })
      if (res.ok) { toast.success("Document creation started", { description: "AI is generating content in the background." }); resetForm(); fetchDocuments() }
      else { const data = await res.json(); toast.error(data.error || "Failed to create document", { duration: 8000 }) }
    } catch { toast.error("Network error", { duration: 8000 }) } finally { setGenerating(false) }
  }

  const handleFileUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setUploadError("File must be less than 5MB"); return }
    if (![".pdf",".txt",".md",".docx"].some(ext => file.name.toLowerCase().endsWith(ext))) { setUploadError("Only PDF, TXT, MD, and DOCX files are allowed"); return }
    setAttachmentFile(file); setUploading(true); setUploadError(null)
    try {
      const formData = new FormData(); formData.append("file", file)
      const res = await fetch("/api/training/upload", { method: "POST", credentials: "include", body: formData })
      if (res.ok) { const data = await res.json(); setAttachmentText(data.text); toast.success(`Processed: ${data.fileName} (${(data.fileSize / 1024).toFixed(1)} KB)`) }
      else { const data = await res.json(); setUploadError(data.error || "Failed to process file"); setAttachmentFile(null); setAttachmentText(null) }
    } catch { setUploadError("Failed to upload file"); setAttachmentFile(null); setAttachmentText(null) } finally { setUploading(false) }
  }

  const handleRetry = async (doc: TrainingDocument) => {
    setGenerating(true); toast.info(`Retrying "${doc.topic}"...`)
    try {
      const res = await fetch("/api/training/documents", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ topic: doc.topic }) })
      if (res.ok) { await fetch(`/api/training/documents/${doc.id}`, { method: "DELETE", credentials: "include" }); toast.success("Retry started"); fetchDocuments() }
      else { const data = await res.json(); toast.error(data.error || "Retry failed", { duration: 8000 }) }
    } catch { toast.error("Network error", { duration: 8000 }) } finally { setGenerating(false) }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const res = await fetch(`/api/training/documents/${deleteId}`, { method: "DELETE", credentials: "include" })
      if (res.ok) { toast.success("Document deleted"); setDocuments(prev => prev.filter(d => d.id !== deleteId)) }
      else toast.error("Failed to delete")
    } catch { toast.error("Failed to delete") } finally { setDeleteId(null) }
  }

  const sortedDocuments = useMemo(() => [...documents].sort((a, b) => {
    switch (sortBy) {
      case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      case "name-asc": return a.topic.localeCompare(b.topic)
      case "name-desc": return b.topic.localeCompare(a.topic)
      default: return 0
    }
  }), [documents, sortBy])

  if (status === "loading" || loading) {
    return (<div className="space-y-6">
      <div className="flex items-center justify-between"><div className="space-y-2"><div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" /><div className="h-4 w-72 bg-muted/50 animate-pulse rounded" /></div><div className="h-10 w-48 bg-muted/50 animate-pulse rounded-lg" /></div>
      <div className="grid gap-4 md:grid-cols-4">{[1,2,3,4].map(i => <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />)}</div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-56 rounded-xl bg-muted/50 animate-pulse" />)}</div>
    </div>)
  }

  const { totalDocs, readyDocs, generatingDocs, totalAssignments } = useMemo(() => ({
    totalDocs: documents.length,
    readyDocs: documents.filter(d => d.status === "READY").length,
    generatingDocs: documents.filter(d => d.status === "GENERATING" || d.status === "DRAFT").length,
    totalAssignments: documents.reduce((sum, d) => sum + d._count.assignments, 0),
  }), [documents])

  const briefCharPercent = (newBrief.length / MAX_BRIEF_CHARS) * 100
  const briefCharColor = briefCharPercent > 90 ? "text-red-500" : briefCharPercent > 70 ? "text-amber-500" : "text-muted-foreground"

  return (
    <div className="space-y-6">
      {generating && (<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"><Card className="w-96 p-8 text-center"><CardContent className="flex flex-col items-center gap-4 pt-6"><div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center"><Sparkles className="h-8 w-8 text-primary animate-pulse" /></div><div><h3 className="text-lg font-semibold">Generating Training</h3><p className="text-sm text-muted-foreground mt-1">AI is creating your training document...</p></div><Loader2 className="h-6 w-6 animate-spin text-primary" /></CardContent></Card></div>)}

      <PageHeader title="Training Library" description="Create and manage AI-generated training materials">
        <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetForm(); setCreateOpen(open) }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white" disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Generate Training
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[580px] max-h-[92vh] flex flex-col overflow-hidden p-0">
            <div className="px-6 pt-6 pb-0 shrink-0">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center"><Sparkles className="h-4 w-4 text-white" /></div>Generate Training with AI</DialogTitle>
                <DialogDescription className="sr-only">Create a new training document</DialogDescription>
              </DialogHeader>
              {/* Wizard Steps */}
              <div className="flex items-center gap-2 mt-4">
                {[{ num: 1, label: "Topic & Brief" }, { num: 2, label: "Attachments & Generate" }].map((step, i) => (
                  <div key={step.num} className="flex items-center gap-2 flex-1">
                    <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors shrink-0", wizardStep >= step.num ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground")}>{wizardStep > step.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.num}</div>
                    <span className={cn("text-xs font-medium truncate", wizardStep >= step.num ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                    {i < 1 && <div className={cn("flex-1 h-px mx-1", wizardStep > step.num ? "bg-orange-500" : "bg-border")} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {wizardStep === 1 && (<div className="space-y-5">
                {/* Topic */}
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold flex items-center gap-1.5">Topic <span className="text-red-500">*</span></label>
                  <Input placeholder="e.g., React Hooks, SEO Basics, Project Management..." value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newTopic.trim()) { e.preventDefault(); setWizardStep(2) } }} disabled={generating} className="h-11 text-base" autoFocus />
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> This will be used as the document title.</p>
                </div>

                {/* Brief */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold flex items-center gap-1.5">Brief / Requirements <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
                    {newBrief.length > 0 && (
                      <span className={cn("text-xs tabular-nums font-medium", briefCharColor)}>
                        {newBrief.length.toLocaleString()} / {(MAX_BRIEF_CHARS).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Scrollable brief textarea — native textarea with explicit fixed height & overflow */}
                  <div className="relative">
                    <textarea
                      ref={briefTextareaRef}
                      placeholder={"Add detailed instructions, specific areas to focus on, target audience, depth level, etc.\n\nAI will use this to generate more targeted training content.\n\nYou can paste large amounts of text here — this field is fully scrollable."}
                      value={newBrief}
                      onChange={e => {
                        const val = e.target.value
                        if (val.length <= MAX_BRIEF_CHARS) setNewBrief(val)
                      }}
                      disabled={generating}
                      rows={8}
                      className={cn(
                        "w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-sm shadow-xs",
                        "placeholder:text-muted-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        "leading-relaxed resize-none",
                        "h-[200px] max-h-[300px] overflow-y-auto"
                      )}
                    />
                    {/* Character limit progress bar */}
                    {newBrief.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-md overflow-hidden bg-muted">
                        <div
                          className={cn(
                            "h-full transition-all duration-200 rounded-full",
                            briefCharPercent > 90 ? "bg-red-500" : briefCharPercent > 70 ? "bg-amber-500" : "bg-orange-500"
                          )}
                          style={{ width: `${Math.min(briefCharPercent, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {newBrief.length > MAX_BRIEF_CHARS * 0.9 && newBrief.length <= MAX_BRIEF_CHARS && (
                    <p className="text-xs text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Approaching character limit.</p>
                  )}
                  {newBrief.length === MAX_BRIEF_CHARS && (
                    <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Character limit reached.</p>
                  )}

                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Provide context to get more focused and relevant training material. You can paste up to {(MAX_BRIEF_CHARS / 1000).toFixed(0)}K characters.</p>
                </div>
              </div>)}

              {wizardStep === 2 && (<div className="space-y-5">
                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Training Summary</p>
                  <p className="text-sm font-semibold">{newTopic}</p>
                  {newBrief && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground line-clamp-3">{newBrief}</p>
                      {newBrief.length > 200 && (
                        <button type="button" className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium" onClick={() => setWizardStep(1)}>
                          View/edit full brief ({newBrief.length.toLocaleString()} chars)
                        </button>
                      )}
                    </div>
                  )}
                  <button type="button" className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium" onClick={() => setWizardStep(1)}>Edit topic &amp; brief</button>
                </div>

                {/* File Upload */}
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold flex items-center gap-1.5">Reference Document <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
                  {attachmentFile && attachmentText ? (
                    <div className="flex items-center gap-3 p-3.5 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0"><FileText className="h-4 w-4 text-green-600 dark:text-green-400" /></div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-green-700 dark:text-green-300 truncate">{attachmentFile.name}</p><p className="text-xs text-green-600 dark:text-green-400">{(attachmentFile.size / 1024).toFixed(1)} KB — Ready</p></div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 dark:text-green-400 hover:text-red-500 shrink-0" onClick={() => { setAttachmentFile(null); setAttachmentText(null); setUploadError(null); if (fileInputRef.current) fileInputRef.current.value = "" }} disabled={generating}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <div className={cn("relative flex items-center justify-center gap-3 p-6 border-2 border-dashed rounded-xl transition-all cursor-pointer group", uploading ? "border-blue-300 bg-blue-50/50 dark:bg-blue-900/20" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30")} onClick={() => !uploading && fileInputRef.current?.click()} onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files?.[0]; if (file) handleFileUpload(file) }}>
                      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx" onChange={e => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = "" }} disabled={uploading || generating} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="h-10 w-10 rounded-full bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0">{uploading ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> : <FileUp className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />}</div>
                      <div className="text-center"><p className="text-sm font-medium text-foreground/80">{uploading ? "Processing document..." : "Drop a file here or click to upload"}</p><p className="text-xs text-muted-foreground mt-0.5">PDF, DOCX, TXT, or MD (max 5MB)</p></div>
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{uploadError}</p>}
                </div>

                {/* Tips */}
                <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Tips for better results</p>
                  <ul className="text-xs text-blue-600/80 dark:text-blue-400/80 space-y-1 ml-5 list-disc"><li>Be specific about target audience</li><li>Include depth level (basic, intermediate, advanced)</li><li>Upload a reference document for AI</li><li>Longer briefs with clear instructions produce better results</li></ul>
                </div>
              </div>)}
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 bg-background shrink-0">
              <div className="flex items-center justify-between gap-3">
                {wizardStep === 1 ? <Button variant="ghost" onClick={() => { resetForm(); setCreateOpen(false) }}>Cancel</Button> : <Button variant="ghost" onClick={() => setWizardStep(1)}>Back</Button>}
                {wizardStep === 1 ? <Button onClick={() => setWizardStep(2)} disabled={!newTopic.trim()} className="gap-1.5">Next: Attachments <ChevronRight className="h-4 w-4" /></Button> : <Button onClick={handleCreate} disabled={!newTopic.trim() || generating} className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white gap-1.5 min-w-[160px]">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate with AI</Button>}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { icon: FileText, label: "Total Documents", value: totalDocs, bg: "bg-primary/10", iconColor: "text-primary" },
          { icon: CheckCircle2, label: "Ready to Assign", value: readyDocs, bg: "bg-green-100 dark:bg-green-900/30", iconColor: "text-green-600 dark:text-green-400" },
          { icon: generatingDocs > 0 ? Loader2 : Zap, label: generatingDocs > 0 ? "Generating..." : "In Progress", value: generatingDocs, bg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400" },
          { icon: Users, label: "Total Assignments", value: totalAssignments, bg: "bg-orange-100 dark:bg-orange-900/30", iconColor: "text-orange-600 dark:text-orange-400" },
        ].map(stat => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
              <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", stat.bg)}><stat.icon className={cn("h-5 w-5", stat.iconColor, stat.label === "Generating..." && "animate-spin")} /></div>
              <div className="min-w-0"><p className="text-xl sm:text-2xl font-bold tabular-nums">{stat.value}</p><p className="text-xs text-muted-foreground truncate">{stat.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by topic..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-[160px]"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="All Status" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Status</SelectItem><SelectItem value="READY">Ready</SelectItem><SelectItem value="GENERATING">Generating</SelectItem><SelectItem value="GENERATION_FAILED">Failed</SelectItem><SelectItem value="DRAFT">Draft</SelectItem><SelectItem value="ARCHIVED">Archived</SelectItem></SelectContent></Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as SortOption)}><SelectTrigger className="w-full sm:w-[160px]"><ArrowUpDown className="h-4 w-4 mr-2" /><SelectValue placeholder="Sort by" /></SelectTrigger><SelectContent><SelectItem value="newest">Newest First</SelectItem><SelectItem value="oldest">Oldest First</SelectItem><SelectItem value="name-asc">Name A-Z</SelectItem><SelectItem value="name-desc">Name Z-A</SelectItem></SelectContent></Select>
      </div>

      {/* Documents */}
      {sortedDocuments.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center"><div className="flex flex-col items-center gap-4"><div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center"><BookOpen className="h-8 w-8 text-muted-foreground" /></div><div><h3 className="text-lg font-semibold">No Training Documents</h3><p className="text-sm text-muted-foreground mt-1">{search || (statusFilter !== "ALL") ? "No documents match your filters." : "Create your first AI-generated training document."}</p></div>{!search && statusFilter === "ALL" && <Button onClick={() => setCreateOpen(true)} className="gap-2"><Sparkles className="h-4 w-4" /> Generate First Training</Button>}</div></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedDocuments.map(doc => {
            const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.DRAFT
            const isGenerating = doc.status === "GENERATING" || doc.status === "DRAFT"
            return (
              <Card key={doc.id} className={cn("group hover:shadow-lg transition-all duration-200 cursor-pointer border-border relative overflow-hidden", isGenerating && "ring-2 ring-blue-200 dark:ring-blue-800/50")} onClick={() => router.push(`/dashboard/training/${doc.id}`)}>
                {isGenerating && <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-blue-50/30 to-transparent dark:via-blue-900/10" />}
                {doc.imageUrl && (<div className="h-32 sm:h-36 w-full overflow-hidden rounded-t-xl relative z-[1]"><img src={doc.imageUrl} alt={doc.topic} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" /><div className="absolute top-2 right-2"><Badge className={cn("text-xs shadow-sm", statusCfg.className)}><statusCfg.icon className={cn("h-3 w-3 mr-1", doc.status === "GENERATING" && "animate-spin")} />{statusCfg.label}</Badge></div></div>)}
                <CardHeader className="pb-2 relative z-[1]"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base font-semibold line-clamp-1 flex-1">{doc.topic}</CardTitle>{!doc.imageUrl && <Badge className={cn("text-xs shrink-0 shadow-sm", statusCfg.className)}><statusCfg.icon className={cn("h-3 w-3 mr-1", doc.status === "GENERATING" && "animate-spin")} />{statusCfg.label}</Badge>}</div>{doc.summary && <CardDescription className="text-xs line-clamp-2 mt-0.5">{doc.summary}</CardDescription>}</CardHeader>
                <CardContent className="pt-0 relative z-[1]">
                  <div className="flex items-center justify-between text-xs text-muted-foreground"><div className="flex items-center gap-2.5"><span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{doc._count.tests} test{doc._count.tests !== 1 ? "s" : ""}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{doc._count.assignments}</span></div><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{safeDateStr(new Date(doc.createdAt))}</span></div>
                  <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="flex-1 gap-1 h-8 text-xs" onClick={() => router.push(`/dashboard/training/${doc.id}`)}><Eye className="h-3 w-3" /> View</Button>
                    {doc.status === "GENERATION_FAILED" && <Button variant="outline" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 gap-1" onClick={() => handleRetry(doc)}><RefreshCw className="h-3 w-3" /> Retry</Button>}
                    <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setDeleteId(doc.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Training Document</AlertDialogTitle><AlertDialogDescription>This will permanently delete this document, all its tests, and assignments.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}
