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

/**
 * Ensure a parent folder exists in the local DB before creating children.
 * If the parent driveFileId doesn't have a FileMetadata record, we create
 * a stub entry so the FK constraint is satisfied.
 */
async function ensureParentInDb(driveParentId: string | null, userId: string): Promise<void> {
  if (!driveParentId) return

  try {
    const existing = await db.fileMetadata.findUnique({
      where: { driveFileId: driveParentId },
      select: { id: true },
    })

    if (!existing) {
      // Fetch metadata from Drive for the parent
      const parentInfo = await drive.getFile(driveParentId)
      if (parentInfo) {
        await db.fileMetadata.create({
          data: {
            driveFileId: parentInfo.id,
            name: sanitize(parentInfo.name, 500),
            mimeType: parentInfo.mimeType,
            size: parentInfo.size,
            parentId: parentInfo.parents?.[0] || null,
            trashed: false,
            starred: false,
            thumbnailLink: parentInfo.thumbnailLink || null,
            webViewLink: parentInfo.webViewLink || null,
            description: parentInfo.description || null,
            createdBy: userId,
          },
        })

        // Recursively ensure the parent's parent exists too
        if (parentInfo.parents?.[0]) {
          await ensureParentInDb(parentInfo.parents[0], userId)
        }
      }
    }
  } catch (err: any) {
    // Non-critical: if we can't ensure parent, the create might still work
    console.warn("[files] Could not ensure parent in DB:", err?.message)
  }
}

