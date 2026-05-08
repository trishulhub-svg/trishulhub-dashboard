import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createMeetingSchema, validateRequest } from "@/lib/validations"

// GET /api/meetings - List meetings with filters
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role

    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const status = searchParams.get("status")
    const organizerId = searchParams.get("organizerId")
    const projectId = searchParams.get("projectId")

    // Build where clause
    const where: any = {}

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
      const nextDay = new Date(targetDate)
      nextDay.setDate(nextDay.getDate() + 1)
      where.date = { gte: targetDate, lt: nextDay }
    } else if (startDate && endDate) {
      where.date = { gte: new Date(startDate), lte: new Date(endDate) }
    } else if (!status || status === "SCHEDULED") {
      // Default: upcoming meetings
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      where.date = { gte: today }
    }

    // Role-based access: developers see their own + where they're attendee
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      where.OR = [
        { organizerId: userId },
        { attendees: { some: { userId } } },
      ]
    }

    const meetings = await db.meeting.findMany({
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
    })

    return NextResponse.json(meetings)
  } catch (error: any) {
    console.error("[meetings] GET error:", error.message)
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

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const validation = validateRequest(createMeetingSchema, body)

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { title, description, date, startTime, endTime, meetingType, meetingLink, projectId, attendeeIds, notes } = validation.data

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

    // Notify attendees (fire-and-forget)
    try {
      for (const attendeeId of attendeeIds || []) {
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
      }
    } catch (notifyErr: any) {
      console.error("[meetings] POST notification error (non-blocking):", notifyErr.message)
    }

    return NextResponse.json(meeting, { status: 201 })
  } catch (error: any) {
    console.error("[meetings] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
