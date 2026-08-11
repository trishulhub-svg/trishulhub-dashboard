import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
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

// PATCH /api/availability/overrides/[id] - Update override
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    const data: Record<string, unknown> = {}

    // W38: Validate fields before applying
    if (body.date !== undefined) {
      const parsedDate = parseLocalDate(typeof body.date === "string" ? body.date : "")
      if (!parsedDate) {
        return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 })
      }
      data.date = parsedDate
    }
    if (body.startTime !== undefined) {
      if (body.startTime === null || body.startTime === "") {
        data.startTime = null
      } else if (typeof body.startTime === "string" && (TIME_REGEX.test(body.startTime) || body.startTime === "24:00")) {
        data.startTime = body.startTime
      } else {
        return NextResponse.json({ error: "Start time must be in HH:MM format (00:00–23:59)" }, { status: 400 })
      }
    }
    if (body.endTime !== undefined) {
      if (body.endTime === null || body.endTime === "") {
        data.endTime = null
      } else if (typeof body.endTime === "string" && (TIME_REGEX.test(body.endTime) || body.endTime === "24:00")) {
        data.endTime = body.endTime
      } else {
        return NextResponse.json({ error: "End time must be in HH:MM format (00:00–24:00)" }, { status: 400 })
      }
    }
    if (body.isAvailable !== undefined) {
      if (typeof body.isAvailable !== "boolean") {
        return NextResponse.json({ error: "isAvailable must be a boolean" }, { status: 400 })
      }
      data.isAvailable = body.isAvailable
    }
    if (body.reason !== undefined) {
      data.reason = body.reason === null || body.reason === "" ? null : String(body.reason).slice(0, 200)
    }

    const override = await db.$transaction(async (tx) => {
      const existing = await tx.availabilityOverride.findUnique({ where: { id } })
      if (!existing) {
        throw new Error("NOT_FOUND")
      }

      // W38: Validate startTime < endTime if both provided (cross-field with existing record)
      const effectiveStartTime = data.startTime !== undefined ? (data.startTime as string | null) : existing.startTime
      const effectiveEndTime = data.endTime !== undefined ? (data.endTime as string | null) : existing.endTime
      if (
        effectiveStartTime &&
        effectiveEndTime &&
        effectiveEndTime !== "24:00" &&
        effectiveStartTime >= effectiveEndTime
      ) {
        throw new Error("START_AFTER_END")
      }
      if (
        (data.startTime !== undefined || data.endTime !== undefined) &&
        ((effectiveStartTime && !effectiveEndTime) || (!effectiveStartTime && effectiveEndTime))
      ) {
        throw new Error("TIME_MUST_BE_PAIRED")
      }

      return tx.availabilityOverride.update({
        where: { id },
        data,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole,
      department: "HR_PEOPLE",
      page: "availability",
      action: "UPDATE",
      entityType: "AvailabilityOverride",
      entityId: id,
      description: `Updated availability override for user ${override.user?.name || override.userId} on ${formatDisplayDate(toYmd(override.date))} (fields: ${Object.keys(data).join(", ") || "none"})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json(mapOverride(override))
  } catch (error: unknown) {
    console.error("[availability/overrides] PATCH error:", error instanceof Error ? error.message : String(error))
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }
    if (error instanceof Error && error.message === "START_AFTER_END") {
      return NextResponse.json({ error: "Start time must be before end time" }, { status: 400 })
    }
    if (error instanceof Error && error.message === "TIME_MUST_BE_PAIRED") {
      return NextResponse.json({ error: "Both startTime and endTime must be provided together, or neither" }, { status: 400 })
    }
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/availability/overrides/[id] - Delete override
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    const existing = await db.availabilityOverride.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Availability override not found" }, { status: 404 })
    }

    await db.availabilityOverride.delete({ where: { id } })

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
