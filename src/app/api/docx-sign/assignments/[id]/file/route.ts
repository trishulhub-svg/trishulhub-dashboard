/**
 * GET /api/docx-sign/assignments/[id]/file?kind=source|signed
 * Returns PDF bytes for viewing / download (authz: owner or admin).
 * Loads only the PDF column needed for the requested kind.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { isAdminDocxRole, parsePdfDataUrl } from "@/lib/docx-sign"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureCriticalSchema()
    const { id } = await params
    const kind = new URL(req.url).searchParams.get("kind") || "source"
    const download = new URL(req.url).searchParams.get("download") === "1"

    // Branch selects so we never load both source + signed PDF blobs
    const row =
      kind === "signed"
        ? await db.docxAssignment.findUnique({
            where: { id },
            select: {
              id: true,
              userId: true,
              signedFileData: true,
              document: { select: { title: true, fileName: true } },
            },
          })
        : await db.docxAssignment.findUnique({
            where: { id },
            select: {
              id: true,
              userId: true,
              document: { select: { title: true, fileName: true, fileData: true } },
            },
          })

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const isAdmin = isAdminDocxRole(session.user.role)
    if (!isAdmin && row.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const raw =
      kind === "signed"
        ? (row as { signedFileData?: string | null }).signedFileData
        : (row.document as { fileData?: string }).fileData

    if (!raw) {
      return NextResponse.json(
        { error: kind === "signed" ? "Signed PDF not available yet" : "Source PDF missing" },
        { status: 404 }
      )
    }

    const pdf = parsePdfDataUrl(raw)
    if (!pdf) return NextResponse.json({ error: "Invalid PDF data" }, { status: 500 })

    if (download) {
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "HR_PEOPLE",
        page: "docx-sign",
        action: "DOWNLOAD",
        entityType: "DocxAssignment",
        entityId: row.id,
        description: `Downloaded ${kind === "signed" ? "signed" : "source"} PDF for "${row.document.title}" (Docx Sign)`,
        metadata: JSON.stringify({
          kind: kind === "signed" ? "docx_sign_download_signed" : "docx_sign_download_source",
          documentTitle: row.document.title,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
    }

    const fileName =
      kind === "signed"
        ? `signed-${row.document.fileName || "contract.pdf"}`
        : row.document.fileName || "contract.pdf"

    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("[docx-sign/file GET]", e)
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 })
  }
}
