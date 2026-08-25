/**
 * DeepSeek Peak / Off-Peak pricing status.
 *
 * DeepSeek API billing rules (official):
 *   - Pricing is defined in BEIJING TIME (Asia/Shanghai).
 *   - Weekday peak windows: 09:00–12:00 and 14:00–18:00 Beijing Time (2× rate).
 *   - Weekends (Sat/Sun Beijing Time) are off-peak all day (effective 2026-08-23).
 *
 * The state is ALWAYS derived from Asia/Shanghai; the user's timezone is used
 * ONLY for display. Zero dependency: uses the native Intl timezone engine so
 * DST transitions (Europe/London) and fixed offsets (Asia/Kolkata, Asia/Shanghai)
 * are handled automatically by the platform — no hard-coded offsets anywhere.
 */

export const DEEPSEEK_BILLING_TIMEZONE = "Asia/Shanghai"

/** Weekday peak windows in Beijing wall-clock minutes (inclusive start, exclusive end). */
export const DEEPSEEK_WEEKDAY_PEAK_WINDOWS: Array<{ start: string; end: string }> = [
  { start: "09:00", end: "12:00" },
  { start: "14:00", end: "18:00" },
]

export const DEEPSEEK_WEEKEND_ALWAYS_OFF_PEAK = true

export type DeepSeekStatus = "peak" | "off_peak"

export type DeepSeekPricingState = {
  status: DeepSeekStatus
  isWeekend: boolean
  billingTimezone: string
  userTimezone: string | null
  userCountry: "UK" | "INDIA" | null
  /** User-local wall-clock time of "now". */
  currentLocalTime: Date
  /** Beijing wall-clock time of "now". */
  currentBeijingTime: Date
  /** Instant when the current period started (Beijing-derived, absolute). */
  periodStartedAt: Date
  /** Instant when the current period ends (Beijing-derived, absolute). */
  periodEndsAt: Date
  /** Absolute instant of the next pricing transition. */
  nextTransitionAt: Date
  nextStatus: DeepSeekStatus
  millisecondsUntilTransition: number
  display: {
    statusLabel: string
    transitionLabel: string
    transitionLocalTime: string
    transitionWeekday: string
    countdown: string
    userTimezoneLabel: string
    billingTimezoneLabel: string
    recommendation: string
  }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Wall-clock parts of an instant in an IANA timezone, via native Intl. */
function partsInZone(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: WEEKDAY_INDEX[map.weekday] ?? -1,
  }
}

/** Short timezone abbreviation (e.g. GMT, BST, IST) derived by Intl. */
function tzAbbreviation(instant: Date, timeZone: string): string {
  try {
    // "longOffset" gives "GMT+08:00"; "short" gives "GMT" / "BST" / "IST" on
    // most platforms. Prefer the generic short name when it is not an offset.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour12: false,
    })
    for (const p of fmt.formatToParts(instant)) {
      if (p.type === "timeZoneName") {
        const v = p.value
        if (/^[A-Z]{2,5}$/.test(v)) return v // GMT, BST, IST, CST…
        return v
      }
    }
  } catch {
    /* fall through */
  }
  return timeZone
}

/** Long timezone name (e.g. "China Standard Time"). */
function tzLongName(instant: Date, timeZone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
    for (const p of fmt.formatToParts(instant)) {
      if (p.type === "timeZoneName") return p.value
    }
  } catch {
    /* fall through */
  }
  return timeZone
}

/**
 * Convert a wall-clock time (as a plain Date with local fields) in `timeZone`
 * to the absolute UTC instant, using the Intl round-trip. Converges in 1–2
 * iterations for fixed-offset zones and handles DST zones for unambiguous
 * wall times. No offset arithmetic is hard-coded.
 */
function wallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const wallTarget = Date.UTC(year, month - 1, day, hour, minute)
  let guess = wallTarget
  for (let i = 0; i < 3; i++) {
    const parts = partsInZone(new Date(guess), timeZone)
    const currentWall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const diff = wallTarget - currentWall
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}

/** Resolve the employee timezone: browser → profile country fallback → null. */
export function resolveUserTimezone(
  browserTimezone: string | null | undefined,
  profileCountry?: string | null | undefined
): { timezone: string | null; country: "UK" | "INDIA" | null } {
  const tz = browserTimezone || null
  const norm = tz ? tz.replace("Asia/Calcutta", "Asia/Kolkata") : null
  if (norm === "Europe/London") return { timezone: norm, country: "UK" }
  if (norm === "Asia/Kolkata") return { timezone: norm, country: "INDIA" }

  // Profile-country fallback (UserDetail.country: "UK" | "INDIA").
  if (profileCountry === "UK") return { timezone: "Europe/London", country: "UK" }
  if (profileCountry === "INDIA") return { timezone: "Asia/Kolkata", country: "INDIA" }

  // Unsupported browser timezone: still show Beijing-derived status, label unavailable.
  return { timezone: null, country: null }
}

