import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import * as drive from "@/lib/google-drive"

// POST: Empty trash - permanently delete all trashed files
export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    if (!isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden. Only admins can empty trash." }, { status: 403 })
    }

    const rl = rateLimit(`empty-trash-${userId}`, 1, 60 * 1000)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // Get all trashed files from DB
    const trashedFiles = await db.fileMetadata.findMany({
      where: { trashed: true },
      select: { id: true, driveFileId: true },
    })

    let deleted = 0
    for (const file of trashedFiles) {
      try {
        await drive.deleteFile(file.driveFileId, true)
      } catch (err) {
        console.error(`[empty-trash] Failed to delete ${file.driveFileId}:`, err)
      }
      try {
        await db.fileMetadata.delete({ where: { id: file.id } })
        deleted++
      } catch (err) {
        console.error(`[empty-trash] Failed to delete DB record ${file.id}:`, err)
      }
    }

    // Also empty Google Drive trash
    try {
      await drive.emptyTrash()
    } catch (err) {
      console.error("[empty-trash] Failed to empty Drive trash:", err)
    }

    return NextResponse.json({ success: true, deleted })
  } catch (error: unknown) {
    console.error("[empty-trash] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to empty trash" }, { status: 500 })
  }
}
