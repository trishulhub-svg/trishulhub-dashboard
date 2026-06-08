import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createMeetingSchema, validateRequest } from "@/lib/validations"
import { meetingRateLimit } from "@/lib/rate-limit"

// GET /api/meetings - List meetings with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    // Rate limit GET requests
    const rl = meetingRateLimit(`meetings-get-${userId}`)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const status = searchParams.get("status")
    const organizerId = searchParams.get("organizerId")
    const projectId = searchParams.get("projectId")
    const page = parseInt(searchParams.get("page") || "1", 10)
    const pageSize = 50

    // Build where clause
    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (organizerId) {
      where.organizerId = organizerId
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (date) {
      const targetDate = new Date(date)
      if (isNaN(targetDate.getTime())) {
        return NextResponse.json({ error: "Invalid date parameter" }, { status: 400 })
      }
      const nextDay = new Date(targetDate)
      nextDay.setDate(nextDay.getDate() + 1)
      where.date = { gte: targetDate, lt: nextDay }
    } else if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NextResponse.json({ error: "Invalid date range parameters" }, { status: 400 })
      }
      where.date = { gte: start, lte: end }
    } else if (!status || status === "SCHEDULED") {
      // Default: upcoming meetings
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      where.date = { gte: today }
    }

    // W55: Role-based access — for non-admins, incorporate projectId/organizerId into the OR clause
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      const projectFilter = projectId ? { projectId } : {}
      where.OR = [
        { organizerId: userId, ...projectFilter },
        { attendees: { some: { userId } }, ...projectFilter },
      ]
      // For non-admins, only apply organizerId if it matches the user or is already in the OR
      // Remove top-level organizerId/projectId for non-admins since they're now in the OR clause
      delete where.organizerId
      delete where.projectId
    }

    const [meetings, total] = await Promise.all([
      db.meeting.findMany({
        where,
        include: {
          organizer: { select: { id: true, name: true, email: true, avatar: true } },
          project: { select: { id: true, name: true } },
          attendees: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      db.meeting.count({ where }),
    ])

    return NextResponse.json({
      data: meetings,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error: unknown) {
    console.error("[meetings] GET error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/meetings - Create a meeting
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    // Only SUPER_ADMIN and ADMIN can create meetings
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can schedule meetings" }, { status: 403 })
    }

    // C10: Rate limit
    const rl = meetingRateLimit(`meetings-${session.user.id}`)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const validation = validateRequest(createMeetingSchema, body)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { title, description, date, startTime, endTime, meetingType, meetingLink, projectId, attendeeIds, notes } = validation.data

    // Validate attendee IDs exist
    if (attendeeIds && attendeeIds.length > 0) {
      const existingUsers = await db.user.findMany({
        where: { id: { in: attendeeIds } },
        select: { id: true }
      })
      const validIds = existingUsers.map(u => u.id)
      const invalidIds = attendeeIds.filter(id => !validIds.includes(id))
      if (invalidIds.length > 0) {
        return NextResponse.json({ error: `Users not found: ${invalidIds.join(", ")}` }, { status: 400 })
      }
    }

    // Create the meeting with attendees
    const meeting = await db.meeting.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        startTime,
        endTime: endTime || null,
        organizerId: userId,
        meetingType: meetingType || "VIRTUAL",
        meetingLink: meetingLink || null,
        projectId: projectId || null,
        notes: notes || null,
        status: "SCHEDULED",
        attendees: {
          create: (attendeeIds || []).map((attendeeId: string) => ({
            userId: attendeeId,
            rsvpStatus: "PENDING",
          })),
        },
      },
      include: {
        organizer: { select: { id: true, name: true, email: true, avatar: true } },
        project: { select: { id: true, name: true } },
        attendees: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    })

    // W39: Notify attendees in parallel using Promise.allSettled
    await Promise.allSettled(
      (attendeeIds || []).map(async (attendeeId: string) => {
        try {
          await db.notification.create({
            data: {
              userId: attendeeId,
              title: "New Meeting Invitation",
              message: `${session.user.name || "Admin"} scheduled a meeting: "${title}" on ${new Date(date).toLocaleDateString()} at ${startTime}`,
              type: "TASK",
              link: "/dashboard/meetings",
              metadata: JSON.stringify({ meetingId: meeting.id }),
            },
          })
        } catch (err) {
          console.warn("[meetings] Failed to create notification:", err)
        }
      })
    )

    return NextResponse.json(meeting, { status: 201 })
  } catch (error: unknown) {
    console.error("[meetings] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
