import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// POST /api/meetings/[id]/rsvp - RSVP to a meeting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const { id } = await params

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const { rsvpStatus } = body

    if (!["ACCEPTED", "DECLINED"].includes(rsvpStatus)) {
      return NextResponse.json({ error: "RSVP status must be ACCEPTED or DECLINED" }, { status: 400 })
    }

    // Check if the user is an attendee
    const attendee = await db.meetingAttendee.findUnique({
      where: {
        meetingId_userId: {
          meetingId: id,
          userId,
        },
      },
    })

    if (!attendee) {
      return NextResponse.json({ error: "You are not an attendee of this meeting" }, { status: 403 })
    }

    const updated = await db.meetingAttendee.update({
      where: { id: attendee.id },
      data: { rsvpStatus },
      include: {
        user: { select: { id: true, name: true, email: true } },
        meeting: { select: { id: true, title: true, organizerId: true } },
      },
    })

    // Notify organizer about RSVP (fire-and-forget)
    try {
      await db.notification.create({
        data: {
          userId: updated.meeting.organizerId,
          title: `Meeting RSVP: ${rsvpStatus === "ACCEPTED" ? "Accepted" : "Declined"}`,
          message: `${session.user.name || "An attendee"} has ${rsvpStatus.toLowerCase()} the meeting "${updated.meeting.title}"`,
          type: "INFO",
          link: "/dashboard/meetings",
          metadata: JSON.stringify({ meetingId: id }),
        },
      })
    } catch (notifyErr: any) {
      console.error("[meetings/rsvp] notification error (non-blocking):", notifyErr.message)
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[meetings/id/rsvp] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
