/**
 * GET /api/bootstrap/shell
 * Layout chrome: unread badge + nav pending counts + current user avatar.
 * One session check; same RBAC as the individual endpoints.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"
import { isAdmin, canManageApprovals } from "@/lib/rbac"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-shell")
    if ("error" in auth) return auth.error

    const userId = auth.session.user.id
    const userRole = auth.session.user.role

    const [unreadCount, me, badges] = await Promise.all([
      db.notification.count({ where: { userId, isRead: false } }),
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          avatar: true,
          isActive: true,
        },
      }),
      loadPendingBadges(userId, userRole),
    ])

    if (!me?.isActive) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
    }

    return NextResponse.json({
      unreadCount,
      pendingCounts: badges,
      me,
    })
  } catch (error: unknown) {
    console.error(
      "[bootstrap/shell] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

async function loadPendingBadges(
  userId: string,
  userRole: string
): Promise<Record<string, number>> {
  const badges: Record<string, number> = {}

  if (isAdmin(userRole)) {
    const [approvals, pendingLeaves] = await Promise.all([
      db.approval.count({ where: { status: "PENDING" } }),
      db.leave.count({ where: { status: "PENDING" } }),
    ])
    const total = approvals + pendingLeaves
    if (total > 0) badges["/dashboard/approvals"] = total
    if (pendingLeaves > 0) badges["/dashboard/leaves"] = pendingLeaves
    return badges
  }

  if (canManageApprovals(userRole)) {
    const [approvals, myPendingLeaves] = await Promise.all([
      db.approval.count({ where: { status: "PENDING" } }),
      db.leave.count({ where: { userId, status: "PENDING" } }),
    ])
    const total = approvals + myPendingLeaves
    if (total > 0) badges["/dashboard/approvals"] = total
    if (myPendingLeaves > 0) badges["/dashboard/leaves"] = myPendingLeaves
    return badges
  }

  const myPendingLeaves = await db.leave.count({
    where: { userId, status: "PENDING" },
  })
  if (myPendingLeaves > 0) {
    badges["/dashboard/leaves"] = myPendingLeaves
    badges["/dashboard/approvals"] = myPendingLeaves
  }
  return badges
}
