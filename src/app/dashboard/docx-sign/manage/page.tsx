"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  FilePenLine, Loader2, Plus, Download, RefreshCw, Users, Upload, Trash2, UserMinus, UserPlus, Save, PenLine, ChevronDown,
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
import { SignaturePad } from "@/components/docx-sign/signature-pad"
import { cn, safeText } from "@/lib/utils"

type TeamUser = { id: string; name: string; email: string; isActive?: boolean; role?: string }
type Assignment = {
  id: string
  userId: string
  status: string
  signedAt: string | null
  resignNote: string | null
  createdAt?: string
  authorizedPersonName?: string | null
  signerIp?: string | null
  signerCountry?: string | null
  user: { id: string; name: string; email: string }
  assignedBy: { id: string; name: string }
}
type DocumentRow = {
  id: string
  title: string
  fileName: string
  createdAt: string
  uploadedBy: { id?: string; name: string }
  assignmentCount?: number
  statusCounts?: { pending: number; signed: number; resign: number }
  assignments: Assignment[]
  assignmentsLoaded?: boolean
}

type MyAssignment = {
  id: string
  status: string
  signedAt: string | null
  resignNote: string | null
  hasSignedPdf: boolean
  createdAt: string
  authorizedPersonName?: string | null
  document: { id: string; title: string; fileName: string }
  assignedBy: { id: string; name: string }
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
  const myId = session?.user?.id
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
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  const [assignDocId, setAssignDocId] = useState<string | null>(null)
  const [assignSelected, setAssignSelected] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [authSig, setAuthSig] = useState<string | null>(null)
  const [hasAuthSig, setHasAuthSig] = useState(false)
  const [savingAuthSig, setSavingAuthSig] = useState(false)
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([])
  const [authSigExpanded, setAuthSigExpanded] = useState(false)
  const [authSigLoading, setAuthSigLoading] = useState(false)
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set())
  const [loadingDocIds, setLoadingDocIds] = useState<Set<string>>(new Set())
  const [teamLoading, setTeamLoading] = useState(false)
  const teamLoadedRef = useRef(false)

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated") {
      router.replace("/login")
      return
    }
    if (!isAdmin) router.replace("/dashboard/docx-sign/my")
  }, [status, isAdmin, router])

  const loadFullAuthSig = useCallback(async () => {
    setAuthSigLoading(true)
    try {
      const res = await fetch("/api/docx-sign/authorized-signature", {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) return
      const j = await res.json()
      setHasAuthSig(Boolean(j.hasSignature))
      setAuthSig(typeof j.signatureData === "string" ? j.signatureData : null)
    } catch {
      /* ignore */
    } finally {
      setAuthSigLoading(false)
    }
  }, [])

  const loadTeam = useCallback(async () => {
    if (teamLoadedRef.current || teamLoading) return
    setTeamLoading(true)
    try {
      const res = await fetch("/api/team?type=users", {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) return
      const j = await res.json()
      const users = Array.isArray(j) ? j : j.users || j.team || []
      setTeam(
        users
          .filter((u: TeamUser) => u?.id && u.isActive !== false)
          .map((u: TeamUser) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            isActive: u.isActive,
            role: u.role,
          }))
      )
      teamLoadedRef.current = true
    } catch {
      /* ignore */
    } finally {
      setTeamLoading(false)
    }
  }, [teamLoading])

  const loadDocAssignments = useCallback(async (docId: string) => {
    setLoadingDocIds((prev) => new Set(prev).add(docId))
    try {
      const res = await fetch(
        `/api/docx-sign/assignments?documentId=${encodeURIComponent(docId)}`,
        { credentials: "include", cache: "no-store" }
      )
      if (!res.ok) {
        toast.error("Failed to load assignees")
        return
      }
      const j = await res.json()
      const assignments = Array.isArray(j.assignments) ? j.assignments : []
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId
            ? {
                ...d,
                assignments,
                assignmentCount: assignments.length,
                assignmentsLoaded: true,
              }
            : d
        )
      )
    } catch {
      toast.error("Failed to load assignees")
    } finally {
      setLoadingDocIds((prev) => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }, [])

  const toggleDocExpand = useCallback(
    (docId: string) => {
      setExpandedDocIds((prev) => {
        const next = new Set(prev)
        if (next.has(docId)) next.delete(docId)
        else next.add(docId)
        return next
      })
      const doc = docs.find((d) => d.id === docId)
      if (doc && !doc.assignmentsLoaded) void loadDocAssignments(docId)
    },
    [docs, loadDocAssignments]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/bootstrap/docx-sign", {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) {
        const [dRes, mineRes, sigRes] = await Promise.all([
          fetch("/api/docx-sign/documents", { credentials: "include", cache: "no-store" }),
          fetch("/api/docx-sign/assignments?mine=1", { credentials: "include", cache: "no-store" }),
          fetch("/api/docx-sign/authorized-signature?meta=1", {
            credentials: "include",
            cache: "no-store",
          }),
        ])
        if (dRes.ok) {
          const j = await dRes.json()
          const documents = Array.isArray(j.documents) ? j.documents : []
          setDocs(
            documents.map((d: DocumentRow) => ({
              ...d,
              assignmentCount: d.assignments?.length || 0,
              assignmentsLoaded: Array.isArray(d.assignments) && d.assignments.length > 0,
              assignments: d.assignments || [],
            }))
          )
        }
        if (mineRes.ok) {
          const j = await mineRes.json()
          setMyAssignments(Array.isArray(j.assignments) ? j.assignments : [])
        }
        if (sigRes.ok) {
          const j = await sigRes.json()
          setHasAuthSig(Boolean(j.hasSignature))
        }
        void loadTeam()
        return
      }

      const j = await res.json()
      const documents = Array.isArray(j.documents) ? j.documents : []
      setDocs(
        documents.map((d: DocumentRow) => ({
          ...d,
          assignments: [],
          assignmentsLoaded: false,
          assignmentCount: d.assignmentCount ?? 0,
        }))
      )
      setMyAssignments(Array.isArray(j.myAssignments) ? j.myAssignments : [])
      setExpandedDocIds(new Set())
      setHasAuthSig(Boolean(j.authorizedSignature?.hasSignature))
      if (!j.authorizedSignature?.hasSignature) {
        setAuthSig(null)
        setAuthSigExpanded(true)
      }
    } catch {
      toast.error("Failed to load Docx Sign")
    } finally {
      setLoading(false)
    }
  }, [loadTeam])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  const openAuthSigEditor = useCallback(() => {
    setAuthSigExpanded(true)
    if (hasAuthSig && !authSig) void loadFullAuthSig()
  }, [hasAuthSig, authSig, loadFullAuthSig])

  /** Admins/SAs may assign to each other and staff — never to themselves. */
  const selectableTeam = useMemo(
    () => team.filter((u) => u.id !== myId),
    [team, myId]
  )

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
    if (id === myId) return
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const saveAuthorizedSignature = async () => {
    if (!authSig) {
      toast.error("Draw your Authorized Person signature first")
      return
    }
    setSavingAuthSig(true)
    try {
      const res = await fetch("/api/docx-sign/authorized-signature", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData: authSig }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Could not save signature")
        return
      }
      setHasAuthSig(true)
      toast.success("Authorized Person signature saved")
      setAuthSigExpanded(false)
      setAuthSig(null)
    } catch {
      toast.error("Could not save signature")
    } finally {
      setSavingAuthSig(false)
    }
  }

  const submitUpload = async () => {
    if (!hasAuthSig) {
      toast.error("Save your Authorized Person signature first")
      return
    }
    if (!title.trim() || !fileData || selected.length === 0) {
      toast.error("Title, PDF, and at least one user are required")
      return
    }
    if (selected.includes(myId || "")) {
      toast.error("You cannot assign a contract to yourself")
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
      const targetId = resignId
      const note = resignNote.trim() || null
      setResignId(null)
      setResignNote("")
      setDocs((prev) =>
        prev.map((d) => ({
          ...d,
          assignments: d.assignments.map((a) =>
            a.id === targetId
              ? { ...a, status: "RESIGN_REQUESTED", resignNote: note, signedAt: null }
              : a
          ),
          statusCounts: d.assignments.some((a) => a.id === targetId)
            ? {
                pending: d.statusCounts?.pending || 0,
                signed: Math.max(0, (d.statusCounts?.signed || 1) - 1),
                resign: (d.statusCounts?.resign || 0) + 1,
              }
            : d.statusCounts,
        }))
      )
    } catch {
      toast.error("Failed")
    } finally {
      setResigning(false)
    }
  }

  const revokeAssignment = async (assignmentId: string, userName: string) => {
    if (!window.confirm(`Revoke signing request for ${userName}? They will no longer see this document. You can assign someone else afterward.`)) {
      return
    }
    setRevokingId(assignmentId)
    try {
      const res = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignmentId, action: "revoke" }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Failed to revoke")
        return
      }
      toast.success("Assignment revoked")
      setDocs((prev) =>
        prev.map((d) => {
          const nextAssignments = d.assignments.filter((a) => a.id !== assignmentId)
          if (nextAssignments.length === d.assignments.length && !d.assignmentsLoaded) {
            return {
              ...d,
              assignmentCount: Math.max(0, (d.assignmentCount || 1) - 1),
            }
          }
          return {
            ...d,
            assignments: nextAssignments,
            assignmentCount: nextAssignments.length,
          }
        })
      )
    } catch {
      toast.error("Failed to revoke")
    } finally {
      setRevokingId(null)
    }
  }

  const deleteDocument = async (docId: string, docTitle: string) => {
    if (
      !window.confirm(
        `Delete "${docTitle}"? All assignments will be cleared. You can upload and assign again afterward.`
      )
    ) {
      return
    }
    setDeletingDocId(docId)
    try {
      const res = await fetch(`/api/docx-sign/documents?id=${encodeURIComponent(docId)}`, {
        method: "DELETE",
        credentials: "include",
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Failed to delete")
        return
      }
      toast.success("Document deleted")
      setDocs((prev) => prev.filter((d) => d.id !== docId))
      setExpandedDocIds((prev) => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    } catch {
      toast.error("Failed to delete")
    } finally {
      setDeletingDocId(null)
    }
  }

  const openAssignMore = (doc: DocumentRow) => {
    if (!hasAuthSig) {
      toast.error("Save your Authorized Person signature first")
      return
    }
    setAssignDocId(doc.id)
    setAssignSelected([])
    void loadTeam()
    if (!doc.assignmentsLoaded) void loadDocAssignments(doc.id)
  }

  const submitAssignMore = async () => {
    if (!assignDocId || assignSelected.length === 0) {
      toast.error("Select at least one user")
      return
    }
    if (assignSelected.includes(myId || "")) {
      toast.error("You cannot assign a contract to yourself")
      return
    }
    setAssigning(true)
    try {
      const res = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: assignDocId, userIds: assignSelected }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Failed to assign")
        return
      }
      toast.success(`Assigned to ${j?.assigned || assignSelected.length} user(s)`)
      const docId = assignDocId
      setAssignDocId(null)
      setAssignSelected([])
      setExpandedDocIds((prev) => new Set(prev).add(docId))
      await loadDocAssignments(docId)
    } catch {
      toast.error("Failed to assign")
    } finally {
      setAssigning(false)
    }
  }

  const assignDoc = docs.find((d) => d.id === assignDocId) || null
  const assignableUsers = useMemo(() => {
    const pool = selectableTeam
    if (!assignDoc) return pool
    const taken = new Set(assignDoc.assignments.map((a) => a.userId))
    return pool.filter((u) => !taken.has(u.id))
  }, [assignDoc, selectableTeam])

  const stats = useMemo(() => {
    let pending = 0
    let signed = 0
    let resign = 0
    for (const d of docs) {
      if (d.statusCounts) {
        pending += d.statusCounts.pending || 0
        signed += d.statusCounts.signed || 0
        resign += d.statusCounts.resign || 0
        continue
      }
      for (const a of d.assignments) {
        if (a.status === "SIGNED") signed++
        else if (a.status === "RESIGN_REQUESTED") resign++
        else pending++
      }
    }
    return { pending, signed, resign }
  }, [docs])

  const myPending = useMemo(
    () => myAssignments.filter((a) => a.status === "PENDING" || a.status === "RESIGN_REQUESTED"),
    [myAssignments]
  )

  if (status === "loading" || !isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-1 sm:px-0">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 50% at 100% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 55%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-primary mb-1">
              <FilePenLine className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Contracts</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Docx Sign</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Upload a PDF, assign as Authorized Person (not yourself), track dual signatures, and download stamped copies with UK/local time and IP.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap relative">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => router.push("/dashboard/docx-sign/my")}
            >
              <PenLine className="h-4 w-4 mr-1.5" />
              My contracts{myPending.length > 0 ? ` (${myPending.length})` : ""}
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="h-9"
              onClick={() => {
                if (!hasAuthSig) {
                  toast.error("Save your Authorized Person signature below first")
                  return
                }
                void loadTeam()
                setOpenUpload(true)
              }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Upload & assign
            </Button>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Pending", value: stats.pending },
            { label: "Signed", value: stats.signed },
            { label: "Re-sign", value: stats.resign },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/80 bg-background/80 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {myPending.length > 0 && (
        <section className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Waiting for your signature</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Another Admin or Super Admin assigned {myPending.length} contract
                {myPending.length === 1 ? "" : "s"} to you. Review and sign here.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => router.push("/dashboard/docx-sign/my")}
            >
              View all my contracts
            </Button>
          </div>
          <div className="space-y-2">
            {myPending.map((a) => (
              <div
                key={a.id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border bg-background/80 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{safeText(a.document.title)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Authorized Person {safeText(a.authorizedPersonName || a.assignedBy?.name)}
                    {a.resignNote ? ` · ${a.resignNote}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[a.status] || "")}>
                    {a.status.replace("_", " ")}
                  </Badge>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => router.push(`/dashboard/docx-sign/sign/${a.id}`)}
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {a.status === "RESIGN_REQUESTED" ? "Sign again" : "Review & sign"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Authorized Person signature</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Used on every contract you authorize, next to the acceptor&apos;s signature.
              {hasAuthSig ? " Signature on file." : " Required before you can upload or assign."}
            </p>
          </div>
          {hasAuthSig && !authSigExpanded && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={openAuthSigEditor}>
              Update signature
            </Button>
          )}
        </div>
        {(!hasAuthSig || authSigExpanded) && (
          <>
            {authSigLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <SignaturePad value={authSig} onChange={setAuthSig} disabled={savingAuthSig} />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-9"
                onClick={() => void saveAuthorizedSignature()}
                disabled={savingAuthSig || authSigLoading || !authSig}
              >
                {savingAuthSig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save Authorized Person signature
              </Button>
              {hasAuthSig && authSigExpanded && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    setAuthSigExpanded(false)
                    setAuthSig(null)
                  }}
                >
                  Collapse
                </Button>
              )}
            </div>
          </>
        )}
      </section>

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
        <div className="space-y-3">
          {docs.map((doc) => {
            const expanded = expandedDocIds.has(doc.id)
            const loadingAssignees = loadingDocIds.has(doc.id)
            const count = doc.assignmentCount ?? doc.assignments.length
            return (
            <div key={doc.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  className="min-w-0 text-left flex-1"
                  onClick={() => toggleDocExpand(doc.id)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold truncate">{safeText(doc.title)}</h2>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {safeText(doc.fileName)} · uploaded by {safeText(doc.uploadedBy?.name)} ·{" "}
                        {new Date(doc.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2 sm:pl-6">
                  <Badge variant="secondary" className="w-fit text-[10px]">
                    <Users className="h-3 w-3 mr-1" />
                    {count} assignee{count === 1 ? "" : "s"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1"
                    onClick={() => openAssignMore(doc)}
                  >
                    <UserPlus className="h-3 w-3" />
                    Assign more
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 text-destructive hover:text-destructive"
                    disabled={deletingDocId === doc.id}
                    onClick={() => void deleteDocument(doc.id, doc.title)}
                  >
                    {deletingDocId === doc.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
              {expanded && (
              <div className="divide-y divide-border/50 border-t border-border/60">
                {loadingAssignees ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading assignees…
                  </p>
                ) : doc.assignments.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                    No assignees — use Assign more to share this document again.
                  </p>
                ) : (
                  doc.assignments.map((a) => (
                  <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{safeText(a.user?.name)}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {safeText(a.user?.email)} · Authorized Person{" "}
                        {safeText(a.authorizedPersonName || a.assignedBy?.name)}
                        {a.signedAt
                          ? ` · signed ${new Date(a.signedAt).toLocaleString()}`
                          : ""}
                        {a.signerIp ? ` · IP ${a.signerIp}` : ""}
                        {a.signerCountry ? ` · ${a.signerCountry}` : ""}
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                        disabled={revokingId === a.id}
                        onClick={() => void revokeAssignment(a.id, a.user?.name || "user")}
                      >
                        {revokingId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserMinus className="h-3.5 w-3.5" />
                        )}
                        Revoke
                      </Button>
                    </div>
                  </div>
                  ))
                )}
              </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      <Dialog open={openUpload} onOpenChange={setOpenUpload}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload & assign contract</DialogTitle>
            <DialogDescription className="text-xs">
              PDF only. You are the Authorized Person. You can assign to other Admins / Super Admins and staff — not yourself.
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
                  {teamLoading && selectableTeam.length === 0 ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-2 p-1">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading team…
                    </p>
                  ) : (
                    selectableTeam.map((u) => {
                    const on = selected.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u.id)}
                        className={cn(
                          "text-[10px] px-2 py-1 rounded-full border transition-colors",
                          on
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-muted/40 border-transparent text-muted-foreground"
                        )}
                      >
                        {safeText(u.name)}
                      </button>
                    )
                  })
                  )}
                </div>
              </ScrollArea>
              <p className="text-[10px] text-muted-foreground">
                {selected.length} selected · you are hidden from this list
              </p>
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
              Clears the previous signature and asks the user to sign again. The new signed PDF will include your current Authorized Person stamp rules (UK/local time + IP).
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

      <Dialog
        open={!!assignDocId}
        onOpenChange={(o) => {
          if (!o) {
            setAssignDocId(null)
            setAssignSelected([])
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign more people</DialogTitle>
            <DialogDescription className="text-xs">
              Add people to &ldquo;{safeText(assignDoc?.title || "")}&rdquo; as Authorized Person. You cannot assign yourself. Already assigned people are hidden.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-48 rounded-lg border p-2">
            {assignableUsers.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                Everyone eligible is already assigned.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignableUsers.map((u) => {
                  const on = assignSelected.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        setAssignSelected((prev) =>
                          prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                        )
                      }
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
            )}
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground">{assignSelected.length} selected</p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAssignDocId(null)
                setAssignSelected([])
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitAssignMore()}
              disabled={assigning || assignSelected.length === 0}
            >
              {assigning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <UserPlus className="h-4 w-4 mr-1" />
              )}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
