/**
 * GET /api/bootstrap/docx-sign
 * Manage page: documents + my assignments + assignable users + auth-sig meta.
 * One session check; lean fields (no PDF/signature blobs).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { isAdminDocxRole } from "@/lib/docx-sign"

async function hasAuthorizedSignature(userId: string): Promise<{
  hasSignature: boolean
  name: string | null
}> {
  const rows = await db.$queryRaw<Array<{ name: string | null; hasSig: number | bigint }>>`
    SELECT name as name,
      CASE
        WHEN "docxAuthorizedSignature" IS NOT NULL AND length("docxAuthorizedSignature") > 10 THEN 1
        ELSE 0
      END as hasSig
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `
  const row = rows[0]
  return {
    hasSignature: Number(row?.hasSig || 0) === 1,
    name: row?.name || null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-docx-sign")
    if ("error" in auth) return auth.error

    if (!isAdminDocxRole(auth.session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()
    const userId = auth.session.user.id

    const [documents, myAssignments, assignableUsers, sigMeta] = await Promise.all([
      db.docxDocument.findMany({
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
      }),
      db.docxAssignment.findMany({
        where: {
          userId,
          document: { isActive: true },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          signedAt: true,
          resignNote: true,
          createdAt: true,
          authorizedPersonName: true,
          document: {
            select: { id: true, title: true, fileName: true },
          },
          assignedBy: { select: { id: true, name: true } },
        },
      }),
      db.user.findMany({
        where: { role: { not: "CLIENT" }, isActive: true },
        select: { id: true, name: true, email: true, role: true, isActive: true },
        orderBy: { name: "asc" },
        take: 100,
      }),
      hasAuthorizedSignature(userId),
    ])

    return NextResponse.json({
      documents,
      myAssignments: myAssignments.map((r) => ({
        id: r.id,
        status: r.status,
        signedAt: r.signedAt,
        resignNote: r.resignNote,
        hasSignedPdf: r.status === "SIGNED",
        authorizedPersonName: r.authorizedPersonName || r.assignedBy.name,
        createdAt: r.createdAt,
        document: r.document,
        assignedBy: r.assignedBy,
      })),
      assignableUsers,
      authorizedSignature: {
        hasSignature: sigMeta.hasSignature,
        authorizedPersonName: sigMeta.name || auth.session.user.name || null,
      },
    })
  } catch (e) {
    console.error("[bootstrap/docx-sign GET]", e)
    return NextResponse.json({ error: "Failed to load Docx Sign" }, { status: 500 })
  }
}
