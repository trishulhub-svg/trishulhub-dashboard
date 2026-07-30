/**
 * GET /api/bootstrap/docx-sign
 * Manage page: document summaries + pending mine + auth-sig meta.
 * Assignees and full team list load on demand (expand / upload dialog).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { isAdminDocxRole } from "@/lib/docx-sign"
import { listMyAssignmentsLean } from "@/lib/docx-sign-lean"

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

    const [documents, myPending, statusCounts, sigMeta] = await Promise.all([
      db.docxDocument.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          fileName: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
          _count: { select: { assignments: true } },
        },
      }),
      listMyAssignmentsLean(userId, {
        take: 20,
        statuses: ["PENDING", "RESIGN_REQUESTED"],
      }),
      db.$queryRawUnsafe<
        Array<{ documentId: string; status: string; cnt: number | bigint }>
      >(
        `SELECT a."documentId" as documentId, a."status" as status, COUNT(*) as cnt
         FROM "DocxAssignment" a
         INNER JOIN "DocxDocument" d ON d."id" = a."documentId"
         WHERE d."isActive" = 1
         GROUP BY a."documentId", a."status"`
      ),
      hasAuthorizedSignature(userId),
    ])

    const countsByDoc = new Map<
      string,
      { pending: number; signed: number; resign: number; total: number }
    >()
    for (const row of statusCounts) {
      const cur = countsByDoc.get(row.documentId) || {
        pending: 0,
        signed: 0,
        resign: 0,
        total: 0,
      }
      const n = Number(row.cnt) || 0
      cur.total += n
      if (row.status === "PENDING") cur.pending += n
      else if (row.status === "SIGNED") cur.signed += n
      else if (row.status === "RESIGN_REQUESTED") cur.resign += n
      countsByDoc.set(row.documentId, cur)
    }

    return NextResponse.json({
      documents: documents.map((d) => {
        const c = countsByDoc.get(d.id) || {
          pending: 0,
          signed: 0,
          resign: 0,
          total: d._count.assignments,
        }
        return {
          id: d.id,
          title: d.title,
          fileName: d.fileName,
          createdAt: d.createdAt,
          uploadedBy: d.uploadedBy,
          assignmentCount: c.total || d._count.assignments,
          statusCounts: {
            pending: c.pending,
            signed: c.signed,
            resign: c.resign,
          },
          // Lazy-loaded on expand — keep empty for fast first paint
          assignments: [] as unknown[],
        }
      }),
      myAssignments: myPending,
      // Team picker loads when upload/assign dialog opens
      assignableUsers: [] as unknown[],
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
