import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"

// GET /api/leaves - List leaves with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)

    const where: any = {}

    // Non-admin users see only their own leaves
    if (!isAdmin(userRole)) {
      where.userId = userId
    } else {
      // Admin can filter by userId
      const filterUserId = searchParams.get("userId")
      if (filterUserId) where.userId = filterUserId
    }

    // Filter by status
    const status = searchParams.get("status")
    if (status) where.status = status

    // Filter by date range
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    if (startDate && endDate) {
      where.OR = [
        { startDate: { lte: new Date(endDate) }, endDate: { gte: new Date(startDate) } }
      ]
    }

    const leaves = await db.leave.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(leaves)
  } catch (error: any) {
    console.error("[leaves] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/leaves - Create a leave request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sessionUserId = session.user.id
    const userRole = session.user.role
    const body = await req.json()

    const { userId, leaveType, startDate, endDate, reason } = body

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
    }

    if (!leaveType) {
      return NextResponse.json({ error: "Leave type is required" }, { status: 400 })
    }

    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
    }

    // Non-admin users can only create leaves for themselves
    const targetUserId = !isAdmin(userRole) ? sessionUserId : (userId || sessionUserId)

    const validLeaveTypes = ["SICK_LEAVE", "CASUAL_LEAVE", "ANNUAL_LEAVE", "PUBLIC_HOLIDAY", "OTHER"]
    if (!validLeaveTypes.includes(leaveType)) {
      return NextResponse.json({ error: "Invalid leave type" }, { status: 400 })
    }

    const leave = await db.leave.create({
      data: {
        userId: targetUserId,
        leaveType,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reason: reason || null,
        status: "PENDING",
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    })

    // Notify admins about new leave request
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
    })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          title: "New Leave Request",
          message: `${leave.user?.name || "A team member"} requested ${leaveType.replace("_", " ").toLowerCase()} leave from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
          type: "APPROVAL",
          link: "/dashboard/leaves",
          metadata: JSON.stringify({ leaveId: leave.id }),
        },
      })
    }

    return NextResponse.json(leave, { status: 201 })
  } catch (error: any) {
    console.error("[leaves] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
