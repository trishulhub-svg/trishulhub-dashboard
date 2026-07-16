"use client"

import {
  CheckCircle2,
  Clock,
  Loader2,
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
}: Props) {
  const assignee =
    assignment?.user?.name ||
    assignment?.user?.email ||
    (showAssignee ? "Unknown" : null)

  return (
    <Dialog open={open && !!assignment} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto z-[100]">
        {assignment ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 text-left leading-snug">
                {assignment.title}
              </DialogTitle>
              <DialogDescription className="text-left">
                Full training assignment details
              </DialogDescription>
            </DialogHeader>

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

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
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
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
