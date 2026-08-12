/**
 * File Management RBAC — role toggles (default) + custom user overrides +
 * department grants + private departments + per-file (ITEM_USER) grants.
 */

import { db } from "@/lib/db"
import { FILE_ACCESS_ROLES_KEY, ensureRootAndReview, ensureDriveFolder } from "@/lib/file-drive"
import { canManageFileReview, canManageFileSettings, isSuperAdmin } from "@/lib/rbac"

export const FILE_STAFF_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "HR",
  "PROJECT_MANAGER",
  "DEVELOPER",
] as const

export type FileStaffRole = (typeof FILE_STAFF_ROLES)[number]

export type FileRoleAccessMap = Record<FileStaffRole, boolean>

const DEFAULT_ROLE_ACCESS: FileRoleAccessMap = {
  SUPER_ADMIN: true,
  ADMIN: true,
  HR: true,
  PROJECT_MANAGER: true,
  DEVELOPER: true,
}

export const PRIVATE_DEPARTMENT_NAME = "Private"

export async function getFileRoleAccessMap(): Promise<FileRoleAccessMap> {
  const row = await db.appSetting.findUnique({ where: { key: FILE_ACCESS_ROLES_KEY } })
  if (!row?.value) return { ...DEFAULT_ROLE_ACCESS }
  try {
    const parsed = JSON.parse(row.value) as Partial<FileRoleAccessMap>
    return {
      SUPER_ADMIN: true, // always on
      ADMIN: parsed.ADMIN !== false,
      HR: parsed.HR !== false,
      PROJECT_MANAGER: parsed.PROJECT_MANAGER !== false,
      DEVELOPER: parsed.DEVELOPER !== false,
    }
  } catch {
    return { ...DEFAULT_ROLE_ACCESS }
  }
}

export async function saveFileRoleAccessMap(map: Partial<FileRoleAccessMap>): Promise<FileRoleAccessMap> {
  const next: FileRoleAccessMap = {
    SUPER_ADMIN: true,
    ADMIN: map.ADMIN !== false,
    HR: map.HR !== false,
    PROJECT_MANAGER: map.PROJECT_MANAGER !== false,
    DEVELOPER: map.DEVELOPER !== false,
  }
  await db.appSetting.upsert({
    where: { key: FILE_ACCESS_ROLES_KEY },
    create: { key: FILE_ACCESS_ROLES_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  return next
}

/** USER_MODULE grants: canRead false = explicit deny; canRead true = explicit allow */
export async function getUserModuleOverride(
  userId: string
): Promise<"ALLOW" | "DENY" | null> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "canRead" FROM "FileAccessGrant" WHERE "scope" = 'USER_MODULE' AND "userId" = ? LIMIT 1`,
      userId
    )) as Array<{ canRead: number | boolean }>
    if (!rows[0]) return null
    const v = rows[0].canRead
    return v === false || v === 0 ? "DENY" : "ALLOW"
  } catch {
    return null
  }
}

export async function setUserModuleOverride(
  userId: string,
  mode: "ALLOW" | "DENY" | "CLEAR"
): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM "FileAccessGrant" WHERE "scope" = 'USER_MODULE' AND "userId" = ?`,
    userId
  )
  if (mode === "CLEAR") return
  const id = `fag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  await db.$executeRawUnsafe(
    `INSERT INTO "FileAccessGrant" ("id","scope","userId","canRead","canWrite","canDelete","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
    id,
    "USER_MODULE",
    userId,
    mode === "ALLOW" ? 1 : 0,
    mode === "ALLOW" ? 1 : 0,
    0
  )
}

export async function canAccessFileModule(userId: string, role: string): Promise<boolean> {
  if (isSuperAdmin(role) || canManageFileSettings(role)) return true
  const override = await getUserModuleOverride(userId)
  if (override === "DENY") return false
  if (override === "ALLOW") return true
  const map = await getFileRoleAccessMap()
  if (role in map) return map[role as FileStaffRole] !== false
  return false
}

async function listPrivateDepartmentIds(): Promise<Set<string>> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileNode"
       WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND "isPrivate" = 1`
    )) as Array<{ id: string }>
    return new Set(rows.map((r) => r.id))
  } catch {
    return new Set()
  }
}

/**
 * Department node IDs the user may see.
 * null = all non-private departments (Admin/Super Admin get private too via caller).
 * Private departments are NEVER returned for non-admin roles.
 */
export async function getAllowedDepartmentIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  // Admin / Super Admin: all departments including private
  if (isSuperAdmin(role) || canManageFileReview(role)) return null

  const privateIds = await listPrivateDepartmentIds()

  try {
    const nodeRole = (await db.$queryRawUnsafe(
      `SELECT "nodeId" FROM "FileAccessGrant"
       WHERE "scope" = 'NODE_ROLE' AND "role" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
      role
    )) as Array<{ nodeId: string }>
    const nodeUser = (await db.$queryRawUnsafe(
      `SELECT "nodeId" FROM "FileAccessGrant"
       WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
      userId
    )) as Array<{ nodeId: string }>
    const ids = new Set<string>()
    for (const r of nodeRole) if (r.nodeId && !privateIds.has(r.nodeId)) ids.add(r.nodeId)
    for (const r of nodeUser) if (r.nodeId && !privateIds.has(r.nodeId)) ids.add(r.nodeId)

    // If no grants exist yet, fall back to all non-private departments
    if (ids.size === 0) {
      const any = (await db.$queryRawUnsafe(
        `SELECT COUNT(*) as c FROM "FileAccessGrant" WHERE "scope" IN ('NODE_ROLE','NODE_USER')`
      )) as Array<{ c: number }>
      if (!any[0] || Number(any[0].c) === 0) {
        const all = (await db.$queryRawUnsafe(
          `SELECT "id" FROM "FileNode"
           WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND ("isPrivate" = 0 OR "isPrivate" IS NULL)`
        )) as Array<{ id: string }>
        return all.map((r) => r.id)
      }
      return []
    }
    return [...ids]
  } catch {
    // Fail closed — never expand access on query errors
    return []
  }
}

/** True when NODE_ROLE / NODE_USER grants exist in the system. */
async function hasAnyNodeGrants(): Promise<boolean> {
  try {
    const any = (await db.$queryRawUnsafe(
      `SELECT COUNT(*) as c FROM "FileAccessGrant" WHERE "scope" IN ('NODE_ROLE','NODE_USER')`
    )) as Array<{ c: number }>
    return Boolean(any[0] && Number(any[0].c) > 0)
  } catch {
    return true // fail closed: assume grants exist so we require write checks
  }
}

/** Department-level write grant for role or user. */
export async function canWriteDepartment(
  userId: string,
  role: string,
  deptId: string
): Promise<boolean> {
  if (isSuperAdmin(role) || canManageFileReview(role)) return true
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileAccessGrant"
       WHERE "canWrite" = 1 AND "nodeId" = ? AND (
         ("scope" = 'NODE_USER' AND "userId" = ?)
         OR ("scope" = 'NODE_ROLE' AND "role" = ?)
       )
       LIMIT 1`,
      deptId,
      userId,
      role
    )) as Array<{ id: string }>
    if (rows[0]) return true
    // Bootstrap (no grants configured yet): allow write inside departments the user can see
    if (!(await hasAnyNodeGrants())) return true
    return false
  } catch {
    return false
  }
}

