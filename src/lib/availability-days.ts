/**
 * Weekday filter for availability date ranges.
 * Convention matches Availability.dayOfWeek: 0=Sunday … 6=Saturday.
 * null / empty / all seven days ⇒ applies every day in the date span.
 */

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** Monday-first order for UI toggles */
export const WEEKDAY_TOGGLE_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export type DaysOfWeekValue = number[] | null

/** True when the stored filter means every weekday. */
export function isAllWeekdays(days: DaysOfWeekValue): boolean {
  if (days == null || days.length === 0) return true
  if (days.length < 7) return false
  const set = new Set(days)
  return ALL_WEEKDAYS.every((d) => set.has(d))
}

/**
 * Parse DB / API value into a normalized unique sorted list, or null (= all days).
 */
export function parseDaysOfWeek(raw: unknown): DaysOfWeekValue {
  if (raw == null || raw === "") return null
  let arr: unknown[] = []
  if (Array.isArray(raw)) {
    arr = raw
  } else if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed || trimmed === "[]" || trimmed.toLowerCase() === "all") return null
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) arr = parsed
      else return null
    } catch {
      // Comma-separated fallback: "1,2,3"
      arr = trimmed.split(",").map((s) => s.trim()).filter(Boolean)
    }
  } else {
    return null
  }

  const nums = Array.from(
    new Set(
      arr
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )
  ).sort((a, b) => a - b)

  if (nums.length === 0 || isAllWeekdays(nums)) return null
  return nums
}

/** Serialize for DB TEXT column. null = all days. */
export function serializeDaysOfWeek(days: DaysOfWeekValue): string | null {
  const normalized = parseDaysOfWeek(days)
  if (normalized == null) return null
  return JSON.stringify(normalized)
}

/** Whether a date range applies on a given weekday (0–6). */
export function dateRangeAppliesOnDay(
  daysOfWeek: unknown,
  dayOfWeek: number
): boolean {
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return false
  const days = parseDaysOfWeek(daysOfWeek)
  if (days == null) return true
  return days.includes(dayOfWeek)
}

/** Validate request body daysOfWeek; returns normalized list or null (all). Throws-style via result. */
export function validateDaysOfWeekInput(
  raw: unknown
): { ok: true; value: DaysOfWeekValue } | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, value: null }
  }
  if (raw === null || raw === "" || raw === "all") {
    return { ok: true, value: null }
  }
  if (!Array.isArray(raw) && typeof raw !== "string") {
    return { ok: false, error: "daysOfWeek must be an array of weekday numbers (0–6) or null for all days" }
  }
  const parsed = parseDaysOfWeek(raw)
  if (Array.isArray(raw) && raw.length === 0) {
    return { ok: false, error: "Select at least one day, or choose All days" }
  }
  if (typeof raw === "string" && raw.trim() === "[]") {
    return { ok: false, error: "Select at least one day, or choose All days" }
  }
  // Explicit empty after parse of non-empty invalid → error
  if (Array.isArray(raw) && raw.length > 0 && parsed == null && !isAllWeekdays(
    raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  )) {
    // Had values but none valid
    const anyValid = raw.some((v) => {
      const n = typeof v === "number" ? v : Number(v)
      return Number.isInteger(n) && n >= 0 && n <= 6
    })
    if (!anyValid) {
      return { ok: false, error: "daysOfWeek values must be integers 0 (Sun) through 6 (Sat)" }
    }
  }
  return { ok: true, value: parsed }
}

/** Human label: "All days" | "Mon–Fri" | "Mon, Wed, Fri" */
export function formatDaysOfWeekLabel(daysOfWeek: unknown): string {
  const days = parseDaysOfWeek(daysOfWeek)
  if (days == null) return "All days"

  const set = new Set(days)
  const weekdays = [1, 2, 3, 4, 5]
  if (weekdays.every((d) => set.has(d)) && days.length === 5) return "Mon–Fri"
  if (days.length === 2 && set.has(0) && set.has(6)) return "Weekends"

  // Prefer Mon→Sun ordering for display
  const ordered = WEEKDAY_TOGGLE_ORDER.filter((d) => set.has(d))
  return ordered.map((d) => WEEKDAY_SHORT[d]).join(", ")
}
