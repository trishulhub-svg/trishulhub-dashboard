/**
 * GET/PATCH /api/docx-sign/assignments
 * Staff: mine=1. Admin: all / filter.
 * PATCH: sign, resign, revoke, assign more.
 * Signed PDF stamps Authorized Person + acceptor, UK/local times, IP footer.
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
  countryDisplayName,
  formatDocxDateTime,
  getSignerCountry,
  isAdminDocxRole,
  isUkCountry,
  parsePdfDataUrl,
  parsePngDataUrl,
  resolveSignerTimeZone,
  stampSignatureOnPdf,
  toPdfDataUrl,
  UK_TIME_ZONE,
} from "@/lib/docx-sign"
import { z } from "zod"

const patchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["save_signature", "submit", "request_resign", "revoke"]),
  signatureData: z.string().optional(),
  resignNote: z.string().trim().max(500).optional().nullable(),
  signerTimeZone: z.string().trim().max(80).optional().nullable(),
})

const assignMoreSchema = z.object({
  documentId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1).max(100),
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
        where: {
          userId: session.user.id,
          document: { isActive: true },
        },
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
          authorizedPersonName: r.authorizedPersonName || r.assignedBy.name,
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
        authorizedPersonName: r.authorizedPersonName || r.assignedBy.name,
        signerIp: r.signerIp,
        signerCountry: r.signerCountry,
        signerTimeZone: r.signerTimeZone,
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

    // Admin: assign more users to an existing document
    if (body && typeof body === "object" && "documentId" in body && Array.isArray(body.userIds)) {
      if (!isAdminDocxRole(session.user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const parsedAssign = assignMoreSchema.safeParse(body)
      if (!parsedAssign.success) {
        return NextResponse.json(
          { error: parsedAssign.error.issues[0]?.message || "Invalid request" },
          { status: 400 }
        )
      }
      if (parsedAssign.data.userIds.includes(session.user.id)) {
        return NextResponse.json(
          {
            error:
              "You cannot assign a contract to yourself. Assign to another Admin, Super Admin, or staff member.",
          },
          { status: 400 }
        )
      }

      const assigner = await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, docxAuthorizedSignature: true },
      })
      if (!assigner?.docxAuthorizedSignature || !parsePngDataUrl(assigner.docxAuthorizedSignature)) {
        return NextResponse.json(
          {
            error:
              "Save your Authorized Person signature first (Manage → Authorized Person signature), then assign.",
          },
          { status: 400 }
        )
      }

      const doc = await db.docxDocument.findFirst({
        where: { id: parsedAssign.data.documentId, isActive: true },
        select: { id: true, title: true },
      })
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

      const uniqueUserIds = [...new Set(parsedAssign.data.userIds)].filter(
        (id) => id !== session.user.id
      )
      const users = await db.user.findMany({
        where: { id: { in: uniqueUserIds }, isActive: true },
        select: { id: true },
      })
      if (users.length !== uniqueUserIds.length) {
        return NextResponse.json(
          { error: "One or more selected users are invalid or inactive" },
          { status: 400 }
        )
      }
      const existing = await db.docxAssignment.findMany({
        where: { documentId: doc.id, userId: { in: uniqueUserIds } },
        select: { userId: true },
      })
      const already = new Set(existing.map((e) => e.userId))
      const toAdd = uniqueUserIds.filter((id) => !already.has(id))
      if (toAdd.length === 0) {
        return NextResponse.json({ error: "All selected users are already assigned" }, { status: 400 })
      }

      const authorizedPersonName = assigner.name || session.user.name || "Authorized Person"
      const authorizedSignatureData = assigner.docxAuthorizedSignature

      await db.docxAssignment.createMany({
        data: toAdd.map((userId) => ({
          documentId: doc.id,
          userId,
          assignedById: session.user.id,
          status: "PENDING",
          authorizedPersonName,
          authorizedSignatureData,
        })),
      })
      void notifyUsers({
        userIds: toAdd,
        title: "Document to sign",
        message: `"${doc.title}" was shared with you for e-signature by Authorized Person ${authorizedPersonName}.`,
        type: "TASK",
        link: "/dashboard/docx-sign/my",
        metadata: { kind: "docx_sign_assigned", documentId: doc.id },
      })
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "HR_PEOPLE",
        page: "docx-sign",
        action: "ASSIGN",
        entityType: "DocxDocument",
        entityId: doc.id,
        description: `Authorized Person ${authorizedPersonName} assigned "${doc.title}" to ${toAdd.length} more user${toAdd.length === 1 ? "" : "s"}`,
        newValue: JSON.stringify({
          userIds: toAdd,
          authorizedPersonName,
          authorizedPersonId: session.user.id,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        metadata: JSON.stringify({
          kind: "docx_sign_assign_more",
          authorizedPersonId: session.user.id,
          authorizedPersonName,
        }),
      })
      return NextResponse.json({ assigned: toAdd.length, skipped: uniqueUserIds.length - toAdd.length })
    }

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
        assignedBy: {
          select: { id: true, name: true, docxAuthorizedSignature: true },
        },
      },
    })
    if (!existing) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    const isAdmin = isAdminDocxRole(session.user.role)
    const isOwner = existing.userId === session.user.id
    const authorizedPersonLabel =
      existing.authorizedPersonName || existing.assignedBy.name || "Authorized Person"

    // Admin revoke — remove assignment so user can be reassigned later
    if (parsed.data.action === "revoke") {
      if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      await db.docxAssignment.delete({ where: { id: existing.id } })
      void notifyUsers({
        userIds: existing.userId,
        title: "Signing request revoked",
        message: `Your assignment for "${existing.document.title}" was revoked by an admin.`,
        type: "WARNING",
        link: "/dashboard/docx-sign/my",
        metadata: { kind: "docx_sign_revoked", documentId: existing.documentId },
      })
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "HR_PEOPLE",
        page: "docx-sign",
        action: "DELETE",
        entityType: "DocxAssignment",
        entityId: existing.id,
        description: `Revoked assignment of "${existing.document.title}" from ${existing.user.name} (Authorized Person was ${authorizedPersonLabel})`,
        oldValue: JSON.stringify({
          status: existing.status,
          userId: existing.userId,
          documentId: existing.documentId,
          signedAt: existing.signedAt,
          authorizedPersonName: authorizedPersonLabel,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ success: true, revoked: true })
    }

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
          signerIp: null,
          signerCountry: null,
          signerTimeZone: null,
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
        description: `Requested re-sign from ${existing.user.name} for "${existing.document.title}" (Authorized Person ${authorizedPersonLabel})`,
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

    // submit — dual signature stamp
    const sigRaw = parsed.data.signatureData || existing.signatureData || ""
    const sigBytes = parsePngDataUrl(sigRaw)
    if (!sigBytes) {
      return NextResponse.json({ error: "Draw and save a signature before submit" }, { status: 400 })
    }

    const authSigRaw =
      existing.authorizedSignatureData ||
      existing.assignedBy.docxAuthorizedSignature ||
      ""
    const authSigBytes = parsePngDataUrl(authSigRaw)
    if (!authSigBytes) {
      return NextResponse.json(
        {
          error:
            "Authorized Person signature is missing. Ask the admin who assigned this contract to save their signature and re-assign.",
        },
        { status: 400 }
      )
    }

    const pdf = parsePdfDataUrl(existing.document.fileData)
    if (!pdf) {
      return NextResponse.json({ error: "Source PDF is invalid" }, { status: 500 })
    }

    const signedAt = new Date()
    const signedAtIso = signedAt.toISOString()
    const signerIp = getIpAddress(req)
    const signerCountry = getSignerCountry(req)
    const signerTimeZone = resolveSignerTimeZone(
      signerCountry,
      parsed.data.signerTimeZone || null
    )

    // Persist snapshot if assignment was created before Authorized Person upgrade
    if (!existing.authorizedSignatureData || !existing.authorizedPersonName) {
      await db.docxAssignment.update({
        where: { id: existing.id },
        data: {
          authorizedPersonName: authorizedPersonLabel,
          authorizedSignatureData: authSigRaw,
        },
      })
    }

    const stamped = await stampSignatureOnPdf(pdf.bytes, sigBytes, authSigBytes, {
      acceptorName: session.user.name || existing.user.name || "Signer",
      authorizedPersonName: authorizedPersonLabel,
      signedAtIso,
      signerIp,
      signerCountry,
      signerTimeZone,
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
        signerIp,
        signerUserAgent: getUserAgent(req)?.slice(0, 500) || null,
        signerCountry: signerCountry || null,
        signerTimeZone,
        authorizedPersonName: authorizedPersonLabel,
        authorizedSignatureData: authSigRaw,
      },
    })

    const admins = await db.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      select: { id: true },
    })
    void notifyUsers({
      userIds: admins.map((a) => a.id),
      title: "Document signed",
      message: `${session.user.name || "User"} accepted "${existing.document.title}" (Authorized Person: ${authorizedPersonLabel}).`,
      type: "SUCCESS",
      link: "/dashboard/docx-sign/manage",
      metadata: { kind: "docx_sign_signed", assignmentId: existing.id },
    })

    const ukTime = formatDocxDateTime(signedAtIso, UK_TIME_ZONE)
    const localTime = isUkCountry(signerCountry)
      ? null
      : formatDocxDateTime(signedAtIso, signerTimeZone)

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "docx-sign",
      action: "STATUS_CHANGE",
      entityType: "DocxAssignment",
      entityId: existing.id,
      description: `${session.user.name || "User"} accepted "${existing.document.title}" with Authorized Person ${authorizedPersonLabel} (IP ${signerIp}${
        signerCountry ? `, ${countryDisplayName(signerCountry)}` : ""
      })`,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({
        status: "SIGNED",
        signedAt: signedAtIso,
        authorizedPersonId: existing.assignedById,
        authorizedPersonName: authorizedPersonLabel,
        acceptorUserId: existing.userId,
        acceptorName: session.user.name || existing.user.name,
        signerIp,
        signerCountry,
        signerTimeZone,
        ukDateTime: ukTime,
        localDateTime: localTime,
      }),
      ipAddress: signerIp,
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({
        kind: "docx_sign_accepted",
        documentId: existing.documentId,
        authorizedPersonId: existing.assignedById,
        authorizedPersonName: authorizedPersonLabel,
        signerCountry,
        signerTimeZone,
        dualSignatures: true,
      }),
    })

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      signedAt: updated.signedAt,
      signerCountry: updated.signerCountry,
      signerTimeZone: updated.signerTimeZone,
    })
  } catch (e) {
    console.error("[docx-sign/assignments PATCH]", e)
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 })
  }
}