export async function canWriteFileNode(
  userId: string,
  role: string,
  nodeId: string
): Promise<boolean> {
  if (!(await canAccessFileModule(userId, role))) return false
  if (isSuperAdmin(role) || canManageFileReview(role)) return true
  if (!(await canAccessFileNode(userId, role, nodeId))) return false
  const deptId = await getDepartmentIdForNode(nodeId)
  if (!deptId) return false
  return canWriteDepartment(userId, role, deptId)
}

export async function canWriteFiles(userId: string, role: string): Promise<boolean> {
  if (!(await canAccessFileModule(userId, role))) return false
  if (isSuperAdmin(role) || canManageFileReview(role)) return true
  try {
    if (!(await hasAnyNodeGrants())) return true
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileAccessGrant"
       WHERE "canWrite" = 1 AND (
         ("scope" = 'NODE_USER' AND "userId" = ?)
         OR ("scope" = 'NODE_ROLE' AND "role" = ?)
       )
       LIMIT 1`,
      userId,
      role
    )) as Array<{ id: string }>
    return Boolean(rows[0])
  } catch {
    return false
  }
}

export async function listDepartmentGrants(nodeId: string) {
  return db.$queryRawUnsafe(
    `SELECT "id","scope","role","userId","canRead","canWrite","canDelete"
     FROM "FileAccessGrant"
     WHERE "nodeId" = ? AND "scope" IN ('NODE_ROLE','NODE_USER')
     ORDER BY "createdAt" ASC`,
    nodeId
  ) as Promise<
    Array<{
      id: string
      scope: string
      role: string | null
      userId: string | null
      canRead: boolean
      canWrite: boolean
      canDelete: boolean
    }>
  >
}

export async function listItemGrants(itemId: string) {
  return db.$queryRawUnsafe(
    `SELECT g."id", g."userId", g."canRead", g."canWrite", u."name", u."email"
     FROM "FileAccessGrant" g
     LEFT JOIN "User" u ON u."id" = g."userId"
     WHERE g."scope" = 'ITEM_USER' AND g."itemId" = ?
     ORDER BY u."name" ASC`,
    itemId
  ) as Promise<
    Array<{
      id: string
      userId: string | null
      canRead: boolean
      canWrite: boolean
      name: string | null
      email: string | null
    }>
  >
}

/** Walk folder parents until DEPARTMENT. */
export async function getDepartmentIdForNode(nodeId: string): Promise<string | null> {
  let current: string | null = nodeId
  for (let i = 0; i < 40 && current; i++) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id","kind","parentId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      current
    )) as Array<{ id: string; kind: string; parentId: string | null }>
    if (!rows[0]) return null
    if (rows[0].kind === "DEPARTMENT") return rows[0].id
    current = rows[0].parentId
  }
  return null
}

export async function getDepartmentIdForItem(itemId: string): Promise<string | null> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileItem" WHERE "id" = ? LIMIT 1`,
    itemId
  )) as Array<{ nodeId: string }>
  if (!rows[0]?.nodeId) return null
  return getDepartmentIdForNode(rows[0].nodeId)
}

