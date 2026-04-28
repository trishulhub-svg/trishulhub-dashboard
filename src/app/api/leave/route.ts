import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/leave - List leave requests
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const userRole = (session.user as any).role

    // Admins see all, others see their own
    const where = userRole === "SUPER_ADMIN" || userRole === "ADMIN"
      ? {}
      : { userId }

    const leaves = await db.leaveRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(leaves)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/leave - Create a leave request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const { type, startDate, endDate, reason } = await req.json()

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
    }

    const leave = await db.leaveRequest.create({
      data: {
        userId,
        type: type || "CASUAL",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || null,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // Notify admins about the new leave request
    const admins = await db.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "ADMIN"] },
        isActive: true,
      },
    })

    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          title: "New Leave Request",
          message: `${(session.user as any).name || "A team member"} requested ${type || "casual"} leave from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
          type: "APPROVAL",
          link: "/dashboard/leave",
          metadata: JSON.stringify({ leaveRequestId: leave.id }),
        },
      })
    }

    return NextResponse.json(leave, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/leave - Approve or reject a leave request
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const userRole = (session.user as any).role

    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can approve/reject leave requests" }, { status: 403 })
    }

    const { id, status, feedback } = await req.json()

    if (!id || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Valid ID and status (APPROVED/REJECTED) required" }, { status: 400 })
    }

    const leave = await db.leaveRequest.update({
      where: { id },
      data: {
        status,
        approvedBy: userId,
        feedback: feedback || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // Notify the employee
    await db.notification.create({
      data: {
        userId: leave.userId,
        title: `Leave ${status === "APPROVED" ? "Approved" : "Rejected"}`,
        message: `Your ${leave.type} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been ${status.toLowerCase()}.`,
        type: status === "APPROVED" ? "SUCCESS" : "WARNING",
        link: "/dashboard/leave",
        metadata: JSON.stringify({ leaveRequestId: leave.id }),
      },
    })

    // Notify HR agent about leave approval for workload tracking
    const hrAgent = await db.agent.findFirst({ where: { type: "HR" } })
    if (hrAgent) {
      await db.crossAgentMessage.create({
        data: {
          fromAgentId: hrAgent.id,
          toAgentId: hrAgent.id,
          message: `Leave ${status.toLowerCase()}: ${leave.user?.name || "Employee"} - ${leave.type} leave from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()}. Update workload tracking accordingly.`,
          type: "INFO",
          status: "PROCESSED",
        },
      })
    }

    return NextResponse.json(leave)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
