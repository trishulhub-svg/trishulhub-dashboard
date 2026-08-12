/**
 * Keep Google Drive ACLs aligned with Trishulhub Files grants.
 * Uses each user's personal Google edit email (googleEditEmail || login email).
 */

import { db } from "@/lib/db"
import { shareDriveFolderWithEmail, unshareDriveFolderFromEmail, ensureNodeDriveFolder } from "@/lib/file-drive"
import { getGoogleEditEmailForUser, normalizeGoogleEditEmail } from "@/lib/file-google-email"
import { FILE_STAFF_ROLES } from "@/lib/file-access"

function newGrantId() {
  return `fag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function departmentDriveId(nodeId: string): Promise<string | null> {
  try {
    return await ensureNodeDriveFolder(nodeId)
  } catch (e) {
    console.warn("[file-drive-acl] ensureNodeDriveFolder failed", nodeId, e)
    const rows = (await db.$queryRawUnsafe(
      `SELECT "driveFolderId" FROM "FileNode" WHERE "id" = ? LIMIT 1`,
      nodeId
    )) as Array<{ driveFolderId: string | null }>
    return rows[0]?.driveFolderId || null
  }
}

export async function shareDriveTargetWithUser(
  driveId: string | null | undefined,
  userId: string,
  role: "reader" | "writer" = "writer"
): Promise<{ ok: boolean; email?: string; error?: string }> {
  if (!driveId) return { ok: false, error: "No Drive id" }
  const email = await getGoogleEditEmailForUser(userId)
  if (!email) return { ok: false, error: "User has no Google email" }
  try {
    await shareDriveFolderWithEmail(driveId, email, role)
    return { ok: true, email }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn("[file-drive-acl] share failed", driveId, email, msg)
    return { ok: false, email, error: msg.slice(0, 160) }
  }
}

export async function unshareDriveTargetFromUser(
  driveId: string | null | undefined,
  userId: string,
  emailOverride?: string | null
): Promise<void> {
  if (!driveId) return
  const email = emailOverride || (await getGoogleEditEmailForUser(userId))
  if (!email) return
  try {
    await unshareDriveFolderFromEmail(driveId, email)
  } catch (e) {
    console.warn("[file-drive-acl] unshare failed", driveId, email, e)
  }
}

export async function unshareDriveTargetFromEmail(
  driveId: string | null | undefined,
  email: string | null | undefined
): Promise<void> {
  if (!driveId || !email) return
  try {
    await unshareDriveFolderFromEmail(driveId, email)
  } catch (e) {
    console.warn("[file-drive-acl] unshare email failed", driveId, email, e)
  }
}

/** Department node IDs granted to a role via NODE_ROLE. */
export async function listRoleDepartmentIds(role: string): Promise<string[]> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileAccessGrant"
     WHERE "scope" = 'NODE_ROLE' AND "role" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
    role
  )) as Array<{ nodeId: string }>
  return rows.map((r) => r.nodeId).filter(Boolean)
}

/** Map of staff role → department node IDs. */
export async function getRoleDepartmentMap(): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {}
  for (const role of FILE_STAFF_ROLES) {
    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      map[role] = [] // admins see all via RBAC; no NODE_ROLE needed
      continue
    }
    map[role] = await listRoleDepartmentIds(role)
  }
  return map
}

async function listActiveUsersByRole(role: string): Promise<Array<{ id: string }>> {
  return db.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  })
}

/** Share a department Drive folder with every active user of a role. */
export async function shareDepartmentWithRoleUsers(nodeId: string, role: string): Promise<void> {
  const driveId = await departmentDriveId(nodeId)
  if (!driveId) return
  const users = await listActiveUsersByRole(role)
  for (const u of users) {
    await shareDriveTargetWithUser(driveId, u.id, "writer")
  }
}

export async function unshareDepartmentFromRoleUsers(nodeId: string, role: string): Promise<void> {
  const driveId = await departmentDriveId(nodeId)
  if (!driveId) return
  const users = await listActiveUsersByRole(role)
  for (const u of users) {
    await unshareDriveTargetFromUser(driveId, u.id)
  }
}

/**
 * Replace NODE_ROLE department set for a staff role and sync Drive ACLs.
 * Future users with this role inherit the grants automatically (DB + rematerialize on create/role change).
 */
export async function setRoleDepartmentAccess(
  role: string,
  nodeIds: string[]
): Promise<{ added: number; removed: number; driveWarnings: string[] }> {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    return { added: 0, removed: 0, driveWarnings: ["Admin / Super Admin already see all departments"] }
  }
  if (!FILE_STAFF_ROLES.includes(role as (typeof FILE_STAFF_ROLES)[number])) {
    throw new Error("Invalid role")
  }

  const uniqueDesired = [...new Set(nodeIds.filter(Boolean))]
  const driveWarnings: string[] = []

  // Validate departments (non-private only)
  for (const nodeId of uniqueDesired) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id","kind","isPrivate","name" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
      nodeId
    )) as Array<{ id: string; kind: string; isPrivate: number | boolean | null; name: string }>
    if (!rows[0] || rows[0].kind !== "DEPARTMENT") {
      throw new Error("Invalid department")
    }
    if (rows[0].isPrivate === true || rows[0].isPrivate === 1) {
      throw new Error(`Private department “${rows[0].name}” cannot be granted to roles`)
    }
  }

  const existing = await listRoleDepartmentIds(role)
  const existingSet = new Set(existing)
  const desiredSet = new Set(uniqueDesired)
  const toAdd = uniqueDesired.filter((id) => !existingSet.has(id))
  const toRemove = existing.filter((id) => !desiredSet.has(id))

  for (const nodeId of toRemove) {
    await db.$executeRawUnsafe(
      `DELETE FROM "FileAccessGrant" WHERE "scope" = 'NODE_ROLE' AND "role" = ? AND "nodeId" = ?`,
      role,
      nodeId
    )
    try {
      await unshareDepartmentFromRoleUsers(nodeId, role)
    } catch (e) {
      driveWarnings.push(`Unshare failed for ${nodeId}`)
      console.warn("[file-drive-acl] role unshare", e)
    }
  }

  for (const nodeId of toAdd) {
    // avoid duplicates
    await db.$executeRawUnsafe(
      `DELETE FROM "FileAccessGrant" WHERE "scope" = 'NODE_ROLE' AND "role" = ? AND "nodeId" = ?`,
      role,
      nodeId
    )
    await db.$executeRawUnsafe(
      `INSERT INTO "FileAccessGrant" ("id","scope","role","userId","nodeId","canRead","canWrite","canDelete","createdAt","updatedAt")
       VALUES (?,?,?,?,?,1,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
      newGrantId(),
      "NODE_ROLE",
      role,
      null,
      nodeId
    )
    try {
      await shareDepartmentWithRoleUsers(nodeId, role)
    } catch (e) {
      driveWarnings.push(`Drive share failed for ${nodeId}`)
      console.warn("[file-drive-acl] role share", e)
    }
  }

  return { added: toAdd.length, removed: toRemove.length, driveWarnings }
}

