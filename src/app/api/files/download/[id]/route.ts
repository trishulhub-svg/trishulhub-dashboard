import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import * as drive from "@/lib/google-drive"

// ── GET: Generate download URL and redirect ──
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const { id } = await params
    const userId = session.user.id

    // Rate limit
    const rl = rateLimit(`file-download-${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const file = await db.fileMetadata.findUnique({ where: { id } })
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (file.trashed) {
      return NextResponse.json({ error: "File has been deleted" }, { status: 410 })
    }

    // Get download URL from Drive
    const downloadUrl = await drive.getDownloadUrl(file.driveFileId)

    if (!downloadUrl) {
      return NextResponse.json({ error: "Download not available for this file type" }, { status: 400 })
    }

    // Redirect to download URL
    return NextResponse.redirect(downloadUrl)
  } catch (error: unknown) {
    console.error("[files/download] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 })
  }
}
