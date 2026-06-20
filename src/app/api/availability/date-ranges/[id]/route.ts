import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { ensureTable } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"

// W32: Standardized time validation regex (validates HH:MM with proper hour/minute ranges)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

function toYmd(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// PATCH /api/availability/date-ranges/[id] — Update a date range
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureTable("AvailabilityDateRange")

    const rl = rateLimit(`availability-date-ranges-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    let body
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const data: Record<string, unknown> = {}

    if (body.startDate !== undefined) {
      const s = typeof body.startDate === "string" ? body.startDate : ""
      const start = new Date(s + (s.length === 10 ? "T00:00:00" : ""))
      if (isNaN(start.getTime())) {
        return NextResponse.json({ error: "Invalid startDate format. Use YYYY-MM-DD" }, { status: 400 })
      }
      start.setHours(0, 0, 0, 0)
      data.startDate = start
    }
    if (body.endDate !== undefined) {
      const e = typeof body.endDate === "string" ? body.endDate : ""
      const end = new Date(e + (e.length === 10 ? "T00:00:00" : ""))
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid endDate format. Use YYYY-MM-DD" }, { status: 400 })
      }
      end.setHours(23, 59, 59, 999)
      data.endDate = end
    }
    if (body.startTime !== undefined) {
      // Allow null (clears time) or valid HH:MM
      if (body.startTime === null || body.startTime === "") {
        data.startTime = null
      } else if (typeof body.startTime === "string" && TIME_REGEX.test(body.startTime)) {
        data.startTime = body.startTime
      } else {
        return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
      }
    }
    if (body.endTime !== undefined) {
      if (body.endTime === null || body.endTime === "") {
        data.endTime = null
      } else if (typeof body.endTime === "string" && TIME_REGEX.test(body.endTime)) {
        data.endTime = body.endTime
      } else {
        return NextResponse.json({ error: "End time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
      }
    }
    if (body.isAvailable !== undefined) {
      if (typeof body.isAvailable !== "boolean") {
        return NextResponse.json({ error: "isAvailable must be a boolean" }, { status: 400 })
      }
      data.isAvailable = body.isAvailable
    }
    if (body.reason !== undefined) {
      data.reason = body.reason === null || body.reason === "" ? null : String(body.reason).slice(0, 300)
    }

    const updated = await db.$transaction(async (tx) => {
      const existing = await tx.availabilityDateRange.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }

      // Ownership check: non-admins can only modify their own date ranges
      if (!isAdmin(session.user.role) && existing.userId !== session.user.id) {
        throw new Error("FORBIDDEN")
      }

      // Cross-field validation: startDate <= endDate
      const effStart = data.startDate !== undefined ? (data.startDate as Date) : existing.startDate
      const effEnd = data.endDate !== undefined ? (data.endDate as Date) : existing.endDate
      if (effStart > effEnd) {
        throw new Error("START_AFTER_END")
      }

      // Cross-field validation: startTime < endTime (when both set)
      const effStartTime = data.startTime !== undefined ? (data.startTime as string | null) : existing.startTime
      const effEndTime = data.endTime !== undefined ? (data.endTime as string | null) : existing.endTime
      if (
        (data.startTime !== undefined || data.endTime !== undefined) &&
        effStartTime && effEndTime && effStartTime >= effEndTime
      ) {
        throw new Error("TIME_INVALID")
      }

      // Paired-times rule: if only one is set after this update, reject (must be both or neither)
      if (
        (data.startTime !== undefined || data.endTime !== undefined) &&
        ((effStartTime && !effEndTime) || (!effStartTime && effEndTime))
      ) {
        throw new Error("TIME_MUST_BE_PAIRED")
      }

      return tx.availabilityDateRange.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    const mapped = {
      id: updated.id,
      userId: updated.userId,
      user: updated.user,
      startDate: toYmd(updated.startDate instanceof Date ? updated.startDate : new Date(updated.startDate)),
      endDate: toYmd(updated.endDate instanceof Date ? updated.endDate : new Date(updated.endDate)),
      startTime: updated.startTime,
      endTime: updated.endTime,
      isAvailable: updated.isAvailable,
      reason: updated.reason,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }

    return NextResponse.json({ success: true, dateRange: mapped })
  } catch (error: unknown) {
    console.error("[availability/date-ranges] PATCH error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Date range not found" }, { status: 404 })
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (error.message === "START_AFTER_END") {
        return NextResponse.json({ error: "startDate must be on or before endDate" }, { status: 400 })
      }
      if (error.message === "TIME_INVALID") {
        return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
      }
      if (error.message === "TIME_MUST_BE_PAIRED") {
        return NextResponse.json({ error: "Both startTime and endTime must be provided together, or neither" }, { status: 400 })
      }
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/date-ranges/[id] — Delete a date range
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureTable("AvailabilityDateRange")

    const rl = rateLimit(`availability-date-ranges-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    const existing = await db.availabilityDateRange.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Date range not found" }, { status: 404 })
    }

    // Ownership check
    if (!isAdmin(session.user.role) && existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await db.availabilityDateRange.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[availability/date-ranges] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
