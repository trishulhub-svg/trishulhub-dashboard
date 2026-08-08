import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { canAccessFileModule, canWriteFiles, getAllowedDepartmentIds } from "@/lib/file-access"
import {
  ensureRootAndReview,
  uploadDriveFile,
  moveDriveFile,
  getDriveWebViewLink,
  isMobileUserAgent,
} from "@/lib/file-drive"
import { canManageFileReview } from "@/lib/rbac"

function newId() {
  return `fi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

async function assertFolderAccess(folderId: string, userId: string, role: string) {
  const folder = (await db.$queryRawUnsafe(
    `SELECT "id","kind","driveFolderId","parentId" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
    folderId
  )) as Array<{ id: string; kind: string; driveFolderId: string | null; parentId: string | null }>
  if (!folder[0]) return { error: "Folder not found", status: 404 as const }
  if (folder[0].kind !== "FOLDER") {
    return { error: "Files can only be uploaded inside folders (not departments/categories)", status: 400 as const }
  }
  const allowed = await getAllowedDepartmentIds(userId, role)
  if (allowed) {
    let current: string | null = folderId
    let deptId: string | null = null
    for (let i = 0; i < 40 && current; i++) {
      const rows = (await db.$queryRawUnsafe(
        `SELECT "id","kind","parentId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
        current
      )) as Array<{ id: string; kind: string; parentId: string | null }>
      if (!rows[0]) break
      if (rows[0].kind === "DEPARTMENT") {
        deptId = rows[0].id
        break
      }
      current = rows[0].parentId
    }
    if (deptId && !allowed.includes(deptId)) {
      return { error: "Forbidden", status: 403 as const }
    }
  }
  return { folder: folder[0] }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isMobileUserAgent(req.headers.get("user-agent"))) {
      return NextResponse.json({ error: "Files are available on PC / desktop browser only" }, { status: 403 })
    }
    if (!(await canAccessFileModule(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const nodeId = searchParams.get("nodeId")
    const review = searchParams.get("review") === "1"
    const openId = searchParams.get("openId")

    if (openId) {
      const rows = (await db.$queryRawUnsafe(
        `SELECT * FROM "FileItem" WHERE "id" = ? LIMIT 1`,
        openId
      )) as Array<{
        id: string
        driveFileId: string | null
        webViewLink: string | null
        deletedAt: string | null
        deletedById: string | null
        name: string
      }>
      const item = rows[0]
      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
      if (item.deletedAt && !canManageFileReview(session.user.role) && item.deletedById !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      let link = item.webViewLink
      if (!link && item.driveFileId) {
        link = await getDriveWebViewLink(item.driveFileId)
        if (link) {
          await db.$executeRawUnsafe(`UPDATE "FileItem" SET "webViewLink" = ? WHERE "id" = ?`, link, item.id)
        }
      }
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files",
        action: "ACCESS",
        entityType: "FileItem",
        entityId: item.id,
        description: `Opened file in Google: ${item.name}`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ webViewLink: link })
    }

    if (review) {
      if (!canManageFileReview(session.user.role)) {
        // users see only their own deleted files
        const mine = await db.$queryRawUnsafe(
          `SELECT * FROM "FileItem" WHERE "deletedAt" IS NOT NULL AND "deletedById" = ? ORDER BY "deletedAt" DESC LIMIT 200`,
          session.user.id
        )
        return NextResponse.json({ items: mine })
      }
      const all = await db.$queryRawUnsafe(
        `SELECT * FROM "FileItem" WHERE "deletedAt" IS NOT NULL ORDER BY "deletedAt" DESC LIMIT 500`
      )
      return NextResponse.json({ items: all })
    }

    if (!nodeId) return NextResponse.json({ error: "nodeId required" }, { status: 400 })
    const access = await assertFolderAccess(nodeId, session.user.id, session.user.role)
    if ("error" in access && access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const items = await db.$queryRawUnsafe(
      `SELECT * FROM "FileItem" WHERE "nodeId" = ? AND "deletedAt" IS NULL ORDER BY "name" ASC`,
      nodeId
    )
    return NextResponse.json({ items })
  } catch (err) {
    console.error("[files/items] GET", err)
    return NextResponse.json({ error: "Failed to load files" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (isMobileUserAgent(req.headers.get("user-agent"))) {
      return NextResponse.json({ error: "Files are available on PC / desktop browser only" }, { status: 403 })
    }
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`files-upload-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const form = await req.formData()
    const nodeId = String(form.get("nodeId") || "")
    const file = form.get("file")
    if (!nodeId || !(file instanceof File)) {
      return NextResponse.json({ error: "nodeId and file required" }, { status: 400 })
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Max file size is 50MB" }, { status: 400 })
    }

    const access = await assertFolderAccess(nodeId, session.user.id, session.user.role)
    if ("error" in access && access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
    const folder = access.folder!
    if (!folder.driveFolderId) {
      return NextResponse.json(
        { error: "Folder is not linked to Google Drive yet. Connect Drive in Files → Settings." },
        { status: 400 }
      )
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const uploaded = await uploadDriveFile({
      name: file.name.slice(0, 240),
      mimeType: file.type || "application/octet-stream",
      parentId: folder.driveFolderId,
      body: buf,
    })

    const id = newId()
    await db.$executeRawUnsafe(
      `INSERT INTO "FileItem" ("id","nodeId","name","mimeType","sizeBytes","driveFileId","webViewLink","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      nodeId,
      file.name.slice(0, 240),
      file.type || "application/octet-stream",
      file.size,
      uploaded.id,
      uploaded.webViewLink || null,
      session.user.id
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files",
      action: "UPLOAD",
      entityType: "FileItem",
      entityId: id,
      description: `Uploaded file: ${file.name}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    const rows = await db.$queryRawUnsafe(`SELECT * FROM "FileItem" WHERE "id" = ? LIMIT 1`, id)
    return NextResponse.json({ item: (rows as unknown[])[0] }, { status: 201 })
  } catch (err) {
    console.error("[files/items] POST", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 200) : "Upload failed" },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const rows = (await db.$queryRawUnsafe(
      `SELECT * FROM "FileItem" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
      id
    )) as Array<{
      id: string
      name: string
      nodeId: string
      driveFileId: string | null
    }>
    const item = rows[0]
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      const { reviewFolderId } = await ensureRootAndReview()
      if (item.driveFileId) {
        const folder = (await db.$queryRawUnsafe(
          `SELECT "driveFolderId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
          item.nodeId
        )) as Array<{ driveFolderId: string | null }>
        await moveDriveFile(item.driveFileId, reviewFolderId, folder[0]?.driveFolderId)
      }
    } catch (e) {
      console.warn("[files/items] Drive move to review failed:", e)
    }

    await db.$executeRawUnsafe(
      `UPDATE "FileItem" SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "originalNodeId" = "nodeId", "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      session.user.id,
      id
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files",
      action: "DELETE",
      entityType: "FileItem",
      entityId: id,
      description: `Soft-deleted file (Review): ${item.name}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[files/items] DELETE", err)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || "")
    const action = String(body.action || "")
    if (!id || action !== "restore") {
      return NextResponse.json({ error: "id and action=restore required" }, { status: 400 })
    }

    const rows = (await db.$queryRawUnsafe(
      `SELECT * FROM "FileItem" WHERE "id" = ? AND "deletedAt" IS NOT NULL LIMIT 1`,
      id
    )) as Array<{
      id: string
      name: string
      driveFileId: string | null
      originalNodeId: string | null
      nodeId: string
      deletedById: string | null
    }>
    const item = rows[0]
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!canManageFileReview(session.user.role) && item.deletedById !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetNodeId = item.originalNodeId || item.nodeId
    const folder = (await db.$queryRawUnsafe(
      `SELECT "driveFolderId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      targetNodeId
    )) as Array<{ driveFolderId: string | null }>

    try {
      const { reviewFolderId } = await ensureRootAndReview()
      if (item.driveFileId && folder[0]?.driveFolderId) {
        await moveDriveFile(item.driveFileId, folder[0].driveFolderId, reviewFolderId)
      }
    } catch (e) {
      console.warn("[files/items] Drive restore move failed:", e)
    }

    await db.$executeRawUnsafe(
      `UPDATE "FileItem" SET "deletedAt" = NULL, "deletedById" = NULL, "nodeId" = ?, "originalNodeId" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      targetNodeId,
      id
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files-review",
      action: "UPDATE",
      entityType: "FileItem",
      entityId: id,
      description: `Restored file from Review: ${item.name}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[files/items] PUT", err)
    return NextResponse.json({ error: "Failed to restore" }, { status: 500 })
  }
}
