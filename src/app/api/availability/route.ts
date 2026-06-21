import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// W32: Standardized time validation regex (validates HH:MM with proper hour/minute ranges)
// Also accepts "24:00" as a valid end time (meaning end of day / midnight)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

// GET /api/availability - List availability entries
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("Availability")

    // Rate limit for GET
    const rl = rateLimit(`availability-list-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const where: Record<string, unknown> = {}

    const userId = searchParams.get("userId")
    if (userId) {
      // W33: Validate userId format to prevent injection
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) {
        return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
      }
      where.userId = userId
    }

    const dayOfWeekParam = searchParams.get("dayOfWeek")
    if (dayOfWeekParam !== null) {
      const dayOfWeek = parseInt(dayOfWeekParam)
      if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
        where.dayOfWeek = dayOfWeek
      }
    }

    const pageParam = parseInt(searchParams.get("page") || "1", 10)
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = 100

    const [availabilities, total] = await Promise.all([
      db.availability.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      db.availability.count({ where }),
    ])

    return NextResponse.json({
      data: availabilities,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error: unknown) {
    console.error("[availability] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/availability - Create availability entry
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("Availability")

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const { userId, dayOfWeek, startTime, endTime, isAvailable } = body

    if (!userId || dayOfWeek === undefined || dayOfWeek === null || !startTime || !endTime) {
      return NextResponse.json({ error: "User ID, day of week, start time, and end time are required" }, { status: 400 })
    }

    if (typeof dayOfWeek !== "number" || isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json({ error: "Day of week must be a valid number 0-6 (Sunday=0)" }, { status: 400 })
    }

    // Validate startTime/endTime format
    if (!TIME_REGEX.test(startTime) && startTime !== "24:00") {
      return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
    }
    if (!TIME_REGEX.test(endTime) && endTime !== "24:00") {
      return NextResponse.json({ error: "End time must be in HH:MM format (00:00–24:00)" }, { status: 400 })
    }
    // "24:00" means end of day — always greater than any start time
    // For normal times, start must be before end
    if (endTime !== "24:00" && startTime >= endTime) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }

    // Validate userId exists
    const userExists = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 400 })
    }

    // C11: Check for overlapping time ranges + create in transaction
    const availability = await db.$transaction(async (tx) => {
      const existing = await tx.availability.findMany({ where: { userId, dayOfWeek } })
      const hasOverlap = existing.some(e =>
        startTime < e.endTime && endTime > e.startTime
      )
      if (hasOverlap) {
        throw new Error("TIME_OVERLAP")
      }
      return tx.availability.create({
        data: {
          userId,
          dayOfWeek,
          startTime,
          endTime,
          isAvailable: isAvailable !== undefined ? isAvailable : true,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    // Audit: log availability entry creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "availability", action: "CREATE",
      entityType: "Availability", entityId: availability.id,
      description: `Created availability for user ${availability.user?.name || userId}: day ${dayOfWeek}, ${startTime}–${endTime}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(availability, { status: 201 })
  } catch (error: unknown) {
    console.error("[availability] POST error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "TIME_OVERLAP") {
      return NextResponse.json({ error: "Time range overlaps with existing availability" }, { status: 409 })
    }
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Duplicate availability entry for this user, day, and time slot" }, { status: 409 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
