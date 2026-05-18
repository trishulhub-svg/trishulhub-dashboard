import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"

// PATCH /api/leaves/[id] - Update leave status (approve/reject/cancel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable("Leave")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params
    const body = await req.json()
    const { status, reason } = body

    const validStatuses = ["APPROVED", "REJECTED", "CANCELLED"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status. Must be APPROVED, REJECTED, or CANCELLED" }, { status: 400 })
    }

    const existingLeave = await db.leave.findUnique({ where: { id } })
    if (!existingLeave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }

    // Only admins can approve/reject
    if ((status === "APPROVED" || status === "REJECTED") && !isAdmin(userRole)) {
      return NextResponse.json({ error: "Only admins can approve or reject leave requests" }, { status: 403 })
    }

    // Only the requester or admin can cancel
    if (status === "CANCELLED" && !isAdmin(userRole) && existingLeave.userId !== userId) {
      return NextResponse.json({ error: "You can only cancel your own leave requests" }, { status: 403 })
    }

    // Validate status transitions
    if (existingLeave.status === "CANCELLED") {
      return NextResponse.json({ error: "Cannot update a cancelled leave" }, { status: 400 })
    }
    if (existingLeave.status === "REJECTED" && status !== "CANCELLED") {
      return NextResponse.json({ error: "Rejected leaves can only be cancelled" }, { status: 400 })
    }

    const updateData: any = {
      status,
      ...(status === "APPROVED" || status === "REJECTED" ? { approvedBy: userId, approvedAt: new Date() } : {}),
      ...(reason && status === "CANCELLED" ? { reason } : {}),
    }

    const leave = await db.leave.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
      },
    })

    // Notify the employee about the leave decision (fire-and-forget)
    if (status === "APPROVED" || status === "REJECTED") {
      try {
        await db.notification.create({
          data: {
            userId: leave.userId,
            title: `Leave ${status === "APPROVED" ? "Approved" : "Rejected"}`,
            message: `Your ${leave.leaveType.replace("_", " ").toLowerCase()} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been ${status.toLowerCase()}.`,
            type: status === "APPROVED" ? "SUCCESS" : "WARNING",
            link: "/dashboard/leaves",
            metadata: JSON.stringify({ leaveId: leave.id }),
          },
        })
      } catch (notifyErr: any) {
        console.error("[leaves] PATCH notification error (non-blocking):", notifyErr.message)
      }

      // Notify HR agent about leave approval/rejection for workload tracking (fire-and-forget)
      try {
        const hrAgent = await db.agent.findFirst({ where: { type: "HR" } })
        if (hrAgent) {
          await db.crossAgentMessage.create({
            data: {
              fromAgentId: hrAgent.id,
              toAgentId: hrAgent.id,
              message: `Leave ${status.toLowerCase()}: ${leave.user?.name || "Employee"} - ${leave.leaveType} leave from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}. Update workload tracking accordingly.`,
              type: "INFO",
              status: "PROCESSED",
            },
          })
        }
      } catch (hrErr: any) {
        console.error("[leaves] PATCH HR agent notification error (non-blocking):", hrErr.message)
      }
    }

    return NextResponse.json(leave)
  } catch (error: any) {
    console.error("[leaves] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/leaves/[id] - Delete a leave request
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureTable("Leave")
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    const leave = await db.leave.findUnique({ where: { id } })
    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }

    // Only the requester or admin can delete
    if (!isAdmin(userRole) && leave.userId !== userId) {
      return NextResponse.json({ error: "You can only delete your own leave requests" }, { status: 403 })
    }

    await db.leave.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[leaves] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
