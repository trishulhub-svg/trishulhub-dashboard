import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createMeetingSchema, validateRequest } from "@/lib/validations"
import { meetingRateLimit } from "@/lib/rate-limit"
import { sendEmailWithFailover, isValidEmail, isDisposableEmail } from "@/lib/email"

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

    // W55: Role-based access — for non-admins, fetch meetings where user is organizer OR attendee
    // Using separate queries to avoid fragile OR + relation filter pattern with SQLite
    const includeOpts = {
      organizer: { select: { id: true, name: true, email: true, avatar: true } },
      project: { select: { id: true, name: true } },
      attendees: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    }

    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      // Remove top-level organizerId/projectId since we'll use them per-query
      delete where.organizerId
      delete where.projectId

      const projectFilter = projectId ? { projectId } : {}
      const skip = (page - 1) * pageSize

      // Fetch meetings organized by user
      const [organizedMeetings, organizedCount] = await Promise.all([
        db.meeting.findMany({
          where: { ...where, organizerId: userId, ...projectFilter },
          include: includeOpts,
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        db.meeting.count({ where: { ...where, organizerId: userId, ...projectFilter } }),
      ])

      // Fetch meetings where user is an attendee (via relation filter)
      const [attendedMeetings, attendedCount] = await Promise.all([
        db.meeting.findMany({
          where: { ...where, attendees: { some: { userId } }, ...projectFilter },
          include: includeOpts,
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        db.meeting.count({ where: { ...where, attendees: { some: { userId } }, ...projectFilter } }),
      ])

      // Merge and deduplicate by meeting ID
      const seen = new Set<string>()
      const mergedMeetings: typeof organizedMeetings = []
      for (const m of organizedMeetings) {
        if (!seen.has(m.id)) { seen.add(m.id); mergedMeetings.push(m) }
      }
      for (const m of attendedMeetings) {
        if (!seen.has(m.id)) { seen.add(m.id); mergedMeetings.push(m) }
      }

      // Sort combined results
      mergedMeetings.sort((a, b) => {
        const dc = new Date(a.date).getTime() - new Date(b.date).getTime()
        return dc !== 0 ? dc : a.startTime.localeCompare(b.startTime)
      })

      const total = organizedCount + attendedCount

      return NextResponse.json({
        data: mergedMeetings.slice(skip, skip + pageSize),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      })
    }

    const [meetings, total] = await Promise.all([
      db.meeting.findMany({
        where,
        include: includeOpts,
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

    // Send email invitations to all attendees (internal + external)
    const externalEmails = validation.data.externalAttendeeEmails || []
    let internalEmails: string[] = []
    if (attendeeIds && attendeeIds.length > 0) {
      const internalUsers = await db.user.findMany({
        where: { id: { in: attendeeIds } },
        select: { name: true, email: true },
      })
      internalEmails = internalUsers.map(u => u.email)
    }
    const allEmails = [...internalEmails, ...externalEmails]
    const seenEmails = new Set<string>()
    const uniqueEmails = allEmails.filter(e => {
      if (seenEmails.has(e)) return false
      seenEmails.add(e)
      return true
    })

    const meetingDateStr = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const meetingHtml = `<div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#5ACB38,#1889CC);padding:20px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:24px;">TrishulHub</h1>
      </div>
      <div style="background:white;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <h2 style="margin:0 0 16px;color:#1a1a1a;">Meeting Invitation: ${title}</h2>
        <p style="color:#4b5563;margin:8px 0;"><strong>Date:</strong> ${meetingDateStr}</p>
        <p style="color:#4b5563;margin:8px 0;"><strong>Time:</strong> ${startTime}${endTime ? ` - ${endTime}` : ''}</p>
        <p style="color:#4b5563;margin:8px 0;"><strong>Type:</strong> ${meetingType || 'Virtual'}</p>
        ${description ? `<p style="color:#4b5563;margin:8px 0;"><strong>Description:</strong> ${description}</p>` : ''}
        ${meetingLink ? `<p style="margin:16px 0;text-align:center;"><a href="${meetingLink}" style="background:#1889CC;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Join Meeting</a></p>` : ''}
        ${notes ? `<p style="color:#6b7280;margin:16px 0;padding:12px;background:#f9fafb;border-radius:8px;font-size:14px;"><strong>Notes:</strong> ${notes}</p>` : ''}
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin:20px 0 0;">This meeting was scheduled via TrishulHub</p>
    </div>`

    await Promise.allSettled(
      uniqueEmails.map(email => {
        if (!isValidEmail(email) || isDisposableEmail(email)) return Promise.resolve()
        return sendEmailWithFailover({
          to: email,
          subject: `Meeting: ${title} — TrishulHub`,
          html: meetingHtml,
          type: "MEETING_INVITATION",
          triggeredBy: userId,
        }).catch(err => console.warn("[meetings] Failed to send email:", err))
      })
    )

    return NextResponse.json(meeting, { status: 201 })
  } catch (error: unknown) {
    console.error("[meetings] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
