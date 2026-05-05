import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateMeetingSchema, validateRequest } from "@/lib/validations"

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
      const isAttendee = meeting.attendees.some((a: any) => a.userId === userId)
      if (!isOrganizer && !isAttendee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    return NextResponse.json(meeting)
  } catch (error: any) {
    console.error("[meetings/id] GET error:", error.message)
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

    const body = await req.json()
    const validation = validateRequest(updateMeetingSchema, { ...body, id })

    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { title, description, date, startTime, endTime, meetingType, meetingLink, projectId, status, attendeeIds, notes } = validation.data

    // Build update data
    const updateData: any = {}
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
      // Remove existing attendees not in the new list
      const existingAttendeeIds = existingMeeting.attendees.map((a) => a.userId)
      const toRemove = existingAttendeeIds.filter((aid) => !attendeeIds.includes(aid))
      const toAdd = attendeeIds.filter((aid: string) => !existingAttendeeIds.includes(aid))

      // Delete removed attendees
      if (toRemove.length > 0) {
        await db.meetingAttendee.deleteMany({
          where: { meetingId: id, userId: { in: toRemove } },
        })
      }

      // Add new attendees
      if (toAdd.length > 0) {
        await db.meetingAttendee.createMany({
          data: toAdd.map((aid: string) => ({
            meetingId: id,
            userId: aid,
            rsvpStatus: "PENDING",
          })),
        })
      }

      // Notify new attendees
      for (const newAttendeeId of toAdd) {
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
      }
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
  } catch (error: any) {
    console.error("[meetings/id] PATCH error:", error.message)
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

    const existingMeeting = await db.meeting.findUnique({
      where: { id },
      include: { attendees: { include: { user: true } } },
    })

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 })
    }

    // Only organizer or admin can cancel
    if (existingMeeting.organizerId !== userId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only the organizer or admin can cancel this meeting" }, { status: 403 })
    }

    const meeting = await db.meeting.update({
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

    // Notify attendees about cancellation
    for (const attendee of existingMeeting.attendees) {
      await db.notification.create({
        data: {
          userId: attendee.userId,
          title: "Meeting Cancelled",
          message: `"${existingMeeting.title}" on ${new Date(existingMeeting.date).toLocaleDateString()} has been cancelled`,
          type: "WARNING",
          link: "/dashboard/meetings",
          metadata: JSON.stringify({ meetingId: id }),
        },
      })
    }

    return NextResponse.json(meeting)
  } catch (error: any) {
    console.error("[meetings/id] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
