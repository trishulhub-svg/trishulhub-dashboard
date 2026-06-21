import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { sendEmailWithFailover } from "@/lib/email"

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const

/**
 * PATCH /api/user-details/[id]
 *
 * Admin-only operations on a UserDetail row:
 *   - { action: "REVIEW", status: "APPROVED" | "REJECTED", rejectedReason?: string }
 *       Sets the review status. If REJECTED, rejectedReason is required.
 *       Sends an email notification to the user via SMTP (sendEmailWithFailover).
 *       Sets reviewedBy and reviewedAt.
 *   - { action: "UNLOCK_COUNTRY" }
 *       Sets countryLocked to false so the user can change their country.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`user-details-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    // ── Admin-only ──
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Only admins can review or unlock user details" }, { status: 403 })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const action = typeof body.action === "string" ? body.action.toUpperCase() : ""

    // ── Fetch the target UserDetail ──
    const detail = await db.userDetail.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, department: true },
        },
      },
    })

    if (!detail) {
      return NextResponse.json({ error: "User details not found" }, { status: 404 })
    }

    // ━━ Action: REVIEW (approve / reject) ━━
    if (action === "REVIEW") {
      const newStatus = typeof body.status === "string" ? body.status.toUpperCase() : ""
      if (!VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
        return NextResponse.json({ error: "Invalid status. Must be APPROVED or REJECTED" }, { status: 400 })
      }
      if (newStatus !== "APPROVED" && newStatus !== "REJECTED") {
        return NextResponse.json({ error: "Review action only supports APPROVED or REJECTED" }, { status: 400 })
      }

      const rejectedReason = typeof body.rejectedReason === "string" ? body.rejectedReason.trim() : ""
      if (newStatus === "REJECTED" && !rejectedReason) {
        return NextResponse.json({ error: "A reason is required when rejecting details" }, { status: 400 })
      }
      if (newStatus === "REJECTED" && rejectedReason.length > 1000) {
        return NextResponse.json({ error: "Rejection reason is too long (max 1000 characters)" }, { status: 400 })
      }

      const previousStatus = detail.status

      const updated = await db.userDetail.update({
        where: { id },
        data: {
          status: newStatus,
          rejectedReason: newStatus === "REJECTED" ? rejectedReason : null,
          reviewedBy: userId,
          reviewedAt: new Date(),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, department: true },
          },
        },
      })

      // Audit: log review decision (fire-and-forget)
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole,
        department: "HR_PEOPLE",
        page: "my-details",
        action: newStatus === "APPROVED" ? "APPROVE" : "REJECT",
        entityType: "UserDetail",
        entityId: id,
        description: `${newStatus === "APPROVED" ? "Approved" : "Rejected"} personal details for ${updated.user?.name || detail.userId}${newStatus === "REJECTED" ? ` — reason: ${rejectedReason}` : ""}`,
        oldValue: previousStatus,
        newValue: newStatus,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })

      // ── Notify the user (in-app + email) ──
      // In-app notification (fire-and-forget)
      try {
        await db.notification.create({
          data: {
            userId: detail.userId,
            title: `Details ${newStatus === "APPROVED" ? "Approved" : "Rejected"}`,
            message: newStatus === "APPROVED"
              ? `Your personal details have been approved by ${session.user.name || "an admin"}.`
              : `Your personal details were rejected by ${session.user.name || "an admin"}. Reason: ${rejectedReason}`,
            type: newStatus === "APPROVED" ? "SUCCESS" : "WARNING",
            link: "/dashboard/my-details",
            metadata: JSON.stringify({ userDetailId: id, status: newStatus }),
          },
        })
      } catch (notifyErr: unknown) {
        console.error("[user-details] PATCH in-app notification error (non-blocking):", notifyErr)
      }

      // ── Email notification via SMTP failover ──
      // Don't block the response on email delivery — fire-and-forget.
      void (async () => {
        try {
          const userName = updated.user?.name || "there"
          const subject = newStatus === "APPROVED"
            ? "Your TrishulHub details have been approved"
            : "Action needed: TrishulHub details rejected"
          const html = newStatus === "APPROVED"
            ? `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="color: #1f2937; font-size: 22px; margin: 0;">TrishulHub</h1>
                  <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">HR & People</p>
                </div>
                <div style="background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb;">
                  <h2 style="color: #059669; font-size: 18px; margin: 0 0 12px 0;">✓ Details Approved</h2>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Hi ${userName},</p>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Your personal details (country, government ID, and bank account information) have been reviewed and <strong>approved</strong> by ${session.user.name || "an administrator"}.</p>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">You can view your details anytime in the TrishulHub dashboard.</p>
                </div>
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub.</p>
              </div>
            `
            : `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="color: #1f2937; font-size: 22px; margin: 0;">TrishulHub</h1>
                  <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">HR & People</p>
                </div>
                <div style="background: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e5e7eb;">
                  <h2 style="color: #dc2626; font-size: 18px; margin: 0 0 12px 0;">✗ Details Rejected</h2>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Hi ${userName},</p>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Your personal details were reviewed by ${session.user.name || "an administrator"} and <strong>rejected</strong>. Please review the reason below and resubmit.</p>
                  <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                    <p style="color: #991b1b; font-size: 14px; line-height: 1.5; margin: 0;"><strong>Reason:</strong> ${rejectedReason.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
                  </div>
                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">Please log in to TrishulHub, go to <strong>HR & People → My Details</strong>, update your details, and resubmit.</p>
                </div>
                <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub.</p>
              </div>
            `
          await sendEmailWithFailover({
            to: updated.user?.email || "",
            subject,
            html,
            type: "USER_DETAIL_REVIEW",
            triggeredBy: userId,
          })
        } catch (emailErr: unknown) {
          console.error("[user-details] PATCH email notification error (non-blocking):", emailErr instanceof Error ? emailErr.message : String(emailErr))
        }
      })()

      // Return masked response (without re-fetching — updated already has the data)
      return NextResponse.json({
        id: updated.id,
        userId: updated.userId,
        country: updated.country,
        countryLocked: updated.countryLocked,
        fullNameAsPerId: updated.fullNameAsPerId,
        govIdType: updated.govIdType,
        status: updated.status,
        rejectedReason: updated.rejectedReason,
        reviewedBy: updated.reviewedBy,
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        user: updated.user,
      })
    }

    // ━━ Action: UNLOCK_COUNTRY ━━
    if (action === "UNLOCK_COUNTRY") {
      if (!detail.countryLocked) {
        return NextResponse.json({ error: "Country is not locked for this user" }, { status: 400 })
      }

      const updated = await db.userDetail.update({
        where: { id },
        data: { countryLocked: false },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true, department: true },
          },
        },
      })

      // Audit: log country unlock (fire-and-forget)
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole,
        department: "HR_PEOPLE",
        page: "my-details",
        action: "CONFIG_CHANGE",
        entityType: "UserDetail",
        entityId: id,
        description: `Unlocked country selection for ${updated.user?.name || detail.userId} (was: ${detail.country})`,
        oldValue: "locked",
        newValue: "unlocked",
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })

      // In-app notification to the user
      try {
        await db.notification.create({
          data: {
            userId: detail.userId,
            title: "Country Selection Unlocked",
            message: `An admin has unlocked your country selection. You can now choose a different country in My Details.`,
            type: "INFO",
            link: "/dashboard/my-details",
            metadata: JSON.stringify({ userDetailId: id, action: "UNLOCK_COUNTRY" }),
          },
        })
      } catch (notifyErr: unknown) {
        console.error("[user-details] PATCH unlock notification error (non-blocking):", notifyErr)
      }

      return NextResponse.json({
        id: updated.id,
        userId: updated.userId,
        country: updated.country,
        countryLocked: updated.countryLocked,
        status: updated.status,
        user: updated.user,
      })
    }

    return NextResponse.json({ error: "Invalid action. Must be REVIEW or UNLOCK_COUNTRY" }, { status: 400 })
  } catch (error: unknown) {
    console.error("[user-details] PATCH Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET /api/user-details/[id] — Admin fetches a single user's decrypted details for review.
// Returns the masked version by default; pass ?reveal=true to also include the masked last-4.
// We never return the raw decrypted values — admins see the same masked view as the user,
// but with the full admin metadata (reviewedBy, reviewedAt, rejectedReason, etc.).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(`user-details-get-id-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureAllTables()

    const userRole = session.user.role
    const { id } = await params

    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Only admins can view other users' details" }, { status: 403 })
    }

    const detail = await db.userDetail.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, department: true },
        },
      },
    })

    if (!detail) {
      return NextResponse.json({ error: "User details not found" }, { status: 404 })
    }

    // Mask the gov ID and bank account numbers (never expose raw values)
    const { decryptCredentialFromJson } = await import("@/lib/encryption")
    const maskSensitive = (value: string | null, fallback = "") => {
      if (!value) return fallback
      if (value.length <= 4) return "•".repeat(value.length)
      return "•".repeat(Math.min(value.length - 4, 8)) + value.slice(-4)
    }

    let govIdMasked = ""
    if (detail.govIdNumber) {
      try {
        govIdMasked = maskSensitive(decryptCredentialFromJson(detail.govIdNumber))
      } catch {
        govIdMasked = maskSensitive(detail.govIdNumber)
      }
    }

    let bankAccountMasked = ""
    if (detail.bankAccountNumber) {
      try {
        bankAccountMasked = maskSensitive(decryptCredentialFromJson(detail.bankAccountNumber))
      } catch {
        bankAccountMasked = maskSensitive(detail.bankAccountNumber)
      }
    }

    return NextResponse.json({
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
    })
  } catch (error: unknown) {
    console.error("[user-details] GET [id] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
