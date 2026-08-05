import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureTable } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { notifyUsers } from "@/lib/notify"
import { formatDisplayDateRange } from "@/lib/format"

// PATCH /api/leaves/[id] - Update leave status (approve/reject/cancel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`leaves-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
    const { status, reason, feedback } = body

    const validStatuses = ["APPROVED", "REJECTED", "CANCELLED"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be APPROVED, REJECTED, or CANCELLED" }, { status: 400 })
    }

    // Wrap leave approval in transaction to prevent TOCTOU
    const previousLeave = await db.leave.findUnique({ where: { id } })
    const leave = await db.$transaction(async (tx) => {
      const existingLeave = await tx.leave.findUnique({ where: { id } })
      if (!existingLeave) return null

      // Only admins can approve/reject
      if ((status === "APPROVED" || status === "REJECTED") && !isAdmin(userRole)) {
        throw new Error("Only admins can approve or reject leave requests")
      }

      // SECURITY: Self-approval prevention — admins cannot approve their own leave
      if ((status === "APPROVED" || status === "REJECTED") && existingLeave.userId === userId) {
        throw new Error("You cannot approve or reject your own leave request")
      }

      // Only the requester or admin can cancel
      if (status === "CANCELLED" && !isAdmin(userRole) && existingLeave.userId !== userId) {
        throw new Error("You can only cancel your own leave requests")
      }

      // Validate status transitions
      if (existingLeave.status === "CANCELLED") {
        throw new Error("Cannot update a cancelled leave")
      }
      if (existingLeave.status === "REJECTED" && status !== "CANCELLED") {
        throw new Error("Rejected leaves can only be cancelled")
      }

      const rejectNote =
        typeof feedback === "string"
          ? feedback.trim().slice(0, 1000)
          : typeof reason === "string" && status === "REJECTED"
            ? reason.trim().slice(0, 1000)
            : undefined

      const updateData: Parameters<typeof db.leave.update>[0]["data"] = {
        status,
        ...(status === "APPROVED" || status === "REJECTED" ? { approvedBy: userId, approvedAt: new Date() } : {}),
        ...(reason && status === "CANCELLED" ? { reason } : {}),
        ...(rejectNote && (status === "REJECTED" || status === "APPROVED") ? { feedback: rejectNote } : {}),
      }

      return await tx.leave.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true } },
        },
      })
    })

    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }

    // Audit: log leave status change (approve/reject/cancel) — fire-and-forget
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "leaves", action: "STATUS_CHANGE",
      entityType: "Leave", entityId: id,
      description: `Changed leave status: ${leave.leaveType} for ${leave.user?.name || leave.userId} (${previousLeave?.status || "unknown"} → ${status})`,
      oldValue: previousLeave?.status || undefined,
      newValue: status,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    // Notify the employee about the leave decision (fire-and-forget)
    if (status === "APPROVED" || status === "REJECTED") {
      try {
        void notifyUsers({
          userIds: leave.userId,
          title: `Leave ${status === "APPROVED" ? "Approved" : "Rejected"}`,
          message: `Your ${leave.leaveType.replace(/_/g, " ").toLowerCase()} leave request ${formatDisplayDateRange(leave.startDate, leave.endDate)} has been ${status.toLowerCase()}${leave.feedback ? `. Feedback: ${leave.feedback}` : ""}.`,
          type: status === "APPROVED" ? "SUCCESS" : "WARNING",
          link: "/dashboard/leaves",
          metadata: { leaveId: leave.id },
        })
      } catch (notifyErr: unknown) {
        console.error("[leaves] PATCH notification error (non-blocking):", notifyErr)
      }
    }

    return NextResponse.json(leave)
  } catch (error: unknown) {
    // Handle authorization/validation errors thrown inside transaction
    if (error instanceof Error) {
      const msg = error.message
      if (msg.includes("Only admins can approve") || msg.includes("cannot approve or reject your own") ||
          msg.includes("can only cancel your own") || msg.includes("Cannot update a cancelled") ||
          msg.includes("Rejected leaves can only be cancelled") || msg.includes("Only admins")) {
        const status = msg.includes("Only admins") && !msg.includes("approve or reject") && !msg.includes("approve your own")
          ? 403
          : (msg.includes("Cannot update") || msg.includes("Rejected leaves") ? 400 : 403)
        return NextResponse.json({ error: "Leave request operation failed" }, { status })
      }
    }
    console.error("[leaves] PATCH Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/leaves/[id] - Delete a leave request
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`leaves-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    // Wrap delete in transaction to prevent TOCTOU
    const result = await db.$transaction(async (tx) => {
      const leave = await tx.leave.findUnique({ where: { id } })
      if (!leave) return null

      // Only the requester or admin can delete
      if (!isAdmin(userRole) && leave.userId !== userId) {
        throw new Error("You can only delete your own leave requests")
      }
      await tx.leave.delete({ where: { id } })
      return leave
    })

    if (result === null) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }

    // Audit: log leave deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "leaves", action: "DELETE",
      entityType: "Leave", entityId: id,
      description: `Deleted leave request (${result.leaveType}) for ${result.userId}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("can only delete your own")) {
      return NextResponse.json({ error: "Leave request operation failed" }, { status: 403 })
    }
    console.error("[leaves] DELETE Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
