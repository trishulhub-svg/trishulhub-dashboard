"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  CircleUserRound,
  Clock,
  ListMusic,
  Loader2,
  Plus,
  Trash2,
  UserCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatDateTime } from "@/lib/format"

const TOUR_STEPS = [
  {
    num: 1,
    title: "Open your Profile",
    narration:
      "You’re on the Percipio Home screen. Look at the bottom navigation bar and tap Profile (far right) to open your account menu.",
    image: "/learning/tour/step-1-home.jpg",
    highlight: "Tap Profile",
    icon: UserCircle2,
  },
  {
    num: 2,
    title: "Open Playlists",
    narration:
      "On your Profile page, scroll the menu and tap Playlists. That’s where your assigned training playlists live.",
    image: "/learning/tour/step-2-profile.jpg",
    highlight: "Tap Playlists",
    icon: ListMusic,
  },
  {
    num: 3,
    title: "Choose your playlist",
    narration:
      "On My Playlists, open the playlist assigned to you (your name or training title). Start the courses inside to complete your training.",
    image: "/learning/tour/step-3-playlists.jpg",
    highlight: "Choose your playlist",
    icon: CircleUserRound,
  },
] as const

type Assignment = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: string
  status: "ASSIGNED" | "DONE" | "OVERDUE" | string
  completedAt: string | null
  createdAt: string
  user?: { id: string; name: string; email: string } | null
  assignedBy?: { id: string; name: string } | null
}

type TeamMember = { id: string; name: string; email: string; role: string }

function statusBadge(status: string) {
  if (status === "DONE") return <Badge className="bg-success/15 text-success border-0">Done</Badge>
  if (status === "OVERDUE") return <Badge variant="destructive">Overdue</Badge>
  return <Badge variant="secondary">Assigned</Badge>
}

function dueLabel(dueDate: string) {
  try {
    return new Date(dueDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return formatDateTime(dueDate)
  }
}

export default function TrainingSetupPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formUserId, setFormUserId] = useState("")
  const [formTitle, setFormTitle] = useState("")
  const [formDue, setFormDue] = useState("")
  const [formNotes, setFormNotes] = useState("")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/training/assignments", { credentials: "include" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load")
      setAssignments(data.assignments || [])
      setTeam(data.team || [])
      setIsAdmin(!!data.isAdmin)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load training")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === "authenticated") load()
    else if (sessionStatus === "unauthenticated") setLoading(false)
  }, [sessionStatus, load])

  const current = TOUR_STEPS[step]

  const markDone = async (id: string) => {
    setMarkingId(id)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to mark done")
      toast.success("Marked as done — admins notified")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setMarkingId(null)
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
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete")
      toast.success("Assignment removed")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setDeletingId(null)
    }
  }

  const assign = async () => {
    if (!formUserId || !formTitle.trim() || !formDue) {
      toast.error("Select a person, title, and due date")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: formUserId,
          title: formTitle.trim(),
          dueDate: formDue,
          notes: formNotes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to assign")
      toast.success("Training assigned — user notified")
      setFormTitle("")
      setFormDue("")
      setFormNotes("")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign")
    } finally {
      setSaving(false)
    }
  }

  const myAssignments = isAdmin
    ? assignments.filter((a) => a.userId === session?.user?.id)
    : assignments
  const allForAdmin = isAdmin ? assignments : []

  return (
    <div className="th-page-enter space-y-8 max-w-4xl">
      <PageHeader
        title="App setup done"
        description="Follow the Percipio tour, then track your assigned training."
        showBack={false}
      >
        <Button variant="outline" size="sm" className="gap-2" onClick={() => router.push("/dashboard/training")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Learning
        </Button>
      </PageHeader>

      {/* Tour */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Percipio tour · Step {current.num} of {TOUR_STEPS.length}
            </p>
            <h2 className="text-lg font-semibold tracking-tight mt-0.5">{current.title}</h2>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <current.icon className="h-3.5 w-3.5" />
            {current.highlight}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,280px)_1fr] gap-0">
          <div className="bg-muted/30 p-4 sm:p-5 flex justify-center items-start border-b lg:border-b-0 lg:border-r border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.image}
              alt={`Percipio tour step ${current.num}: ${current.title}`}
              className="w-full max-w-[240px] rounded-xl border border-border shadow-sm object-cover"
            />
          </div>
          <div className="p-5 sm:p-6 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">{current.narration}</p>
              <div className="flex gap-2">
                {TOUR_STEPS.map((s, i) => (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setStep(i)}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted"
                    }`}
                    aria-label={`Go to step ${s.num}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                Previous
              </Button>
              {step < TOUR_STEPS.length - 1 ? (
                <Button type="button" onClick={() => setStep((s) => Math.min(TOUR_STEPS.length - 1, s + 1))}>
                  Next step
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                  Replay tour
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* My assignments */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Your assigned training</h2>
          <p className="text-sm text-muted-foreground">
            Complete each item in Percipio, then mark it done here.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : myAssignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No training assigned to you yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {myAssignments.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold tracking-tight truncate">{a.title}</h3>
                    {statusBadge(a.status)}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Due {dueLabel(a.dueDate)}
                    {a.assignedBy?.name ? ` · by ${a.assignedBy.name}` : ""}
                  </p>
                  {a.notes && (
                    <p className="text-sm text-muted-foreground">{a.notes}</p>
                  )}
                </div>
                {a.status !== "DONE" ? (
                  <Button
                    type="button"
                    className="gap-2 shrink-0"
                    disabled={markingId === a.id}
                    onClick={() => void markDone(a.id)}
                  >
                    {markingId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Mark done
                  </Button>
                ) : (
                  <span className="text-xs text-success font-medium shrink-0">
                    Completed{a.completedAt ? ` · ${dueLabel(a.completedAt)}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Admin assign */}
      {isAdmin && (
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="th-stat-icon shrink-0">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Assign training</h2>
              <p className="text-sm text-muted-foreground">
                Super Admin and Admin can assign Percipio training to anyone with a due date.
                Overdue items notify both Admin and Super Admin automatically.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Team member</Label>
              <Select value={formUserId} onValueChange={setFormUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {m.role.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input
                type="date"
                value={formDue}
                onChange={(e) => setFormDue(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Training title</Label>
              <Input
                placeholder="e.g. Prompt-Driven Development Handbook"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Playlist name or extra instructions"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <Button type="button" className="gap-2" disabled={saving} onClick={() => void assign()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Assign training
          </Button>

          {allForAdmin.length > 0 && (
            <div className="pt-2 space-y-3">
              <h3 className="text-sm font-semibold">All assignments</h3>
              <ul className="space-y-2">
                {allForAdmin.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium truncate min-w-0 flex-1">
                      {a.title}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {a.user?.name || "Unknown"}
                      </span>
                    </span>
                    {statusBadge(a.status)}
                    <span className="text-xs text-muted-foreground">Due {dueLabel(a.dueDate)}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      disabled={deletingId === a.id}
                      onClick={() => void deleteAssignment(a.id)}
                      aria-label="Delete assignment"
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
