import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateMeetingSchema, validateRequest } from "@/lib/validations"
import { rateLimit } from "@/lib/rate-limit"

// GET /api/meetings/[id] - Get single meeting detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const meeting = await db.meeting.findUnique({
      where: { id },
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

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 })
    }

    // Non-admins can only see meetings they organize or are invited to
    const userId = session.user.id
    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      const isOrganizer = meeting.organizerId === userId
      const isAttendee = meeting.attendees.some((a: { userId: string; rsvpStatus: string }) => a.userId === userId)
      if (!isOrganizer && !isAttendee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    return NextResponse.json(meeting)
  } catch (error: unknown) {
    console.error("[meetings/id] GET error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/meetings/[id] - Update meeting
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    // C10: Rate limit
    const rl = rateLimit(`meetings-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const existingMeeting = await db.meeting.findUnique({
      where: { id },
      include: { attendees: true },
    })

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 })
    }

    // Only organizer or admin can update
    if (existingMeeting.organizerId !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only the organizer or admin can update this meeting" }, { status: 403 })
    }

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const validation = validateRequest(updateMeetingSchema, { ...body, id })

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { title, description, date, startTime, endTime, meetingType, meetingLink, projectId, status, attendeeIds, notes } = validation.data

    // Build update data
    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description || null
    if (date !== undefined) updateData.date = new Date(date)
    if (startTime !== undefined) updateData.startTime = startTime
    if (endTime !== undefined) updateData.endTime = endTime || null
    if (meetingType !== undefined) updateData.meetingType = meetingType
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink || null
    if (projectId !== undefined) updateData.projectId = projectId || null
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes || null

    // Handle attendee updates
    if (attendeeIds !== undefined) {
      // C20: Validate attendeeIds exist as users before deleteMany + createMany
      if (attendeeIds.length > 0) {
        const existingUsers = await db.user.findMany({
          where: { id: { in: attendeeIds } },
          select: { id: true },
        })
        const validIds = new Set(existingUsers.map(u => u.id))
        const invalidIds = attendeeIds.filter(aid => !validIds.has(aid))
        if (invalidIds.length > 0) {
          return NextResponse.json({ error: "Some attendee user IDs do not exist" }, { status: 400 })
        }
      }

      // Wrap attendee delete + create in transaction for atomicity
      await db.$transaction(async (tx) => {
        await tx.meetingAttendee.deleteMany({ where: { meetingId: id } })
        if (attendeeIds.length > 0) {
          await tx.meetingAttendee.createMany({
            data: attendeeIds.map((userId) => ({
              meetingId: id,
              userId,
              rsvpStatus: "PENDING",
            })),
          })
        }
      })

      // Determine which attendees are new (for notifications)
      const existingAttendeeIds = existingMeeting.attendees.map((a) => a.userId)
      const toAdd = attendeeIds.filter((aid: string) => !existingAttendeeIds.includes(aid))

      // W39: Notify new attendees in parallel using Promise.allSettled
      await Promise.allSettled(
        toAdd.map(async (newAttendeeId: string) => {
          try {
            await db.notification.create({
              data: {
                userId: newAttendeeId,
                title: "Meeting Invitation",
                message: `You've been added to a meeting: "${title || existingMeeting.title}" on ${(date ? new Date(date) : existingMeeting.date).toLocaleDateString()}`,
                type: "TASK",
                link: "/dashboard/meetings",
                metadata: JSON.stringify({ meetingId: id }),
              },
            })
          } catch (err) {
            console.warn("[meetings/id] Failed to create notification:", err)
          }
        })
      )
    }

    const meeting = await db.meeting.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json(meeting)
  } catch (error: unknown) {
    console.error("[meetings/id] PATCH error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/meetings/[id] - Cancel meeting (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const { id } = await params

    // C10: Rate limit
    const rl = rateLimit(`meetings-${session.user.id}`, 30, 60000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // C22: Wrap findUnique + permission + cancelled check + update in transaction to prevent race conditions
    let meeting
    try {
      meeting = await db.$transaction(async (tx) => {
        const existing = await tx.meeting.findUnique({
          where: { id },
          include: { attendees: { include: { user: { select: { id: true, name: true, email: true } } } } },
        })
        if (!existing) throw new Error("NOT_FOUND")

        // Only organizer or admin to cancel
        if (existing.organizerId !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
          throw new Error("FORBIDDEN")
        }

        // Prevent cancelling already-cancelled meetings
        if (existing.status === "CANCELLED") {
          throw new Error("ALREADY_CANCELLED")
        }

        return tx.meeting.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: {
            organizer: { select: { id: true, name: true, email: true } },
            project: { select: { id: true, name: true } },
            attendees: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        })
      })
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : ""
      if (msg === "NOT_FOUND") return NextResponse.json({ error: "Meeting not found" }, { status: 404 })
      if (msg === "FORBIDDEN") return NextResponse.json({ error: "Only the organizer or admin can cancel this meeting" }, { status: 403 })
      if (msg === "ALREADY_CANCELLED") return NextResponse.json({ error: "Meeting already cancelled" }, { status: 400 })
      throw txErr
    }

    // W39: Notify attendees about cancellation in parallel using Promise.allSettled
    await Promise.allSettled(
      (meeting.attendees || []).map(async (attendee: { userId: string; user: { id: string; name: string; email: string } | null }) => {
        try {
          await db.notification.create({
            data: {
              userId: attendee.userId,
              title: "Meeting Cancelled",
              message: `"${meeting.title}" on ${new Date(meeting.date).toLocaleDateString()} has been cancelled`,
              type: "WARNING",
              link: "/dashboard/meetings",
              metadata: JSON.stringify({ meetingId: id }),
            },
          })
        } catch (err) {
          console.warn("[meetings/id] Failed to create cancellation notification:", err)
        }
      })
    )

    return NextResponse.json(meeting)
  } catch (error: unknown) {
    console.error("[meetings/id] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
