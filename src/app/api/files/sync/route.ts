import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import * as drive from "@/lib/google-drive"

// ── POST: Force sync from Google Drive → local DB ──
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    if (!isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden. Only admins can trigger sync." }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`file-sync-${userId}`, 2, 60 * 1000) // 2 per minute
    if (!rl.success) {
      return NextResponse.json({ error: "Sync rate limit: max 2 per minute" }, { status: 429 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const folderId = (body.folderId as string) || null

    if (!drive.isConfigured()) {
      return NextResponse.json({ error: "Google Drive not configured. Check environment variables." }, { status: 500 })
    }

    // Recursive sync helper
    async function syncRecursive(parentDriveId: string | null, parentId: string | null, depth: number = 0): Promise<number> {
      if (depth > 5) return 0 // Max depth to prevent infinite loops

      let totalSynced = 0

      try {
        const result = await drive.listFiles(parentDriveId || undefined, undefined, 200)

        for (const f of result.files) {
          const driveParentId = f.parents?.[0] || parentId

          // Upsert FileMetadata
          await db.fileMetadata.upsert({
            where: { driveFileId: f.id },
            update: {
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              parentId: driveParentId,
              trashed: f.trashed,
              thumbnailLink: f.thumbnailLink || null,
              webViewLink: f.webViewLink || null,
              description: f.description || null,
            },
            create: {
              driveFileId: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size,
              parentId: driveParentId,
              trashed: f.trashed,
              thumbnailLink: f.thumbnailLink || null,
              webViewLink: f.webViewLink || null,
              description: f.description || null,
              createdBy: userId,
            },
          })
          totalSynced++

          // Recurse into folders
          if (drive.isFolder(f.mimeType)) {
            const childCount = await syncRecursive(f.id, f.id, depth + 1)
            totalSynced += childCount
          }
        }

        // F-014: Full pagination loop — continue until no next page token
        let pageToken = result.nextPageToken || null
        while (pageToken) {
          const nextResult = await drive.listFiles(parentDriveId || undefined, pageToken, 200)
          for (const f of nextResult.files) {
            const driveParentId = f.parents?.[0] || parentId
            await db.fileMetadata.upsert({
              where: { driveFileId: f.id },
              update: {
                name: f.name,
                mimeType: f.mimeType,
                size: f.size,
                parentId: driveParentId,
                trashed: f.trashed,
                thumbnailLink: f.thumbnailLink || null,
                webViewLink: f.webViewLink || null,
                description: f.description || null,
              },
              create: {
                driveFileId: f.id,
                name: f.name,
                mimeType: f.mimeType,
                size: f.size,
                parentId: driveParentId,
                trashed: f.trashed,
                thumbnailLink: f.thumbnailLink || null,
                webViewLink: f.webViewLink || null,
                description: f.description || null,
                createdBy: userId,
              },
            })
            totalSynced++
          }
          pageToken = nextResult.nextPageToken || null
        }
      } catch (err: unknown) {
        console.error(`[files/sync] Error syncing folder ${parentDriveId}:`, err instanceof Error ? err.message : String(err))
      }

      return totalSynced
    }

    const rootId = folderId || drive.getRootId()
    const syncedCount = await syncRecursive(rootId, folderId)

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      message: `Synced ${syncedCount} files from Google Drive`,
    })
  } catch (error: unknown) {
    console.error("[files/sync] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to sync files" }, { status: 500 })
  }
}
