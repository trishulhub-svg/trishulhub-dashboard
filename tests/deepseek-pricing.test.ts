import { describe, it, expect } from "vitest"
import {
  getDeepSeekPricingState,
  resolveUserTimezone,
  DEEPSEEK_BILLING_TIMEZONE,
} from "@/lib/deepseek-pricing"

/**
 * Build an absolute instant for a given Beijing wall-clock time.
 * Asia/Shanghai has no DST, so UTC = Beijing - 8h, but we express it via
 * Date.UTC so the engine receives the correct instant regardless of host TZ.
 */
function beijing(y: number, mo: number, d: number, h: number, mi: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h - 8, mi))
}

describe("DeepSeek pricing state", () => {
  it("is always derived from Asia/Shanghai regardless of user timezone", () => {
    // Monday 09:00 Beijing = 06:30 India = 02:00 UK (BST)
    const instant = beijing(2026, 8, 24, 9, 0)
    const india = getDeepSeekPricingState(instant, "Asia/Kolkata")
    const uk = getDeepSeekPricingState(instant, "Europe/London")
    expect(india.status).toBe("peak")
    expect(uk.status).toBe("peak")
    expect(india.status).toBe(uk.status)
    expect(india.userTimezone).toBe("Asia/Kolkata")
    expect(uk.userTimezone).toBe("Europe/London")
  })

  it("Monday 08:59 Beijing → off-peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 8, 59), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Monday 09:00 Beijing → peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 9, 0), "Asia/Kolkata").status).toBe("peak")
  })
  it("Monday 11:59 Beijing → peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 11, 59), "Asia/Kolkata").status).toBe("peak")
  })
  it("Monday 12:00 Beijing → off-peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 12, 0), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Monday 13:59 Beijing → off-peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 13, 59), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Monday 14:00 Beijing → peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 14, 0), "Asia/Kolkata").status).toBe("peak")
  })
  it("Monday 17:59 Beijing → peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 17, 59), "Asia/Kolkata").status).toBe("peak")
  })
  it("Monday 18:00 Beijing → off-peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 24, 18, 0), "Asia/Kolkata").status).toBe("off_peak")
  })

  it("Friday 23:59 Beijing → off-peak", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 28, 23, 59), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Saturday 00:00 Beijing → off-peak (weekend)", () => {
    const s = getDeepSeekPricingState(beijing(2026, 8, 29, 0, 0), "Asia/Kolkata")
    expect(s.status).toBe("off_peak")
    expect(s.isWeekend).toBe(true)
  })
  it("Saturday midday → off-peak (weekend)", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 29, 12, 0), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Sunday midday → off-peak (weekend)", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 30, 12, 0), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Monday 08:59 Beijing → off-peak (after weekend)", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 31, 8, 59), "Asia/Kolkata").status).toBe("off_peak")
  })
  it("Monday 09:00 Beijing → peak (after weekend)", () => {
    expect(getDeepSeekPricingState(beijing(2026, 8, 31, 9, 0), "Asia/Kolkata").status).toBe("peak")
  })

  it("weekend next-peak points at Monday 09:00 Beijing", () => {
    const s = getDeepSeekPricingState(beijing(2026, 8, 29, 12, 0), "Asia/Kolkata")
    expect(s.isWeekend).toBe(true)
    expect(s.nextStatus).toBe("peak")
    // Monday 09:00 Beijing = Monday 06:30 India
    expect(s.display.transitionLocalTime).toContain("6:30")
    expect(s.display.transitionWeekday).toBe("Monday")
  })

  it("countdown stays positive and updates across a boundary", () => {
    const before = getDeepSeekPricingState(beijing(2026, 8, 24, 11, 59), "Asia/Kolkata")
    expect(before.status).toBe("peak")
    expect(before.millisecondsUntilTransition).toBeGreaterThan(0)
    const after = getDeepSeekPricingState(beijing(2026, 8, 24, 12, 0), "Asia/Kolkata")
    expect(after.status).toBe("off_peak")
  })

  it("Friday after 18:00 rolls the next peak to Monday 09:00 Beijing", () => {
    const s = getDeepSeekPricingState(beijing(2026, 8, 28, 19, 0), "Europe/London")
    expect(s.status).toBe("off_peak")
    expect(s.nextStatus).toBe("peak")
    expect(s.display.transitionWeekday).toBe("Monday")
  })

  it("handles a UK winter (GMT) instant correctly", () => {
    // Monday 09:00 Beijing in January (GMT) = 01:00 UK
    const s = getDeepSeekPricingState(beijing(2027, 1, 4, 9, 0), "Europe/London")
    expect(s.status).toBe("peak")
    // Next transition (peak ends) = 12:00 Beijing = 04:00 UK in winter
    expect(s.display.transitionLocalTime).toContain("4:00")
  })

  it("handles a UK summer (BST) instant correctly", () => {
    // Monday 09:00 Beijing in July (BST) = 02:00 UK
    const s = getDeepSeekPricingState(beijing(2026, 7, 6, 9, 0), "Europe/London")
    expect(s.status).toBe("peak")
    // Next transition (peak ends) = 12:00 Beijing = 05:00 UK in summer (BST)
    expect(s.display.transitionLocalTime).toContain("5:00")
  })

  it("handles India conversion correctly", () => {
    // Monday 09:00 Beijing = 06:30 India
    const s = getDeepSeekPricingState(beijing(2026, 8, 24, 9, 0), "Asia/Kolkata")
    expect(s.status).toBe("peak")
    // Next transition (peak ends) = 12:00 Beijing = 09:30 India
    expect(s.display.transitionLocalTime).toContain("9:30")
  })

  it("falls back to profile country when browser timezone unsupported", () => {
    const s = getDeepSeekPricingState(beijing(2026, 8, 24, 9, 0), "America/New_York", "INDIA")
    expect(s.userTimezone).toBe("Asia/Kolkata")
    expect(s.userCountry).toBe("INDIA")
  })

  it("unknown browser timezone without profile → timezone unavailable but status works", () => {
    const s = getDeepSeekPricingState(beijing(2026, 8, 24, 9, 0), "America/New_York")
    expect(s.status).toBe("peak")
    expect(s.userTimezone).toBeNull()
    expect(s.display.userTimezoneLabel).toBe("Timezone unavailable")
  })
})

describe("resolveUserTimezone", () => {
  it("recognises UK and India", () => {
    expect(resolveUserTimezone("Europe/London")).toEqual({ timezone: "Europe/London", country: "UK" })
    expect(resolveUserTimezone("Asia/Kolkata")).toEqual({ timezone: "Asia/Kolkata", country: "INDIA" })
    expect(resolveUserTimezone("Asia/Calcutta")).toEqual({ timezone: "Asia/Kolkata", country: "INDIA" })
  })
  it("falls back to profile country", () => {
    expect(resolveUserTimezone(undefined, "UK")).toEqual({ timezone: "Europe/London", country: "UK" })
    expect(resolveUserTimezone(undefined, "INDIA")).toEqual({ timezone: "Asia/Kolkata", country: "INDIA" })
  })
  it("returns null for unsupported", () => {
    expect(resolveUserTimezone("America/New_York")).toEqual({ timezone: null, country: null })
  })
})

describe("billing timezone constant", () => {
  it("is Asia/Shanghai", () => {
    expect(DEEPSEEK_BILLING_TIMEZONE).toBe("Asia/Shanghai")
  })
})
