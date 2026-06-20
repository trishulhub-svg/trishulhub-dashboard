import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/rbac"
import { db } from "@/lib/db"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/approvals/pending-counts
// Returns a map of nav-href → count for notification badges.
// Different roles see different badge data:
//   ADMIN/SUPER_ADMIN: pending approvals, leaves
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
      ensureTable("LeaveRequest"),
    ])

    const badges: Record<string, number> = {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADMIN / SUPER_ADMIN badges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isAdmin(userRole)) {
      const [approvals, leaveRequests] = await Promise.all([
        db.approval.count({ where: { status: "PENDING" } }),
        db.leaveRequest.count({ where: { status: "PENDING" } }),
      ])

      const total = approvals + leaveRequests

      // Approvals page: all pending combined
      if (total > 0) badges["/dashboard/approvals"] = total

      // Team page: pending leave requests (admin needs to act)
      if (leaveRequests > 0) badges["/dashboard/team"] = leaveRequests

      // Leaves page: pending leaves
      if (leaveRequests > 0) badges["/dashboard/leaves"] = leaveRequests

      return NextResponse.json(badges)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DEVELOPER / VIEWER badges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const [
      myPendingLeaves,
      myResolvedApprovals,
    ] = await Promise.all([
      // My pending leave requests
      db.leaveRequest.count({
        where: {
          userId,
          status: "PENDING",
        },
      }),
      // My approvals that got resolved (for notification on Approvals page)
      db.approval.count({
        where: {
          requesterId: userId,
          status: { in: ["APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"] },
        },
      }),
    ])

    // ── Map to nav badges ──

    // Leaves: my pending leave requests
    if (myPendingLeaves > 0) badges["/dashboard/leaves"] = myPendingLeaves

    // Approvals: my pending leaves (things to check)
    const myApprovalItems = myPendingLeaves
    if (myApprovalItems > 0) badges["/dashboard/approvals"] = myApprovalItems

    return NextResponse.json(badges)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[approvals/pending-counts] GET error:", message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
