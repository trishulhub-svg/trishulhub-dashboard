import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rsvpRateLimit } from "@/lib/rate-limit"

// POST /api/meetings/[id]/rsvp - RSVP to a meeting
// I23: Note — Manual validation is used here. Future: migrate to Zod schema for consistency
// with other endpoints that use validateRequest + Zod.
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

    // Rate limit RSVP requests
    const rl = rsvpRateLimit(`rsvp-${userId}`)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // Check that meeting exists and is not CANCELLED
    const meeting = await db.meeting.findUnique({ where: { id } })
    if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 })
    if (meeting.status === "CANCELLED") return NextResponse.json({ error: "Meeting is cancelled" }, { status: 400 })

    let body
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const { rsvpStatus } = body

    if (!["ACCEPTED", "DECLINED"].includes(rsvpStatus)) {
      return NextResponse.json({ error: "RSVP status must be ACCEPTED or DECLINED" }, { status: 400 })
    }

    // C26: Check attendee + update in transaction to prevent TOCTOU race condition
    let updated
    try {
      updated = await db.$transaction(async (tx) => {
        const attendee = await tx.meetingAttendee.findUnique({
          where: {
            meetingId_userId: {
              meetingId: id,
              userId,
            },
          },
        })
        if (!attendee) throw new Error("NOT_ATTENDEE")
        return tx.meetingAttendee.update({
          where: { id: attendee.id },
          data: { rsvpStatus },
          include: {
            user: { select: { id: true, name: true, email: true } },
            meeting: { select: { id: true, title: true, organizerId: true } },
          },
        })
      })
    } catch (txErr: unknown) {
      const msg = txErr instanceof Error ? txErr.message : ""
      if (msg === "NOT_ATTENDEE") {
        return NextResponse.json({ error: "You are not an attendee of this meeting" }, { status: 403 })
      }
      throw txErr
    }

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
    } catch (notifyErr: unknown) {
      console.error("[meetings/rsvp] notification error (non-blocking):", notifyErr)
    }

    return NextResponse.json(updated)
  } catch (error: unknown) {
    console.error("[meetings/id/rsvp] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
