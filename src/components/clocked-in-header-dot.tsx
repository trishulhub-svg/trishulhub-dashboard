"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Clock, Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn, safeText } from "@/lib/utils"
import { buildClientClockPayload } from "@/lib/clock-integrity"
import { useClockedInStatus, notifyClockStatusChanged } from "@/hooks/use-clocked-in-status"
import {
  ClockInKindToggle,
  NonProjectActivityItems,
  ProjectSelectItems,
  type ClockInKind,
} from "@/app/dashboard/time-tracking/_components/activity-select"
import type {
  Project,
  TimeActivityItem,
  TrainingAssignment,
} from "@/app/dashboard/time-tracking/_components/types"

function formatElapsed(clockIn?: string): string {
  if (!clockIn) return ""
  const ms = Date.now() - new Date(clockIn).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

/**
 * Global header indicator:
 * - Green pulse when clocked in → confirm open Time Tracking
 * - Clock in control when idle → start a session without leaving the page
 */
export function ClockedInHeaderDot({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter()
  const { data: session } = useSession()
  const role = session?.user?.role || ""
  const userId = session?.user?.id
  const canClock = enabled && role && role !== "CLIENT"

  const { status, loading, refresh } = useClockedInStatus(!!canClock)
  const [activeOpen, setActiveOpen] = useState(false)
  const [clockInOpen, setClockInOpen] = useState(false)
  const [tick, setTick] = useState(0)

  const [projects, setProjects] = useState<Project[]>([])
  const [activities, setActivities] = useState<TimeActivityItem[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [kind, setKind] = useState<ClockInKind>("project")
  const [selected, setSelected] = useState("none")
  const [description, setDescription] = useState("")
  const [trainingAssignments, setTrainingAssignments] = useState<TrainingAssignment[]>([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [selectedTrainingId, setSelectedTrainingId] = useState("")

  const trainingSelect =
    activities.find((a) => a.key === "TRAINING")?.selectValue || "__training__"
  const isTrainingSelected = selected === trainingSelect

  useEffect(() => {
    if (!status.active) return
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [status.active])

  const elapsed = useMemo(() => {
    void tick
    return formatElapsed(status.clockIn)
  }, [status.clockIn, tick])

  const activity = safeText(status.label, "Clocked in")

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true)
    try {
      const res = await fetch("/api/bootstrap/time-tracking", {
        credentials: "include",
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Could not load clock-in options")
        return
      }
      const nextProjects = Array.isArray(data.projects) ? (data.projects as Project[]) : []
      const nextActivities = Array.isArray(data.activityVisible)
        ? (data.activityVisible as TimeActivityItem[])
        : Array.isArray(data.activityCatalog)
          ? (data.activityCatalog as TimeActivityItem[]).filter((a) => a.enabled)
          : []
      setProjects(nextProjects)
      setActivities(nextActivities)
      // Prefer highest work-priority project with open work
      const preferred =
        [...nextProjects]
          .filter((p) => p.hasOpenAssignedMilestones)
          .sort((a, b) => {
            const pa = a.workPriority != null && a.workPriority >= 1 ? a.workPriority : 999
            const pb = b.workPriority != null && b.workPriority >= 1 ? b.workPriority : 999
            return pa - pb
          })[0] || nextProjects[0]
      if (preferred?.id) {
        setKind("project")
        setSelected(preferred.id)
      } else {
        setKind("project")
        setSelected("none")
      }
    } catch {
      toast.error("Could not load clock-in options")
    } finally {
      setOptionsLoading(false)
    }
  }, [])

  const loadTraining = useCallback(async () => {
    setTrainingLoading(true)
    try {
      const res = await fetch("/api/training/assignments?mine=1", { credentials: "include" })
      const data = await res.json().catch(() => [])
      if (res.ok && Array.isArray(data)) {
        const open = (data as TrainingAssignment[]).filter((a) => a.status !== "DONE")
        setTrainingAssignments(open)
      }
    } catch {
      /* non-fatal */
    } finally {
      setTrainingLoading(false)
    }
  }, [])

  const openClockIn = () => {
    setDescription("")
    setSelectedTrainingId("")
    setClockInOpen(true)
    void loadOptions()
  }

  const handleKindChange = (next: ClockInKind) => {
    setKind(next)
    setSelected("none")
    setSelectedTrainingId("")
  }

  const handleSelectChange = (value: string) => {
    setSelected(value)
    setSelectedTrainingId("")
    if (value === trainingSelect) void loadTraining()
  }

  const projectHasWork = projects.some((p) => p.hasOpenAssignedMilestones)
  const activityBadgeKeys = useMemo(() => {
    const keys = new Set<string>()
    if (trainingAssignments.length > 0) keys.add("TRAINING")
    for (const a of activities) {
      if (
        Array.isArray(a.userIds) &&
        a.userIds.length > 0 &&
        userId &&
        a.userIds.includes(userId)
      ) {
        keys.add(a.key)
      }
    }
    return keys
  }, [trainingAssignments.length, activities, userId])

  const handleStart = async () => {
    const bySelect = new Map(activities.map((a) => [a.selectValue, a]))
    let payload: Record<string, unknown> = {}

    if (selected === trainingSelect || bySelect.get(selected)?.key === "TRAINING") {
      if (!selectedTrainingId) {
        toast.error("Select an assigned training before starting")
        return
      }
      const assignment = trainingAssignments.find((a) => a.id === selectedTrainingId)
      payload = {
        activityType: "TRAINING",
        trainingAssignmentId: selectedTrainingId,
        description: description.trim() || (assignment ? `Training: ${assignment.title}` : "Training"),
      }
    } else {
      const nonProject = bySelect.get(selected)
      if (nonProject && nonProject.key !== "TRAINING") {
        payload = {
          activityType: nonProject.key,
          description: description.trim() || nonProject.label,
        }
      } else if (selected && selected !== "none") {
        payload = {
          projectId: selected,
          activityType: "PROJECT",
          description: description.trim() || undefined,
        }
      } else {
        toast.error("Choose a project or activity to clock in")
        return
      }
    }

    setStarting(true)
    try {
      const res = await fetch("/api/time-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...payload,
          ...buildClientClockPayload(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Could not clock in")
        return
      }
      toast.success("Clocked in")
      setClockInOpen(false)
      notifyClockStatusChanged()
      void refresh()
    } catch {
      toast.error("Could not clock in")
    } finally {
      setStarting(false)
    }
  }

  if (!canClock || loading) return null

  if (!status.active) {
    return (
      <>
        <button
          type="button"
          onClick={openClockIn}
          className={cn(
            "th-clock-in group relative inline-flex items-center justify-center gap-2 rounded-full",
            "h-9 px-2.5 sm:px-3",
            "border border-emerald-500/30 bg-emerald-500/5",
            "hover:bg-emerald-500/10 hover:border-emerald-500/45",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          )}
          aria-label="Clock in"
          title="Clock in from here"
        >
          <Play className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 fill-emerald-600/20" />
          <span className="hidden sm:inline text-[11px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
            Clock in
          </span>
        </button>

        <Dialog open={clockInOpen} onOpenChange={setClockInOpen}>
          <DialogContent className="sm:max-w-[440px] max-h-[min(85dvh,40rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-4 w-4 text-emerald-600" />
                Clock in
              </DialogTitle>
              <DialogDescription>
                Start a session here — no need to leave this page. Use Time Tracking anytime for full controls.
              </DialogDescription>
            </DialogHeader>

            {optionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading options…
              </div>
            ) : (
              <div className="space-y-4 py-1">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">What are you working on?</Label>
                  <ClockInKindToggle
                    value={kind}
                    onChange={handleKindChange}
                    projectHasWork={projectHasWork}
                    activityHasWork={activityBadgeKeys.size > 0}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {kind === "project" ? "Project" : "Activity"}
                  </Label>
                  <Select
                    value={selected === "none" ? undefined : selected}
                    onValueChange={handleSelectChange}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue
                        placeholder={
                          kind === "project" ? "Choose a project…" : "Choose an activity…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {kind === "project" ? (
                        <ProjectSelectItems projects={projects} />
                      ) : (
                        <NonProjectActivityItems
                          activities={activities}
                          badgeKeys={activityBadgeKeys}
                        />
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {isTrainingSelected && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Training assignment</Label>
                    <Select
                      value={selectedTrainingId || undefined}
                      onValueChange={setSelectedTrainingId}
                      disabled={trainingLoading}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue
                          placeholder={
                            trainingLoading ? "Loading…" : "Select assigned training…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {trainingAssignments.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            No open training assignments
                          </SelectItem>
                        ) : (
                          trainingAssignments.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {safeText(t.title)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What are you doing?"
                    maxLength={500}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setClockInOpen(false)
                  router.push("/dashboard/time-tracking?tab=today")
                }}
              >
                Open Time Tracking
              </Button>
              <Button
                type="button"
                className="th-clock-in bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={
                  starting ||
                  optionsLoading ||
                  selected === "none" ||
                  (isTrainingSelected && !selectedTrainingId)
                }
                onClick={() => void handleStart()}
              >
                {starting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Clock in
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setActiveOpen(true)}
        className={cn(
          "th-clock-in th-clock-in--live group relative inline-flex items-center justify-center gap-2 rounded-full",
          "h-9 px-2.5 sm:px-3",
          "border border-emerald-500/40 bg-emerald-500/10",
          "hover:bg-emerald-500/15 hover:border-emerald-500/55",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
          "animate-[clock-in-glow_2.4s_ease-in-out_infinite]"
        )}
        aria-label="You are clocked in. Open Time Tracking?"
        title={`Clocked in${activity ? `: ${activity}` : ""}${elapsed ? ` · ${elapsed}` : ""}`}
      >
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.55)]" />
        </span>
        <span className="hidden sm:inline text-[11px] font-semibold tracking-wide text-emerald-700 dark:text-emerald-300">
          Clocked in
          {elapsed ? <span className="font-normal opacity-80"> · {elapsed}</span> : null}
        </span>
      </button>

      <AlertDialog open={activeOpen} onOpenChange={setActiveOpen}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              You are clocked in
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <span className="block">
                Open Time Tracking to clock out, switch activity, or review your session?
              </span>
              {(activity || elapsed) && (
                <span className="block rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                    {activity}
                  </span>
                  {elapsed ? (
                    <span className="mt-0.5 block text-muted-foreground">Running {elapsed}</span>
                  ) : null}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setActiveOpen(false)
                router.push("/dashboard/time-tracking?tab=today")
              }}
            >
              Yes, open Time Tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
