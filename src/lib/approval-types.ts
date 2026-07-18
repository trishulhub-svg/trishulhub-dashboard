/** Single source of truth for non-leave approval types (AI leftovers removed). */

export const APPROVAL_TYPES = [
  "TASK",
  "INVOICE",
  "EMAIL",
  "QUOTATION",
  "PROJECT_PLAN",
  "CODE_REVIEW",
  "EXPENSE_APPROVAL",
] as const

export type ApprovalType = (typeof APPROVAL_TYPES)[number]

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"] as const

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export function isValidApprovalType(v: unknown): v is ApprovalType {
  return typeof v === "string" && (APPROVAL_TYPES as readonly string[]).includes(v)
}

export function isValidApprovalStatus(v: unknown): v is ApprovalStatus {
  return typeof v === "string" && (APPROVAL_STATUSES as readonly string[]).includes(v)
}
