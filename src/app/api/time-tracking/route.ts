import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { startTimeEntrySchema, validateRequest } from "@/lib/validations"

// GET /api/time-tracking - List time entries with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
    const where: any = {}

    if (!isAdminUser) {
      where.userId = userId
    } else if (filterUserId) {
      where.userId = filterUserId
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (status) {
      where.status = status.toUpperCase()
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
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
      })

      return NextResponse.json(entries)
    }

    const entries = await db.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: "desc" },
    })

    return NextResponse.json(entries)
  } catch (error: any) {
    console.error("[time-tracking] GET error:", error.message)
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

    const userId = session.user.id
    const body = await req.json()

    const validation = validateRequest(startTimeEntrySchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { projectId, description } = validation.data

    // Check: user can only have ONE active timer at a time
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
  } catch (error: any) {
    console.error("[time-tracking] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
