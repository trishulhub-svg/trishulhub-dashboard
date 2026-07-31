"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatDateTime } from "@/lib/format"
import { dueCountdown, dueToneClass, formatDueDate } from "@/lib/training-due"

export type TrainingAssignmentDetail = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: string
  status: string
  completedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  user?: { id: string; name: string; email?: string } | null
  assignedBy?: { id: string; name: string } | null
}

export type TrainingAssignmentEditPayload = {
  id: string
  title: string
  notes: string | null
  dueDate: string
  userId: string
  status: "ASSIGNED" | "DONE"
}

type TeamOption = { id: string; name: string; email: string; role?: string }

function statusBadge(status: string) {
  if (status === "DONE") return <Badge className="bg-success/15 text-success border-0">Done</Badge>
  if (status === "OVERDUE") return <Badge variant="destructive">Overdue</Badge>
  return <Badge variant="secondary">Assigned</Badge>
}

function dateLabel(value?: string | null) {
  if (!value) return "—"
  const formatted = formatDueDate(value)
  if (formatted !== "—") return formatted
  try {
    return formatDateTime(value)
  } catch {
    return "—"
  }
}

function toDateInputValue(value?: string | null) {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  )
}

type Props = {
  assignment: TrainingAssignmentDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Show assignee row (admin view) */
  showAssignee?: boolean
  /** Admin can delete */
  onDelete?: (id: string) => void
  deleting?: boolean
  /** Assignee can mark done */
  onMarkDone?: (id: string) => void
  marking?: boolean
  /** Admin edit */
  canEdit?: boolean
  /** Open directly in edit mode (e.g. row Edit button) */
  startInEditMode?: boolean
  team?: TeamOption[]
  onSave?: (payload: TrainingAssignmentEditPayload) => void | Promise<void>
  saving?: boolean
}

