/**
 * Shared display formatting — dates, currency, URLs.
 *
 * Canonical date display across TrishulHub UI: **DD MMM YYYY**
 * Example: 03 Aug 2026
 *
 * Keep YYYY-MM-DD only for <input type="date"> values and API payloads.
 */

/** Currency symbols mapping */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
}

/** Company display default — new finance UI shows GBP (£). */
export const DEFAULT_DISPLAY_CURRENCY = "GBP"

/** Get currency symbol for a currency code */
export function getCurrencySymbol(currency: string = DEFAULT_DISPLAY_CURRENCY): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

/** Format a number as currency (defaults to GBP) */
export function formatCurrency(amount: number, currency: string = DEFAULT_DISPLAY_CURRENCY): string {
  const symbol = getCurrencySymbol(currency)
  if (currency === "INR") {
    return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
  }
  if (currency === "GBP") {
    return `${symbol}${amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`
  }
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/**
 * Parse a date value for display without UTC day-shift on YYYY-MM-DD strings.
 */
export function parseDisplayDate(input: string | Date | null | undefined): Date | null {
  if (input == null || input === "") return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input
  }
  const raw = String(input).trim()
  if (!raw) return null

  // Date-only: YYYY-MM-DD or YYYY-MM-DDTHH:mm… → use calendar components
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const local = new Date(y, mo, d)
    return Number.isNaN(local.getTime()) ? null : local
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Pad day to 2 digits */
function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * Canonical UI date: DD MMM YYYY (e.g. 03 Aug 2026)
 */
export function formatDisplayDate(
  input: string | Date | null | undefined,
  fallback: string = "—"
): string {
  const d = parseDisplayDate(input)
  if (!d) return fallback
  return `${pad2(d.getDate())} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Date with weekday: DDD DD MMM YYYY (e.g. Mon 03 Aug 2026)
 */
export function formatDisplayDateWithWeekday(
  input: string | Date | null | undefined,
  fallback: string = "—"
): string {
  const d = parseDisplayDate(input)
  if (!d) return fallback
  return `${WEEKDAY_SHORT[d.getDay()]} ${pad2(d.getDate())} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Compact month+day (e.g. 03 Aug) — use in tight grids; still DD MMM order.
 */
export function formatDisplayDateShort(
  input: string | Date | null | undefined,
  fallback: string = "—"
): string {
  const d = parseDisplayDate(input)
  if (!d) return fallback
  return `${pad2(d.getDate())} ${MONTH_SHORT[d.getMonth()]}`
}

/**
 * Inclusive range: 03 Aug 2026 → 31 Aug 2026 (single day collapses)
 */
export function formatDisplayDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  fallback: string = "—"
): string {
  const a = formatDisplayDate(start, "")
  const b = formatDisplayDate(end, "")
  if (!a && !b) return fallback
  if (!a) return b
  if (!b || a === b) return a
  return `${a} → ${b}`
}

/** Alias used across Finance / Training — same as formatDisplayDate */
export function formatDate(d: string | Date | null | undefined): string {
  return formatDisplayDate(d, "N/A")
}

/** Format a date with time (DD MMM YYYY, HH:mm) */
export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "N/A"
  try {
    const date = typeof d === "string" || d instanceof Date ? parseDisplayDate(d) : null
    const full = date || new Date(d as string | Date)
    if (Number.isNaN(full.getTime())) return "Invalid date"
    const hh = pad2(full.getHours())
    const mm = pad2(full.getMinutes())
    return `${formatDisplayDate(full)} · ${hh}:${mm}`
  } catch {
    return "Invalid date"
  }
}

/** YYYY-MM-DD for form inputs / API keys (not for display) */
export function toDateInputValue(d: Date | string | null | undefined): string {
  const date = parseDisplayDate(d)
  if (!date) return ""
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Expense category badge colors */
export const CATEGORY_BADGE_COLORS: Record<string, string> = {
  HOSTING: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DOMAINS: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  API_COSTS: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  TOOLS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  MARKETING: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  SALARY: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  SOFTWARE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

/** Validate a URL is safe (http/https only) */
export function safeUrl(url: string | null | undefined): string {
  if (!url) return "#"
  try {
    const parsed = new URL(url)
    if (["http:", "https:"].includes(parsed.protocol)) return url
    return "#"
  } catch {
    return "#"
  }
}
