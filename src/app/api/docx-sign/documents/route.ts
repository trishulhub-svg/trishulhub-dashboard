/**
 * GET/POST /api/docx-sign/documents
 * Admin/SA: list documents + upload PDF and assign to users (separate assignments).
 * Assigner becomes Authorized Person; cannot assign to self; can assign to other admins.
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
  MAX_PDF_DATA_URL_CHARS,
  parsePdfDataUrl,
  parsePngDataUrl,
} from "@/lib/docx-sign"
import { z } from "zod"

const uploadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  fileData: z.string().min(32).max(MAX_PDF_DATA_URL_CHARS),
  userIds: z.array(z.string().min(1)).min(1).max(100),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()
    const docs = await db.docxDocument.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        fileName: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
        assignments: {
          select: {
            id: true,
            userId: true,
            status: true,
            signedAt: true,
            resignNote: true,
            createdAt: true,
            authorizedPersonName: true,
            signerIp: true,
            signerCountry: true,
            user: { select: { id: true, name: true, email: true } },
            assignedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    return NextResponse.json({ documents: docs })
  } catch (e) {
    console.error("[docx-sign/documents GET]", e)
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(
      `docx-upload-${session.user.id}`,
      RATE_LIMITS.crmWrite.limit,
      RATE_LIMITS.crmWrite.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    await ensureCriticalSchema()
    const body = await req.json().catch(() => null)
    const parsed = uploadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid upload" },
        { status: 400 }
      )
    }

    const pdf = parsePdfDataUrl(parsed.data.fileData)
    if (!pdf) {
      return NextResponse.json(
        { error: "Invalid PDF (must be application/pdf base64, max ~4MB)" },
        { status: 400 }
      )
    }

    const uniqueUserIds = [...new Set(parsed.data.userIds)]
    if (uniqueUserIds.includes(session.user.id)) {
      return NextResponse.json(
        { error: "You cannot assign a contract to yourself. Assign to another Admin, Super Admin, or staff member." },
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
            "Save your Authorized Person signature first (Manage → Authorized Person signature), then upload.",
        },
        { status: 400 }
      )
    }

    const users = await db.user.findMany({
      where: { id: { in: uniqueUserIds }, isActive: true },
      select: { id: true, name: true },
    })
    if (users.length !== uniqueUserIds.length) {
      return NextResponse.json(
        { error: "One or more selected users are invalid or inactive" },
        { status: 400 }
      )
    }

    const authorizedPersonName = assigner.name || session.user.name || "Authorized Person"
    const authorizedSignatureData = assigner.docxAuthorizedSignature

    const doc = await db.docxDocument.create({
      data: {
        title: parsed.data.title,
        fileName: parsed.data.fileName,
        mimeType: "application/pdf",
        fileData: pdf.dataUrl,
        uploadedById: session.user.id,
      },
    })

    await db.docxAssignment.createMany({
      data: uniqueUserIds.map((userId) => ({
        documentId: doc.id,
        userId,
        assignedById: session.user.id,
        status: "PENDING",
        authorizedPersonName,
        authorizedSignatureData,
      })),
    })

    void notifyUsers({
      userIds: uniqueUserIds,
      title: "Document to sign",
      message: `"${parsed.data.title}" was shared with you for e-signature by Authorized Person ${authorizedPersonName}.`,
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
      action: "UPLOAD",
      entityType: "DocxDocument",
      entityId: doc.id,
      description: `Authorized Person ${authorizedPersonName} uploaded "${parsed.data.title}" and assigned to ${uniqueUserIds.length} user${uniqueUserIds.length === 1 ? "" : "s"}`,
      newValue: JSON.stringify({
        title: parsed.data.title,
        fileName: parsed.data.fileName,
        userIds: uniqueUserIds,
        authorizedPersonName,
        authorizedPersonId: session.user.id,
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({
        kind: "docx_sign_upload_assign",
        authorizedPersonId: session.user.id,
        authorizedPersonName,
      }),
    })

    return NextResponse.json({ id: doc.id, assigned: uniqueUserIds.length }, { status: 201 })
  } catch (e) {
    console.error("[docx-sign/documents POST]", e)
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 })
  }
}

/** Soft-delete document (isActive=false) and remove all assignments so it can be replaced. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdminDocxRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    await ensureCriticalSchema()
    const existing = await db.docxDocument.findFirst({
      where: { id, isActive: true },
      select: { id: true, title: true },
    })
    if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    const assignees = await db.docxAssignment.findMany({
      where: { documentId: id },
      select: { userId: true },
    })
    await db.docxAssignment.deleteMany({ where: { documentId: id } })
    await db.docxDocument.update({
      where: { id },
      data: { isActive: false },
    })

    const userIds = [...new Set(assignees.map((a) => a.userId))]
    if (userIds.length > 0) {
      void notifyUsers({
        userIds,
        title: "Document removed",
        message: `"${existing.title}" was removed by an admin.`,
        type: "WARNING",
        link: "/dashboard/docx-sign/my",
        metadata: { kind: "docx_sign_deleted", documentId: id },
      })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "HR_PEOPLE",
      page: "docx-sign",
      action: "DELETE",
      entityType: "DocxDocument",
      entityId: id,
      description: `Authorized Person ${session.user.name || "admin"} deleted document "${existing.title}" (${userIds.length} assignment${userIds.length === 1 ? "" : "s"} cleared)`,
      oldValue: JSON.stringify({ title: existing.title, assigneeCount: userIds.length }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("[docx-sign/documents DELETE]", e)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
