import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import * as drive from "@/lib/google-drive"

// ── Helpers ──

/** Strip HTML tags and enforce max length */
function sanitize(str: string, max: number = 500): string {
  return str.replace(/<[^>]*>/g, "").slice(0, max)
}

/** Sync Drive files for a folder into local FileMetadata */
async function syncDriveFolder(folderId: string | null, userId: string): Promise<number> {
  try {
    const result = await drive.listFiles(folderId || undefined)
    let synced = 0

    for (const f of result.files) {
      const parentId = f.parents?.[0] || null

      // Upsert FileMetadata
      await db.fileMetadata.upsert({
        where: { driveFileId: f.id },
        update: {
          name: sanitize(f.name, 500),
          mimeType: f.mimeType,
          size: f.size,
          parentId,
          trashed: f.trashed,
          thumbnailLink: f.thumbnailLink || null,
          webViewLink: f.webViewLink || null,
          description: f.description || null,
        },
        create: {
          driveFileId: f.id,
          name: sanitize(f.name, 500),
          mimeType: f.mimeType,
          size: f.size,
          parentId,
          trashed: f.trashed,
          thumbnailLink: f.thumbnailLink || null,
          webViewLink: f.webViewLink || null,
          description: f.description || null,
          createdBy: userId,
        },
      })
      synced++
    }

    return synced
  } catch (err: any) {
    console.error("[files] Drive sync error:", err?.message)
    return 0
  }
}

// ── GET: List files ──
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    // Rate limit
    const rl = rateLimit(`files-get-${userId}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const parentId = searchParams.get("parentId") || null
    const search = searchParams.get("search") || ""
    const starred = searchParams.get("starred") === "true"
    const trashed = searchParams.get("trashed") === "true"
    const pageToken = searchParams.get("pageToken") || undefined
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 100)

    // Sync from Drive first (non-blocking, best-effort)
    syncDriveFolder(parentId, userId).catch(() => {})

    // Build where clause
    const where: Record<string, unknown> = {}

    if (trashed) {
      where.trashed = true
    } else {
      where.trashed = false
    }

    if (starred) {
      where.starred = true
    }

    if (parentId) {
      where.parentId = parentId
    } else if (!trashed) {
      // Root level: parentId is null
      where.parentId = null
    }

    // RBAC: SUPER_ADMIN/ADMIN see all, others see own + shared
    if (!isAdmin(role)) {
      where.OR = [
        { createdBy: userId },
        { permissions: { some: { userId } } },
      ]
    }

    if (search) {
      where.name = { contains: search }
    }

    // Fetch files with pagination
    const files = await db.fileMetadata.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: pageSize,
      skip: pageToken ? 1 : 0,
      ...(pageToken ? { cursor: { id: pageToken } } : {}),
    })

    // Get storage info
    const storageInfo = await drive.getStorageUsage()

    return NextResponse.json(JSON.parse(JSON.stringify({
      files,
      storage: storageInfo,
    })))
  } catch (error: unknown) {
    console.error("[files] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 })
  }
}

// ── POST: Upload file or create folder ──
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

    const userId = session.user.id
    const role = session.user.role

    // Rate limit
    const rl = rateLimit(`files-write-${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const contentType = req.headers.get("content-type") || ""

    // Parse form data
    const formData = await req.formData()
    const action = sanitize(formData.get("action") as string || "upload", 20)
    const parentId = (formData.get("parentId") as string) || null
    const description = sanitize(formData.get("description") as string || "", 2000)

    if (action === "folder") {
      // Create folder
      const folderName = sanitize(formData.get("folderName") as string || "", 255)
      if (!folderName) {
        return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
      }

      const driveFolder = await drive.createFolder(parentId || drive.getRootId()!, folderName)

      // Save to DB
      const metadata = await db.fileMetadata.create({
        data: {
          driveFileId: driveFolder.id,
          name: driveFolder.name,
          mimeType: driveFolder.mimeType,
          size: 0,
          parentId: driveFolder.parents?.[0] || null,
          description: description || null,
          webViewLink: driveFolder.webViewLink || null,
          createdBy: userId,
        },
      })

      return NextResponse.json(JSON.parse(JSON.stringify(metadata)))
    }

    // Upload file
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Size check (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 50MB limit" }, { status: 400 })
    }

    const fileName = sanitize(file.name, 500)
    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || "application/octet-stream"

    // Upload to Google Drive
    const driveFile = await drive.uploadFile(parentId || drive.getRootId()!, fileName, mimeType, buffer, description)

    // Save metadata to DB
    const metadata = await db.fileMetadata.create({
      data: {
        driveFileId: driveFile.id,
        name: driveFile.name,
        mimeType: driveFile.mimeType,
        size: driveFile.size,
        parentId: driveFile.parents?.[0] || null,
        description: driveFile.description || null,
        thumbnailLink: driveFile.thumbnailLink || null,
        webViewLink: driveFile.webViewLink || null,
        createdBy: userId,
      },
    })

    return NextResponse.json(JSON.parse(JSON.stringify(metadata)))
  } catch (error: unknown) {
    console.error("[files] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}
