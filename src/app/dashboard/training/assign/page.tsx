"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  ClipboardList,
  GraduationCap,
  Loader2,
  Plus,
  QrCode,
  Trash2,
  Clock,
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

type Assignment = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: string
  status: string
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

export default function AssignTrainingPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [team, setTeam] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formUserId, setFormUserId] = useState("")
  const [formTitle, setFormTitle] = useState("")
  const [formDue, setFormDue] = useState("")
  const [formNotes, setFormNotes] = useState("")

  const canAccess =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN"

  const load = useCallback(async () => {
    setLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch("/api/training/assignments", {
        credentials: "include",
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to load")
      setAssignments(Array.isArray(data.assignments) ? data.assignments : [])
      setTeam(Array.isArray(data.team) ? data.team : [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load")
      setAssignments([])
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      if (!canAccess) {
        router.replace("/dashboard/training/my")
        return
      }
      void load()
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false)
    }
  }, [sessionStatus, canAccess, load, router])

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

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="th-stat-icon shrink-0">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">New assignment</h2>
            <p className="text-sm text-muted-foreground">
              Pick a team member, title, and due date. They’ll get a notification.
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
            <Input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)} />
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
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">All assignments</h2>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 flex justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No assignments yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="font-medium truncate min-w-0 flex-1">
                  {a.title}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {a.user?.name || "Unknown"}
                  </span>
                </span>
                {statusBadge(a.status)}
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Due {dueLabel(a.dueDate)}
                </span>
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
        )}
      </section>
    </div>
  )
}