/** Department IDs a user should access via NODE_USER + NODE_ROLE (non-admin). */
export async function listUserGrantedDepartmentIds(userId: string, role: string): Promise<string[]> {
  const ids = new Set<string>()
  const nodeUser = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileAccessGrant"
     WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
    userId
  )) as Array<{ nodeId: string }>
  for (const r of nodeUser) if (r.nodeId) ids.add(r.nodeId)

  if (role && role !== "SUPER_ADMIN" && role !== "ADMIN") {
    const nodeRole = await listRoleDepartmentIds(role)
    for (const id of nodeRole) ids.add(id)
  }
  return [...ids]
}

export async function listUserGrantedItemDriveIds(userId: string): Promise<string[]> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT i."driveFileId" FROM "FileAccessGrant" g
     INNER JOIN "FileItem" i ON i."id" = g."itemId"
     WHERE g."scope" = 'ITEM_USER' AND g."userId" = ? AND g."canRead" = 1
       AND i."deletedAt" IS NULL AND i."driveFileId" IS NOT NULL`,
    userId
  )) as Array<{ driveFileId: string }>
  return rows.map((r) => r.driveFileId).filter(Boolean)
}

/**
 * Rematerialize Drive ACL for a user after email or role change.
 * Unshares old email (if provided) from previous targets, then shares new email on current grants.
 */
export async function rematerializeUserDriveAccess(opts: {
  userId: string
  role: string
  oldEmail?: string | null
  oldRole?: string | null
}): Promise<{ shared: number; unshared: number; warnings: string[] }> {
  const warnings: string[] = []
  let shared = 0
  let unshared = 0

  const oldEmailNorm = normalizeGoogleEditEmail(opts.oldEmail || null)
  const newEmail = await getGoogleEditEmailForUser(opts.userId)

  const oldRole = opts.oldRole || opts.role
  const oldDeptIds = await listUserGrantedDepartmentIds(opts.userId, oldRole)
  // For old role departments we still need NODE_USER + old ROLE
  // Rebuild carefully: NODE_USER stays; NODE_ROLE uses oldRole for unshare set
  const nodeUserOnly = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileAccessGrant"
     WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
    opts.userId
  )) as Array<{ nodeId: string }>
  const oldRoleDepts = opts.oldRole ? await listRoleDepartmentIds(opts.oldRole) : []
  const unshareDeptSet = new Set<string>([
    ...nodeUserOnly.map((r) => r.nodeId),
    ...oldRoleDepts,
    ...oldDeptIds,
  ])

  const newDeptIds = await listUserGrantedDepartmentIds(opts.userId, opts.role)
  const itemDriveIds = await listUserGrantedItemDriveIds(opts.userId)

  // Unshare old email from old department folders + item files
  if (oldEmailNorm) {
    for (const nodeId of unshareDeptSet) {
      const driveId = await departmentDriveId(nodeId)
      if (!driveId) continue
      await unshareDriveTargetFromEmail(driveId, oldEmailNorm)
      unshared += 1
    }
    for (const driveId of itemDriveIds) {
      await unshareDriveTargetFromEmail(driveId, oldEmailNorm)
      unshared += 1
    }
  }

  // If role changed, also unshare new email from departments that belonged only to old role
  if (opts.oldRole && opts.oldRole !== opts.role && newEmail) {
    const stillNeeded = new Set(newDeptIds)
    for (const nodeId of oldRoleDepts) {
      if (stillNeeded.has(nodeId)) continue
      // keep if NODE_USER
      if (nodeUserOnly.some((r) => r.nodeId === nodeId)) continue
      const driveId = await departmentDriveId(nodeId)
      if (!driveId) continue
      await unshareDriveTargetFromEmail(driveId, newEmail)
      unshared += 1
    }
  }

  // Share current grants to new email
  if (newEmail) {
    for (const nodeId of newDeptIds) {
      const driveId = await departmentDriveId(nodeId)
      const result = await shareDriveTargetWithUser(driveId, opts.userId, "writer")
      if (result.ok) shared += 1
      else if (result.error) warnings.push(result.error)
    }
    for (const driveId of itemDriveIds) {
      const result = await shareDriveTargetWithUser(driveId, opts.userId, "writer")
      if (result.ok) shared += 1
      else if (result.error) warnings.push(result.error)
    }
  } else {
    warnings.push("No Google email on user — Drive share skipped. Set Personal Gmail on Team profile.")
  }

  return { shared, unshared, warnings }
}

export async function shareDepartmentWithUser(nodeId: string, userId: string) {
  const driveId = await departmentDriveId(nodeId)
  return shareDriveTargetWithUser(driveId, userId, "writer")
}

export async function unshareDepartmentFromUser(nodeId: string, userId: string, emailOverride?: string | null) {
  const driveId = await departmentDriveId(nodeId)
  await unshareDriveTargetFromUser(driveId, userId, emailOverride)
}
