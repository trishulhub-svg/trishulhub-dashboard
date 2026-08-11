import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isSuperAdmin, isAdmin } from "@/lib/rbac"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { parseDaysOfWeek, dateRangeAppliesOnDay } from "@/lib/availability-days"

function toYmd(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
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

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * POST /api/availability/date-ranges/[id]/exclude-day
 * Body: { date: "YYYY-MM-DD" }
 * Super Admin only — carves one calendar day out of a multi-day range
 * (shrink start/end, split into two ranges, or delete if single-day).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureCriticalSchema()

    const rl = rateLimit(`availability-exclude-day-${session.user.id}`, 30, 60_000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // Admins can manage ranges, but single-day carve-out is Super Admin only
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }
    if (!isSuperAdmin(session.user.role)) {
      return NextResponse.json(
        {
          error:
            "Contact Super Admin to remove a single day from a date range. Admins can edit or delete the full range instead.",
          code: "SUPER_ADMIN_REQUIRED",
        },
        { status: 403 }
      )
    }

    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const dateStr = typeof body.date === "string" ? body.date.trim() : ""
    const day = parseLocalDate(dateStr)
    if (!day) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 })
    }
    const dayYmd = toYmd(day)

    const existing = await db.availabilityDateRange.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: "Date range not found" }, { status: 404 })
    }

    const start = new Date(existing.startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(existing.endDate)
    end.setHours(0, 0, 0, 0)
    const startYmd = toYmd(start)
    const endYmd = toYmd(end)

    if (dayYmd < startYmd || dayYmd > endYmd) {
      return NextResponse.json({ error: "That date is not inside this date range" }, { status: 400 })
    }

    const daysOfWeek = parseDaysOfWeek(existing.daysOfWeek)
    if (!dateRangeAppliesOnDay(daysOfWeek, day.getDay())) {
      return NextResponse.json(
        { error: "That weekday is not included in this date range filter" },
        { status: 400 }
      )
    }

    const userLabel = existing.user?.name || existing.userId
    let mode: "deleted" | "shrunk_start" | "shrunk_end" | "split" = "deleted"

    if (startYmd === endYmd) {
      // Only this one day — delete the whole range
      await db.availabilityDateRange.delete({ where: { id } })
      mode = "deleted"
    } else if (dayYmd === startYmd) {
      const newStart = addDays(day, 1)
      await db.availabilityDateRange.update({
        where: { id },
        data: { startDate: newStart, updatedAt: new Date() },
      })
      mode = "shrunk_start"
    } else if (dayYmd === endYmd) {
      const newEnd = endOfDay(addDays(day, -1))
      await db.availabilityDateRange.update({
        where: { id },
        data: { endDate: newEnd, updatedAt: new Date() },
      })
      mode = "shrunk_end"
    } else {
      // Middle day — keep left half on original, create right half
      const leftEnd = endOfDay(addDays(day, -1))
      const rightStart = addDays(day, 1)
      await db.$transaction(async (tx) => {
        await tx.availabilityDateRange.update({
          where: { id },
          data: { endDate: leftEnd, updatedAt: new Date() },
        })
        await tx.availabilityDateRange.create({
          data: {
            userId: existing.userId,
            startDate: rightStart,
            endDate: existing.endDate,
            startTime: existing.startTime,
            endTime: existing.endTime,
            isAvailable: existing.isAvailable,
            reason: existing.reason,
            daysOfWeek: existing.daysOfWeek,
          },
        })
      })
      mode = "split"
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "availability",
      action: "DELETE",
      entityType: "AvailabilityDateRange",
      entityId: id,
      description: `Removed single day ${dayYmd} from date range for ${userLabel} (${startYmd} → ${endYmd}, mode=${mode})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({
        excludedDate: dayYmd,
        mode,
        userId: existing.userId,
        originalStart: startYmd,
        originalEnd: endYmd,
      }),
    })

    return NextResponse.json({
      ok: true,
      mode,
      excludedDate: dayYmd,
      message:
        mode === "deleted"
          ? `Removed the only day (${dayYmd}) — date range deleted`
          : `Removed ${dayYmd} from the date range`,
    })
  } catch (error: unknown) {
    console.error(
      "[availability/date-ranges/exclude-day]",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "Failed to remove day from date range" }, { status: 500 })
  }
}
