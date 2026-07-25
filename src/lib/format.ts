/**
 * Shared formatting utilities for Finance module
 */

/** Currency symbols mapping */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
}

/** Get currency symbol for a currency code */
export function getCurrencySymbol(currency: string = "INR"): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

/** Format a number as currency (defaults to INR) */
export function formatCurrency(amount: number, currency: string = "INR"): string {
  const symbol = getCurrencySymbol(currency)
  if (currency === "INR") {
    return `${symbol}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
  }
  return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

/** Format a date string or Date object for display */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "N/A"
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  } catch {
    return "Invalid date"
  }
}

/** Format a date with time */
export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "N/A"
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "Invalid date"
  }
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
