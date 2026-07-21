/**
 * Shared milestone helpers for clock-in briefing / clock-out gates.
 */

/** Calendar day YYYY-MM-DD in UTC (date inputs store dueDate as UTC midnight). */
export function toDateKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

export function todayDateKey(now: Date = new Date()): string {
  return toDateKey(now)
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
 */
export function isDueOnOrBefore(dueDate: Date | string, todayKey: string): boolean {
  return toDateKey(dueDate) <= todayKey
}

type AssigneeLike = { userId: string }

/**
 * Visible to user when unassigned OR user is an assignee.
 */
export function isMilestoneRelevantToUser(
  assignees: AssigneeLike[],
  userId: string
): boolean {
  if (!assignees || assignees.length === 0) return true
  return assignees.some((a) => a.userId === userId)
}
