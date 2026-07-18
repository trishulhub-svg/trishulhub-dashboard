/**
 * Clock integrity for Time Tracking.
 *
 * Company work clock = UK (Europe/London).
 * Employees may be physically in India or UK — that is fine.
 * What we block: a device whose clock was manually changed (cheat / fake time).
 *
 * Method: client sends its current wall-clock as UTC ISO (`clientNow`).
 * Server compares to authoritative server UTC. Timezone label is recorded for
 * clarity but skew is always measured in absolute UTC milliseconds.
 */

export const WORK_TIMEZONE = "Europe/London"

/** Allow small drift for network latency / OS sync lag */
export const MAX_CLOCK_SKEW_MS = 3 * 60 * 1000 // 3 minutes

export type ClockIntegrityOk = {
  ok: true
  skewMs: number
  serverNow: Date
  timezone: string
  serverNowUk: string
}

export type ClockIntegrityFail = {
  ok: false
  status: 400 | 403
  error: string
  code: "CLOCK_REQUIRED" | "CLOCK_INVALID" | "CLOCK_SKEW"
  details: {
    serverNow: string
    serverNowUk: string
    clientNow?: string
    skewMs?: number
    maxSkewMs: number
    workTimezone: string
  }
}

export type ClockIntegrityResult = ClockIntegrityOk | ClockIntegrityFail

function formatUk(date: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: WORK_TIMEZONE,
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

function parseClientNow(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function normalizeTimezone(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "unknown"
  const tz = raw.trim()
  // Soft validate IANA-ish timezone (Europe/London, Asia/Kolkata, etc.)
  if (!/^[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(tz) || tz.length > 64) {
    return "unknown"
  }
  try {
    // Throws RangeError for invalid zones in modern runtimes
    Intl.DateTimeFormat("en-GB", { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return "unknown"
  }
}

/**
 * Validate that the client's device clock matches real time (server UTC).
 * Call on every self-serve clock-in / clock-out.
 */
export function checkClientClockIntegrity(input: {
  clientNow?: unknown
  timezone?: unknown
  /** Override "now" for tests */
  serverNow?: Date
}): ClockIntegrityResult {
  const serverNow = input.serverNow ?? new Date()
  const serverNowUk = formatUk(serverNow)
  const timezone = normalizeTimezone(input.timezone)

  if (input.clientNow === undefined || input.clientNow === null || input.clientNow === "") {
    return {
      ok: false,
      status: 400,
      code: "CLOCK_REQUIRED",
      error:
        "Device time is required to clock in/out. Please update the app and enable Automatic date & time on your phone.",
      details: {
        serverNow: serverNow.toISOString(),
        serverNowUk,
        maxSkewMs: MAX_CLOCK_SKEW_MS,
        workTimezone: WORK_TIMEZONE,
      },
    }
  }

  const clientDate = parseClientNow(input.clientNow)
  if (!clientDate) {
    return {
      ok: false,
      status: 400,
      code: "CLOCK_INVALID",
      error: "Device time could not be read. Enable Automatic date & time, then try again.",
      details: {
        serverNow: serverNow.toISOString(),
        serverNowUk,
        clientNow: String(input.clientNow),
        maxSkewMs: MAX_CLOCK_SKEW_MS,
        workTimezone: WORK_TIMEZONE,
      },
    }
  }

  const skewMs = clientDate.getTime() - serverNow.getTime()
  const absSkew = Math.abs(skewMs)

  if (absSkew > MAX_CLOCK_SKEW_MS) {
    const mins = Math.max(1, Math.round(absSkew / 60000))
    const direction = skewMs > 0 ? "ahead of" : "behind"
    return {
      ok: false,
      status: 403,
      code: "CLOCK_SKEW",
      error:
        `Clock in/out blocked: your device clock is about ${mins} minute(s) ${direction} UK company time. ` +
        `Turn on Automatic date & time (and automatic timezone) on your phone, then try again. ` +
        `Working from India is fine — only a manually changed clock is blocked.`,
      details: {
        serverNow: serverNow.toISOString(),
        serverNowUk,
        clientNow: clientDate.toISOString(),
        skewMs,
        maxSkewMs: MAX_CLOCK_SKEW_MS,
        workTimezone: WORK_TIMEZONE,
      },
    }
  }

  return {
    ok: true,
    skewMs,
    serverNow,
    timezone,
    serverNowUk,
  }
}

/** Browser helper payload for clock-in / clock-out requests */
export function buildClientClockPayload(): { clientNow: string; timezone: string } {
  let timezone = "unknown"
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"
  } catch {
    /* ignore */
  }
  return {
    clientNow: new Date().toISOString(),
    timezone,
  }
}
