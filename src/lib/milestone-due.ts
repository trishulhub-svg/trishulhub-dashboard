/**
 * UK (Europe/London) milestone due helpers + overdue notifier.
 */
import { WORK_TIMEZONE } from "@/lib/clock-integrity"
import { db } from "@/lib/db"
import { notifyUsers } from "@/lib/notifications"
import { todayDateKey, toDateKey } from "@/lib/milestones"

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Process-local debounce so notification/milestone polls don't stampede Turso. */
let lastOverdueSweepAt = 0
const OVERDUE_SWEEP_COOLDOWN_MS = 60_000
let overdueSweepInFlight: Promise<number> | null = null

export function parseOptionalDueTime(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === "") return null
  if (typeof raw !== "string" || !HHMM.test(raw)) return undefined
  return raw
}

/** Instant when a due date (+ optional HH:mm UK) is considered overdue. */
export function dueDeadlineUtc(dueDate: Date | string, dueTime?: string | null): Date {
  const dayKey =
    typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueDate)
      ? dueDate.slice(0, 10)
      : new Date(dueDate).toISOString().slice(0, 10)

  const time = dueTime && HHMM.test(dueTime) ? dueTime : "23:59"
  const [y, m, d] = dayKey.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)

  let guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: WORK_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0)
    const ly = get("year")
    const lm = get("month")
    const ld = get("day")
    const lh = get("hour") === 24 ? 0 : get("hour")
    const lmin = get("minute")
    const localAsUtc = Date.UTC(ly, lm - 1, ld, lh, lmin, 0, 0)
    const targetAsUtc = Date.UTC(y, m - 1, d, hh, mm, 0, 0)
    guess += targetAsUtc - localAsUtc
  }
  // End of day without time: due after 23:59:59 London
  if (!dueTime || !HHMM.test(dueTime)) {
    guess += 59 * 1000
  }
  return new Date(guess)
}

export function isMilestoneOverdue(
  dueDate: Date | string | null | undefined,
  dueTime: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dueDate) return false
  return now.getTime() >= dueDeadlineUtc(dueDate, dueTime).getTime()
}

/** Next UK calendar day YYYY-MM-DD after `fromKey`. */
export function nextUkDateKey(fromKey: string): string {
  const [y, m, d] = fromKey.split("-").map(Number)
  let t = Date.UTC(y, m - 1, d, 12, 0, 0)
  for (let i = 0; i < 48; i++) {
    t += 60 * 60 * 1000
    if (toDateKey(new Date(t), WORK_TIMEZONE) > fromKey) {
      return toDateKey(new Date(t), WORK_TIMEZONE)
    }
  }
  const dt = new Date(`${fromKey}T12:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

/** Open carried-forward milestones assigned to a user (blocks clock-out / switch escape). */
export async function countOpenCarriedMilestones(userId: string): Promise<number> {
  return db.projectMilestone.count({
    where: {
      done: false,
      carriedForward: true,
      assignees: { some: { userId } },
    },
  })
}

/**
 * Notify assignees + ADMIN/SUPER_ADMIN/PM for overdue unfinished milestones.
 * Idempotent via dueNotifiedAt. Debounced for hot-path callers.
 */
export async function notifyOverdueMilestones(limit = 40): Promise<number> {
  const nowMs = Date.now()
  if (nowMs - lastOverdueSweepAt < OVERDUE_SWEEP_COOLDOWN_MS) {
    return 0
  }
  if (overdueSweepInFlight) {
    return overdueSweepInFlight
  }

  overdueSweepInFlight = (async () => {
    lastOverdueSweepAt = Date.now()
    const now = new Date()
    let open: Array<{
      id: string
      projectId: string
      title: string
      dueDate: Date | null
      dueTime: string | null
      assignees: { userId: string }[]
      project: { id: string; name: string }
    }> = []
    try {
      open = await db.projectMilestone.findMany({
        where: { done: false, dueDate: { not: null }, dueNotifiedAt: null },
        include: {
          assignees: { select: { userId: true } },
          project: { select: { id: true, name: true } },
        },
        take: limit,
        orderBy: { dueDate: "asc" },
      })
    } catch (err) {
      // Schema drift (missing dueNotifiedAt/dueTime) must not break milestone GETs
      console.warn(
        "[milestone-due] overdue query skipped:",
        err instanceof Error ? err.message : err
      )
      return 0
    }

    const due = open.filter(
      (m) => m.dueDate && isMilestoneOverdue(m.dueDate, m.dueTime, now)
    )
    if (due.length === 0) return 0

    // Claim first to reduce duplicate spam under concurrent polls
    const claimIds = due.map((m) => m.id)
    await db.projectMilestone.updateMany({
      where: { id: { in: claimIds }, dueNotifiedAt: null },
      data: { dueNotifiedAt: now },
    })

    const [admins, pms] = await Promise.all([
      db.user.findMany({
        where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
        select: { id: true },
      }),
      db.user.findMany({
        where: { isActive: true, role: "PROJECT_MANAGER" },
        select: { id: true },
      }),
    ])
    const leadershipIds = [...new Set([...admins, ...pms].map((u) => u.id))]

    let sent = 0
    for (const m of due) {
      const assigneeIds = m.assignees.map((a) => a.userId)
      const title = `Milestone overdue: ${m.title}`
      const message = `"${m.title}" on ${m.project.name} is past due (${toDateKey(m.dueDate!)}${m.dueTime ? ` ${m.dueTime} UK` : ""}).`
      const recipientIds = [...new Set([...assigneeIds, ...leadershipIds])]
      if (recipientIds.length > 0) {
        void notifyUsers(recipientIds, {
          title,
          message,
          type: "WARNING",
          link: `/dashboard/projects/${m.projectId}`,
          metadata: { projectId: m.projectId, milestoneId: m.id, kind: "milestone_overdue" },
        })
      }
      sent++
    }
    return sent
  })()

  try {
    return await overdueSweepInFlight
  } finally {
    overdueSweepInFlight = null
  }
}

export { todayDateKey }
