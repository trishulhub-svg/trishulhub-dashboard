import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureTable } from "@/lib/auto-migrate"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

// I25: Handle overnight time ranges (e.g., 22:00–06:00)
function calculateHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60 // overnight
  return Math.max(0, Math.round((diff / 60) * 100) / 100)
}

function formatDateOnly(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getWeekRange(dateStr: string): { weekStart: Date; weekEnd: Date } {
  const d = new Date(dateStr + "T00:00:00")
  const day = d.getDay() // 0=Sunday
  const diff = d.getDate() - day
  const weekStart = new Date(d)
  weekStart.setDate(diff)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart, weekEnd }
}

// GET /api/availability/schedule
export async function GET(req: NextRequest) {
  try {
    // ── Auth ──
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    // W35: Consolidate all ensureTable calls into a single batch (AFTER auth)
    await Promise.all([
      ensureTable("Availability"),
      ensureTable("AvailabilityOverride"),
      ensureTable("AvailabilityDateRange"),
      ensureTable("Task"),
      ensureTable("TimeEntry"),
      ensureTable("Leave"),
      ensureTable("LeaveRequest"),
    ])

    // ── Rate limit ──
    const rl = rateLimit(
      `availability-schedule-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // ── Parse query params ──
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")
    const dateStr = searchParams.get("date")
    const userId = searchParams.get("userId")

    if (!dateStr) {
      return NextResponse.json({ error: "date parameter is required (YYYY-MM-DD)" }, { status: 400 })
    }

    const dateObj = new Date(dateStr + "T00:00:00")
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD" }, { status: 400 })
    }

    if (type === "week") {
      return handleWeekView(dateStr, dateObj)
    }

    // ── Single-user daily view ──
    if (!userId) {
      return NextResponse.json({ error: "userId parameter is required for daily view" }, { status: 400 })
    }

    // Validate userId format
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userId)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 })
    }

    return handleDailyView(dateStr, dateObj, userId)
  } catch (error: unknown) {
    console.error("[availability/schedule] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// ────────────────────────────────────────────
// Daily view for a single user
// ────────────────────────────────────────────
async function handleDailyView(dateStr: string, dateObj: Date, userId: string) {
  const dayOfWeek = dateObj.getDay()

  // Fetch user
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, department: true, avatar: true, isActive: true },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Parallel fetch all data
  const startOfDay = new Date(dateObj)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(dateObj)
  endOfDay.setHours(23, 59, 59, 999)

  const [
    availabilities,
    overrides,
    dateRanges,
    timeEntries,
    leaves,
    leaveRequests,
  ] = await Promise.all([
    // 1. Weekly availability for this day
    db.availability.findMany({
      where: { userId, dayOfWeek, isAvailable: true },
      orderBy: { startTime: "asc" },
    }),

    // 2. Overrides for this specific date
    db.availabilityOverride.findMany({
      where: {
        userId,
        date: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { startTime: "asc" },
    }),

    // 3. Date ranges overlapping this date (startDate <= endOfDay AND endDate >= startOfDay)
    db.availabilityDateRange.findMany({
      where: {
        userId,
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
      orderBy: { startDate: "asc" },
    }),

    // 4. Time entries for this user on this date
    db.timeEntry.findMany({
      where: {
        userId,
        date: { gte: startOfDay, lt: new Date(endOfDay.getTime() + 1) },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: "asc" },
    }),

    // 5. Approved leave overlapping this date
    db.leave.findMany({
      where: {
        userId,
        status: "APPROVED",
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
    }),

    // 6. Leave requests for this user (all statuses for context)
    db.leaveRequest.findMany({
      where: {
        userId,
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Determine leave status
  const isOnLeave = leaves.length > 0
  const leaveInfo = leaves.length > 0
    ? {
        id: leaves[0].id,
        leaveType: leaves[0].leaveType,
        startDate: leaves[0].startDate,
        endDate: leaves[0].endDate,
        reason: leaves[0].reason,
        status: leaves[0].status,
        approvedBy: leaves[0].approvedBy,
      }
    : null

  // If there's an override marking the user unavailable, treat as a type of leave
  const unavailableOverride = overrides.find(o => !o.isAvailable)

  // Calculate scheduled hours
  let totalScheduledHours = 0
  const effectiveAvailabilities = unavailableOverride
    ? [] // Override says unavailable — no scheduled hours
    : availabilities
  for (const a of effectiveAvailabilities) {
    totalScheduledHours += calculateHours(a.startTime, a.endTime)
  }

  // If override specifies new times, use those instead
  if (overrides.length > 0 && overrides.some(o => o.isAvailable && o.startTime && o.endTime)) {
    const availableOverrides = overrides.filter(o => o.isAvailable && o.startTime && o.endTime)
    totalScheduledHours = 0
    for (const o of availableOverrides) {
      totalScheduledHours += calculateHours(o.startTime, o.endTime)
    }
  }

  // Calculate total worked hours
  const totalWorkedHours = timeEntries.reduce((sum, te) => sum + (te.totalHours || 0), 0)

  // Build response
  const response = {
    date: dateStr,
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek],
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
    },
    availability: effectiveAvailabilities.map(a => ({
      id: a.id,
      startTime: a.startTime,
      endTime: a.endTime,
      isAvailable: a.isAvailable,
      hours: calculateHours(a.startTime, a.endTime),
    })),
    overrides: overrides.map(o => ({
      id: o.id,
      date: formatDateOnly(o.date instanceof Date ? o.date : new Date(o.date)),
      startTime: o.startTime,
      endTime: o.endTime,
      isAvailable: o.isAvailable,
      reason: o.reason,
    })),
    dateRanges: dateRanges.map(dr => ({
      id: dr.id,
      startDate: formatDateOnly(dr.startDate instanceof Date ? dr.startDate : new Date(dr.startDate)),
      endDate: formatDateOnly(dr.endDate instanceof Date ? dr.endDate : new Date(dr.endDate)),
      startTime: dr.startTime,
      endTime: dr.endTime,
      isAvailable: dr.isAvailable,
      reason: dr.reason,
    })),
    isOnLeave: isOnLeave || !!unavailableOverride,
    leaveInfo: isOnLeave ? leaveInfo : unavailableOverride
      ? { reason: unavailableOverride.reason || "Availability override — unavailable", type: "override" }
      : null,
    timeEntries: timeEntries.map(te => ({
      id: te.id,
      description: te.description,
      clockIn: te.clockIn,
      clockOut: te.clockOut,
      totalHours: te.totalHours,
      status: te.status,
      projectName: te.project?.name || null,
    })),
    totalScheduledHours,
    totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
  }

  return NextResponse.json(response)
}

// ────────────────────────────────────────────
// Week view for all active non-CLIENT users
// ────────────────────────────────────────────
async function handleWeekView(dateStr: string, dateObj: Date) {
  const { weekStart, weekEnd } = getWeekRange(dateStr)

  // Generate each day of the week
  const weekDays: Date[] = []
  for (let i = 0; i <= 6; i++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    day.setHours(0, 0, 0, 0)
    weekDays.push(day)
  }

  const weekDayStrings = weekDays.map(formatDateOnly)
  const dayOfWeeks = weekDays.map(d => d.getDay())

  // Fetch all active non-CLIENT users (limit to 200)
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: { not: "CLIENT" },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      avatar: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  })

  // W44: Get total active users count to warn if capped
  const totalUsers = await db.user.count({
    where: { isActive: true, role: { not: "CLIENT" } },
  })
  const hitCap = users.length >= 200 && totalUsers > 200

  if (users.length === 0) {
    return NextResponse.json({
      weekStart: formatDateOnly(weekStart),
      weekEnd: formatDateOnly(weekEnd),
      users: [],
    })
  }

  const userIds = users.map(u => u.id)

  // ── Batch fetch all data for the week ──
  const [
    allAvailabilities,
    allOverrides,
    allDateRanges,
    allLeaves,
  ] = await Promise.all([
    // Availability for all users for all days of the week
    db.availability.findMany({
      where: {
        userId: { in: userIds },
        dayOfWeek: { in: dayOfWeeks },
        isAvailable: true,
      },
      orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    }),

    // Overrides for all users within the week
    db.availabilityOverride.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: weekStart, lte: weekEnd },
      },
      orderBy: [{ userId: "asc" }, { date: "asc" }],
    }),

    // Date ranges overlapping the week (startDate <= weekEnd AND endDate >= weekStart)
    db.availabilityDateRange.findMany({
      where: {
        userId: { in: userIds },
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
      orderBy: [{ userId: "asc" }, { startDate: "asc" }],
    }),

    // Approved leaves overlapping the week
    db.leave.findMany({
      where: {
        userId: { in: userIds },
        status: "APPROVED",
        startDate: { lte: weekEnd },
        endDate: { gte: weekStart },
      },
    }),
  ])

  // W34: Pre-build Maps for O(1) lookups instead of .filter() in inner loops
  // Key format: "userId:dayOfWeek" for availabilities, "userId:dateStr" for overrides, etc.
  // C24: Fix Map to store arrays per key — users can have multiple slots per day
  const availByKey = new Map<string, typeof allAvailabilities>()
  for (const a of allAvailabilities) {
    const key = `${a.userId}:${a.dayOfWeek}`
    const arr = availByKey.get(key) || []
    arr.push(a)
    availByKey.set(key, arr)
  }
  const overrideByKey = new Map(
    allOverrides.map(o => {
      const overrideDate = o.date instanceof Date ? o.date : new Date(o.date)
      return [`${o.userId}:${formatDateOnly(overrideDate)}`, o]
    })
  )
  const leavesByUser = new Map<string, typeof allLeaves>()
  for (const l of allLeaves) {
    const arr = leavesByUser.get(l.userId) || []
    arr.push(l)
    leavesByUser.set(l.userId, arr)
  }

  // ── Build per-user day map ──
  const usersSchedule = users.map((user) => {
    const days: Record<string, Record<string, unknown>> = {}

    for (let i = 0; i < 7; i++) {
      const dayDate = weekDays[i]
      const dayStr = weekDayStrings[i]
      const dow = dayOfWeeks[i]

      const dayStart = new Date(dayDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayDate)
      dayEnd.setHours(23, 59, 59, 999)

      // C24: O(1) lookup — returns array of all slots for this user/day
      const userAvailabilities = availByKey.get(`${user.id}:${dow}`) || []

      const userOverride = overrideByKey.get(`${user.id}:${dayStr}`) || null

      // Check leave using pre-built map
      const userLeaves = leavesByUser.get(user.id) || []
      const onLeave = userLeaves.some(l => {
        const lStart = l.startDate instanceof Date ? l.startDate : new Date(l.startDate)
        const lEnd = l.endDate instanceof Date ? l.endDate : new Date(l.endDate)
        return lStart <= dayEnd && lEnd >= dayStart
      })

      // Determine effective availability
      let effectiveAvailabilities: { id: string; startTime: string; endTime: string; isAvailable: boolean; hours: number }[] = userAvailabilities.map(a => ({
        id: a.id, startTime: a.startTime, endTime: a.endTime, isAvailable: true, hours: calculateHours(a.startTime, a.endTime),
      }))
      let isUnavailable = false
      if (userOverride) {
        if (!userOverride.isAvailable) {
          effectiveAvailabilities = []
          isUnavailable = true
        } else if (userOverride.startTime && userOverride.endTime) {
          effectiveAvailabilities = [
            {
              id: userOverride.id,
              startTime: userOverride.startTime,
              endTime: userOverride.endTime,
              isAvailable: true,
              hours: calculateHours(userOverride.startTime, userOverride.endTime),
            },
          ]
        }
      }

      // Calculate total hours
      const totalHours = effectiveAvailabilities.reduce(
        (sum, a) => sum + a.hours,
        0
      )

      days[dayStr] = {
        dayOfWeek: dow,
        dayName: DAY_NAMES[dow],
        availability: effectiveAvailabilities.map(a => ({
          id: a.id,
          startTime: a.startTime,
          endTime: a.endTime,
          isAvailable: true,
          hours: calculateHours(a.startTime, a.endTime),
        })),
        override: userOverride
          ? {
              id: userOverride.id,
              date: dayStr,
              startTime: userOverride.startTime,
              endTime: userOverride.endTime,
              isAvailable: userOverride.isAvailable,
              reason: userOverride.reason,
            }
          : null,
        isOnLeave: onLeave || isUnavailable,
        totalHours: Math.round(totalHours * 100) / 100,
      }
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        avatar: user.avatar,
      },
      days,
    }
  })

  const response = {
    weekStart: formatDateOnly(weekStart),
    weekEnd: formatDateOnly(weekEnd),
    // W44: Include totalUsers count and cap warning
    totalUsers,
    ...(hitCap ? { warning: "Result capped at 200 users. Some users may not be shown." } : {}),
    users: usersSchedule,
    // Date ranges overlapping this week (additive availability/leave spans)
    dateRanges: allDateRanges.map(dr => ({
      id: dr.id,
      userId: dr.userId,
      startDate: formatDateOnly(dr.startDate instanceof Date ? dr.startDate : new Date(dr.startDate)),
      endDate: formatDateOnly(dr.endDate instanceof Date ? dr.endDate : new Date(dr.endDate)),
      startTime: dr.startTime,
      endTime: dr.endTime,
      isAvailable: dr.isAvailable,
      reason: dr.reason,
    })),
  }

  return NextResponse.json(response)
}
