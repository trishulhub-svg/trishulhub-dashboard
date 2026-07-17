/** Default expense categories (seeded into ExpenseCategory on migrate). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "HOSTING",
  "DOMAINS",
  "API_COSTS",
  "TOOLS",
  "MARKETING",
  "SALARY",
  "SOFTWARE",
  "OTHER",
] as const

/** Normalize a category name to a stable storage key (uppercase, underscores). */
export function normalizeExpenseCategoryName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase()
}

/** Human-readable label from a stored category key. */
export function formatExpenseCategoryLabel(key: string): string {
  return key.replace(/_/g, " ")
}
