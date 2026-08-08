import { describe, expect, it } from "vitest"
import { formatMoney, normalizeCurrency, roundMoney } from "../src/lib/money"
import {
  APPROVAL_TYPES,
  isValidApprovalStatus,
  isValidApprovalType,
} from "../src/lib/approval-types"

describe("money helpers", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(10.005)).toBe(10.01)
    expect(roundMoney(10.004)).toBe(10)
    expect(roundMoney(NaN)).toBe(0)
  })

  it("normalizes currency to company defaults", () => {
    expect(normalizeCurrency("inr")).toBe("INR")
    expect(normalizeCurrency("bogus")).toBe("GBP")
    expect(normalizeCurrency("USD")).toBe("USD")
    expect(normalizeCurrency(undefined)).toBe("GBP")
  })

  it("formats INR", () => {
    expect(formatMoney(127479, "INR")).toContain("1,27,479")
  })
})

describe("approval types", () => {
  it("allows only trimmed types (no AI leftovers)", () => {
    expect(APPROVAL_TYPES).not.toContain("LEAD_OUTREACH")
    expect(APPROVAL_TYPES).not.toContain("CODE_DEPLOYMENT")
    expect(isValidApprovalType("EXPENSE_APPROVAL")).toBe(true)
    expect(isValidApprovalType("SCHEDULED_ACTION")).toBe(false)
    expect(isValidApprovalStatus("PENDING")).toBe(true)
    expect(isValidApprovalStatus("DONE")).toBe(false)
  })
})
