import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureTable } from "@/lib/auto-migrate"

const VALID_LEAVE_TYPES = [
  "SICK_LEAVE",
  "CASUAL_LEAVE",
  "ANNUAL_LEAVE",
  "PUBLIC_HOLIDAY",
  "MATERNITY_LEAVE",
  "PATERNITY_LEAVE",
  "COMPENSATORY_OFF",
  "HALF_DAY",
  "WORK_FROM_HOME",
  "OTHER",
] as const

const VALID_LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const

// GET /api/leaves - List leaves with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`leaves-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const userId = session.user.id
    const userRole = session.user.role
    const { searchParams } = new URL(req.url)

    const where: Record<string, unknown> = {}

    // Non-admin users see only their own leaves
    if (!isAdmin(userRole)) {
      where.userId = userId
    } else {
      // Admin can filter by userId
      const filterUserId = searchParams.get("userId")
      if (filterUserId) where.userId = filterUserId
    }

    // Filter by status (validated against whitelist)
    const status = searchParams.get("status")
    if (status) {
      if (!VALID_LEAVE_STATUSES.includes(status as typeof VALID_LEAVE_STATUSES[number])) {
        return NextResponse.json({ error: "Invalid status filter. Allowed: PENDING, APPROVED, REJECTED, CANCELLED" }, { status: 400 })
      }
      where.status = status
    }

    // Filter by date range
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    if (startDate && endDate) {
      where.OR = [
        { startDate: { lte: new Date(endDate) }, endDate: { gte: new Date(startDate) } }
      ]
    }

    // Pagination
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const take = Math.max(Number(searchParams.get("limit")) || 50, 1)
    const skip = (page - 1) * take

    const leaves = await db.leave.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        approver: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    })

    return NextResponse.json(leaves)
  } catch (error: unknown) {
    console.error("[leaves] GET Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/leaves - Create a leave request
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limiting
    const rl = rateLimit(`leaves-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureTable("Leave")

    const sessionUserId = session.user.id
    const userRole = session.user.role
    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

    const { userId, leaveType, startDate, endDate, reason } = body

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start date and end date are required" }, { status: 400 })
    }

    if (!leaveType) {
      return NextResponse.json({ error: "Leave type is required" }, { status: 400 })
    }

    if (!VALID_LEAVE_TYPES.includes(leaveType)) {
      return NextResponse.json({ error: `Invalid leave type. Allowed: ${VALID_LEAVE_TYPES.join(", ")}` }, { status: 400 })
    }

    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
    }

    // Validate dates are not entirely in the past
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (new Date(endDate) < today) {
      return NextResponse.json({ error: "Leave dates cannot be entirely in the past" }, { status: 400 })
    }

    // Non-admin users can only create leaves for themselves
    const targetUserId = !isAdmin(userRole) ? sessionUserId : (userId || sessionUserId)

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

    // Notify admins about new leave request (fire-and-forget, don't block creation)
    try {
      const admins = await db.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      })
      // TODO: Use db.notification.createMany for batch insert
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
    } catch (notifyErr: unknown) {
      console.error("[leaves] POST notification error (non-blocking):", notifyErr)
    }

    return NextResponse.json(leave, { status: 201 })
  } catch (error: unknown) {
    console.error("[leaves] POST Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
