"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  GraduationCap,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AssignmentDetailDialog } from "@/components/training/assignment-detail-dialog"
import { cn } from "@/lib/utils"
import { dueCountdown, dueToneClass, formatDueDate } from "@/lib/training-due"

type Assignment = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: string
  status: string
  completedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  user?: { id: string; name: string; email: string } | null
  assignedBy?: { id: string; name: string } | null
}

type TeamMember = { id: string; name: string; email: string; role: string }

type UserGroup = {
  userId: string
  name: string
  email: string
  open: Assignment[]
  done: Assignment[]
  overdueCount: number
}

function personLabel(a: Assignment) {
  return a.user?.name || a.user?.email || "Unknown"
}

function sortByDueAsc(a: Assignment, b: Assignment) {
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
}

function groupByUser(list: Assignment[]): UserGroup[] {
  const map = new Map<string, UserGroup>()
  for (const a of list) {
    const key = a.userId || "unknown"
    let g = map.get(key)
    if (!g) {
      g = {
        userId: key,
        name: a.user?.name || a.user?.email || "Unknown",
        email: a.user?.email || "",
        open: [],
        done: [],
        overdueCount: 0,
      }
      map.set(key, g)
    }
    if (a.status === "DONE") g.done.push(a)
    else {
      g.open.push(a)
      if (a.status === "OVERDUE") g.overdueCount += 1
    }
  }
  for (const g of map.values()) {
    g.open.sort(sortByDueAsc)
    g.done.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount
    if (b.open.length !== a.open.length) return b.open.length - a.open.length
    return a.name.localeCompare(b.name)
  })
}

