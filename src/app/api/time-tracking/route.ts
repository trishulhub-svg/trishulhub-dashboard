import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { startTimeEntrySchema, adminCreateTimeEntrySchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

type TimeEntryWithUser = {
  id: string; userId: string; status: string; clockIn: Date; clockOut: Date | null;
  totalHours: number | null; projectId: string | null;
  project?: { id: string; name: string } | null;
  user?: { id: string; name: string; email: string } | null;
  [key: string]: unknown;
}

/** Shared helper to fetch all active time entries for admin dashboards */
async function fetchAdminActiveEntries(): Promise<TimeEntryWithUser[]> {
  const allActive = await db.timeEntry.findMany({
    where: { status: "ACTIVE" },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { clockIn: "desc" },
    take: 200,
  })
  return allActive as TimeEntryWithUser[]
}

/**
 * GET /api/time-tracking
 * Lists time entries with optional filters. Supports pagination.
 * @param req - NextRequest with query params: userId, projectId, date, startDate, endDate, status, page, limit
 * @returns JSON with entries[], activeEntries[], page, limit, totalPages
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`time-tracking-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userId = session.user.id
    const userRole = session.user.role
    const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const { searchParams } = new URL(req.url)
    const filterUserId = searchParams.get("userId")
    const projectId = searchParams.get("projectId")
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const status = searchParams.get("status")

    // Non-admins can only see their own entries
    const where: Prisma.TimeEntryWhereInput = {}

    if (!isAdminUser) {
      where.userId = userId
    } else if (filterUserId) {
      where.userId = filterUserId
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (status) {
      const validStatuses = ["ACTIVE", "COMPLETED", "PAUSED"]
      if (!validStatuses.includes(status.toUpperCase())) {
        return NextResponse.json({ error: "Invalid status. Must be ACTIVE, COMPLETED, or PAUSED" }, { status: 400 })
      }
      where.status = status.toUpperCase()
    }

    if (date) {
      const d = new Date(date)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      where.date = { gte: start, lt: end }
    } else if (startDate && endDate) {
      // [FIX: Parse date-only strings as local midnight, not UTC midnight.
      //  new Date("2024-01-15") parses as UTC midnight per ES2015, but the
      //  default query path (line 104-109) computes local midnight. This mismatch
      //  caused entries near day boundaries to be missed in filtered queries.]
      const [sy, sm, sd] = startDate.split("-").map(Number)
      const [ey, em, ed] = endDate.split("-").map(Number)
      const s = new Date(sy, sm - 1, sd)
      const e = new Date(ey, em - 1, ed)
      e.setDate(e.getDate() + 1)
      where.date = { gte: s, lt: e }
    } else if (startDate) {
      const [y, m, d] = startDate.split("-").map(Number)
      where.date = { gte: new Date(y, m - 1, d) }
    } else if (endDate) {
      const [y, m, d] = endDate.split("-").map(Number)
      const e = new Date(y, m - 1, d)
      e.setDate(e.getDate() + 1)
      where.date = { lt: e }
    }

    // Default: if no date filters, return entries for current week + active entries
    if (!date && !startDate && !endDate && !status) {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const startOfWeek = new Date(today)
      startOfWeek.setDate(today.getDate() + mondayOffset)
      startOfWeek.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 6)
      endOfWeek.setHours(23, 59, 59, 999)

      // Get this week's entries + any active entries
      const entries = await db.timeEntry.findMany({
        where: {
          ...where,
          OR: [
            { date: { gte: startOfWeek, lte: endOfWeek } },
            { status: "ACTIVE" },
          ],
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
        take: isAdminUser ? 200 : 50,
      })

      // For admin users, fetch all currently active entries across all users
      let activeEntries: TimeEntryWithUser[] = []
      if (isAdminUser) {
        activeEntries = await fetchAdminActiveEntries()
      }

      return NextResponse.json({ entries, activeEntries, page: 1, limit: 100, totalPages: 1 })
    }

    // Pagination support
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200)
    const offset = (page - 1) * limit

    const [entries, total] = await Promise.all([
      db.timeEntry.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
        skip: offset,
        take: limit,
      }),
      db.timeEntry.count({ where }),
    ])
    const totalPages = Math.ceil(total / limit)

    // For admin users on filtered queries, also fetch active entries
    let activeEntries: TimeEntryWithUser[] = []
    if (isAdminUser) {
      activeEntries = await fetchAdminActiveEntries()
    }

    return NextResponse.json({ entries, activeEntries, page, limit, totalPages })
  } catch (error: unknown) {
    console.error("[time-tracking] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

/**
 * POST /api/time-tracking
 * Starts a new timer (clock in) for the authenticated user, or creates a manual time entry for admins.
 * Normal users: validates projectId, checks for existing active timer atomically.
 * Admin users: can create entries with userId, clockIn, clockOut for any user.
 * @param req - NextRequest with JSON body containing optional projectId, description (normal) or userId, clockIn, clockOut, projectId, description (admin)
 * @returns Created time entry (201), 400 on validation error, 404 if project not found, 409 if active timer exists
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`time-tracking-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userId = session.user.id
    const userRole = session.user.role
    const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // ── Admin manual entry creation path ──
    if (isAdminUser && body.userId && typeof body.userId === "string" && body.clockIn) {
      const validation = validateRequest(adminCreateTimeEntrySchema, body)
      if (!validation.success) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const { userId: targetUserId, projectId, description, clockIn, clockOut } = validation.data

      // Validate the target user exists
      const targetUser = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, role: true },
      })
      if (!targetUser) {
        return NextResponse.json({ error: "Target user not found" }, { status: 404 })
      }

      // Validate project exists if provided
      if (projectId) {
        const project = await db.project.findUnique({ where: { id: projectId } })
        if (!project) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 })
        }
      }

      const clockInDate = new Date(clockIn)
      const entryStatus = clockOut ? "COMPLETED" : "ACTIVE"
      const totalHours = clockOut
        ? Math.round((new Date(clockOut).getTime() - clockInDate.getTime()) / (1000 * 60 * 60) * 100) / 100
        : null

      const entry = await db.timeEntry.create({
        data: {
          userId: targetUserId,
          projectId: projectId || null,
          description: description || null,
          status: entryStatus,
          clockIn: clockInDate,
          clockOut: clockOut ? new Date(clockOut) : null,
          totalHours,
          date: clockInDate,
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
          project: { select: { id: true, name: true } },
        },
      })

      return NextResponse.json(entry, { status: 201 })
    }

    // ── Normal timer start path ──
    const validation = validateRequest(startTimeEntrySchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { projectId, description } = validation.data

    const now = new Date()

    // Atomic check+create to prevent race condition on concurrent timer starts
    let entry
    try {
      entry = await db.$transaction(async (tx) => {
        // Single atomic check inside transaction
        const activeEntry = await tx.timeEntry.findFirst({
          where: { userId, status: "ACTIVE" },
        })
        if (activeEntry) {
          throw new Error("ACTIVE_TIMER_EXISTS")
        }
        // Project validation inside transaction too
        if (projectId) {
          const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } })
          if (!project) throw new Error("PROJECT_NOT_FOUND")
        }
        return tx.timeEntry.create({
          data: {
            userId,
            projectId: projectId || null,
            description: description || null,
            status: "ACTIVE",
            clockIn: now,
            date: now,
          },
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
            project: { select: { id: true, name: true } },
          },
        })
      })
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === "ACTIVE_TIMER_EXISTS") {
        return NextResponse.json(
          { error: "You already have an active timer. Please stop it before starting a new one." },
          { status: 409 }
        )
      }
      if (txError instanceof Error && txError.message === "PROJECT_NOT_FOUND") {
        return NextResponse.json({ error: "Project not found" }, { status: 404 })
      }
      throw txError
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (error: unknown) {
    console.error("[time-tracking] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
