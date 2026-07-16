import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin, canManageApprovals } from "@/lib/rbac"
import { db } from "@/lib/db"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/approvals/pending-counts
// Returns a map of nav-href → count for notification badges.
// Different roles see different badge data:
//   ADMIN/SUPER_ADMIN: pending approvals, all leaves
//   PROJECT_MANAGER:   pending AI approvals (cannot act on leaves)
//   DEVELOPER:          their pending leaves, unread notifications
//   VIEWER:             (no badges currently)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    const rateResult = rateLimit(
      `pending-counts:${userId}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs,
    )
    if (!rateResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    await Promise.all([
      ensureTable("Approval"),
      ensureTable("Leave"),
    ])

    const badges: Record<string, number> = {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADMIN / SUPER_ADMIN badges — full visibility of approvals + leaves
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isAdmin(userRole)) {
      const [approvals, pendingLeaves] = await Promise.all([
        db.approval.count({ where: { status: "PENDING" } }),
        db.leave.count({ where: { status: "PENDING" } }),
      ])

      const total = approvals + pendingLeaves

      // Approvals page: all pending combined
      if (total > 0) badges["/dashboard/approvals"] = total

      // Leaves page: pending leaves
      if (pendingLeaves > 0) badges["/dashboard/leaves"] = pendingLeaves

      return NextResponse.json(badges)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PROJECT_MANAGER badges — sees AI approvals (can manage) + own leaves
    // (PM has developer-level leave access — they can only see/cancel their own)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (canManageApprovals(userRole)) {
      const [approvals, myPendingLeaves] = await Promise.all([
        db.approval.count({ where: { status: "PENDING" } }),
        db.leave.count({ where: { userId, status: "PENDING" } }),
      ])

      const total = approvals + myPendingLeaves

      // Approvals page: pending AI approvals + my pending leaves
      if (total > 0) badges["/dashboard/approvals"] = total

      // Leaves page: my pending leaves
      if (myPendingLeaves > 0) badges["/dashboard/leaves"] = myPendingLeaves

      return NextResponse.json(badges)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DEVELOPER / VIEWER badges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const myPendingLeaves = await db.leave.count({
      where: {
        userId,
        status: "PENDING",
      },
    })

    // ── Map to nav badges ──

    // Leaves: my pending leave requests
    if (myPendingLeaves > 0) badges["/dashboard/leaves"] = myPendingLeaves

    // Approvals: my pending leaves (things to check)
    if (myPendingLeaves > 0) badges["/dashboard/approvals"] = myPendingLeaves

    return NextResponse.json(badges)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[approvals/pending-counts] GET error:", message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
