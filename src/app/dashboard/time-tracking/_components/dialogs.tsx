"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, CheckCircle2, Clock, Eye, Loader2, Pencil, Plus, StopCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { safeText } from "@/lib/utils";
import type { Project, TeamUser, TimeEntry } from "./types";
import { canEditWorkNotes, workNotesHoursLeft } from "./types";
import { formatDate, formatDuration, formatHours, formatTime } from "./utils";

/* ── Clock Out ── */
export type SessionMilestone = {
  id: string
  title: string
  dueDate?: string | null
  done?: boolean
}

interface ClockOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeEntry: TimeEntry | null
  elapsed: number
  notes: string
  onNotesChange: (v: string) => void
  stopping: boolean
  onConfirm: () => void
  dueMilestones?: SessionMilestone[]
  milestonesLoading?: boolean
  checkedMilestoneIds?: Set<string>
  onToggleMilestone?: (id: string, checked: boolean) => void
}

export function ClockOutDialog({
  open,
  onOpenChange,
  activeEntry,
  elapsed,
  notes,
  onNotesChange,
  stopping,
  onConfirm,
  dueMilestones = [],
  milestonesLoading = false,
  checkedMilestoneIds = new Set(),
  onToggleMilestone,
}: ClockOutDialogProps) {
  const allDueDone =
    dueMilestones.length === 0 || dueMilestones.every((m) => checkedMilestoneIds.has(m.id))

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onNotesChange("")
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StopCircle className="h-5 w-5 text-destructive" />
            Clock Out
          </DialogTitle>
          <DialogDescription>
            {activeEntry ? (
              <>
                You&apos;ve been working for{" "}
                <span className="font-semibold text-foreground">{formatDuration(elapsed)}</span>
                {activeEntry.project?.name && (
                  <>
                    {" "}
                    on{" "}
                    <span className="font-semibold text-foreground">
                      {safeText(activeEntry.project.name)}
                    </span>
                  </>
                )}
                .
              </>
            ) : (
              "Record your work summary for this session."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {(milestonesLoading || dueMilestones.length > 0) && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs font-semibold">
                Due today / overdue — tick to mark done &amp; unlock clock-out (not future)
              </Label>
              {milestonesLoading ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {dueMilestones.map((m) => {
                    const checked = checkedMilestoneIds.has(m.id)
                    return (
                      <li key={m.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-emerald-600"
                          checked={checked}
                          onChange={(e) => onToggleMilestone?.(m.id, e.target.checked)}
                        />
                        <span className={checked ? "line-through text-muted-foreground" : ""}>
                          {safeText(m.title)}
                          {m.dueDate && (
                            <span className="block text-[10px] text-muted-foreground">
                              Due{" "}
                              {new Date(m.dueDate).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              })}
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!allDueDone && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Tick every due milestone checkbox to unlock clock-out.
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <Label htmlFor="clock-out-notes">
                Work Summary / Notes
                <span className="text-muted-foreground font-normal ml-1">(optional now)</span>
              </Label>
            </div>
            <div className="rounded-md border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200 leading-snug">
              Notes are optional at clock-out, but you must add them within{" "}
              <span className="font-semibold">24 hours</span>. After 24 hours, editing is locked.
            </div>
            <Textarea
              id="clock-out-notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value.slice(0, 500))}
              placeholder="What did you work on during this session?"
              rows={4}
              maxLength={500}
              className="resize-none"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Clock-out time:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onNotesChange("")
            }}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={stopping || !allDueDone || milestonesLoading}>
            {stopping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <StopCircle className="h-4 w-4 mr-2" />
                Clock Out
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Clock-in milestone briefing ── */
export function MilestoneBriefingDialog({
  open,
  onOpenChange,
  projectName,
  milestones,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName?: string
  milestones: SessionMilestone[]
  loading?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Project milestones
          </DialogTitle>
          <DialogDescription>
            {projectName
              ? `All open milestones for ${safeText(projectName)} with due dates — including upcoming (e.g. due tomorrow still shows today). Close this popup and continue.`
              : "All open milestones for your project with due dates. Close this popup and continue."}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 max-h-72 overflow-y-auto space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open milestones on this project.</p>
          ) : (
            milestones.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-emerald-600 opacity-60"
                  checked={false}
                  disabled
                  readOnly
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{safeText(m.title)}</p>
                  {m.dueDate && (
                    <p className="text-[11px] text-muted-foreground">
                      Due{" "}
                      {new Date(m.dueDate).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it — continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Delete Entry ── */
export function DeleteEntryDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this time entry? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── End Session (admin) ── */
export function EndSessionDialog({
  open,
  onOpenChange,
  ending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ending: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End Running Session?</AlertDialogTitle>
          <AlertDialogDescription>
            This will force clock-out the user now and mark the entry as completed with method{" "}
            <span className="font-medium">ADMIN_OVERRIDE</span>. The user&rsquo;s session will be
            terminated. This action is audit-logged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={ending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {ending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ending...
              </>
            ) : (
              <>
                <StopCircle className="h-4 w-4 mr-2" />
                End Session
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── View Description (+ edit work notes within 24h) ── */
export function ViewDescriptionDialog({
  entry,
  onClose,
  canEditNotes = false,
  onSaveNotes,
  savingNotes = false,
}: {
  entry: TimeEntry | null;
  onClose: () => void;
  canEditNotes?: boolean;
  onSaveNotes?: (notes: string) => Promise<void> | void;
  savingNotes?: boolean;
}) {
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    if (entry) setNotesDraft(entry.workNotes || "");
  }, [entry]);

  const editable = !!(entry && canEditNotes);
  const hoursLeft = entry ? workNotesHoursLeft(entry) : 0;

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Entry Details
          </DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            {entry.user && (
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={entry.user.avatar || ""} alt={safeText(entry.user.name)} />
                  <AvatarFallback className="text-xs">
                    {safeText(entry.user.name, "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{safeText(entry.user.name)}</p>
                  {entry.project && (
                    <p className="text-xs text-muted-foreground">{safeText(entry.project.name)}</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Clock In</p>
                <p className="font-medium tabular-nums">{formatTime(entry.clockIn)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Clock Out</p>
                <p className="font-medium tabular-nums">
                  {entry.clockOut ? formatTime(entry.clockOut) : "Active"}
                </p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Duration</p>
              <p className="font-medium">{formatHours(entry.totalHours)}</p>
            </div>
            {entry.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Description</p>
                <div className="bg-muted/30 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {safeText(entry.description)}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Work Summary / Notes</p>
              {editable ? (
                <>
                  <div className="rounded-md border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200">
                    You have about <span className="font-semibold">{hoursLeft}h</span> left to add or edit notes. After 24 hours from clock-out, editing locks.
                  </div>
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value.slice(0, 500))}
                    rows={4}
                    maxLength={500}
                    placeholder="Add your work summary…"
                    className="resize-none"
                  />
                </>
              ) : (
                <>
                  {entry.status === "COMPLETED" && entry.clockOut && !canEditWorkNotes(entry) && (
                    <div className="rounded-md border border-muted px-3 py-2 text-[11px] text-muted-foreground">
                      The 24-hour window to edit work notes has closed.
                    </div>
                  )}
                  <div className="bg-muted/30 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto min-h-[2.5rem]">
                    {entry.workNotes ? safeText(entry.workNotes) : (
                      <span className="text-muted-foreground italic">No work notes yet</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {editable && onSaveNotes && (
            <Button
              disabled={savingNotes}
              onClick={() => onSaveNotes(notesDraft.trim())}
            >
              {savingNotes ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save notes"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add Entry (admin) ── */
interface AddEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamUsers: TeamUser[];
  projects: Project[];
  userId: string;
  projectId: string;
  description: string;
  clockIn: string;
  clockOut: string;
  saving: boolean;
  onUserId: (v: string) => void;
  onProjectId: (v: string) => void;
  onDescription: (v: string) => void;
  onClockIn: (v: string) => void;
  onClockOut: (v: string) => void;
  onSave: () => void;
}

export function AddEntryDialog(props: AddEntryDialogProps) {
  const {
    open,
    onOpenChange,
    teamUsers,
    projects,
    userId,
    projectId,
    description,
    clockIn,
    clockOut,
    saving,
    onUserId,
    onProjectId,
    onDescription,
    onClockIn,
    onClockOut,
    onSave,
  } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Time Entry
          </DialogTitle>
          <DialogDescription>Manually create a time entry for any team member.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Employee <span className="text-destructive">*</span>
            </Label>
            <Select value={userId} onValueChange={onUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {safeText(u.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={onProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {safeText(p.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => onDescription(e.target.value.slice(0, 1000))}
              placeholder="What was worked on..."
              rows={3}
              maxLength={1000}
              className="resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Clock In <span className="text-destructive">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={clockIn}
                onChange={(e) => onClockIn(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Clock Out <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                type="datetime-local"
                value={clockOut}
                onChange={(e) => onClockOut(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {clockOut
              ? "Entry will be created as completed with calculated duration."
              : "Entry will be created as active (running timer) if no clock-out is set."}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !userId || !clockIn}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Entry
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Entry (admin) ── */
interface EditEntryDialogProps {
  entry: TimeEntry | null;
  onClose: () => void;
  projects: Project[];
  description: string;
  projectId: string;
  clockIn: string;
  clockOut: string;
  saving: boolean;
  onDescription: (v: string) => void;
  onProjectId: (v: string) => void;
  onClockIn: (v: string) => void;
  onClockOut: (v: string) => void;
  onSave: () => void;
}

export function EditEntryDialog(props: EditEntryDialogProps) {
  const {
    entry,
    onClose,
    projects,
    description,
    projectId,
    clockIn,
    clockOut,
    saving,
    onDescription,
    onProjectId,
    onClockIn,
    onClockOut,
    onSave,
  } = props;

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Time Entry
          </DialogTitle>
          <DialogDescription>
            Modify this time entry. Changes will recalculate duration automatically.
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={entry.user?.avatar || ""} alt={safeText(entry.user?.name)} />
                <AvatarFallback className="text-xs">
                  {safeText(entry.user?.name, "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{safeText(entry.user?.name, "Unknown")}</p>
                <p className="text-xs text-muted-foreground">{formatDate(entry.date)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={onProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {safeText(p.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => onDescription(e.target.value.slice(0, 1000))}
                placeholder="What was worked on..."
                rows={3}
                maxLength={1000}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Clock In</Label>
                <Input
                  type="datetime-local"
                  value={clockIn}
                  onChange={(e) => onClockIn(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Clock Out <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={clockOut}
                  onChange={(e) => onClockOut(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>
            {clockIn && clockOut && (
              <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                Calculated duration:{" "}
                <span className="font-medium text-foreground">
                  {(() => {
                    const diff = new Date(clockOut).getTime() - new Date(clockIn).getTime();
                    return diff > 0
                      ? formatHours(diff / (1000 * 60 * 60))
                      : "Invalid (clock-out before clock-in)";
                  })()}
                </span>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !clockIn}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AttForm = {
  userId: string;
  date: string;
  status: string;
  checkIn: string;
  checkOut: string;
  notes: string;
};

type EditAttForm = {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  notes: string;
};

/* ── Attendance dialogs ── */
export function AddAttendanceDialog({
  open,
  onOpenChange,
  teamUsers,
  form,
  setForm,
  loading,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  teamUsers: TeamUser[];
  form: AttForm;
  setForm: Dispatch<SetStateAction<AttForm>>;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Attendance Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Select value={form.userId} onValueChange={(v) => setForm((p) => ({ ...p, userId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {safeText(u.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="LEAVE">On Leave</SelectItem>
                  <SelectItem value="TRAINING">Training</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Time</Label>
              <Input
                type="time"
                value={form.checkIn}
                onChange={(e) => setForm((p) => ({ ...p, checkIn: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Check-out Time</Label>
              <Input
                type="time"
                value={form.checkOut}
                onChange={(e) => setForm((p) => ({ ...p, checkOut: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!form.userId || !form.date || loading}>
            {loading ? "Adding..." : "Add Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditAttendanceDialog({
  open,
  onOpenChange,
  form,
  setForm,
  loading,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: EditAttForm;
  setForm: Dispatch<SetStateAction<EditAttForm>>;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Attendance Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
                <SelectItem value="HALF_DAY">Half Day</SelectItem>
                <SelectItem value="LEAVE">On Leave</SelectItem>
                <SelectItem value="TRAINING">Training</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Time</Label>
              <Input
                type="time"
                value={form.checkIn}
                onChange={(e) => setForm((p) => ({ ...p, checkIn: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Check-out Time</Label>
              <Input
                type="time"
                value={form.checkOut}
                onChange={(e) => setForm((p) => ({ ...p, checkOut: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional notes..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!form.id || loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAttendanceDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Attendance Record</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this attendance record? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Workspace redirect after ?action=start clock-in ── */
export function RedirectWorkspaceDialog({
  open,
  onOpenChange,
  activeEntry,
  elapsed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeEntry: TimeEntry | null;
  elapsed: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeft className="h-5 w-5 text-primary" />
            Ready to Work!
          </DialogTitle>
          <DialogDescription>
            You&apos;re now clocked in. Would you like to go back to the workspace to start your AI
            session?
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Timer Running</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {safeText(activeEntry?.project?.name, "No project")} · {formatDuration(elapsed)}
            </p>
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stay Here
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              window.location.href = "/dashboard/workspace";
            }}
            className="bg-primary hover:bg-primary/90"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go to Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
