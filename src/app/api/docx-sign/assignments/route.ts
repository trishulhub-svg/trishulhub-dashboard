/**
 * GET/PATCH /api/docx-sign/assignments
 * Staff: mine=1. Admin: all / filter. PATCH: sign, resign request, save draft signature.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { notifyUsers } from "@/lib/notify"
import {
  isAdminDocxRole,
  parsePdfDataUrl,
  parsePngDataUrl,
  stampSignatureOnPdf,
  toPdfDataUrl,
} from "@/lib/docx-sign"
import { z } from "zod"

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["save_signature", "submit", "request_resign"]),
  signatureData: z.string().optional(),
  resignNote: z.string().trim().max(500).optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureCriticalSchema()
    const mine = new URL(req.url).searchParams.get("mine") === "1"
    const isAdmin = isAdminDocxRole(session.user.role)

    if (mine || !isAdmin) {
      const rows = await db.docxAssignment.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
              createdAt: true,
            },
          },
          assignedBy: { select: { id: true, name: true } },
        },
      })
      return NextResponse.json({
        assignments: rows.map((r) => ({
          id: r.id,
          status: r.status,
          signedAt: r.signedAt,
          resignNote: r.resignNote,
          hasSignature: Boolean(r.signatureData),
          hasSignedPdf: Boolean(r.signedFileData),
          createdAt: r.createdAt,
          document: r.document,
          assignedBy: r.assignedBy,
        })),
      })
    }

    const rows = await db.docxAssignment.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        document: { select: { id: true, title: true, fileName: true } },
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json({
      assignments: rows.map((r) => ({
        id: r.id,
        status: r.status,
        signedAt: r.signedAt,
        resignNote: r.resignNote,
        hasSignature: Boolean(r.signatureData),
        hasSignedPdf: Boolean(r.signedFileData),
        createdAt: r.createdAt,
        document: r.document,
        user: r.user,
        assignedBy: r.assignedBy,
      })),
    })
  } catch (e) {
    console.error("[docx-sign/assignments GET]", e)
    return NextResponse.json({ error: "Failed to load assignments" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(
      `docx-assign-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureCriticalSchema()
    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const existing = await db.docxAssignment.findUnique({
      where: { id: parsed.data.id },
      include: {
        document: true,
        user: { select: { id: true, name: true } },
      },
    })
    if (!existing) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    const isAdmin = isAdminDocxRole(session.user.role)
    const isOwner = existing.userId === session.user.id

    if (parsed.data.action === "request_resign") {
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      const updated = await db.docxAssignment.update({
        where: { id: existing.id },
        data: {
          status: "RESIGN_REQUESTED",
          resignNote: parsed.data.resignNote || null,
          signatureData: null,
          signedFileData: null,
          signedAt: null,
        },
      })
      void notifyUsers({
        userIds: existing.userId,
        title: "Re-sign requested",
        message: `Please sign "${existing.document.title}" again.${
          parsed.data.resignNote ? ` Note: ${parsed.data.resignNote}` : ""
        }`,
        type: "WARNING",
        link: `/dashboard/docx-sign/sign/${existing.id}`,
        metadata: { kind: "docx_sign_resign", assignmentId: existing.id },
      })
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "HR_PEOPLE",
        page: "docx-sign",
        action: "STATUS_CHANGE",
        entityType: "DocxAssignment",
        entityId: existing.id,
        description: `Requested re-sign from ${existing.user.name} for "${existing.document.title}"`,
        oldValue: JSON.stringify({ status: existing.status }),
        newValue: JSON.stringify({ status: "RESIGN_REQUESTED", resignNote: parsed.data.resignNote }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ id: updated.id, status: updated.status })
    }

    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (existing.status === "SIGNED") {
      return NextResponse.json({ error: "Already signed — wait for admin if re-sign is needed" }, { status: 400 })
    }

    if (parsed.data.action === "save_signature") {
      const sig = parsed.data.signatureData || ""
      if (!parsePngDataUrl(sig)) {
        return NextResponse.json({ error: "Invalid signature image" }, { status: 400 })
      }
      const updated = await db.docxAssignment.update({
        where: { id: existing.id },
        data: { signatureData: sig },
      })
      return NextResponse.json({ id: updated.id, saved: true })
    }

    // submit
    const sigRaw = parsed.data.signatureData || existing.signatureData || ""
    const sigBytes = parsePngDataUrl(sigRaw)
    if (!sigBytes) {
      return NextResponse.json({ error: "Draw and save a signature before submit" }, { status: 400 })
    }
    const pdf = parsePdfDataUrl(existing.document.fileData)
    if (!pdf) {
      return NextResponse.json({ error: "Source PDF is invalid" }, { status: 500 })
    }

    const signedAt = new Date()
    const stamped = await stampSignatureOnPdf(pdf.bytes, sigBytes, {
      signerName: session.user.name || existing.user.name || "Signer",
      signedAtIso: signedAt.toISOString(),
    })
    const signedFileData = toPdfDataUrl(stamped)

    const updated = await db.docxAssignment.update({
      where: { id: existing.id },
      data: {
        status: "SIGNED",
        signatureData: sigRaw,
        signedFileData,
        signedAt,
        resignNote: null,
        signerIp: getIpAddress(req),
        signerUserAgent: getUserAgent(req)?.slice(0, 500) || null,
      },
    })

    // Notify admins
    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true },
    })
    void notifyUsers({
      userIds: admins.map((a) => a.id),
      title: "Document signed",
      message: `${session.user.name || "User"} signed "${existing.document.title}".`,
      type: "SUCCESS",
      link: "/dashboard/docx-sign/manage",
      metadata: { kind: "docx_sign_signed", assignmentId: existing.id },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "docx-sign",
      action: "STATUS_CHANGE",
      entityType: "DocxAssignment",
      entityId: existing.id,
      description: `Signed "${existing.document.title}" (assigned by ${existing.assignedById})`,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({
        status: "SIGNED",
        signedAt: signedAt.toISOString(),
        assignedById: existing.assignedById,
        userId: existing.userId,
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({
        documentId: existing.documentId,
        assignedById: existing.assignedById,
      }),
    })

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      signedAt: updated.signedAt,
    })
  } catch (e) {
    console.error("[docx-sign/assignments PATCH]", e)
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 })
  }
}
