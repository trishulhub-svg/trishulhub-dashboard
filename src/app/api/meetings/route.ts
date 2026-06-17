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

    const { title, description, date, startTime, endTime, meetingType, meetingLink, projectId, attendeeIds, notes, externalAttendeeEmails } = validation.data

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

    // Send branded email invitations to all attendees (internal + external)
    const internalUsers = attendeeIds && attendeeIds.length > 0
      ? await db.user.findMany({ where: { id: { in: attendeeIds } }, select: { email: true } })
      : []
    const allEmails = [...new Set([
      ...internalUsers.map(u => u.email).filter(Boolean),
      ...(externalAttendeeEmails || []),
    ])].filter(e => isValidEmail(e) && !isDisposableEmail(e))

    const meetingDateStr = new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f5f5f5;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#1889CC,#5ACB38);padding:24px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px">TrishulHub</h1>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:18px">Meeting Invitation</h2>
    <p style="margin:0 0 20px;color:#666;font-size:14px">You have been invited to a meeting.</p>
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px">
      <h3 style="margin:0 0 12px;color:#1a1a1a;font-size:16px">${title}</h3>
      <p style="margin:6px 0;color:#444;font-size:14px"><strong>Date:</strong> ${meetingDateStr}</p>
      <p style="margin:6px 0;color:#444;font-size:14px"><strong>Time:</strong> ${startTime}${endTime ? ` - ${endTime}` : ""}</p>
      <p style="margin:6px 0;color:#444;font-size:14px"><strong>Type:</strong> ${meetingType || "Virtual"}</p>
      ${description ? `<p style="margin:12px 0 0;color:#555;font-size:13px;line-height:1.5">${description}</p>` : ""}
    </div>
    ${meetingLink ? `<div style="text-align:center"><a href="${meetingLink}" style="display:inline-block;background:#1889CC;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Join Meeting</a></div>` : ""}
    ${notes ? `<p style="margin:20px 0 0;color:#888;font-size:13px;padding:12px;background:#f9fafb;border-radius:8px"><strong>Notes:</strong> ${notes}</p>` : ""}
  </div>
  <div style="padding:16px 32px;border-top:1px solid #eee;text-align:center">
    <p style="margin:0;color:#aaa;font-size:11px">This meeting was scheduled via TrishulHub</p>
  </div>
</div></body></html>`

    await Promise.allSettled(
      allEmails.map(email =>
        sendEmailWithFailover({
          to: email,
          subject: `Meeting: ${title} - TrishulHub`,
          html: emailHtml,
          text: `Meeting Invitation: ${title}\nDate: ${meetingDateStr}\nTime: ${startTime}${endTime ? " - " + endTime : ""}\n${meetingLink ? "Join: " + meetingLink : ""}`,
          type: "MEETING_INVITATION",
          triggeredBy: userId,
        }).catch(err => console.warn("[meetings] Email failed:", err))
      )
    )

    return NextResponse.json(meeting, { status: 201 })
  } catch (error: unknown) {
    console.error("[meetings] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