export default function AssignTrainingPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [needsOpen, setNeedsOpen] = useState(true)
  const [byPersonOpen, setByPersonOpen] = useState(false)
  const [formUserIds, setFormUserIds] = useState<string[]>([])
  const [formTitle, setFormTitle] = useState("")
  const [formDue, setFormDue] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [detail, setDetail] = useState<Assignment | null>(null)
  const [sectionsPrimed, setSectionsPrimed] = useState(false)

  const role = session?.user?.role || ""
  const canAccess = role === "SUPER_ADMIN" || role === "ADMIN"

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch("/api/training/assignments", {
        credentials: "include",
        signal: controller.signal,
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      const nextTeam = Array.isArray(data.team) ? data.team : []
      const nextAssignments = Array.isArray(data.assignments) ? data.assignments : []
      setTeam(nextTeam)
      setAssignments(nextAssignments)

      if (!res.ok && nextTeam.length === 0) {
        throw new Error(data.detail || data.error || "Failed to load")
      }
      if (data.warning) {
        console.warn("[assign] warning:", data.warning)
      }
      if (nextTeam.length === 0) {
        setLoadError("No team members returned. Tap Retry or check Team is active.")
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Timed out loading — tap Retry"
          : err instanceof Error
            ? err.message
            : "Failed to load"
      setLoadError(msg)
      toast.error(msg)
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === "loading") return
    if (sessionStatus === "unauthenticated") {
      setLoading(false)
      return
    }
    if (!canAccess) {
      router.replace("/dashboard/training/my")
      return
    }
    void load()
  }, [sessionStatus, canAccess, load, router])

  const toggleUser = (id: string) => {
    setFormUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectAllUsers = () => {
    setFormUserIds(team.map((m) => m.id))
  }

  const clearUsers = () => {
    setFormUserIds([])
  }

  const assign = async () => {
    if (formUserIds.length === 0) {
      toast.error("Select at least one team member")
      return
    }
    if (!formTitle.trim()) {
      toast.error("Enter a training title")
      return
    }
    if (!formDue) {
      toast.error("Pick a due date")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userIds: formUserIds,
          title: formTitle.trim(),
          dueDate: formDue,
          notes: formNotes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Failed to assign")
      }
      const count = typeof data.count === "number" ? data.count : formUserIds.length
      toast.success(
        count === 1
          ? "Training assigned — user notified"
          : `Training assigned to ${count} people — all notified`
      )
      setFormTitle("")
      setFormDue("")
      setFormNotes("")
      setFormOpen(false)
      // keep selected people for faster repeat assigns
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign")
    } finally {
      setSaving(false)
    }
  }

  const deleteAssignment = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, action: "DELETE" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || data.error || "Failed to delete")
      toast.success("Assignment removed")
      if (detail?.id === id) setDetail(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setDeletingId(null)
    }
  }

  const needsAttention = useMemo(() => {
    return assignments
      .filter((a) => a.status !== "DONE")
      .slice()
      .sort((a, b) => {
        const aOver = a.status === "OVERDUE" ? 0 : 1
        const bOver = b.status === "OVERDUE" ? 0 : 1
        if (aOver !== bOver) return aOver - bOver
        return sortByDueAsc(a, b)
      })
  }, [assignments])

  const overdueOnly = useMemo(
    () => needsAttention.filter((a) => a.status === "OVERDUE"),
    [needsAttention]
  )

  const byUser = useMemo(() => groupByUser(assignments), [assignments])

  // Smart defaults once data loads: expand Needs attention when something is overdue
  useEffect(() => {
    if (loading || sectionsPrimed || assignments.length === 0) return
    setNeedsOpen(overdueOnly.length > 0 || needsAttention.length > 0)
    setByPersonOpen(false)
    setSectionsPrimed(true)
  }, [loading, sectionsPrimed, assignments.length, overdueOnly.length, needsAttention.length])

  // Compact list: title + assignee + due/days left. Full details via Open.
  const renderAssignmentRow = (a: Assignment, opts?: { showPerson?: boolean }) => {
    const cd = dueCountdown(a.dueDate, a.status)
    return (
      <li key={a.id}>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <button
            type="button"
            className="min-w-0 flex-1 space-y-0.5 text-left rounded-md py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDetail(a)}
            aria-label={`Open details for ${a.title}`}
          >
            <p className="font-medium truncate text-sm">{a.title}</p>
            {opts?.showPerson !== false && (
              <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                <UserRound className="h-3 w-3 shrink-0" />
                {personLabel(a)}
              </p>
            )}
            <p className={`text-xs inline-flex items-center gap-1 ${dueToneClass(cd.tone)}`}>
              <Clock className="h-3 w-3 shrink-0" />
              <span>Due {formatDueDate(a.dueDate)}</span>
              <span aria-hidden>·</span>
              <span className="font-medium">{cd.label}</span>
            </p>
          </button>
          {a.status === "OVERDUE" && (
            <Badge variant="destructive" className="text-[10px] shrink-0">
              Overdue
            </Badge>
          )}
          {a.status === "DONE" && (
            <Badge className="bg-success/15 text-success border-0 text-[10px] shrink-0">
              Done
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1 shrink-0 px-2.5"
            onClick={() => setDetail(a)}
          >
            Open
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </li>
    )
  }

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (sessionStatus === "authenticated" && !canAccess) {
    return null
  }

  return (
    <div className="th-page-enter space-y-8 max-w-3xl">
      <PageHeader
        title="Assign training"
        description="Assign Percipio training with due dates. Overdue and completion alerts go to Admin and Super Admin."
        showBack={false}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => router.push("/dashboard/training/my")}
          >
            <GraduationCap className="h-4 w-4" />
            My Training
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => router.push("/dashboard/training/qr")}
          >
            <QrCode className="h-4 w-4" />
            QR setup
          </Button>
        </div>
      </PageHeader>

      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-stretch gap-1 p-2 sm:p-3">
          <button
            type="button"
            className="flex flex-1 items-start gap-3 min-w-0 rounded-xl px-3 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
            aria-controls="new-assignment-panel"
          >
            <div className="th-stat-icon shrink-0 mt-0.5">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">New assignment</h2>
                {!formOpen && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Tap to expand
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {formOpen
                  ? "Pick people, title, and due date — expand only when you need to assign."
                  : "Tap to assign training to one or more people."}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground mt-1 transition-transform",
                formOpen && "rotate-180"
              )}
            />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 shrink-0 self-start mt-1"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only sm:not-sr-only">Retry</span>
          </Button>
        </div>

        {formOpen && (
          <div id="new-assignment-panel" className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6 border-t border-border pt-5">
            {loadError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                {loadError}
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Team members</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={loading || team.length === 0}
                      onClick={selectAllUsers}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={formUserIds.length === 0}
                      onClick={clearUsers}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div
                  role="group"
                  aria-label="Select team members"
                  className="max-h-56 overflow-y-auto rounded-md border border-input bg-background divide-y divide-border"
                >
                  {loading ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Loading team…</p>
                  ) : team.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">No team members found</p>
                  ) : (
                    team.map((m) => {
                      const checked = formUserIds.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input accent-primary"
                            checked={checked}
                            onChange={() => toggleUser(m.id)}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {m.name || m.email}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(m.role || "").replace(/_/g, " ")}
                          </span>
                        </label>
                      )
                    })
                  )}
                </div>
                {team.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formUserIds.length === 0
                      ? `${team.length} people available — select one or more`
                      : `${formUserIds.length} of ${team.length} selected`}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-due">Due date</Label>
                <Input
                  id="assign-due"
                  type="date"
                  value={formDue}
                  onChange={(e) => setFormDue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign-title">Training title</Label>
                <Input
                  id="assign-title"
                  placeholder="e.g. Prompt-Driven Development"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="assign-notes">Notes (optional)</Label>
                <Textarea
                  id="assign-notes"
                  placeholder="Playlist name or extra instructions"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <Button
              type="button"
              className="gap-2 w-full sm:w-auto"
              disabled={saving || loading || team.length === 0 || formUserIds.length === 0}
              onClick={() => void assign()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {formUserIds.length > 1
                ? `Assign to ${formUserIds.length} people`
                : "Assign training"}
            </Button>
          </div>
        )}
      </section>

      <AssignmentDetailDialog
        assignment={detail}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        showAssignee
        onDelete={(id) => void deleteAssignment(id)}
        deleting={!!detail && deletingId === detail.id}
      />

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 flex justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading assignments…
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No assignments yet. Expand <span className="font-medium text-foreground">New assignment</span> to start.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick overview — admin only page */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
              <p className={`text-lg font-semibold tabular-nums ${overdueOnly.length > 0 ? "text-destructive" : ""}`}>
                {overdueOnly.length}
              </p>
              <p className="text-[11px] text-muted-foreground">Overdue</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
              <p className="text-lg font-semibold tabular-nums">{needsAttention.length}</p>
              <p className="text-[11px] text-muted-foreground">Open</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
              <p className="text-lg font-semibold tabular-nums">{byUser.length}</p>
              <p className="text-[11px] text-muted-foreground">People</p>
            </div>
          </div>

          {/* Needs attention — collapsible */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setNeedsOpen((v) => !v)}
              aria-expanded={needsOpen}
              aria-controls="needs-attention-panel"
            >
              <AlertTriangle
                className={`h-4 w-4 mt-0.5 shrink-0 ${overdueOnly.length > 0 ? "text-destructive" : "text-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight">Needs attention</h2>
                  <Badge variant={overdueOnly.length > 0 ? "destructive" : "secondary"} className="text-xs">
                    {overdueOnly.length} overdue · {needsAttention.length} open
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Incomplete training across the team — overdue first.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground mt-0.5 transition-transform",
                  needsOpen && "rotate-180"
                )}
              />
            </button>
            {needsOpen && (
              <div id="needs-attention-panel" className="border-t border-border px-3 pb-3 pt-3 space-y-2">
                {needsAttention.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Everyone is caught up — no open training.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {needsAttention.map((a) => renderAssignmentRow(a, { showPerson: true }))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* By person — collapsible */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setByPersonOpen((v) => !v)}
              aria-expanded={byPersonOpen}
              aria-controls="by-person-panel"
            >
              <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold tracking-tight">By person</h2>
                  <Badge variant="secondary" className="text-xs">
                    {byUser.length} {byUser.length === 1 ? "person" : "people"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Each person&apos;s open and completed training.
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-muted-foreground mt-0.5 transition-transform",
                  byPersonOpen && "rotate-180"
                )}
              />
            </button>
            {byPersonOpen && (
              <div id="by-person-panel" className="border-t border-border p-3 space-y-3">
                {byUser.map((g) => (
                  <div
                    key={g.userId}
                    className="rounded-xl border border-border overflow-hidden bg-background/40"
                  >
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
                      <UserRound className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{g.name}</p>
                        {g.email && g.email !== g.name ? (
                          <p className="text-xs text-muted-foreground truncate">{g.email}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.overdueCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {g.overdueCount} overdue
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {g.open.length} open
                        </Badge>
                        <Badge className="bg-success/15 text-success border-0 text-xs">
                          {g.done.length} done
                        </Badge>
                      </div>
                    </div>
                    <div className="p-2.5 space-y-3">
                      {g.open.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground px-1">Open</p>
                          <ul className="space-y-2">
                            {g.open.map((a) => renderAssignmentRow(a, { showPerson: false }))}
                          </ul>
                        </div>
                      )}
                      {g.done.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground px-1">Completed</p>
                          <ul className="space-y-2 opacity-80">
                            {g.done.map((a) => renderAssignmentRow(a, { showPerson: false }))}
                          </ul>
                        </div>
                      )}
                      {g.open.length === 0 && g.done.length === 0 && (
                        <p className="text-sm text-muted-foreground px-1 py-2">No items</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
