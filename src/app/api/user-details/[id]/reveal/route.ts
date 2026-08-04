/**
 * GET /api/user-details/[id]/reveal
 * Admin / Super Admin only — decrypt gov ID and bank account for payment processing.
 * Rate-limited + audited. Never exposed to non-admins.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, getAppSetting } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { decryptCredentialFromJson } from "@/lib/encryption"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json(
        { error: "Only Admin or Super Admin can reveal sensitive payment details" },
        { status: 403 }
      )
    }

    const rl = rateLimit(
      `user-details-reveal-${session.user.id}`,
      Math.min(RATE_LIMITS.general.limit, 30),
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Too many reveal requests" }, { status: 429 })
    }

    const { id } = await params
    if (!id || id.length > 64) {
      return NextResponse.json({ error: "Invalid details id" }, { status: 400 })
    }

    const field = new URL(req.url).searchParams.get("field")
    if (field && field !== "govId" && field !== "bankAccount" && field !== "all") {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 })
    }
    const wantGov = !field || field === "govId" || field === "all"
    const wantBank = !field || field === "bankAccount" || field === "all"

    const detail = await db.userDetail.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        govIdNumber: true,
        bankAccountNumber: true,
        user: { select: { name: true, email: true } },
      },
    })
    if (!detail) {
      return NextResponse.json({ error: "User details not found" }, { status: 404 })
    }

    let dbKey = ""
    try {
      dbKey = await getAppSetting("credentialEncryptionKey")
    } catch {
      dbKey = ""
    }

    const decrypt = (enc: string | null | undefined): string => {
      if (!enc) return ""
      try {
        return decryptCredentialFromJson(enc, dbKey || undefined) || ""
      } catch {
        return ""
      }
    }

    const govIdNumber = wantGov ? decrypt(detail.govIdNumber) : undefined
    const bankAccountNumber = wantBank ? decrypt(detail.bankAccountNumber) : undefined

    if (wantGov && detail.govIdNumber && !govIdNumber) {
      return NextResponse.json({ error: "Failed to decrypt government ID" }, { status: 500 })
    }
    if (wantBank && detail.bankAccountNumber && !bankAccountNumber) {
      return NextResponse.json({ error: "Failed to decrypt bank account number" }, { status: 500 })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "my-details",
      action: "READ",
      entityType: "UserDetail",
      entityId: detail.id,
      description: `Revealed sensitive payment details (${field || "all"}) for ${detail.user?.name || detail.userId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      id: detail.id,
      govIdNumber: govIdNumber ?? null,
      bankAccountNumber: bankAccountNumber ?? null,
    })
  } catch (error: unknown) {
    console.error("[user-details] reveal error:", error)
    return NextResponse.json({ error: "Failed to reveal details" }, { status: 500 })
  }
}
