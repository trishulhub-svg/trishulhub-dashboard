/** Money helpers — round to paise (2dp) and normalize currency codes. */

export const COMPANY_DEFAULT_CURRENCY = "INR" as const

export type MoneyCurrency = "INR" | "USD" | "GBP" | "EUR"

const VALID: ReadonlySet<string> = new Set(["INR", "USD", "GBP", "EUR"])

/** Round to 2 decimal places (paise-safe for display/storage as Float). */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export function normalizeCurrency(raw: unknown, fallback: MoneyCurrency = COMPANY_DEFAULT_CURRENCY): MoneyCurrency {
  if (typeof raw !== "string") return fallback
  const c = raw.trim().toUpperCase()
  return VALID.has(c) ? (c as MoneyCurrency) : fallback
}

export function currencySymbol(code: string): string {
  switch (normalizeCurrency(code)) {
    case "USD":
      return "$"
    case "GBP":
      return "£"
    case "EUR":
      return "€"
    default:
      return "₹"
  }
}

export function formatMoney(amount: number, currency: string = COMPANY_DEFAULT_CURRENCY): string {
  const c = normalizeCurrency(currency)
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: c,
      maximumFractionDigits: 2,
    }).format(roundMoney(amount))
  } catch {
    return `${currencySymbol(c)}${roundMoney(amount).toLocaleString("en-IN")}`
  }
}
