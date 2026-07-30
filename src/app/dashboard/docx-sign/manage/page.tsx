"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  FilePenLine, Loader2, Plus, Download, RefreshCw, Users, Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, safeText } from "@/lib/utils"

type TeamUser = { id: string; name: string; email: string; isActive?: boolean }
type Assignment = {
  id: string
  userId: string
  status: string
  signedAt: string | null
  resignNote: string | null
  createdAt: string
  user: { id: string; name: string; email: string }
  assignedBy: { id: string; name: string }
}
type DocumentRow = {
  id: string
  title: string
  fileName: string
  createdAt: string
  uploadedBy: { id: string; name: string }
  assignments: Assignment[]
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  SIGNED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  RESIGN_REQUESTED: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30",
}

export default function DocxSignManagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = session?.user?.role
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [team, setTeam] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [openUpload, setOpenUpload] = useState(false)
  const [title, setTitle] = useState("")
  const [fileName, setFileName] = useState("")
  const [fileData, setFileData] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [resignId, setResignId] = useState<string | null>(null)
  const [resignNote, setResignNote] = useState("")
  const [resigning, setResigning] = useState(false)

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated") {
      router.replace("/login")
      return
    }
    if (!isAdmin) router.replace("/dashboard/docx-sign/my")
  }, [status, isAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dRes, tRes] = await Promise.all([
        fetch("/api/docx-sign/documents", { credentials: "include", cache: "no-store" }),
        fetch("/api/team?type=users", { credentials: "include", cache: "no-store" }),
      ])
      if (dRes.ok) {
        const j = await dRes.json()
        setDocs(Array.isArray(j.documents) ? j.documents : [])
      }
      if (tRes.ok) {
        const j = await tRes.json()
        const users = Array.isArray(j) ? j : j.users || j.team || []
        setTeam(
          users
            .filter((u: TeamUser) => u?.id && u.isActive !== false)
            .map((u: TeamUser) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              isActive: u.isActive,
            }))
        )
      }
    } catch {
      toast.error("Failed to load Docx Sign")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const onFile = (file: File | null) => {
    if (!file) return
    if (file.type !== "application/pdf") {
      toast.error("PDF only")
      return
    }
    if (file.size > 3.8 * 1024 * 1024) {
      toast.error("PDF must be under ~3.8 MB")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setFileData(result)
      setFileName(file.name)
      if (!title.trim()) setTitle(file.name.replace(/\.pdf$/i, ""))
    }
    reader.readAsDataURL(file)
  }

  const toggleUser = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const submitUpload = async () => {
    if (!title.trim() || !fileData || selected.length === 0) {
      toast.error("Title, PDF, and at least one user are required")
      return
    }
    setUploading(true)
    try {
      const res = await fetch("/api/docx-sign/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          fileName: fileName || "contract.pdf",
          fileData,
          userIds: selected,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Upload failed")
        return
      }
      toast.success(`Uploaded and assigned to ${j?.assigned || selected.length} user(s)`)
      setOpenUpload(false)
      setTitle("")
      setFileName("")
      setFileData("")
      setSelected([])
      void load()
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const requestResign = async () => {
    if (!resignId) return
    setResigning(true)
    try {
      const res = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resignId,
          action: "request_resign",
          resignNote: resignNote.trim() || null,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Failed")
        return
      }
      toast.success("Re-sign requested")
      setResignId(null)
      setResignNote("")
      void load()
    } catch {
      toast.error("Failed")
    } finally {
      setResigning(false)
    }
  }

  const stats = useMemo(() => {
    let pending = 0
    let signed = 0
    let resign = 0
    for (const d of docs) {
      for (const a of d.assignments) {
        if (a.status === "SIGNED") signed++
        else if (a.status === "RESIGN_REQUESTED") resign++
        else pending++
      }
    }
    return { pending, signed, resign }
  }, [docs])

  if (status === "loading" || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-1 sm:px-0">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-emerald-500/[0.06] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 mb-1">
              <FilePenLine className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Contracts</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Docx Sign</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Upload a PDF contract, assign users separately, track signatures, and download signed copies.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" className="h-9" onClick={() => setOpenUpload(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Upload & assign
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Pending", value: stats.pending },
            { label: "Signed", value: stats.signed },
            { label: "Re-sign", value: stats.resign },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border bg-background/70 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">No contracts yet</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a PDF and select users to start e-signing.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc) => (
            <div key={doc.id} className="rounded-2xl border bg-card/60 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold truncate">{safeText(doc.title)}</h2>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {safeText(doc.fileName)} · by {safeText(doc.uploadedBy?.name)} ·{" "}
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit text-[10px]">
                  <Users className="h-3 w-3 mr-1" />
                  {doc.assignments.length} assignee{doc.assignments.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="divide-y divide-border/50">
                {doc.assignments.map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{safeText(a.user?.name)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {safeText(a.user?.email)} · assigned by {safeText(a.assignedBy?.name)}
                        {a.signedAt
                          ? ` · signed ${new Date(a.signedAt).toLocaleString()}`
                          : ""}
                      </p>
                      {a.resignNote && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                          Re-sign note: {a.resignNote}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[a.status] || "")}>
                        {a.status.replace("_", " ")}
                      </Badge>
                      {a.status === "SIGNED" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              window.open(
                                `/api/docx-sign/assignments/${a.id}/file?kind=signed&download=1`,
                                "_blank"
                              )
                            }}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Signed PDF
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setResignId(a.id)
                              setResignNote("")
                            }}
                          >
                            Request re-sign
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={openUpload} onOpenChange={setOpenUpload}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload & assign contract</DialogTitle>
            <DialogDescription className="text-xs">
              PDF only. Each selected user gets their own signing assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" placeholder="Employment contract…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PDF file</Label>
              <Input
                type="file"
                accept="application/pdf"
                className="h-9 text-sm"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
              {fileName && <p className="text-[11px] text-muted-foreground">{fileName}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign to users *</Label>
              <ScrollArea className="h-40 rounded-lg border p-2">
                <div className="flex flex-wrap gap-1.5">
                  {team.map((u) => {
                    const on = selected.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          "text-[10px] px-2 py-1 rounded-full border transition-colors",
                          on
                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-300"
                            : "bg-muted/40 border-transparent text-muted-foreground"
                        )}
                      >
                        {safeText(u.name)}
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">{selected.length} selected</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenUpload(false)}>Cancel</Button>
            <Button onClick={() => void submitUpload()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Upload & assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resignId} onOpenChange={(o) => !o && setResignId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request re-sign</DialogTitle>
            <DialogDescription className="text-xs">
              Clears the previous signature and asks the user to sign again.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={resignNote}
            onChange={(e) => setResignNote(e.target.value.slice(0, 500))}
            placeholder="Optional reason (shown to the user)"
            rows={3}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResignId(null)}>Cancel</Button>
            <Button onClick={() => void requestResign()} disabled={resigning}>
              {resigning && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Request re-sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
