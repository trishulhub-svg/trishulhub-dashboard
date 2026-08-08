/**
 * File Management RBAC — role toggles (default) + custom user overrides + department grants.
 */

import { db } from "@/lib/db"
import { FILE_ACCESS_ROLES_KEY } from "@/lib/file-drive"
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

/** Department node IDs the user may see. null = all departments. */
export async function getAllowedDepartmentIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  if (isSuperAdmin(role) || canManageFileReview(role)) return null
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
    for (const r of nodeRole) if (r.nodeId) ids.add(r.nodeId)
    for (const r of nodeUser) if (r.nodeId) ids.add(r.nodeId)
    // If no grants exist yet, fall back to all departments (module access already checked)
    if (ids.size === 0) {
      const any = (await db.$queryRawUnsafe(
        `SELECT COUNT(*) as c FROM "FileAccessGrant" WHERE "scope" IN ('NODE_ROLE','NODE_USER')`
      )) as Array<{ c: number }>
      if (!any[0] || Number(any[0].c) === 0) return null
      return []
    }
    return [...ids]
  } catch {
    return null
  }
}

export async function canWriteFiles(userId: string, role: string): Promise<boolean> {
  if (!(await canAccessFileModule(userId, role))) return false
  if (isSuperAdmin(role) || canManageFileReview(role)) return true
  // Developers can upload when they have access; fine-tune via NODE grants later
  return true
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
