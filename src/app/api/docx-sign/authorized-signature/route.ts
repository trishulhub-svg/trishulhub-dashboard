/**
 * GET/PUT/DELETE /api/docx-sign/authorized-signature
 * Admin / Super Admin: save Authorized Person signature used on stamped contracts.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { isAdminDocxRole, parsePngDataUrl } from "@/lib/docx-sign"
import { z } from "zod"

const putSchema = z.object({
  signatureData: z.string().min(32),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { docxAuthorizedSignature: true, name: true },
    })
    return NextResponse.json({
      hasSignature: Boolean(user?.docxAuthorizedSignature),
      signatureData: user?.docxAuthorizedSignature || null,
      authorizedPersonName: user?.name || session.user.name || null,
    })
  } catch (e) {
    console.error("[docx-sign/authorized-signature GET]", e)
    return NextResponse.json({ error: "Failed to load signature" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(
      `docx-auth-sig-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureCriticalSchema()
    const body = await req.json().catch(() => null)
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }
    if (!parsePngDataUrl(parsed.data.signatureData)) {
      return NextResponse.json({ error: "Invalid signature image" }, { status: 400 })
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { docxAuthorizedSignature: parsed.data.signatureData },
    })

    // Backfill pending / re-sign assignments authorized by this admin
    const me = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    })
    await db.docxAssignment.updateMany({
      where: {
        assignedById: session.user.id,
        status: { in: ["PENDING", "RESIGN_REQUESTED"] },
      },
      data: {
        authorizedPersonName: me?.name || session.user.name || "Authorized Person",
        authorizedSignatureData: parsed.data.signatureData,
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "docx-sign",
      action: "CONFIG_CHANGE",
      entityType: "User",
      entityId: session.user.id,
      description: "Saved Authorized Person signature for Docx Sign contracts",
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, hasSignature: true })
  } catch (e) {
    console.error("[docx-sign/authorized-signature PUT]", e)
    return NextResponse.json({ error: "Failed to save signature" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()
    await db.user.update({
      where: { id: session.user.id },
      data: { docxAuthorizedSignature: null },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "docx-sign",
      action: "CONFIG_CHANGE",
      entityType: "User",
      entityId: session.user.id,
      description: "Cleared Authorized Person signature for Docx Sign",
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, hasSignature: false })
  } catch (e) {
    console.error("[docx-sign/authorized-signature DELETE]", e)
    return NextResponse.json({ error: "Failed to clear signature" }, { status: 500 })
  }
}
