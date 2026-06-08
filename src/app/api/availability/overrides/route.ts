import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"

const timeRegex = /^\d{2}:\d{2}$/

// GET /api/availability/overrides - List overrides
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    await ensureTable("AvailabilityOverride")

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
      const parsedDate = new Date(date)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
      }
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      where.date = { gte: startOfDay, lte: endOfDay }
    }

    const overrides = await db.availabilityOverride.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { date: "asc" },
      take: 100,
    })

    return NextResponse.json(overrides)
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

    await ensureTable("AvailabilityOverride")

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

    // Validate date
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    // W37: Validate time format and startTime < endTime
    if (startTime && !timeRegex.test(startTime)) {
      return NextResponse.json({ error: "Start time must be in HH:MM format" }, { status: 400 })
    }
    if (endTime && !timeRegex.test(endTime)) {
      return NextResponse.json({ error: "End time must be in HH:MM format" }, { status: 400 })
    }
    if (startTime && endTime && startTime >= endTime) {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }

    const override = await db.availabilityOverride.create({
      data: {
        userId,
        date: new Date(date),
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable: isAvailable !== undefined ? isAvailable : false,
        reason: reason || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    return NextResponse.json(override, { status: 201 })
  } catch (error: unknown) {
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

    await ensureTable("AvailabilityOverride")

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
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[availability/overrides] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