export async function hasItemUserGrant(userId: string, itemId: string): Promise<boolean> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileAccessGrant"
       WHERE "scope" = 'ITEM_USER' AND "userId" = ? AND "itemId" = ? AND "canRead" = 1 LIMIT 1`,
      userId,
      itemId
    )) as Array<{ id: string }>
    return Boolean(rows[0])
  } catch {
    return false
  }
}

export async function isDepartmentPrivate(deptId: string | null | undefined): Promise<boolean> {
  if (!deptId) return false
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "isPrivate" FROM "FileNode" WHERE "id" = ? AND "kind" = 'DEPARTMENT' LIMIT 1`,
      deptId
    )) as Array<{ isPrivate: number | boolean | null }>
    const v = rows[0]?.isPrivate
    return v === true || v === 1
  } catch {
    return false
  }
}

/** Files shared to this user via ITEM_USER (excludes private-department files). */
export async function listSharedFileItemsForUser(userId: string) {
  try {
    return (await db.$queryRawUnsafe(
      `SELECT i."id", i."name", i."mimeType", i."sizeBytes", i."webViewLink", i."nodeId"
       FROM "FileAccessGrant" g
       INNER JOIN "FileItem" i ON i."id" = g."itemId"
       WHERE g."scope" = 'ITEM_USER' AND g."userId" = ? AND g."canRead" = 1
         AND i."deletedAt" IS NULL AND g."itemId" IS NOT NULL
       ORDER BY i."name" ASC
       LIMIT 200`,
      userId
    )) as Array<{
      id: string
      name: string
      mimeType: string | null
      sizeBytes: number
      webViewLink: string | null
      nodeId: string
    }>
  } catch {
    return []
  }
}

/** Can this user read/open a specific file? */
export async function canAccessFileItem(
  userId: string,
  role: string,
  itemId: string
): Promise<boolean> {
  if (!(await canAccessFileModule(userId, role))) return false
  if (isSuperAdmin(role) || canManageFileReview(role)) return true

  const deptId = await getDepartmentIdForItem(itemId)
  // Private departments stay Admin / Super Admin only — no ITEM_USER bypass
  if (await isDepartmentPrivate(deptId)) return false

  if (await hasItemUserGrant(userId, itemId)) return true

  if (!deptId) return false
  const allowed = await getAllowedDepartmentIds(userId, role)
  if (allowed === null) return true
  return allowed.includes(deptId)
}

/** Can this user browse into a node (folder/category/dept)? */
export async function canAccessFileNode(
  userId: string,
  role: string,
  nodeId: string
): Promise<boolean> {
  if (!(await canAccessFileModule(userId, role))) return false
  if (isSuperAdmin(role) || canManageFileReview(role)) return true
  const deptId = await getDepartmentIdForNode(nodeId)
  if (!deptId) return false
  if (await isDepartmentPrivate(deptId)) return false
  const allowed = await getAllowedDepartmentIds(userId, role)
  if (allowed === null) return true
  return allowed.includes(deptId)
}

/**
 * Ensure the Admin/Super-Admin-only "Private" department exists.
 * Safe to call on Files root load for admins.
 */
export async function ensurePrivateDepartment(actorUserId: string): Promise<string | null> {
  try {
    const existing = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileNode"
       WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND "isPrivate" = 1
       ORDER BY "createdAt" ASC LIMIT 1`
    )) as Array<{ id: string }>
    if (existing[0]?.id) return existing[0].id

    // Also treat a non-private dept named Private as the private one (upgrade)
    const byName = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileNode"
       WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL AND "parentId" IS NULL
         AND lower("name") = 'private'
       LIMIT 1`
    )) as Array<{ id: string }>
    if (byName[0]?.id) {
      await db.$executeRawUnsafe(
        `UPDATE "FileNode" SET "isPrivate" = 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        byName[0].id
      )
      return byName[0].id
    }

    const { rootFolderId } = await ensureRootAndReview()
    const driveFolderId = await ensureDriveFolder(PRIVATE_DEPARTMENT_NAME, rootFolderId)
    const id = `fn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    await db.$executeRawUnsafe(
      `INSERT INTO "FileNode" ("id","kind","name","parentId","driveFolderId","isPrivate","sortOrder","createdById","createdAt","updatedAt")
       VALUES (?,?,?,?,?,1,0,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      id,
      "DEPARTMENT",
      PRIVATE_DEPARTMENT_NAME,
      null,
      driveFolderId,
      actorUserId
    )
    return id
  } catch (e) {
    console.warn("[file-access] ensurePrivateDepartment failed:", e)
    return null
  }
}
