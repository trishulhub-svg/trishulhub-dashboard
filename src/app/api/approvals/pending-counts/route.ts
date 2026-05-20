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
//   ADMIN/SUPER_ADMIN: pending approvals, leaves, tasks needing their action
//   DEVELOPER:          active tasks assigned to them, their pending leaves, unread notifications
//   VIEWER:             active tasks assigned to them
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
      ensureTable("Task"),
      ensureTable("TrainingAssignment"),
    ])

    const badges: Record<string, number> = {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ADMIN / SUPER_ADMIN badges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isAdmin(userRole)) {
      const [approvals, leaveRequests, tasksAwaitingApproval, overdueTraining] = await Promise.all([
        db.approval.count({ where: { status: "PENDING" } }),
        db.leaveRequest.count({ where: { status: "PENDING" } }),
        db.task.count({ where: { status: "AWAITING_APPROVAL" } }),
        db.trainingAssignment.count({
          where: {
            dueDate: { lt: new Date() },
            status: { notIn: ["PASSED", "FAILED"] },
          },
        }),
      ])

      const total = approvals + leaveRequests + tasksAwaitingApproval + overdueTraining

      // Approvals page: all pending combined + overdue training
      if (total > 0) badges["/dashboard/approvals"] = total

      // Training page: overdue training count for admin
      if (overdueTraining > 0) badges["/dashboard/training"] = overdueTraining

      // Team page: pending leave requests (admin needs to act)
      if (leaveRequests > 0) badges["/dashboard/team"] = leaveRequests

      // Projects page: tasks awaiting admin approval
      if (tasksAwaitingApproval > 0) badges["/dashboard/projects"] = tasksAwaitingApproval

      // Leaves page: pending leaves
      if (leaveRequests > 0) badges["/dashboard/leaves"] = leaveRequests

      return NextResponse.json(badges)
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DEVELOPER / VIEWER badges
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Active tasks assigned to this user (not DONE, not CANCELLED)
    const activeTaskCount = await db.task.count({
      where: {
        assignedTo: userId,
        assigneeType: "HUMAN",
        status: { in: ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL"] },
      },
    })

    // Tasks with upcoming deadline (within 3 days) or overdue
    const urgentTaskCount = await db.task.count({
      where: {
        assignedTo: userId,
        assigneeType: "HUMAN",
        status: { in: ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL"] },
        deadline: {
          lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      },
    })

    // Tasks submitted for approval (waiting on admin)
    const mySubmittedCount = await db.task.count({
      where: {
        assignedTo: userId,
        assigneeType: "HUMAN",
        status: "AWAITING_APPROVAL",
      },
    })

    // My pending leave requests
    const myPendingLeaves = await db.leaveRequest.count({
      where: {
        userId,
        status: "PENDING",
      },
    })

    // My approvals that got resolved (for notification on Approvals page)
    const myResolvedApprovals = await db.approval.count({
      where: {
        requesterId: userId,
        status: { in: ["APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"] },
      },
    })

    // ── Map to nav badges ──

    // Projects: active tasks assigned to me
    if (activeTaskCount > 0) badges["/dashboard/projects"] = activeTaskCount

    // Time Table: tasks with upcoming deadlines
    if (urgentTaskCount > 0) badges["/dashboard/timetable"] = urgentTaskCount

    // Time Tracking: active tasks that need time logging
    if (activeTaskCount > 0) badges["/dashboard/time-tracking"] = activeTaskCount

    // Leaves: my pending leave requests
    if (myPendingLeaves > 0) badges["/dashboard/leaves"] = myPendingLeaves

    // My overdue training assignments
    const myOverdueTraining = await db.trainingAssignment.count({
      where: {
        assignedTo: userId,
        dueDate: { lt: new Date() },
        status: { notIn: ["PASSED", "FAILED"] },
      },
    })

    // My Training: overdue assignments
    if (myOverdueTraining > 0) badges["/dashboard/my-training"] = myOverdueTraining

    // Approvals: my submitted approvals + resolved approvals (things to check)
    const myApprovalItems = mySubmittedCount + myPendingLeaves + myOverdueTraining
    if (myApprovalItems > 0) badges["/dashboard/approvals"] = myApprovalItems

    // Meetings: could add meeting count later if needed
    // For now, no badge on meetings

    return NextResponse.json(badges)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[approvals/pending-counts] GET error:", message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
