import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, isAdminOrProjectManager } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// W32: Standardized time validation regex (validates HH:MM with proper hour/minute ranges)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function toYmd(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// GET /api/availability/date-ranges — List date ranges
//   Non-admins: only their own date ranges
//   Admins: all date ranges, or filtered by ?userId=X
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureTable("AvailabilityDateRange")

    const rl = rateLimit(
      `availability-date-ranges-list-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const userIdParam = searchParams.get("userId")

    // Scope: non-admins (DEVELOPER/VIEWER) only see their own.
    // ADMIN/SUPER_ADMIN/PROJECT_MANAGER can see any user (or all).
    // PROJECT_MANAGER gets read-only admin-like visibility per requirement.
    const where: Record<string, unknown> = {}
    if (!isAdminOrProjectManager(session.user.role)) {
      where.userId = session.user.id
    } else if (userIdParam) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userIdParam)) {
        return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
      }
      where.userId = userIdParam
    }

    const dateRanges = await db.availabilityDateRange.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: [{ startDate: "asc" }],
    })

    const mapped = dateRanges.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      startDate: toYmd(r.startDate instanceof Date ? r.startDate : new Date(r.startDate)),
      endDate: toYmd(r.endDate instanceof Date ? r.endDate : new Date(r.endDate)),
      startTime: r.startTime,
      endTime: r.endTime,
      isAvailable: r.isAvailable,
      reason: r.reason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    return NextResponse.json({ dateRanges: mapped })
  } catch (error: unknown) {
    console.error("[availability/date-ranges] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/availability/date-ranges — Create a new date range
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureTable("AvailabilityDateRange")

    const rl = rateLimit(`availability-date-ranges-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // Mutations are ADMIN/SUPER_ADMIN only (PROJECT_MANAGER is read-only on Availability)
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    let body
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { userId: bodyUserId, startDate, endDate, startTime, endTime, isAvailable, reason } = body

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
    }

    // Admins may create for any user; default to self when omitted.
    let targetUserId: string
    if (bodyUserId) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(bodyUserId)) {
        return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
      }
      targetUserId = bodyUserId
    } else {
      targetUserId = session.user.id
    }

    // Verify user exists
    const userExists = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } })
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Parse + validate dates (accept YYYY-MM-DD or ISO)
    const startStr = typeof startDate === "string" ? startDate : ""
    const endStr = typeof endDate === "string" ? endDate : ""
    const start = new Date(startStr + (startStr.length === 10 ? "T00:00:00" : ""))
    const end = new Date(endStr + (endStr.length === 10 ? "T00:00:00" : ""))
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 })
    }
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)
    if (start > end) {
      return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 })
    }

    // Optional time validation: if provided, both must be valid and start < end
    if (startTime && !TIME_REGEX.test(startTime) && startTime !== "24:00") {
      return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
    }
    if (endTime && !TIME_REGEX.test(endTime) && endTime !== "24:00") {
      return NextResponse.json({ error: "End time must be in HH:MM format (00:00–24:00)" }, { status: 400 })
    }
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return NextResponse.json({ error: "Both startTime and endTime must be provided together, or neither" }, { status: 400 })
    }
    // "24:00" means end of day — always greater than any start time
    if (startTime && endTime && endTime !== "24:00" && startTime >= endTime) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }

    if (isAvailable !== undefined && typeof isAvailable !== "boolean") {
      return NextResponse.json({ error: "isAvailable must be a boolean" }, { status: 400 })
    }

    const created = await db.availabilityDateRange.create({
      data: {
        userId: targetUserId,
        startDate: start,
        endDate: end,
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        reason: reason ? String(reason).slice(0, 300) : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    // Audit: log availability date range creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "HR_PEOPLE", page: "availability", action: "CREATE",
      entityType: "AvailabilityDateRange", entityId: created.id,
      description: `Created availability date range for user ${created.user?.name || targetUserId}: ${toYmd(start)} to ${toYmd(end)}${reason ? ` (${String(reason).slice(0, 80)})` : ""}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    const mapped = {
      id: created.id,
      userId: created.userId,
      user: created.user,
      startDate: toYmd(created.startDate instanceof Date ? created.startDate : new Date(created.startDate)),
      endDate: toYmd(created.endDate instanceof Date ? created.endDate : new Date(created.endDate)),
      startTime: created.startTime,
      endTime: created.endTime,
      isAvailable: created.isAvailable,
      reason: created.reason,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }

    return NextResponse.json({ success: true, dateRange: mapped }, { status: 201 })
  } catch (error: unknown) {
    console.error("[availability/date-ranges] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
