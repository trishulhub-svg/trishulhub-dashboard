import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { encryptCredentialToJson, decryptCredentialFromJson } from "@/lib/encryption"
import { notifyRoles } from "@/lib/notify"

// ━━ Validation constants ━━

const VALID_COUNTRIES = ["UK", "INDIA"] as const
const VALID_GOV_ID_TYPES = ["AADHAAR", "PAN", "NI"] as const
const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const

/** Mask a sensitive string down to its last 4 characters. */
function maskSensitive(value: string | null | undefined): string {
  if (!value) return ""
  if (value.length <= 4) return "•".repeat(value.length)
  return "•".repeat(Math.min(value.length - 4, 8)) + value.slice(-4)
}

/** Sanitize a gov id number — strip spaces and dashes, uppercase. */
function normalizeGovId(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase()
}

/** Sanitize a bank account number — strip spaces and dashes. */
function normalizeAccountNumber(value: string): string {
  return value.replace(/[\s-]/g, "")
}

/** Sanitize an IFSC code — uppercase, strip spaces. */
function normalizeIfsc(value: string): string {
  return value.replace(/\s/g, "").toUpperCase()
}

/** Sanitize a UK sort code — format as XX-XX-XX. */
function normalizeSortCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6)
  if (digits.length !== 6) return value.trim()
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`
}

/** Validate an Aadhaar number — 12 digits, not starting with 0 or 1. */
function isValidAadhaar(value: string): boolean {
  return /^[2-9]\d{11}$/.test(value)
}

/** Validate a PAN number — 5 letters, 4 digits, 1 letter. */
function isValidPAN(value: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(value)
}

/** Validate a UK NI number — 2 prefix letters, 6 digits, 1 suffix letter. */
function isValidNI(value: string): boolean {
  // UK NI format: 2 letters (not D, F, I, Q, U, V; second not O), 6 digits, 1 letter (A-D)
  return /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[ABCD]$/.test(value)
}

/** Validate IFSC code — 4 letters + 0 + 6 alphanumeric. */
function isValidIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value)
}

// ━━ Type for the sanitized response we send to the client ━━

interface UserDetailResponse {
  id: string
  userId: string
  country: string | null
  countryLocked: boolean
  fullNameAsPerId: string | null
  govIdType: string | null
  govIdNumberMasked: string
  bankAccountName: string | null
  bankAccountNumberMasked: string
  bankSortCode: string | null
  bankName: string | null
  bankBranch: string | null
  status: string
  rejectedReason: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  user?: {
    id: string
    name: string
    email: string
    role: string
    department: string | null
  }
}

/**
 * Convert a raw UserDetail row (with encrypted fields) into the masked
 * response we return to the client. NEVER expose decrypted gov ID / bank
 * account numbers in list responses.
 */
function toResponse(
  detail: {
    id: string
    userId: string
    country: string | null
    countryLocked: boolean
    fullNameAsPerId: string | null
    govIdType: string | null
    govIdNumber: string | null
    bankAccountName: string | null
    bankAccountNumber: string | null
    bankSortCode: string | null
    bankName: string | null
    bankBranch: string | null
    status: string
    rejectedReason: string | null
    reviewedBy: string | null
    reviewedAt: Date | null
    createdAt: Date
    updatedAt: Date
    user?: {
      id: string
      name: string
      email: string
      role: string
      department: string | null
    }
  }
): UserDetailResponse {
  // Decrypt the gov ID so we can mask it (we never return the raw value)
  let govIdMasked = ""
  if (detail.govIdNumber) {
    try {
      const decrypted = decryptCredentialFromJson(detail.govIdNumber)
      govIdMasked = maskSensitive(decrypted)
    } catch {
      govIdMasked = maskSensitive(detail.govIdNumber)
    }
  }

  let bankAccountMasked = ""
  if (detail.bankAccountNumber) {
    try {
      const decrypted = decryptCredentialFromJson(detail.bankAccountNumber)
      bankAccountMasked = maskSensitive(decrypted)
    } catch {
      bankAccountMasked = maskSensitive(detail.bankAccountNumber)
    }
  }

  return {
    id: detail.id,
    userId: detail.userId,
    country: detail.country,
    countryLocked: detail.countryLocked,
    fullNameAsPerId: detail.fullNameAsPerId,
    govIdType: detail.govIdType,
    govIdNumberMasked: govIdMasked,
    bankAccountName: detail.bankAccountName,
    bankAccountNumberMasked: bankAccountMasked,
    bankSortCode: detail.bankSortCode,
    bankName: detail.bankName,
    bankBranch: detail.bankBranch,
    status: detail.status,
    rejectedReason: detail.rejectedReason,
    reviewedBy: detail.reviewedBy,
    reviewedAt: detail.reviewedAt ? detail.reviewedAt.toISOString() : null,
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    user: detail.user,
  }
}

// ━━ GET /api/user-details ━━
// Non-admins: return their own details only.
// Admins: return ALL users' details (with user name, email, role).
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`user-details-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    // Ensure the UserDetail table exists
    await ensureAllTables()

    const userId = session.user.id
    const userRole = session.user.role
    const adminView = isAdmin(userRole)

    if (adminView) {
      // Admins see ALL user details (including users who haven't filled in details yet
      // — we still want to see them in the management table). We left-join via separate
      // queries because SQLite + Prisma relationMode doesn't support raw left joins
      // cleanly for optional relations. So we fetch all users and all details, then merge.
      const [allUsers, allDetails] = await Promise.all([
        db.user.findMany({
          where: { role: { not: "CLIENT" }, isActive: true },
          select: { id: true, name: true, email: true, role: true, department: true },
          orderBy: { name: "asc" },
        }),
        db.userDetail.findMany({
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, department: true },
            },
          },
          orderBy: { updatedAt: "desc" },
        }),
      ])

      const detailsByUserId = new Map(allDetails.map((d) => [d.userId, d]))

      // Build a unified list: every user appears, with their detail (or null)
      const result: UserDetailResponse[] = []
      for (const user of allUsers) {
        const detail = detailsByUserId.get(user.id)
        if (detail) {
          result.push(toResponse(detail))
        } else {
          // User has not submitted details yet — emit a placeholder row
          result.push({
            id: "",
            userId: user.id,
            country: null,
            countryLocked: false,
            fullNameAsPerId: null,
            govIdType: null,
            govIdNumberMasked: "",
            bankAccountName: null,
            bankAccountNumberMasked: "",
            bankSortCode: null,
            bankName: null,
            bankBranch: null,
            status: "NOT_SUBMITTED",
            rejectedReason: null,
            reviewedBy: null,
            reviewedAt: null,
            createdAt: "",
            updatedAt: "",
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              department: user.department,
            },
          })
        }
      }

      // Sort: PENDING first, then by name
      result.sort((a, b) => {
        const statusOrder: Record<string, number> = { PENDING: 0, REJECTED: 1, APPROVED: 2, NOT_SUBMITTED: 3 }
        const sa = statusOrder[a.status] ?? 99
        const sb = statusOrder[b.status] ?? 99
        if (sa !== sb) return sa - sb
        return (a.user?.name || "").localeCompare(b.user?.name || "")
      })

      return NextResponse.json(result)
    }

    // Non-admin: return their own details only
    const detail = await db.userDetail.findUnique({
      where: { userId },
    })

    if (!detail) {
      return NextResponse.json(null)
    }

    return NextResponse.json(toResponse(detail))
  } catch (error: unknown) {
    console.error("[user-details] GET Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ━━ POST /api/user-details ━━
// Create or update the current user's own details.
// - Country can only be set ONCE (if countryLocked is true, reject change)
// - Encrypt govIdNumber and bankAccountNumber using encryptCredentialToJson
// - Status resets to PENDING on any edit
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`user-details-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    const userId = session.user.id
    const userRole = session.user.role

    // CLIENT users are not allowed to submit HR details
    if (userRole === "CLIENT") {
      return NextResponse.json({ error: "Client accounts cannot submit user details" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const country = typeof body.country === "string" ? body.country.toUpperCase() : ""
    const fullNameAsPerId = typeof body.fullNameAsPerId === "string" ? body.fullNameAsPerId.trim() : ""
    const govIdType = typeof body.govIdType === "string" ? body.govIdType.toUpperCase() : ""
    const govIdNumberRaw = typeof body.govIdNumber === "string" ? body.govIdNumber.trim() : ""
    const bankAccountName = typeof body.bankAccountName === "string" ? body.bankAccountName.trim() : ""
    const bankAccountNumberRaw = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : ""
    const bankSortCodeRaw = typeof body.bankSortCode === "string" ? body.bankSortCode.trim() : ""
    const bankName = typeof body.bankName === "string" ? body.bankName.trim() : ""
    const bankBranch = typeof body.bankBranch === "string" ? body.bankBranch.trim() : ""

    // ── Validate country ──
    if (!country) {
      return NextResponse.json({ error: "Please select your country (UK or India)" }, { status: 400 })
    }
    if (!VALID_COUNTRIES.includes(country as typeof VALID_COUNTRIES[number])) {
      return NextResponse.json({ error: "Invalid country. Must be UK or INDIA" }, { status: 400 })
    }

    // ── Validate gov ID type matches country ──
    if (!govIdType) {
      return NextResponse.json({ error: "Please select your government ID type" }, { status: 400 })
    }
    if (!VALID_GOV_ID_TYPES.includes(govIdType as typeof VALID_GOV_ID_TYPES[number])) {
      return NextResponse.json({ error: "Invalid government ID type" }, { status: 400 })
    }
    if (country === "INDIA" && !["AADHAAR", "PAN"].includes(govIdType)) {
      return NextResponse.json({ error: "For India, government ID must be Aadhaar or PAN" }, { status: 400 })
    }
    if (country === "UK" && govIdType !== "NI") {
      return NextResponse.json({ error: "For UK, government ID must be National Insurance (NI)" }, { status: 400 })
    }

    // ── Validate full name ──
    if (!fullNameAsPerId || fullNameAsPerId.length < 2) {
      return NextResponse.json({ error: "Please enter your full name as per your government document" }, { status: 400 })
    }
    if (fullNameAsPerId.length > 200) {
      return NextResponse.json({ error: "Full name is too long (max 200 characters)" }, { status: 400 })
    }

    // ── Validate & normalize gov ID number ──
    if (!govIdNumberRaw) {
      return NextResponse.json({ error: "Please enter your government ID number" }, { status: 400 })
    }
    const govIdNumber = normalizeGovId(govIdNumberRaw)
    if (govIdType === "AADHAAR" && !isValidAadhaar(govIdNumber)) {
      return NextResponse.json({ error: "Aadhaar number must be 12 digits and cannot start with 0 or 1" }, { status: 400 })
    }
    if (govIdType === "PAN" && !isValidPAN(govIdNumber)) {
      return NextResponse.json({ error: "PAN number must be in the format ABCDE1234F (5 letters, 4 digits, 1 letter)" }, { status: 400 })
    }
    if (govIdType === "NI" && !isValidNI(govIdNumber)) {
      return NextResponse.json({ error: "National Insurance number must be in the format QQ123456C (2 letters, 6 digits, 1 letter)" }, { status: 400 })
    }

    // ── Validate bank details ──
    if (!bankAccountName || bankAccountName.length < 2) {
      return NextResponse.json({ error: "Please enter the bank account holder name" }, { status: 400 })
    }
    if (!bankAccountNumberRaw) {
      return NextResponse.json({ error: "Please enter your bank account number" }, { status: 400 })
    }
    const bankAccountNumber = normalizeAccountNumber(bankAccountNumberRaw)
    if (bankAccountNumber.length < 6 || bankAccountNumber.length > 20) {
      return NextResponse.json({ error: "Bank account number must be between 6 and 20 digits" }, { status: 400 })
    }
    if (!/^\d+$/.test(bankAccountNumber)) {
      return NextResponse.json({ error: "Bank account number must contain only digits" }, { status: 400 })
    }

    // Sort code (UK) or IFSC (India) — required, format depends on country
    if (!bankSortCodeRaw) {
      return NextResponse.json({ error: country === "UK" ? "Please enter the bank sort code" : "Please enter the IFSC code" }, { status: 400 })
    }
    const bankSortCode = country === "UK" ? normalizeSortCode(bankSortCodeRaw) : normalizeIfsc(bankSortCodeRaw)
    if (country === "UK" && !/^\d{2}-\d{2}-\d{2}$/.test(bankSortCode)) {
      return NextResponse.json({ error: "UK sort code must be 6 digits (e.g., 12-34-56)" }, { status: 400 })
    }
    if (country === "INDIA" && !isValidIfsc(bankSortCode)) {
      return NextResponse.json({ error: "IFSC code must be in the format ABCD0123456 (4 letters, 0, 6 alphanumeric)" }, { status: 400 })
    }

    if (!bankName || bankName.length < 2) {
      return NextResponse.json({ error: "Please enter the bank name" }, { status: 400 })
    }

    // Branch name is required for India, optional for UK
    let bankBranchFinal: string | null = bankBranch
    if (country === "INDIA" && !bankBranch) {
      return NextResponse.json({ error: "Please enter the bank branch name" }, { status: 400 })
    }
    if (country === "UK") {
      bankBranchFinal = bankBranch || null
    }

    // ── Encrypt sensitive fields ──
    const govIdEncrypted = encryptCredentialToJson(govIdNumber)
    const bankAccountEncrypted = encryptCredentialToJson(bankAccountNumber)

    // ── Fetch existing detail (if any) ──
    const existing = await db.userDetail.findUnique({ where: { userId } })

    // ── Country lock enforcement ──
    // If user already has a country set AND it's locked, they can only resubmit
    // with the SAME country (admin must unlock to change it).
    if (existing?.country && existing.countryLocked && existing.country !== country) {
      return NextResponse.json({
        error: `Your country is locked to ${existing.country === "UK" ? "United Kingdom" : "India"}. Please contact an admin to change it.`,
      }, { status: 403 })
    }

    // ── Build the data payload ──
    // Once country is set, lock it (admin can unlock later)
    const countryLocked = true

    const data = {
      country,
      countryLocked,
      fullNameAsPerId,
      govIdType,
      govIdNumber: govIdEncrypted,
      bankAccountName,
      bankAccountNumber: bankAccountEncrypted,
      bankSortCode,
      bankName,
      bankBranch: bankBranchFinal,
      // Reset status to PENDING on every edit
      status: "PENDING" as const,
      rejectedReason: null,
      reviewedBy: null,
      reviewedAt: null,
    }

    let detail
    if (existing) {
      detail = await db.userDetail.update({
        where: { userId },
        data,
      })
    } else {
      detail = await db.userDetail.create({
        data: { userId, ...data },
      })
    }

    // Audit: log submission (fire-and-forget)
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "HR_PEOPLE",
      page: "my-details",
      action: existing ? "UPDATE" : "CREATE",
      entityType: "UserDetail",
      entityId: detail.id,
      description: `${existing ? "Updated" : "Submitted"} personal details (country: ${country}, govIdType: ${govIdType})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    // Notify admins about new submission (fire-and-forget, don't block)
    try {
      await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
        title: "New Details Submission",
        message: `${session.user.name || "A team member"} submitted their personal details for review (${country === "UK" ? "United Kingdom" : "India"}).`,
        type: "APPROVAL",
        link: "/dashboard/my-details",
        metadata: { userDetailId: detail.id, userId },
      })
    } catch (notifyErr: unknown) {
      console.error("[user-details] POST notification error (non-blocking):", notifyErr)
    }

    return NextResponse.json(toResponse(detail), { status: existing ? 200 : 201 })
  } catch (error: unknown) {
    console.error("[user-details] POST Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/user-details — kept for self-unlock requests (currently not exposed).
// The main PATCH endpoint for admin review lives at /api/user-details/[id].
export async function PATCH() {
  return NextResponse.json({ error: "Method not allowed. Use PATCH /api/user-details/[id] for admin review." }, { status: 405 })
}
