/**
 * Shared milestone helpers for clock-in briefing / clock-out gates.
 * Work calendar day uses Europe/London (same as clock integrity).
 */

import { WORK_TIMEZONE } from "@/lib/clock-integrity"
import { db } from "@/lib/db"
import { formatDisplayDateWithWeekday } from "@/lib/format"

/** Progress % from completed / total milestones (0 when none). */
export function milestoneProgressPercent(doneCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0
  return Math.round((doneCount / totalCount) * 100)
}

/** Sync Project.progress from milestone completion ratio. */
export async function syncProjectProgressFromMilestones(projectId: string): Promise<number> {
  const [total, done] = await Promise.all([
    db.projectMilestone.count({ where: { projectId } }),
    db.projectMilestone.count({ where: { projectId, done: true } }),
  ])
  const progress = milestoneProgressPercent(done, total)
  await db.project.update({
    where: { id: projectId },
    data: { progress },
  })
  return progress
}

/** Calendar day YYYY-MM-DD in the company work timezone. */
export function toDateKey(d: Date | string, timeZone: string = WORK_TIMEZONE): string {
  const date = typeof d === "string" ? new Date(d) : d
  try {
    // en-CA → YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function todayDateKey(now: Date = new Date()): string {
  return toDateKey(now, WORK_TIMEZONE)
}

/** Parse HTML date input (YYYY-MM-DD) to Date at UTC midnight. */
export function parseDueDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDueDateLabel(d: Date | string): string {
  return formatDisplayDateWithWeekday(d, "—")
}

/**
 * True when milestone is due today or overdue (not a future due date).
 * Used for clock-out checklist — "due day, not future ones".
 */
export function isDueOnOrBefore(dueDate: Date | string, todayKey: string): boolean {
  // dueDate stored as UTC midnight of the picked calendar day
  const dueKey =
    typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueDate)
      ? dueDate.slice(0, 10)
      : new Date(dueDate).toISOString().slice(0, 10)
  return dueKey <= todayKey
}
