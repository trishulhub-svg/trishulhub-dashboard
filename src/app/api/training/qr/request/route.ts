import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { notifyRoles } from "@/lib/notify"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

/**
 * POST /api/training/qr/request
 * Any staff user can request a fresh training QR.
 * Creates at most one PENDING request per user, then notifies Admin + SuperAdmin.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const userName = session.user.name || session.user.email || "A team member"

    let note: string | undefined
    try {
      const body = await req.json()
      if (typeof body?.note === "string" && body.note.trim()) {
        note = body.note.trim().slice(0, 300)
      }
    } catch {
      // empty body is fine
    }

    const existing = await db.trainingQrRequest.findFirst({
      where: { userId, status: "PENDING" },
      select: { id: true, createdAt: true },
    })
    if (existing) {
      return NextResponse.json({
        ok: true,
        alreadyPending: true,
        request: existing,
        message: "You already requested a new QR. Super Admin has been notified.",
      })
    }

    const request = await db.trainingQrRequest.create({
      data: { userId, status: "PENDING", note },
      select: { id: true, createdAt: true },
    })

    const notifiedAdmins = await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
      title: "Training QR requested",
      message: `${userName} needs a new Percipio login QR. Upload a fresh code in Learning.`,
      type: "WARNING",
      link: "/dashboard/training/qr",
      metadata: {
        kind: "training_qr_request",
        requestId: request.id,
        requesterId: userId,
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "LEARNING",
      page: "my-training",
      action: "CREATE",
      entityType: "TrainingQrRequest",
      entityId: request.id,
      description: `${userName} requested a new training QR`,
      newValue: JSON.stringify({ note: note || null }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      ok: true,
      alreadyPending: false,
      request,
      notifiedAdmins,
      message: "Request sent. Super Admin will upload a new QR shortly.",
    })
  } catch (err) {
    console.error("[training/qr/request POST]", err)
    return NextResponse.json({ error: "Failed to request training QR" }, { status: 500 })
  }
}
