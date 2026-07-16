/** Shared due-date helpers for Learning / training assignments */

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function formatDueDate(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return "—"
  try {
    return new Date(dueDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return "—"
  }
}

export type DueCountdown = {
  days: number
  label: string
  tone: "overdue" | "today" | "soon" | "ok" | "done"
}

/** Days left until due (calendar days). Negative = overdue. */
export function dueCountdown(
  dueDate: string | Date | null | undefined,
  status?: string
): DueCountdown {
  if (status === "DONE") {
    return { days: 0, label: "Completed", tone: "done" }
  }
  if (!dueDate) {
    return { days: 0, label: "No due date", tone: "ok" }
  }
  const due = startOfDay(new Date(dueDate))
  if (Number.isNaN(due.getTime())) {
    return { days: 0, label: "Invalid date", tone: "ok" }
  }
  const today = startOfDay(new Date())
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days < 0) {
    const n = Math.abs(days)
    return {
      days,
      label: n === 1 ? "1 day overdue" : `${n} days overdue`,
      tone: "overdue",
    }
  }
  if (days === 0) return { days: 0, label: "Due today", tone: "today" }
  if (days === 1) return { days: 1, label: "1 day left", tone: "soon" }
  if (days <= 3) return { days, label: `${days} days left`, tone: "soon" }
  return { days, label: `${days} days left`, tone: "ok" }
}

export function dueToneClass(tone: DueCountdown["tone"]): string {
  switch (tone) {
    case "overdue":
      return "text-destructive"
    case "today":
      return "text-amber-700 dark:text-amber-400"
    case "soon":
      return "text-amber-700 dark:text-amber-400"
    case "done":
      return "text-success"
    default:
      return "text-muted-foreground"
  }
}
