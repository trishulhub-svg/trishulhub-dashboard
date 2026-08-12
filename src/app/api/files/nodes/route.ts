import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  canAccessFileModule,
  canWriteFiles,
  canWriteFileNode,
  getAllowedDepartmentIds,
  ensurePrivateDepartment,
  canAccessFileNode,
} from "@/lib/file-access"
import {
  ensureRootAndReview,
  ensureDriveFolder,
  ensureNodeDriveFolder,
  isFilesMobileBlocked,
  getFileDriveConfigPublic,
  getDriveFolderLink,
  moveDriveFile,
  renameDriveFile,
} from "@/lib/file-drive"
import { canManageFileReview } from "@/lib/rbac"

type NodeKind = "DEPARTMENT" | "CATEGORY" | "FOLDER"

function newId() {
  return `fn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function rejectMobile(req: NextRequest, role?: string | null) {
  if (isFilesMobileBlocked(req.headers.get("user-agent"), role)) {
    return NextResponse.json(
      { error: "Files on mobile is limited to Admin and Super Admin. Use a PC / desktop browser." },
      { status: 403 }
    )
  }
  return null
}

async function collectAncestorIds(nodeId: string): Promise<Array<{ id: string; kind: string }>> {
  const out: Array<{ id: string; kind: string }> = []
  let current: string | null = nodeId
  for (let i = 0; i < 40 && current; i++) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id","kind","parentId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      current
    )) as Array<{ id: string; kind: string; parentId: string | null }>
    if (!rows[0]) break
    out.push({ id: rows[0].id, kind: rows[0].kind })
    current = rows[0].parentId
  }
  return out
}

/** Collect self + all descendants (BFS). */
async function collectDescendantIds(rootId: string): Promise<string[]> {
  const ids = [rootId]
  const queue = [rootId]
  while (queue.length) {
    const parent = queue.shift()!
    const kids = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileNode" WHERE "parentId" = ? AND "deletedAt" IS NULL`,
      parent
    )) as Array<{ id: string }>
    for (const k of kids) {
      ids.push(k.id)
      queue.push(k.id)
    }
  }
  return ids
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mobile = rejectMobile(req, session.user.role)
    if (mobile) return mobile
    if (!(await canAccessFileModule(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parentId = new URL(req.url).searchParams.get("parentId")

    // Ensure Admin/Super Admin private department exists
    if (!parentId && canManageFileReview(session.user.role)) {
      await ensurePrivateDepartment(session.user.id)
    }

    const allowedDepts = await getAllowedDepartmentIds(session.user.id, session.user.role)

    let rows: Array<Record<string, unknown>>
    if (!parentId) {
      rows = (await db.$queryRawUnsafe(
        `SELECT * FROM "FileNode" WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND "parentId" IS NULL ORDER BY "isPrivate" DESC, "sortOrder" ASC, "name" ASC`
      )) as Array<Record<string, unknown>>
      if (allowedDepts) {
        rows = rows.filter((r) => allowedDepts.includes(String(r.id)))
      } else if (!canManageFileReview(session.user.role)) {
        // Belt: hide private even if allowedDepts is null for some edge path
        rows = rows.filter((r) => !r.isPrivate)
      }
      // Note: we do NOT share whole departments on browse.
      // Edit access is granted per-file to personal Gmail when user clicks Open.
    } else {
      if (!(await canAccessFileNode(session.user.id, session.user.role, parentId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      rows = (await db.$queryRawUnsafe(
        `SELECT * FROM "FileNode" WHERE "parentId" = ? AND "deletedAt" IS NULL ORDER BY "sortOrder" ASC, "name" ASC`,
        parentId
      )) as Array<Record<string, unknown>>
    }

    const drive = await getFileDriveConfigPublic()
    const nodes = rows.map((r) => ({
      ...r,
      driveFolderUrl: getDriveFolderLink(
        typeof r.driveFolderId === "string" ? r.driveFolderId : null
      ),
    }))
    return NextResponse.json({
      nodes,
      driveConnected: drive.connected,
      driveRootFolderId: drive.rootFolderId,
      driveRootFolderUrl: drive.rootFolderUrl,
      driveRootName: "Trishulhub Files",
    })
  } catch (err) {
    console.error("[files/nodes] GET", err)
    return NextResponse.json({ error: "Failed to load folders" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mobile = rejectMobile(req, session.user.role)
    if (mobile) return mobile
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`files-nodes-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const name = String(body.name || "").trim().slice(0, 200)
    const kind = String(body.kind || "").toUpperCase() as NodeKind
    const parentId = body.parentId ? String(body.parentId) : null
    const wantPrivate = body.isPrivate === true || body.isPrivate === 1 || body.isPrivate === "1"

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!["DEPARTMENT", "CATEGORY", "FOLDER"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
    }

    let parentDrive: string | null = null
    let isPrivate = 0
    if (kind === "DEPARTMENT") {
      if (!canManageFileReview(session.user.role)) {
        return NextResponse.json({ error: "Only Admin/Super Admin can create departments" }, { status: 403 })
      }
      if (parentId) return NextResponse.json({ error: "Departments cannot have a parent" }, { status: 400 })
      if (wantPrivate) isPrivate = 1
    } else {
      if (!parentId) return NextResponse.json({ error: "parentId is required" }, { status: 400 })
      if (!(await canWriteFileNode(session.user.id, session.user.role, parentId))) {
        return NextResponse.json({ error: "Forbidden — write access required" }, { status: 403 })
      }
      const parents = (await db.$queryRawUnsafe(
        `SELECT "id","kind","driveFolderId" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
        parentId
      )) as Array<{ id: string; kind: string; driveFolderId: string | null }>
      if (!parents[0]) return NextResponse.json({ error: "Parent not found" }, { status: 404 })
      if (kind === "CATEGORY" && !["DEPARTMENT", "CATEGORY"].includes(parents[0].kind)) {
        return NextResponse.json({ error: "Category must be under department or category" }, { status: 400 })
      }
      if (kind === "FOLDER" && !["CATEGORY", "FOLDER"].includes(parents[0].kind)) {
        return NextResponse.json({ error: "Folder must be under category or folder" }, { status: 400 })
      }
      parentDrive = parents[0].driveFolderId
      if (!parentDrive) {
        return NextResponse.json(
          { error: "Parent is not linked to Google Drive. Connect Drive and recreate the parent folder." },
          { status: 400 }
        )
      }
    }

    let driveFolderId: string | null = null
    try {
      const { rootFolderId } = await ensureRootAndReview()
      // Repair parent Drive link first so new folder lands in the real mirrored path
      let parentDriveResolved = parentDrive || rootFolderId
      if (parentId) {
        parentDriveResolved = await ensureNodeDriveFolder(parentId)
      }
      driveFolderId = await ensureDriveFolder(name, parentDriveResolved)
    } catch (driveErr) {
      console.warn("[files/nodes] Drive folder create failed:", driveErr)
      return NextResponse.json(
        {
          error:
            driveErr instanceof Error
              ? `Google Drive error: ${driveErr.message.slice(0, 160)}`
              : "Google Drive is not connected",
        },
        { status: 400 }
      )
    }

    const id = newId()
    await db.$executeRawUnsafe(
      `INSERT INTO "FileNode" ("id","kind","name","parentId","driveFolderId","isPrivate","sortOrder","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      kind,
      name,
      parentId,
      driveFolderId,
      isPrivate,
      session.user.id
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files",
      action: "CREATE",
      entityType: "FileNode",
      entityId: id,
      description: `Created ${kind.toLowerCase()}: ${name}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    // New departments must be Drive-shared with Admins immediately (Trishulhub access ≠ Drive ACL)
    if (kind === "DEPARTMENT" && driveFolderId) {
      try {
        const { shareNewDepartmentWithAdmins } = await import("@/lib/file-drive-acl")
        await shareNewDepartmentWithAdmins(id)
      } catch (e) {
        console.warn("[files/nodes] admin Drive share on create failed", e)
      }
    }

    const created = (await db.$queryRawUnsafe(
      `SELECT * FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      id
    )) as Array<Record<string, unknown>>

    return NextResponse.json(
      {
        node: {
          ...created[0],
          driveFolderUrl: getDriveFolderLink(driveFolderId),
        },
        driveFolderUrl: getDriveFolderLink(driveFolderId),
      },
      { status: 201 }
    )
  } catch (err) {
    console.error("[files/nodes] POST", err)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mobile = rejectMobile(req, session.user.role)
    if (mobile) return mobile
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || "")
    const nameRaw = body.name != null ? String(body.name).trim().slice(0, 200) : ""
    const wantsMove = Object.prototype.hasOwnProperty.call(body, "parentId")
    const newParentId = wantsMove
      ? body.parentId == null || body.parentId === ""
        ? null
        : String(body.parentId)
      : undefined

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    if (!nameRaw && !wantsMove) {
      return NextResponse.json({ error: "name or parentId required" }, { status: 400 })
    }

    const existing = (await db.$queryRawUnsafe(
      `SELECT "id","kind","parentId","driveFolderId","name" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
      id
    )) as Array<{
      id: string
      kind: string
      parentId: string | null
      driveFolderId: string | null
      name: string
    }>
    if (!existing[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!(await canWriteFileNode(session.user.id, session.user.role, id))) {
      return NextResponse.json({ error: "Forbidden — write access required" }, { status: 403 })
    }

    const node = existing[0]
    const nextName = nameRaw || node.name

    if (wantsMove) {
      if (node.kind === "DEPARTMENT") {
        return NextResponse.json({ error: "Departments cannot be moved" }, { status: 400 })
      }
      if (!newParentId) {
        return NextResponse.json({ error: "parentId is required to move this item" }, { status: 400 })
      }
      if (newParentId === id) {
        return NextResponse.json({ error: "Cannot move a folder into itself" }, { status: 400 })
      }
      if (!(await canWriteFileNode(session.user.id, session.user.role, newParentId))) {
        return NextResponse.json({ error: "Forbidden — write access required on destination" }, { status: 403 })
      }

      // Prevent moving into own descendant
      let walk: string | null = newParentId
      while (walk) {
        if (walk === id) {
          return NextResponse.json({ error: "Cannot move a folder into its own subfolder" }, { status: 400 })
        }
        const parents = (await db.$queryRawUnsafe(
          `SELECT "parentId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
          walk
        )) as Array<{ parentId: string | null }>
        walk = parents[0]?.parentId ?? null
      }

      const parents = (await db.$queryRawUnsafe(
        `SELECT "id","kind","driveFolderId" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
        newParentId
      )) as Array<{ id: string; kind: string; driveFolderId: string | null }>
      if (!parents[0]) return NextResponse.json({ error: "Parent not found" }, { status: 404 })
      if (node.kind === "CATEGORY" && !["DEPARTMENT", "CATEGORY"].includes(parents[0].kind)) {
        return NextResponse.json({ error: "Category must be under department or category" }, { status: 400 })
      }
      if (node.kind === "FOLDER" && !["CATEGORY", "FOLDER"].includes(parents[0].kind)) {
        return NextResponse.json({ error: "Folder must be under category or folder" }, { status: 400 })
      }

      let targetDriveId: string
      try {
        targetDriveId = await ensureNodeDriveFolder(newParentId)
      } catch (e) {
        return NextResponse.json(
          {
            error:
              e instanceof Error
                ? `Google Drive error: ${e.message.slice(0, 140)}`
                : "Target folder is not linked to Google Drive",
          },
          { status: 400 }
        )
      }

      if (node.driveFolderId) {
        try {
          await moveDriveFile(node.driveFolderId, targetDriveId, null)
        } catch (e) {
          console.error("[files/nodes] Drive folder move failed:", e)
          return NextResponse.json(
            {
              error:
                e instanceof Error
                  ? `Google Drive move failed: ${e.message.slice(0, 140)}`
                  : "Google Drive move failed",
            },
            { status: 400 }
          )
        }
      }

      await db.$executeRawUnsafe(
        `UPDATE "FileNode" SET "parentId" = ?, "name" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "deletedAt" IS NULL`,
        newParentId,
        nextName,
        id
      )

      if (node.driveFolderId && nextName !== node.name) {
        try {
          await renameDriveFile(node.driveFolderId, nextName)
        } catch (e) {
          console.warn("[files/nodes] Drive rename after move failed:", e)
        }
      }

      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files",
        action: "UPDATE",
        entityType: "FileNode",
        entityId: id,
        description: `Moved ${node.kind.toLowerCase()} ${nextName}`,
        oldValue: node.parentId || "",
        newValue: newParentId,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ ok: true, moved: true })
    }

    if (node.driveFolderId && nextName !== node.name) {
      try {
        await renameDriveFile(node.driveFolderId, nextName)
      } catch (e) {
        console.warn("[files/nodes] Drive rename failed:", e)
      }
    }

    await db.$executeRawUnsafe(
      `UPDATE "FileNode" SET "name" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "deletedAt" IS NULL`,
      nextName,
      id
    )
    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files",
      action: "UPDATE",
      entityType: "FileNode",
      entityId: id,
      description: `Renamed folder/node to ${nextName}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[files/nodes] PATCH", err)
    return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const mobile = rejectMobile(req, session.user.role)
    if (mobile) return mobile
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    if (!(await canWriteFileNode(session.user.id, session.user.role, id))) {
      return NextResponse.json({ error: "Forbidden — write access required" }, { status: 403 })
    }

    const nodeIds = await collectDescendantIds(id)
    const placeholders = nodeIds.map(() => "?").join(",")

    // Move Drive folders + files into Review
    try {
      const { reviewFolderId } = await ensureRootAndReview()
      const nodes = (await db.$queryRawUnsafe(
        `SELECT "id","driveFolderId" FROM "FileNode" WHERE "id" IN (${placeholders}) AND "deletedAt" IS NULL`,
        ...nodeIds
      )) as Array<{ id: string; driveFolderId: string | null }>
      for (const n of nodes) {
        if (n.driveFolderId) {
          try {
            await moveDriveFile(n.driveFolderId, reviewFolderId)
          } catch (e) {
            console.warn("[files/nodes] Drive folder move failed", n.id, e)
          }
        }
      }
      const files = (await db.$queryRawUnsafe(
        `SELECT "id","driveFileId","nodeId" FROM "FileItem" WHERE "nodeId" IN (${placeholders}) AND "deletedAt" IS NULL`,
        ...nodeIds
      )) as Array<{ id: string; driveFileId: string | null; nodeId: string }>
      for (const f of files) {
        if (f.driveFileId) {
          try {
            await moveDriveFile(f.driveFileId, reviewFolderId)
          } catch (e) {
            console.warn("[files/nodes] Drive file move failed", f.id, e)
          }
        }
      }
    } catch (e) {
      console.warn("[files/nodes] Review move skipped:", e)
    }

    await db.$executeRawUnsafe(
      `UPDATE "FileNode" SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" IN (${placeholders}) AND "deletedAt" IS NULL`,
      session.user.id,
      ...nodeIds
    )
    await db.$executeRawUnsafe(
      `UPDATE "FileItem" SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "originalNodeId" = "nodeId", "updatedAt" = CURRENT_TIMESTAMP
       WHERE "nodeId" IN (${placeholders}) AND "deletedAt" IS NULL`,
      session.user.id,
      ...nodeIds
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files",
      action: "DELETE",
      entityType: "FileNode",
      entityId: id,
      description: `Soft-deleted folder tree (${nodeIds.length} nodes) → Review`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json({ ok: true, deletedNodes: nodeIds.length })
  } catch (err) {
    console.error("[files/nodes] DELETE", err)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
