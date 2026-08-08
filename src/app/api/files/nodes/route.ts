import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  canAccessFileModule,
  canWriteFiles,
  getAllowedDepartmentIds,
} from "@/lib/file-access"
import {
  ensureRootAndReview,
  ensureDriveFolder,
  isMobileUserAgent,
  getFileDriveConfigPublic,
} from "@/lib/file-drive"
import { canManageFileReview } from "@/lib/rbac"

type NodeKind = "DEPARTMENT" | "CATEGORY" | "FOLDER"

function newId() {
  return `fn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
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

    const parentId = new URL(req.url).searchParams.get("parentId")
    const allowedDepts = await getAllowedDepartmentIds(session.user.id, session.user.role)

    let rows: Array<Record<string, unknown>>
    if (!parentId) {
      // root departments
      rows = (await db.$queryRawUnsafe(
        `SELECT * FROM "FileNode" WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND "parentId" IS NULL ORDER BY "sortOrder" ASC, "name" ASC`
      )) as Array<Record<string, unknown>>
      if (allowedDepts) {
        rows = rows.filter((r) => allowedDepts.includes(String(r.id)))
      }
    } else {
      // ensure parent is visible
      if (allowedDepts) {
        const ancestors = await collectAncestorIds(parentId)
        const dept = ancestors.find((a) => a.kind === "DEPARTMENT")
        if (dept && !allowedDepts.includes(dept.id)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
      }
      rows = (await db.$queryRawUnsafe(
        `SELECT * FROM "FileNode" WHERE "parentId" = ? AND "deletedAt" IS NULL ORDER BY "sortOrder" ASC, "name" ASC`,
        parentId
      )) as Array<Record<string, unknown>>
    }

    const drive = await getFileDriveConfigPublic()
    return NextResponse.json({ nodes: rows, driveConnected: drive.connected })
  } catch (err) {
    console.error("[files/nodes] GET", err)
    return NextResponse.json({ error: "Failed to load folders" }, { status: 500 })
  }
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
    const rl = rateLimit(`files-nodes-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const name = String(body.name || "").trim().slice(0, 200)
    const kind = String(body.kind || "").toUpperCase() as NodeKind
    const parentId = body.parentId ? String(body.parentId) : null

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!["DEPARTMENT", "CATEGORY", "FOLDER"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 })
    }

    if (kind === "DEPARTMENT") {
      if (!canManageFileReview(session.user.role)) {
        return NextResponse.json({ error: "Only Admin/Super Admin can create departments" }, { status: 403 })
      }
      if (parentId) return NextResponse.json({ error: "Departments cannot have a parent" }, { status: 400 })
    } else {
      if (!parentId) return NextResponse.json({ error: "parentId is required" }, { status: 400 })
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
    }

    let driveFolderId: string | null = null
    try {
      const { rootFolderId } = await ensureRootAndReview()
      let parentDrive = rootFolderId
      if (parentId) {
        const p = (await db.$queryRawUnsafe(
          `SELECT "driveFolderId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
          parentId
        )) as Array<{ driveFolderId: string | null }>
        parentDrive = p[0]?.driveFolderId || rootFolderId
      }
      driveFolderId = await ensureDriveFolder(name, parentDrive)
    } catch (driveErr) {
      // Allow offline metadata create when Drive not connected — surface warning
      console.warn("[files/nodes] Drive folder create skipped:", driveErr)
    }

    const id = newId()
    await db.$executeRawUnsafe(
      `INSERT INTO "FileNode" ("id","kind","name","parentId","driveFolderId","sortOrder","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      kind,
      name,
      parentId,
      driveFolderId,
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

    const created = (await db.$queryRawUnsafe(
      `SELECT * FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      id
    )) as Array<Record<string, unknown>>

    return NextResponse.json({ node: created[0] }, { status: 201 })
  } catch (err) {
    console.error("[files/nodes] POST", err)
    return NextResponse.json({ error: "Failed to create" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const id = String(body.id || "")
    const name = String(body.name || "").trim().slice(0, 200)
    if (!id || !name) return NextResponse.json({ error: "id and name required" }, { status: 400 })

    await db.$executeRawUnsafe(
      `UPDATE "FileNode" SET "name" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ? AND "deletedAt" IS NULL`,
      name,
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
      description: `Renamed folder/node to ${name}`,
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
    if (!(await canWriteFiles(session.user.id, session.user.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    // Soft-delete node (and cascade mark children/files via app logic)
    await db.$executeRawUnsafe(
      `UPDATE "FileNode" SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      session.user.id,
      id
    )
    await db.$executeRawUnsafe(
      `UPDATE "FileItem" SET "deletedAt" = CURRENT_TIMESTAMP, "deletedById" = ?, "originalNodeId" = "nodeId", "updatedAt" = CURRENT_TIMESTAMP
       WHERE "nodeId" = ? AND "deletedAt" IS NULL`,
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
      entityType: "FileNode",
      entityId: id,
      description: "Soft-deleted folder/node (moved to review)",
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[files/nodes] DELETE", err)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
