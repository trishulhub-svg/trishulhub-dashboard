// DEPRECATED: Use /api/leaves/[id] instead. This endpoint reads ID from body which is less secure.

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureTable } from "@/lib/auto-migrate"

// GET /api/leave - List leave requests (DEPRECATED: use /api/leaves instead)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`leave-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)

    // Admins see all, others see their own
    const where: Record<string, unknown> = isAdmin(userRole)
      ? {}
      : { userId }

    // Pagination
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const take = Math.max(Number(searchParams.get("limit")) || 50, 1)
    const skip = (page - 1) * take

    const leaves = await db.leave.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    })

    const response = NextResponse.json(leaves)
    response.headers.set('X-Deprecation-Warning', 'This endpoint is deprecated. Use /api/leaves instead.')
    return response
  } catch (error: unknown) {
    console.error("[leave] GET Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/leave - Create a leave request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`leave-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
    const { leaveType, startDate, endDate, reason } = body

    // [W16] Validate leave type against whitelist
    const validLeaveTypes = ["SICK_LEAVE", "CASUAL_LEAVE", "EARNED_LEAVE", "MATERNITY_LEAVE", "PATERNITY_LEAVE", "COMPENSATORY_OFF", "HALF_DAY", "WORK_FROM_HOME"]
    if (leaveType && !validLeaveTypes.includes(leaveType)) {
      return NextResponse.json({ error: `Invalid leave type. Valid types: ${validLeaveTypes.join(", ")}` }, { status: 400 })
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
    }

    // Validate startDate <= endDate
    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
    }

    const leave = await db.leave.create({
      data: {
        userId,
        leaveType: leaveType || "SICK_LEAVE",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || null,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // Notify admins about the new leave request (fire-and-forget)
    try {
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
            message: `${session.user.name || "A team member"} requested ${leaveType || "sick"} leave from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
            type: "APPROVAL",
            link: "/dashboard/leaves",
            metadata: JSON.stringify({ leaveRequestId: leave.id }),
          },
        })
      }
    } catch (notifyErr: unknown) {
      console.error("[leave] POST notification error (non-blocking):", notifyErr)
    }

    const response = NextResponse.json(leave, { status: 201 })
    response.headers.set('X-Deprecation-Warning', 'This endpoint is deprecated. Use /api/leaves instead.')
    return response
  } catch (error: unknown) {
    console.error("[leave] POST Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH /api/leave - Approve or reject a leave request
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rl = rateLimit(`leave-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    const userRole = session.user.role

    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Only admins can approve/reject leave requests" }, { status: 403 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }
    const { id, status, reason: feedback } = body

    if (!id || !["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Valid ID and status (APPROVED/REJECTED) required" }, { status: 400 })
    }

    // Wrap leave approve/reject in transaction to prevent TOCTOU
    const leave = await db.$transaction(async (tx) => {
      const existingLeave = await tx.leave.findUnique({ where: { id: id as string } })
      if (!existingLeave) return null

      // [C7] Prevent self-approval bypass
      if (existingLeave.userId === userId) {
        throw new Error("Cannot approve your own leave request")
      }

      // [W17] Validate status transitions: only PENDING → APPROVED or PENDING → REJECTED
      if (existingLeave.status !== "PENDING") {
        throw new Error("This leave request has already been processed")
      }

      return await tx.leave.update({
        where: { id },
        data: {
          status,
          approvedBy: userId,
          approvedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      })
    })

    if (!leave) {
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }

    // Notify the employee (fire-and-forget)
    try {
      await db.notification.create({
        data: {
          userId: leave.userId,
          title: `Leave ${status === "APPROVED" ? "Approved" : "Rejected"}`,
          message: `Your ${leave.leaveType} leave request from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been ${status.toLowerCase()}.`,
          type: status === "APPROVED" ? "SUCCESS" : "WARNING",
          link: "/dashboard/leaves",
          metadata: JSON.stringify({ leaveRequestId: leave.id }),
        },
      })
    } catch (notifyErr: unknown) {
      console.error("[leave] PATCH notification error (non-blocking):", notifyErr)
    }

    const response = NextResponse.json(leave)
    response.headers.set('X-Deprecation-Warning', 'This endpoint is deprecated. Use /api/leaves instead.')
    return response
  } catch (error: unknown) {
    if (error instanceof Error && (error.message.includes("Cannot approve your own") || error.message.includes("already been processed"))) {
      const status = error.message.includes("Cannot approve") ? 403 : 400
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error("[leave] PATCH Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
