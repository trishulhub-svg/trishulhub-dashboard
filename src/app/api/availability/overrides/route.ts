import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, isAdminOrProjectManager } from "@/lib/rbac"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { formatDisplayDate } from "@/lib/format"

// W32: Standardized time validation regex (validates HH:MM with proper hour/minute ranges)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function toYmd(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse YYYY-MM-DD (or ISO) to local calendar day bounds without UTC day-shift. */
function parseLocalDate(input: string): Date | null {
  const s = typeof input === "string" ? input.trim() : ""
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function mapOverride(o: {
  id: string
  userId: string
  date: Date | string
  startTime: string | null
  endTime: string | null
  isAvailable: boolean
  reason: string | null
  createdAt?: Date | string
  updatedAt?: Date | string
  user?: { id: string; name: string; email: string; avatar: string | null }
}) {
  return {
    id: o.id,
    userId: o.userId,
    user: o.user,
    date: toYmd(o.date),
    startTime: o.startTime,
    endTime: o.endTime,
    isAvailable: o.isAvailable,
    reason: o.reason,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }
}

// C26: Helper to check for Prisma unique constraint error (P2002)
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

// GET /api/availability/overrides - List overrides
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    // GET: allow PROJECT_MANAGER (read-only). Mutations (POST/DELETE) still require isAdmin.
    if (!isAdminOrProjectManager(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureCriticalSchema()

    // Rate limit for GET
    const rl = rateLimit(`availability-overrides-list-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const where: Record<string, unknown> = {}

    const userId = searchParams.get("userId")
    if (userId) where.userId = userId

    const date = searchParams.get("date")
    if (date) {
      const parsedDate = parseLocalDate(date)
      if (!parsedDate) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      const startOfDay = new Date(parsedDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(parsedDate)
      endOfDay.setHours(23, 59, 59, 999)
      where.date = { gte: startOfDay, lte: endOfDay }
    }

    // Optional: from=YYYY-MM-DD — only overrides on/after this day (Overrides tab uses today)
    const from = searchParams.get("from")
    if (from) {
      const fromDate = parseLocalDate(from)
      if (!fromDate) {
        return NextResponse.json({ error: "Invalid from date format. Use YYYY-MM-DD" }, { status: 400 })
      }
      fromDate.setHours(0, 0, 0, 0)
      where.date = { ...(typeof where.date === "object" && where.date ? (where.date as object) : {}), gte: fromDate }
    }

    // W42: Add skip/take pagination with query params
    const pageParam = parseInt(searchParams.get("page") || "1", 10)
    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam
    const pageSize = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10), 1), 500)
    const skip = (page - 1) * pageSize

    const total = await db.availabilityOverride.count({ where })

    const overrides = await db.availabilityOverride.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { date: "asc" },
      take: pageSize,
      skip,
    })

    return NextResponse.json({
      data: overrides.map(mapOverride),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error: unknown) {
    console.error("[availability/overrides] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/availability/overrides - Create override
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureCriticalSchema()

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const { userId, date, startTime, endTime, isAvailable, reason } = body

    if (!userId || !date) {
      return NextResponse.json({ error: "User ID and date are required" }, { status: 400 })
    }

    // W18: Verify user exists before creating override
    const userExists = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!userExists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Validate date (local calendar day — avoid UTC shift on YYYY-MM-DD)
    const parsedDate = parseLocalDate(typeof date === "string" ? date : "")
    if (!parsedDate) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 })
    }

    // W37: Validate time format and startTime < endTime
    if (startTime && !TIME_REGEX.test(startTime) && startTime !== "24:00") {
      return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
    }
    if (endTime && !TIME_REGEX.test(endTime) && endTime !== "24:00") {
      return NextResponse.json({ error: "End time must be in HH:MM format (00:00–24:00)" }, { status: 400 })
    }
    // "24:00" means end of day — always greater than any start time
    if (startTime && endTime && endTime !== "24:00" && startTime >= endTime) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return NextResponse.json({ error: "Both startTime and endTime must be provided together, or neither" }, { status: 400 })
    }

    const override = await db.availabilityOverride.create({
      data: {
        userId,
        date: parsedDate,
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable: isAvailable !== undefined ? isAvailable : false,
        reason: reason || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    // Audit: log availability override creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "availability", action: "CREATE",
      entityType: "AvailabilityOverride", entityId: override.id,
      description: `Created availability override for user ${override.user?.name || userId} on ${formatDisplayDate(toYmd(parsedDate))}${reason ? ` (${reason})` : ""}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json(mapOverride(override), { status: 201 })
  } catch (error: unknown) {
    // C26: Handle P2002 unique constraint violation (duplicate userId+date)
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: "An availability override already exists for this user on this date" }, { status: 409 })
    }
    console.error("[availability/overrides] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/overrides - Delete override
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureCriticalSchema()

    // C10: Rate limit
    const rl = rateLimit(`availability-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

    // Validate id format
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Override not found" }, { status: 404 })

    await db.availabilityOverride.delete({ where: { id } })

    // Audit: log availability override deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "HR_PEOPLE", page: "availability", action: "DELETE",
      entityType: "AvailabilityOverride", entityId: id,
      description: `Deleted availability override for user ${existing.userId} on ${formatDisplayDate(existing.date)}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[availability/overrides] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