/** Sync Drive files for a folder into local FileMetadata */
async function syncDriveFolder(folderId: string | null, userId: string): Promise<number> {
  try {
    const result = await drive.listFiles(folderId || undefined)
    let synced = 0

    for (const f of result.files) {
      const parentId = f.parents?.[0] || null

      // Ensure parent exists in DB before upserting child
      if (parentId) {
        await ensureParentInDb(parentId, userId)
      }

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

// ── GET: List files (also returns Drive config status) ──
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
    const shared = searchParams.get("shared") === "true"
    const trashed = searchParams.get("trashed") === "true"
    const pageToken = searchParams.get("pageToken") || undefined
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50"), 100)

    // Check Drive configuration
    const credentialStatus = drive.getCredentialStatus()

    // Sync from Drive (blocking on first load when DB is likely empty)
    try {
      await syncDriveFolder(parentId, userId)
    } catch (err: any) {
      console.error("[files] Drive sync failed:", err?.message)
    }

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

    // Shared with me filter: files shared with user (not created by them)
    if (shared) {
      where.createdBy = { not: userId }
      where.permissions = { some: { userId } }
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

    // Get storage info (best-effort)
    let storageInfo = { usedBytes: 0, totalBytes: 0 }
    try {
      storageInfo = await drive.getStorageUsage()
    } catch (err) {
      // Non-critical
    }

    return NextResponse.json(JSON.parse(JSON.stringify({
      files,
      storage: storageInfo,
      driveConfigured: credentialStatus.configured,
      credentialStatus,
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

    // Check Drive configuration first
    const credentialStatus = drive.getCredentialStatus()
    if (!credentialStatus.configured) {
      const missing: string[] = []
      if (!credentialStatus.clientEmail) missing.push("GOOGLE_DRIVE_CLIENT_EMAIL")
      if (!credentialStatus.privateKey) missing.push("GOOGLE_DRIVE_PRIVATE_KEY")
      if (!credentialStatus.privateKeyValid && credentialStatus.privateKey) missing.push("GOOGLE_DRIVE_PRIVATE_KEY (invalid format)")

      return NextResponse.json({
        error: `Google Drive is not properly configured. Missing or invalid: ${missing.join(", ")}. ` +
               (credentialStatus.hint || "") +
               " Please check your Vercel environment variables.",
        credentialStatus,
      }, { status: 503 })
    }

    // Parse form data
    const formData = await req.formData()
    const action = sanitize(formData.get("action") as string || "upload", 20)
    const parentId = (formData.get("parentId") as string) || null
    const description = sanitize(formData.get("description") as string || "", 2000)

    // Resolve the actual Drive parent folder ID
    const effectiveParentId = parentId || drive.getRootId()

    if (action === "folder") {
      // Create folder
      const folderName = sanitize(formData.get("folderName") as string || "", 255)
      if (!folderName) {
        return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
      }

      if (!effectiveParentId) {
        return NextResponse.json(
          { error: "Root folder ID is not set. Contact your administrator." },
          { status: 500 }
        )
      }

      // Ensure parent exists in local DB to satisfy FK constraint
      await ensureParentInDb(effectiveParentId, userId)

      let driveFolder
      try {
        driveFolder = await drive.createFolder(effectiveParentId, folderName)
      } catch (driveErr: any) {
        const msg = driveErr?.message || String(driveErr)
        console.error("[files] Drive createFolder error:", msg)

        // Detect common errors and provide helpful messages
        if (msg.includes("DECODER") || msg.includes("unsupported")) {
          return NextResponse.json({
            error: `Google Drive authentication failed. Your GOOGLE_DRIVE_PRIVATE_KEY appears to be in an invalid format. ` +
                   `Error: ${msg}. ` +
                   `Please re-copy the private key from your Google Cloud service account JSON file. ` +
                   `Make sure to include the full key including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- headers. ` +
                   `Do NOT wrap the value in quotes in Vercel env vars.`,
            credentialStatus,
          }, { status: 503 })
        }

        return NextResponse.json({
          error: `Failed to create folder in Google Drive: ${msg}`,
          credentialStatus,
        }, { status: 500 })
      }

      const dbParentId = driveFolder.parents?.[0] || null

      // Save to DB
      try {
        const metadata = await db.fileMetadata.create({
          data: {
            driveFileId: driveFolder.id,
            name: driveFolder.name,
            mimeType: driveFolder.mimeType,
            size: 0,
            parentId: dbParentId,
            description: description || null,
            webViewLink: driveFolder.webViewLink || null,
            createdBy: userId,
          },
        })

        return NextResponse.json(JSON.parse(JSON.stringify(metadata)))
      } catch (dbErr: any) {
        console.error("[files] DB save error after Drive create:", dbErr?.message)
        // Folder was created in Drive but DB save failed — still return Drive data
        return NextResponse.json(JSON.parse(JSON.stringify({
          id: driveFolder.id,
          driveFileId: driveFolder.id,
          name: driveFolder.name,
          mimeType: driveFolder.mimeType,
          size: 0,
          parentId: dbParentId,
          trashed: false,
          starred: false,
          webViewLink: driveFolder.webViewLink || null,
          createdBy: userId,
          _syncWarning: "Created in Google Drive but failed to save in local database",
        })))
      }
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

    if (!effectiveParentId) {
      return NextResponse.json(
        { error: "Root folder ID is not set. Contact your administrator." },
        { status: 500 }
      )
    }

    const fileName = sanitize(file.name, 500)
    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || "application/octet-stream"

    // Ensure parent exists in local DB to satisfy FK constraint
    await ensureParentInDb(effectiveParentId, userId)

    // Upload to Google Drive
    let driveFile
    try {
      driveFile = await drive.uploadFile(effectiveParentId, fileName, mimeType, buffer, description)
    } catch (driveErr: any) {
      const msg = driveErr?.message || String(driveErr)
      console.error("[files] Drive upload error:", msg)

      if (msg.includes("DECODER") || msg.includes("unsupported")) {
        return NextResponse.json({
          error: `Google Drive authentication failed. Your GOOGLE_DRIVE_PRIVATE_KEY format is invalid. Error: ${msg}`,
          credentialStatus,
        }, { status: 503 })
      }

      return NextResponse.json({
        error: `Failed to upload to Google Drive: ${msg}`,
        credentialStatus,
      }, { status: 500 })
    }

    const dbParentId = driveFile.parents?.[0] || null

    // Save metadata to DB
    try {
      const metadata = await db.fileMetadata.create({
        data: {
          driveFileId: driveFile.id,
          name: driveFile.name,
          mimeType: driveFile.mimeType,
          size: driveFile.size,
          parentId: dbParentId,
          description: driveFile.description || null,
          thumbnailLink: driveFile.thumbnailLink || null,
          webViewLink: driveFile.webViewLink || null,
          createdBy: userId,
        },
      })

      return NextResponse.json(JSON.parse(JSON.stringify(metadata)))
    } catch (dbErr: any) {
      console.error("[files] DB save error after Drive upload:", dbErr?.message)
      return NextResponse.json(JSON.parse(JSON.stringify({
        id: driveFile.id,
        driveFileId: driveFile.id,
        name: driveFile.name,
        mimeType: driveFile.mimeType,
        size: driveFile.size,
        parentId: dbParentId,
        trashed: false,
        starred: false,
        thumbnailLink: driveFile.thumbnailLink || null,
        webViewLink: driveFile.webViewLink || null,
        createdBy: userId,
        _syncWarning: "Uploaded to Google Drive but failed to save in local database",
      })))
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[files] POST error:", msg)

    return NextResponse.json(
      { error: `Operation failed: ${msg}` },
      { status: 500 }
    )
  }
}
