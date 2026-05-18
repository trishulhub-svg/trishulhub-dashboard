import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/rbac"
import { db } from "@/lib/db"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rateResult = rateLimit(
      `pending-counts:${session.user.id}`,
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
    ])

    const [approvals, leaveRequests, tasksAwaitingApproval] = await Promise.all([
      db.approval.count({ where: { status: "PENDING" } }),
      db.leaveRequest.count({ where: { status: "PENDING" } }),
      db.task.count({ where: { status: "AWAITING_APPROVAL" } }),
    ])

    return NextResponse.json({
      approvals,
      leaveRequests,
      tasksAwaitingApproval,
      total: approvals + leaveRequests + tasksAwaitingApproval,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[approvals/pending-counts] GET error:", message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
