import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageFileSettings, canManageFileReview } from "@/lib/rbac"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  setUserModuleOverride,
  listDepartmentGrants,
  getUserModuleOverride,
} from "@/lib/file-access"
import { unshareDriveFolderFromEmail } from "@/lib/file-drive"
import { getGoogleEditEmailForUser } from "@/lib/file-google-email"

function newId() {
  return `fag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageFileSettings(session.user.role) && !canManageFileReview(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const nodeId = new URL(req.url).searchParams.get("nodeId")
    const userId = new URL(req.url).searchParams.get("userId")
    if (userId) {
      const mode = await getUserModuleOverride(userId)
      return NextResponse.json({ userId, mode })
    }
    if (nodeId) {
      const grants = await listDepartmentGrants(nodeId)
      return NextResponse.json({ grants })
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
    if (!canManageFileSettings(session.user.role)) {
      return NextResponse.json({ error: "Forbidden — Super Admin only" }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const type = String(body.type || "")

    if (type === "USER_MODULE") {
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

    if (type === "NODE_USER" || type === "NODE_ROLE") {
      const nodeId = String(body.nodeId || "")
      const canRead = body.canRead !== false
      const canWrite = body.canWrite !== false
      const canDelete = body.canDelete === true
      if (!nodeId) return NextResponse.json({ error: "nodeId required" }, { status: 400 })

      const node = (await db.$queryRawUnsafe(
        `SELECT "id","kind","driveFolderId","name" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
        nodeId
      )) as Array<{ id: string; kind: string; driveFolderId: string | null; name: string }>
      if (!node[0] || node[0].kind !== "DEPARTMENT") {
        return NextResponse.json({ error: "Grants attach to DEPARTMENT nodes only" }, { status: 400 })
      }

      if (body.removeId) {
        const existing = (await db.$queryRawUnsafe(
          `SELECT * FROM "FileAccessGrant" WHERE "id" = ? LIMIT 1`,
          String(body.removeId)
        )) as Array<{ id: string; userId: string | null; scope: string }>
        await db.$executeRawUnsafe(`DELETE FROM "FileAccessGrant" WHERE "id" = ?`, String(body.removeId))
        if (existing[0]?.userId && node[0].driveFolderId) {
          const personalGmail = await getGoogleEditEmailForUser(existing[0].userId)
          if (personalGmail) {
            try {
              await unshareDriveFolderFromEmail(node[0].driveFolderId, personalGmail)
            } catch (e) {
              console.warn("[files/access] unshare failed", e)
            }
          }
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

      // Do NOT share whole department folders with personal Gmail.
      // Browse/upload stays in Trishulhub via service account (info@).
      // Per-file writer share happens only when the user clicks Open/Edit.

      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "ASSIGN",
        entityType: "FileAccessGrant",
        entityId: id,
        description: `Granted ${type} access on department ${node[0].name}`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ ok: true, id })
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 })
  } catch (err) {
    console.error("[files/access] PUT", err)
    return NextResponse.json({ error: "Failed to update access" }, { status: 500 })
  }
}
