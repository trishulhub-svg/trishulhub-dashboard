import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isSuperAdmin, isAdmin } from "@/lib/rbac"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { rateLimit } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { parseDaysOfWeek, dateRangeAppliesOnDay } from "@/lib/availability-days"

/** Calendar YYYY-MM-DD from Date/string without local TZ day-shift surprises on Vercel. */
function toYmdSafe(d: Date | string): string {
  if (typeof d === "string") {
    const s = d.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  }
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ""
  return dt.toISOString().slice(0, 10)
}

function parseYmd(input: string): { ymd: string; dow: number } | null {
  const s = typeof input === "string" ? input.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  // Parse as UTC noon to avoid DST/edge midnight issues when reading getUTCDay
  const dt = new Date(`${s}T12:00:00.000Z`)
  if (Number.isNaN(dt.getTime())) return null
  return { ymd: s, dow: dt.getUTCDay() }
}

function addDaysYmd(ymd: string, n: number): string {
  const dt = new Date(`${ymd}T12:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

function startOfYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

function endOfYmd(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999Z`)
}

/**
 * POST /api/availability/date-ranges/[id]/exclude-day
 * Body: { date: "YYYY-MM-DD" }
 * Super Admin only — carves one calendar day out of a multi-day range.
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

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }
    if (!isSuperAdmin(session.user.role)) {
      return NextResponse.json(
        {
          error:
            "Contact Super Admin to remove a single day from a date range. Admins can edit or delete the full range in the Date Ranges tab.",
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
    const parsedDay = parseYmd(typeof body.date === "string" ? body.date : "")
    if (!parsedDay) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 })
    }
    const dayYmd = parsedDay.ymd

    const existing = await db.availabilityDateRange.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: "Date range not found" }, { status: 404 })
    }

    const startYmd = toYmdSafe(existing.startDate)
    const endYmd = toYmdSafe(existing.endDate)
    if (!startYmd || !endYmd) {
      return NextResponse.json({ error: "Date range has invalid dates" }, { status: 400 })
    }

    if (dayYmd < startYmd || dayYmd > endYmd) {
      return NextResponse.json(
        {
          error: `That date (${dayYmd}) is not inside this date range (${startYmd} → ${endYmd})`,
        },
        { status: 400 }
      )
    }

    const daysOfWeek = parseDaysOfWeek(existing.daysOfWeek)
    if (!dateRangeAppliesOnDay(daysOfWeek, parsedDay.dow)) {
      return NextResponse.json(
        { error: "That weekday is not included in this date range filter" },
        { status: 400 }
      )
    }

    const userLabel = existing.user?.name || existing.userId
    let mode: "deleted" | "shrunk_start" | "shrunk_end" | "split" = "deleted"

    if (startYmd === endYmd) {
      await db.availabilityDateRange.delete({ where: { id } })
      mode = "deleted"
    } else if (dayYmd === startYmd) {
      const newStart = addDaysYmd(dayYmd, 1)
      await db.availabilityDateRange.update({
        where: { id },
        data: { startDate: startOfYmd(newStart) },
      })
      mode = "shrunk_start"
    } else if (dayYmd === endYmd) {
      const newEnd = addDaysYmd(dayYmd, -1)
      await db.availabilityDateRange.update({
        where: { id },
        data: { endDate: endOfYmd(newEnd) },
      })
      mode = "shrunk_end"
    } else {
      const leftEnd = addDaysYmd(dayYmd, -1)
      const rightStart = addDaysYmd(dayYmd, 1)
      await db.$transaction(async (tx) => {
        await tx.availabilityDateRange.update({
          where: { id },
          data: { endDate: endOfYmd(leftEnd) },
        })
        await tx.availabilityDateRange.create({
          data: {
            userId: existing.userId,
            startDate: startOfYmd(rightStart),
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to remove day: ${error.message.slice(0, 160)}`
            : "Failed to remove day from date range",
      },
      { status: 500 }
    )
  }
}
