import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageFileSettings, canManageFileReview } from "@/lib/rbac"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  setUserModuleOverride,
  listDepartmentGrants,
  listItemGrants,
  getUserModuleOverride,
  getDepartmentIdForItem,
  isDepartmentPrivate,
  FILE_STAFF_ROLES,
} from "@/lib/file-access"
import {
  getRoleDepartmentMap,
  setRoleDepartmentAccess,
  shareDepartmentWithUser,
  unshareDepartmentFromUser,
  shareDriveTargetWithUser,
  unshareDriveTargetFromUser,
  shareDepartmentWithRoleUsers,
  unshareDepartmentFromRoleUsers,
} from "@/lib/file-drive-acl"
import { getGoogleEditEmailForUser } from "@/lib/file-google-email"

function newId() {
  return `fag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const ensureMine = searchParams.get("ensureMine") === "1"
    const ensureNodeId = searchParams.get("ensureNodeId")

    // Any Files user can sync their own Drive ACL (fixes Admin "Request access")
    if (ensureMine || ensureNodeId) {
      const { canAccessFileModule } = await import("@/lib/file-access")
      if (!(await canAccessFileModule(session.user.id, session.user.role))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      if (ensureMine) {
        const { rematerializeUserDriveAccess } = await import("@/lib/file-drive-acl")
        const result = await rematerializeUserDriveAccess({
          userId: session.user.id,
          role: session.user.role,
        })
        return NextResponse.json({ ok: true, ...result })
      }
      if (ensureNodeId) {
        const { ensureDriveAccessForOpen } = await import("@/lib/file-drive-acl")
        const { canAccessFileNode } = await import("@/lib/file-access")
        if (!(await canAccessFileNode(session.user.id, session.user.role, ensureNodeId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        const ensured = await ensureDriveAccessForOpen({
          userId: session.user.id,
          nodeId: ensureNodeId,
        })
        const node = (await db.$queryRawUnsafe(
          `SELECT "driveFolderId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
          ensureNodeId
        )) as Array<{ driveFolderId: string | null }>
        const { getDriveFolderLink } = await import("@/lib/file-drive")
        return NextResponse.json({
          ok: true,
          ...ensured,
          driveFolderUrl: getDriveFolderLink(node[0]?.driveFolderId || null),
        })
      }
    }

    if (!canManageFileSettings(session.user.role) && !canManageFileReview(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const nodeId = searchParams.get("nodeId")
    const userId = searchParams.get("userId")
    const itemId = searchParams.get("itemId")
    const roleDepts = searchParams.get("roleDepts") === "1"
    const departments = searchParams.get("departments") === "1"

    if (roleDepts) {
      if (!canManageFileSettings(session.user.role)) {
        return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 })
      }
      const map = await getRoleDepartmentMap()
      return NextResponse.json({ roleDepartments: map, roles: FILE_STAFF_ROLES })
    }

    if (departments) {
      // All departments for access UI (including private — marked, not grantable)
      const rows = (await db.$queryRawUnsafe(
        `SELECT "id","name","isPrivate","driveFolderId" FROM "FileNode"
         WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL
         ORDER BY "isPrivate" DESC, "name" ASC`
      )) as Array<{
        id: string
        name: string
        isPrivate: number | boolean | null
        driveFolderId: string | null
      }>
      return NextResponse.json({
        departments: rows.map((r) => ({
          id: r.id,
          name: r.name,
          isPrivate: r.isPrivate === true || r.isPrivate === 1,
          hasDrive: Boolean(r.driveFolderId),
        })),
      })
    }

    if (userId) {
      const mode = await getUserModuleOverride(userId)
      return NextResponse.json({ userId, mode })
    }
    if (itemId) {
      const grants = await listItemGrants(itemId)
      return NextResponse.json({ grants })
    }
    if (nodeId) {
      const grants = await listDepartmentGrants(nodeId)
      // Enrich with user names
      const enriched: Array<{
        id: string
        scope: string
        role: string | null
        userId: string | null
        canRead: boolean
        canWrite: boolean
        canDelete: boolean
        name: string | null
        email: string | null
      }> = []
      for (const g of grants as Array<{
        id: string
        scope: string
        role: string | null
        userId: string | null
        canRead: boolean
        canWrite: boolean
        canDelete: boolean
      }>) {
        let name: string | null = null
        let email: string | null = null
        if (g.userId) {
          const u = await db.user.findUnique({
            where: { id: g.userId },
            select: { name: true, email: true },
          })
          name = u?.name || null
          email = u?.email || null
        }
        enriched.push({ ...g, name, email })
      }
      return NextResponse.json({ grants: enriched })
    }
    // list custom user overrides
    const overrides = await db.$queryRawUnsafe(
      `SELECT g."id", g."userId", g."canRead", u."name", u."email", u."role"
       FROM "FileAccessGrant" g
       LEFT JOIN "User" u ON u."id" = g."userId"
       WHERE g."scope" = 'USER_MODULE'
       ORDER BY u."name" ASC`
    )
    return NextResponse.json({ overrides })
  } catch (err) {
    console.error("[files/access] GET", err)
    return NextResponse.json({ error: "Failed to load access" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const type = String(body.type || "")

    // Set departments for an entire role (all current + future users of that role)
    if (type === "ROLE_DEPARTMENTS") {
      if (!canManageFileSettings(session.user.role)) {
        return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 })
      }
      const role = String(body.role || "")
      const nodeIds = Array.isArray(body.nodeIds) ? body.nodeIds.map(String) : []
      if (!role) return NextResponse.json({ error: "role required" }, { status: 400 })
      try {
        const result = await setRoleDepartmentAccess(role, nodeIds)
        void logAudit({
          userId: session.user.id,
          userName: session.user.name || "unknown",
          userRole: session.user.role,
          department: "FILES",
          page: "files-settings",
          action: "CONFIG_CHANGE",
          entityType: "FileAccessGrant",
          entityId: role,
          description: `Set role ${role} department access (+${result.added}/-${result.removed}) + Drive sync`,
          ipAddress: getIpAddress(req),
          userAgent: getUserAgent(req),
        })
        return NextResponse.json({ ok: true, ...result })
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to save role departments" },
          { status: 400 }
        )
      }
    }

    // Module overrides + role settings: Super Admin only
    if (type === "USER_MODULE") {
      if (!canManageFileSettings(session.user.role)) {
        return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 })
      }
      const userId = String(body.userId || "")
      const mode = String(body.mode || "CLEAR") as "ALLOW" | "DENY" | "CLEAR"
      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })
      if (!["ALLOW", "DENY", "CLEAR"].includes(mode)) {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
      }
      await setUserModuleOverride(userId, mode)
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "CONFIG_CHANGE",
        entityType: "FileAccessGrant",
        entityId: userId,
        description: `Set custom file module access for user to ${mode}`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ ok: true })
    }

    // Department + per-file grants: Admin or Super Admin
    if (!canManageFileReview(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — Admin or Super Admin only" }, { status: 403 })
    }

    if (type === "ITEM_USER") {
      const itemId = String(body.itemId || "")
      const userId = String(body.userId || "")
      if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 })

      const items = (await db.$queryRawUnsafe(
        `SELECT "id","name","driveFileId" FROM "FileItem" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
        itemId
      )) as Array<{ id: string; name: string; driveFileId: string | null }>
      if (!items[0]) return NextResponse.json({ error: "File not found" }, { status: 404 })

      if (body.removeId) {
        const existing = (await db.$queryRawUnsafe(
          `SELECT * FROM "FileAccessGrant" WHERE "id" = ? AND "scope" = 'ITEM_USER' LIMIT 1`,
          String(body.removeId)
        )) as Array<{ id: string; userId: string | null }>
        await db.$executeRawUnsafe(`DELETE FROM "FileAccessGrant" WHERE "id" = ?`, String(body.removeId))
        if (existing[0]?.userId && items[0].driveFileId) {
          await unshareDriveTargetFromUser(items[0].driveFileId, existing[0].userId)
        }
        void logAudit({
          userId: session.user.id,
          userName: session.user.name || "unknown",
          userRole: session.user.role,
          department: "FILES",
          page: "files",
          action: "DELETE",
          entityType: "FileAccessGrant",
          entityId: String(body.removeId),
          description: `Removed file grant on ${items[0].name}`,
          ipAddress: getIpAddress(req),
          userAgent: getUserAgent(req),
        })
        return NextResponse.json({ ok: true })
      }

      if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

      const deptId = await getDepartmentIdForItem(itemId)
      if (await isDepartmentPrivate(deptId)) {
        return NextResponse.json(
          { error: "Private department files cannot be shared. Admin / Super Admin only." },
          { status: 400 }
        )
      }

      await db.$executeRawUnsafe(
        `DELETE FROM "FileAccessGrant" WHERE "scope" = 'ITEM_USER' AND "userId" = ? AND "itemId" = ?`,
        userId,
        itemId
      )
      const id = newId()
      await db.$executeRawUnsafe(
        `INSERT INTO "FileAccessGrant" ("id","scope","userId","itemId","canRead","canWrite","canDelete","createdAt","updatedAt")
         VALUES (?,?,?,?,1,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        id,
        "ITEM_USER",
        userId,
        itemId
      )

      let driveShare: { ok: boolean; email?: string; error?: string } | null = null
      if (items[0].driveFileId) {
        driveShare = await shareDriveTargetWithUser(items[0].driveFileId, userId, "writer")
      }

      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files",
        action: "ASSIGN",
        entityType: "FileAccessGrant",
        entityId: id,
        description: `Granted file access on ${items[0].name} to user ${userId}${
          driveShare?.email ? ` + Drive ${driveShare.email}` : ""
        }`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({
        ok: true,
        id,
        driveShare,
        warning: driveShare && !driveShare.ok ? driveShare.error : undefined,
      })
    }

    if (type === "NODE_USER" || type === "NODE_ROLE") {
      const nodeId = String(body.nodeId || "")
      const canRead = body.canRead !== false
      const canWrite = body.canWrite !== false
      const canDelete = body.canDelete === true
      if (!nodeId) return NextResponse.json({ error: "nodeId required" }, { status: 400 })

      const node = (await db.$queryRawUnsafe(
        `SELECT "id","kind","driveFolderId","name","isPrivate" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
        nodeId
      )) as Array<{
        id: string
        kind: string
        driveFolderId: string | null
        name: string
        isPrivate: number | boolean | null
      }>
      if (!node[0] || node[0].kind !== "DEPARTMENT") {
        return NextResponse.json({ error: "Grants attach to DEPARTMENT nodes only" }, { status: 400 })
      }
      if (node[0].isPrivate === true || node[0].isPrivate === 1) {
        return NextResponse.json(
          { error: "Private department cannot be shared. It stays Admin / Super Admin only." },
          { status: 400 }
        )
      }

      if (body.removeId) {
        const existing = (await db.$queryRawUnsafe(
          `SELECT * FROM "FileAccessGrant" WHERE "id" = ? LIMIT 1`,
          String(body.removeId)
        )) as Array<{ id: string; userId: string | null; scope: string; role: string | null }>
        await db.$executeRawUnsafe(`DELETE FROM "FileAccessGrant" WHERE "id" = ?`, String(body.removeId))
        if (existing[0]?.scope === "NODE_USER" && existing[0].userId) {
          await unshareDepartmentFromUser(nodeId, existing[0].userId)
        }
        if (existing[0]?.scope === "NODE_ROLE" && existing[0].role) {
          await unshareDepartmentFromRoleUsers(nodeId, existing[0].role)
        }
        void logAudit({
          userId: session.user.id,
          userName: session.user.name || "unknown",
          userRole: session.user.role,
          department: "FILES",
          page: "files-settings",
          action: "DELETE",
          entityType: "FileAccessGrant",
          entityId: String(body.removeId),
          description: `Removed department grant on ${node[0].name}`,
          ipAddress: getIpAddress(req),
          userAgent: getUserAgent(req),
        })
        return NextResponse.json({ ok: true })
      }

      const id = newId()
      const role = type === "NODE_ROLE" ? String(body.role || "") : null
      const userId = type === "NODE_USER" ? String(body.userId || "") : null
      if (type === "NODE_ROLE" && !role) return NextResponse.json({ error: "role required" }, { status: 400 })
      if (type === "NODE_USER" && !userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

      // Upsert: one grant per user/role + department
      if (type === "NODE_USER" && userId) {
        await db.$executeRawUnsafe(
          `DELETE FROM "FileAccessGrant" WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "nodeId" = ?`,
          userId,
          nodeId
        )
      }
      if (type === "NODE_ROLE" && role) {
        await db.$executeRawUnsafe(
          `DELETE FROM "FileAccessGrant" WHERE "scope" = 'NODE_ROLE' AND "role" = ? AND "nodeId" = ?`,
          role,
          nodeId
        )
      }

      await db.$executeRawUnsafe(
        `INSERT INTO "FileAccessGrant" ("id","scope","role","userId","nodeId","canRead","canWrite","canDelete","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
        id,
        type,
        role,
        userId,
        nodeId,
        canRead ? 1 : 0,
        canWrite ? 1 : 0,
        canDelete ? 1 : 0
      )

      let driveShare: { ok: boolean; email?: string; error?: string } | null = null
      if (type === "NODE_USER" && userId) {
        driveShare = await shareDepartmentWithUser(nodeId, userId)
        const gmail = await getGoogleEditEmailForUser(userId)
        if (!gmail) {
          driveShare = {
            ok: false,
            error: "User has no Google email — set Personal Gmail on Team, then re-grant or ask them to open Files.",
          }
        }
      }
      if (type === "NODE_ROLE" && role) {
        await shareDepartmentWithRoleUsers(nodeId, role)
        driveShare = { ok: true }
      }

      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "ASSIGN",
        entityType: "FileAccessGrant",
        entityId: id,
        description: `Granted ${type} access on department ${node[0].name} + Drive sync`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({
        ok: true,
        id,
        driveShare,
        warning: driveShare && !driveShare.ok ? driveShare.error : undefined,
      })
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 })
  } catch (err) {
    console.error("[files/access] PUT", err)
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 })
  }
}