export function AssignmentDetailDialog({
  assignment,
  open,
  onOpenChange,
  showAssignee = false,
  onDelete,
  deleting = false,
  onMarkDone,
  marking = false,
  canEdit = false,
  startInEditMode = false,
  team = [],
  onSave,
  saving = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editDue, setEditDue] = useState("")
  const [editUserId, setEditUserId] = useState("")
  const [editStatus, setEditStatus] = useState<"ASSIGNED" | "DONE">("ASSIGNED")

  useEffect(() => {
    if (!assignment || !open) {
      setEditing(false)
      return
    }
    setEditTitle(assignment.title || "")
    setEditNotes(assignment.notes || "")
    setEditDue(toDateInputValue(assignment.dueDate))
    setEditUserId(assignment.userId)
    setEditStatus(assignment.status === "DONE" ? "DONE" : "ASSIGNED")
    setEditing(canEdit && !!onSave && startInEditMode)
  }, [assignment, open, canEdit, onSave, startInEditMode])

  const assignee =
    assignment?.user?.name ||
    assignment?.user?.email ||
    (showAssignee ? "Unknown" : null)

  const beginEdit = () => {
    if (!assignment) return
    setEditTitle(assignment.title || "")
    setEditNotes(assignment.notes || "")
    setEditDue(toDateInputValue(assignment.dueDate))
    setEditUserId(assignment.userId)
    setEditStatus(assignment.status === "DONE" ? "DONE" : "ASSIGNED")
    setEditing(true)
  }

  const handleSave = () => {
    if (!assignment || !onSave) return
    if (!editTitle.trim()) return
    if (!editDue) return
    if (!editUserId) return
    void onSave({
      id: assignment.id,
      title: editTitle.trim(),
      notes: editNotes.trim() || null,
      dueDate: editDue,
      userId: editUserId,
      status: editStatus,
    })
  }

  // Ensure current assignee appears even if not in active team list
  const teamOptions = (() => {
    if (!assignment) return team
    if (team.some((t) => t.id === assignment.userId)) return team
    return [
      {
        id: assignment.userId,
        name: assignment.user?.name || "Current assignee",
        email: assignment.user?.email || "",
      },
      ...team,
    ]
  })()

  return (
    <Dialog open={open && !!assignment} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto z-[100]">
        {assignment ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left leading-snug">
                {editing ? "Edit assignment" : assignment.title}
              </DialogTitle>
              <DialogDescription className="text-left">
                {editing
                  ? "Update title, due date, notes, assignee, or status"
                  : "Full training assignment details"}
              </DialogDescription>
            </DialogHeader>

            {!editing && (
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge(assignment.status)}
                {(() => {
                  const cd = dueCountdown(assignment.dueDate, assignment.status)
                  return (
                    <span className={`text-xs inline-flex items-center gap-1 ${dueToneClass(cd.tone)}`}>
                      <Clock className="h-3.5 w-3.5" />
                      Due {dateLabel(assignment.dueDate)} · {cd.label}
                    </span>
                  )
                })()}
              </div>
            )}

            {editing ? (
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-assign-title">Title</Label>
                  <Input
                    id="edit-assign-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-assign-due">Due date</Label>
                  <Input
                    id="edit-assign-due"
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                  />
                </div>
                {showAssignee && (
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-assign-user">Assigned to</Label>
                    <select
                      id="edit-assign-user"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={editUserId}
                      onChange={(e) => setEditUserId(e.target.value)}
                    >
                      {teamOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-assign-status">Status</Label>
                  <select
                    id="edit-assign-status"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "ASSIGNED" | "DONE")}
                  >
                    <option value="ASSIGNED">Assigned (open)</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-assign-notes">Notes</Label>
                  <Textarea
                    id="edit-assign-notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
            ) : (
              <dl className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                {showAssignee && (
                  <DetailRow label="Assigned to">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {assignee}
                      {assignment.user?.email && assignment.user.email !== assignee ? (
                        <span className="text-muted-foreground">· {assignment.user.email}</span>
                      ) : null}
                    </span>
                  </DetailRow>
                )}
                <DetailRow label="Assigned by">
                  {assignment.assignedBy?.name || "Admin"}
                </DetailRow>
                <DetailRow label="Due date">
                  {(() => {
                    const cd = dueCountdown(assignment.dueDate, assignment.status)
                    return (
                      <span>
                        {dateLabel(assignment.dueDate)}{" "}
                        <span className={dueToneClass(cd.tone)}>({cd.label})</span>
                      </span>
                    )
                  })()}
                </DetailRow>
                <DetailRow label="Status">
                  {assignment.status === "DONE"
                    ? "Completed"
                    : assignment.status === "OVERDUE"
                      ? "Overdue"
                      : "Assigned"}
                </DetailRow>
                <DetailRow label="Notes">
                  {assignment.notes?.trim()
                    ? assignment.notes
                    : <span className="text-muted-foreground">No notes</span>}
                </DetailRow>
                <DetailRow label="Created">{dateLabel(assignment.createdAt)}</DetailRow>
                {assignment.status === "DONE" && (
                  <DetailRow label="Completed">{dateLabel(assignment.completedAt)}</DetailRow>
                )}
              </dl>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:flex-wrap">
              {editing ? (
                <>
                  <Button
                    type="button"
                    className="gap-2 w-full sm:w-auto"
                    disabled={saving || !editTitle.trim() || !editDue || !editUserId}
                    onClick={handleSave}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  {canEdit && onSave && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="gap-2 w-full sm:w-auto"
                      onClick={beginEdit}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  {onMarkDone && assignment.status !== "DONE" && (
                    <Button
                      type="button"
                      className="gap-2 w-full sm:w-auto"
                      disabled={marking}
                      onClick={() => onMarkDone(assignment.id)}
                    >
                      {marking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark done
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      type="button"
                      variant="destructive"
                      className="gap-2 w-full sm:w-auto"
                      disabled={deleting}
                      onClick={() => onDelete(assignment.id)}
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
