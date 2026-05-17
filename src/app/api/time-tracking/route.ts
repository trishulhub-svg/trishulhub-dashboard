import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { startTimeEntrySchema, validateRequest } from "@/lib/validations"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/time-tracking - List time entries with filters
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
    const where: Record<string, unknown> = {}

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
      where.status = validStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : "ACTIVE"
    }

    if (date) {
      const d = new Date(date)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      where.date = { gte: start, lt: end }
    } else if (startDate && endDate) {
      const s = new Date(startDate)
      const e = new Date(endDate)
      e.setDate(e.getDate() + 1)
      where.date = { gte: s, lt: e }
    } else if (startDate) {
      where.date = { gte: new Date(startDate) }
    } else if (endDate) {
      const e = new Date(endDate)
      e.setDate(e.getDate() + 1)
      where.date = { lt: e }
    }

    // Default: if no date filters, return entries for today + active entries
    if (!date && !startDate && !endDate && !status) {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfDay = new Date(startOfDay)
      endOfDay.setDate(endOfDay.getDate() + 1)

      // Get today's entries + any active entries
      const entries = await db.timeEntry.findMany({
        where: {
          ...where,
          OR: [
            { date: { gte: startOfDay, lt: endOfDay } },
            { status: "ACTIVE" },
          ],
        },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
      })

      // For admin users, fetch all currently active entries across all users
      let activeEntries: unknown[] = []
      if (isAdminUser) {
        const allActive = await db.timeEntry.findMany({
          where: { status: "ACTIVE" },
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { clockIn: "desc" },
        })
        activeEntries = JSON.parse(JSON.stringify(allActive))
      }

      return NextResponse.json({ entries: JSON.parse(JSON.stringify(entries)), activeEntries })
    }

    const entries = await db.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: "desc" },
      take: 200,
    })

    // For admin users on filtered queries, also fetch active entries
    let activeEntries: unknown[] = []
    if (isAdminUser) {
      const allActive = await db.timeEntry.findMany({
        where: { status: "ACTIVE" },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
      })
      activeEntries = JSON.parse(JSON.stringify(allActive))
    }

    return NextResponse.json({ entries: JSON.parse(JSON.stringify(entries)), activeEntries })
  } catch (error: unknown) {
    console.error("[time-tracking] GET error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/time-tracking - Start a new timer (clock in)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(`time-tracking-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userId = session.user.id
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const validation = validateRequest(startTimeEntrySchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { projectId, description } = validation.data

    // Check: user can only have ONE active timer at a time
    // NOTE: SQLite/Prisma doesn't support unique partial indexes easily,
    // so we use a double-check pattern. The first check catches the common case;
    // the second check right before create catches race conditions between
    // two concurrent POST requests.
    const activeEntry = await db.timeEntry.findFirst({
      where: { userId, status: "ACTIVE" },
    })

    if (activeEntry) {
      return NextResponse.json(
        { error: "You already have an active timer. Please stop it before starting a new one.", activeEntry },
        { status: 400 }
      )
    }

    // Validate project exists if provided
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId } })
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 })
      }
    }

    const now = new Date()

    // Second check: catch race condition between concurrent POST requests
    const raceCheck = await db.timeEntry.findFirst({
      where: { userId, status: "ACTIVE" },
    })
    if (raceCheck) {
      return NextResponse.json(
        { error: "You already have an active timer. Please stop it before starting a new one.", raceCheck },
        { status: 409 }
      )
    }

    const entry = await db.timeEntry.create({
      data: {
        userId,
        projectId: projectId || null,
        description: description || null,
        status: "ACTIVE",
        clockIn: now,
        date: now,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error: unknown) {
    console.error("[time-tracking] POST error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
