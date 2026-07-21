/**
 * Shared milestone helpers for clock-in briefing / clock-out gates.
 * Work calendar day uses Europe/London (same as clock integrity).
 */

import { WORK_TIMEZONE } from "@/lib/clock-integrity"

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
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
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

type AssigneeLike = { userId: string }

/**
 * Used for assignment UI / notifications only.
 * Clock-in briefing and clock-out gates use ALL project milestones (per product prompt).
 */
export function isMilestoneRelevantToUser(
  assignees: AssigneeLike[],
  userId: string
): boolean {
  if (!assignees || assignees.length === 0) return true
  return assignees.some((a) => a.userId === userId)
}