function minutesToWindow(min: number): DeepSeekStatus {
  for (const w of DEEPSEEK_WEEKDAY_PEAK_WINDOWS) {
    const [sh, sm] = w.start.split(":").map(Number)
    const [eh, em] = w.end.split(":").map(Number)
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    if (min >= startMin && min < endMin) return "peak"
  }
  return "off_peak"
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${pad(h)}h ${pad(m)}m`
}

function formatLocalClock(instant: Date, timeZone: string | null): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || undefined,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  return fmt.format(instant).replace(/\s?/g, "").toUpperCase()
}

function formatLocalWeekday(instant: Date, timeZone: string | null): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || undefined, weekday: "long" })
  return fmt.format(instant)
}

/** Core calculation: current instant → Asia/Shanghai → DeepSeek rule → local display. */
export function getDeepSeekPricingState(
  now: Date = new Date(),
  browserTimezone?: string | null,
  profileCountry?: string | null
): DeepSeekPricingState {
  const { timezone: userTimezone, country: userCountry } = resolveUserTimezone(
    browserTimezone,
    profileCountry
  )
  const bj = partsInZone(now, DEEPSEEK_BILLING_TIMEZONE)
  const bjMin = bj.hour * 60 + bj.minute
  const isWeekend = bj.weekday === 0 || bj.weekday === 6

  const status: DeepSeekStatus =
    DEEPSEEK_WEEKEND_ALWAYS_OFF_PEAK && isWeekend ? "off_peak" : minutesToWindow(bjMin)

  // ── Next transition (always computed in Asia/Shanghai) ──
  const transition = (() => {
    if (isWeekend) {
      // Next peak: Monday 09:00 Beijing.
      const daysUntilMonday = (8 - bj.weekday) % 7 || 7
      const t = wallTimeToInstant(bj.year, bj.month, bj.day + daysUntilMonday, 9, 0, DEEPSEEK_BILLING_TIMEZONE)
      return { at: t, next: "peak" as DeepSeekStatus }
    }
    if (status === "peak") {
      const end =
        bjMin < 12 * 60 ? { h: 12, m: 0 } : { h: 18, m: 0 }
      const t = wallTimeToInstant(bj.year, bj.month, bj.day, end.h, end.m, DEEPSEEK_BILLING_TIMEZONE)
      return { at: t, next: "off_peak" as DeepSeekStatus }
    }
    // Off-peak on a weekday: 09:00 (if before), 14:00 (if lunch window), or next weekday 09:00.
    if (bjMin < 9 * 60) {
      const t = wallTimeToInstant(bj.year, bj.month, bj.day, 9, 0, DEEPSEEK_BILLING_TIMEZONE)
      return { at: t, next: "peak" as DeepSeekStatus }
    }
    if (bjMin < 14 * 60) {
      const t = wallTimeToInstant(bj.year, bj.month, bj.day, 14, 0, DEEPSEEK_BILLING_TIMEZONE)
      return { at: t, next: "peak" as DeepSeekStatus }
    }
    // After 18:00 Beijing → next weekday 09:00 (Friday → Monday).
    const daysUntilNextWeekday = bj.weekday === 5 ? 3 : 1
    const t = wallTimeToInstant(bj.year, bj.month, bj.day + daysUntilNextWeekday, 9, 0, DEEPSEEK_BILLING_TIMEZONE)
    return { at: t, next: "peak" as DeepSeekStatus }
  })()

  const periodStartedAt = (() => {
    if (isWeekend) {
      const t = wallTimeToInstant(bj.year, bj.month, bj.day, 0, 0, DEEPSEEK_BILLING_TIMEZONE)
      return t
    }
    if (status === "peak") {
      const start = bjMin < 12 * 60 ? 9 * 60 : 14 * 60
      return wallTimeToInstant(bj.year, bj.month, bj.day, Math.floor(start / 60), start % 60, DEEPSEEK_BILLING_TIMEZONE)
    }
    // Off-peak weekday start: previous boundary (18:00 prev day, 12:00, or 00:00).
    if (bjMin < 9 * 60) {
      return wallTimeToInstant(bj.year, bj.month, bj.day, 0, 0, DEEPSEEK_BILLING_TIMEZONE)
    }
    if (bjMin < 14 * 60) {
      return wallTimeToInstant(bj.year, bj.month, bj.day, 12, 0, DEEPSEEK_BILLING_TIMEZONE)
    }
    return wallTimeToInstant(bj.year, bj.month, bj.day, 18, 0, DEEPSEEK_BILLING_TIMEZONE)
  })()

  const periodEndsAt = transition.at
  const millisecondsUntilTransition = Math.max(0, transition.at.getTime() - now.getTime())

  const userTzAbbr = userTimezone ? tzAbbreviation(now, userTimezone) : "—"
  const billingAbbr = tzAbbreviation(now, DEEPSEEK_BILLING_TIMEZONE)
  const billingLong = tzLongName(now, DEEPSEEK_BILLING_TIMEZONE)
  const userCountryLabel =
    userCountry === "UK" ? "United Kingdom" : userCountry === "INDIA" ? "India" : "Unknown"

  return {
    status,
    isWeekend,
    billingTimezone: DEEPSEEK_BILLING_TIMEZONE,
    userTimezone,
    userCountry,
    currentLocalTime: new Date(now.getTime()),
    currentBeijingTime: new Date(now.getTime()),
    periodStartedAt,
    periodEndsAt,
    nextTransitionAt: transition.at,
    nextStatus: transition.next,
    millisecondsUntilTransition,
    display: {
      statusLabel: status === "peak" ? "DeepSeek Peak" : "DeepSeek Off-Peak",
      transitionLabel:
        isWeekend
          ? "Weekend off-peak"
          : status === "peak"
            ? "Peak ends"
            : "Off-peak ends",
      transitionLocalTime: formatLocalClock(transition.at, userTimezone),
      transitionWeekday: formatLocalWeekday(transition.at, userTimezone),
      countdown: formatCountdown(millisecondsUntilTransition),
      userTimezoneLabel: userTimezone
        ? `${userCountryLabel} · ${userTzAbbr}`
        : "Timezone unavailable",
      billingTimezoneLabel: `Beijing · ${billingAbbr} (${billingLong})`,
      recommendation:
        status === "peak"
          ? "Consider moving non-urgent heavy AI workloads to off-peak."
          : "Good time for heavier DeepSeek workloads.",
    },
  }
}
