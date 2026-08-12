/**
 * Keep Google Drive ACLs aligned with Trishulhub Files grants.
 *
 * Root cause of "Request access" for Admin/SA:
 * Trishulhub RBAC lets them see everything, but Drive folders were never shared
 * to their Gmail (NODE_ROLE is skipped for Admin). Fix: share every department
 * (and root) they are allowed to see — including all depts for Admin/SA.
 */

import { db } from "@/lib/db"
import {
  shareDriveFolderWithEmail,
  unshareDriveFolderFromEmail,
  ensureNodeDriveFolder,
  ensureRootAndReview,
} from "@/lib/file-drive"
import {
  getGoogleEditEmailForUser,
  getGoogleShareEmailsForUser,
  normalizeGoogleEditEmail,
} from "@/lib/file-google-email"
import { FILE_STAFF_ROLES } from "@/lib/file-access"
import { canManageFileReview, isSuperAdmin } from "@/lib/rbac"

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

/** Share one Drive file/folder with every Google identity for the user. */
export async function shareDriveTargetWithUser(
  driveId: string | null | undefined,
  userId: string,
  role: "reader" | "writer" = "writer"
): Promise<{ ok: boolean; email?: string; emails?: string[]; error?: string }> {
  if (!driveId) return { ok: false, error: "No Drive id" }
  const emails = await getGoogleShareEmailsForUser(userId)
  if (!emails.length) return { ok: false, error: "User has no Google email" }

  const errors: string[] = []
  let anyOk = false
  for (const email of emails) {
    try {
      await shareDriveFolderWithEmail(driveId, email, role)
      anyOk = true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[file-drive-acl] share failed", driveId, email, msg)
      errors.push(`${email}: ${msg.slice(0, 100)}`)
    }
  }
  if (!anyOk) {
    return { ok: false, emails, error: errors[0] || "Share failed" }
  }
  return { ok: true, email: emails[0], emails }
}

export async function unshareDriveTargetFromUser(
  driveId: string | null | undefined,
  userId: string,
  emailOverride?: string | null
): Promise<void> {
  if (!driveId) return
  if (emailOverride) {
    try {
      await unshareDriveFolderFromEmail(driveId, emailOverride)
    } catch (e) {
      console.warn("[file-drive-acl] unshare failed", driveId, emailOverride, e)
    }
    return
  }
  const emails = await getGoogleShareEmailsForUser(userId)
  for (const email of emails) {
    try {
      await unshareDriveFolderFromEmail(driveId, email)
    } catch (e) {
      console.warn("[file-drive-acl] unshare failed", driveId, email, e)
    }
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
      map[role] = [] // admins see all via RBAC; Drive sync uses all departments
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

async function listAllDepartmentIds(includePrivate: boolean): Promise<string[]> {
  if (includePrivate) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id" FROM "FileNode" WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL`
    )) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }
  const rows = (await db.$queryRawUnsafe(
    `SELECT "id" FROM "FileNode"
     WHERE "kind" = 'DEPARTMENT' AND "deletedAt" IS NULL
       AND ("isPrivate" = 0 OR "isPrivate" IS NULL)`
  )) as Array<{ id: string }>
  return rows.map((r) => r.id)
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
 */
export async function setRoleDepartmentAccess(
  role: string,
  nodeIds: string[]
): Promise<{ added: number; removed: number; driveWarnings: string[] }> {
  if (role === "SUPER_ADMIN" || role === "ADMIN") {
    // Still refresh Admin/SA Drive ACL (all departments) when someone "saves" access settings
    const warnings: string[] = []
    try {
      await syncAdminDriveAccessForAllAdmins()
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : "Admin Drive sync failed")
    }
    return {
      added: 0,
      removed: 0,
      driveWarnings: warnings.length
        ? warnings
        : ["Admin / Super Admin get all departments on Drive automatically"],
    }
  }
  if (!FILE_STAFF_ROLES.includes(role as (typeof FILE_STAFF_ROLES)[number])) {
    throw new Error("Invalid role")
  }

  const uniqueDesired = [...new Set(nodeIds.filter(Boolean))]
  const driveWarnings: string[] = []

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

/**
 * Department IDs a user should have on Drive.
 * Admin / Super Admin → ALL departments (including private).
 * Others → NODE_USER + NODE_ROLE.
 */
export async function listUserGrantedDepartmentIds(userId: string, role: string): Promise<string[]> {
  if (isSuperAdmin(role) || canManageFileReview(role)) {
    return listAllDepartmentIds(true)
  }

  const ids = new Set<string>()
  const nodeUser = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileAccessGrant"
     WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
    userId
  )) as Array<{ nodeId: string }>
  for (const r of nodeUser) if (r.nodeId) ids.add(r.nodeId)

  const nodeRole = await listRoleDepartmentIds(role)
  for (const id of nodeRole) ids.add(id)
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

/** Walk node → parents and collect Drive folder IDs (leaf first). */
export async function listAncestorDriveFolderIds(nodeId: string): Promise<string[]> {
  const ids: string[] = []
  let current: string | null = nodeId
  for (let i = 0; i < 40 && current; i++) {
    const rows = (await db.$queryRawUnsafe(
      `SELECT "id","parentId","driveFolderId" FROM "FileNode" WHERE "id" = ? AND "deletedAt" IS NULL LIMIT 1`,
      current
    )) as Array<{ id: string; parentId: string | null; driveFolderId: string | null }>
    if (!rows[0]) break
    if (rows[0].driveFolderId) ids.push(rows[0].driveFolderId)
    else {
      try {
        const ensured = await ensureNodeDriveFolder(rows[0].id)
        if (ensured) ids.push(ensured)
      } catch {
        /* ignore */
      }
    }
    current = rows[0].parentId
  }
  return ids
}

/**
 * Share a Drive file AND its folder ancestors with the user (both login + personal Gmail).
 * Call this before returning a Google open link.
 */
export async function ensureDriveAccessForOpen(opts: {
  userId: string
  driveFileId?: string | null
  nodeId?: string | null
}): Promise<{ sharedWith: string[]; warnings: string[] }> {
  const warnings: string[] = []
  const sharedWith: string[] = []
  const emails = await getGoogleShareEmailsForUser(opts.userId)
  if (!emails.length) {
    return {
      sharedWith: [],
      warnings: [
        "No Google email on your profile. Set Personal Gmail on Team, or use a Gmail login — then reopen.",
      ],
    }
  }

  // Share only the file + ancestor folders — NEVER the Files root for every open.
  // Root writer access would bypass department isolation on Google Drive.
  const targets = new Set<string>()
  if (opts.driveFileId) targets.add(opts.driveFileId)
  if (opts.nodeId) {
    for (const id of await listAncestorDriveFolderIds(opts.nodeId)) targets.add(id)
  }

  for (const driveId of targets) {
    const result = await shareDriveTargetWithUser(driveId, opts.userId, "writer")
    if (result.ok && result.emails) {
      for (const e of result.emails) if (!sharedWith.includes(e)) sharedWith.push(e)
    } else if (result.error) {
      warnings.push(result.error)
    }
  }
  return { sharedWith, warnings }
}

/**
 * Rematerialize Drive ACL for a user after email/role change, or when entering Files.
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
  const newEmails = await getGoogleShareEmailsForUser(opts.userId)
  const primary = (await getGoogleEditEmailForUser(opts.userId)) || newEmails[0] || null

  const oldRole = opts.oldRole || opts.role
  const wasAdmin = isSuperAdmin(oldRole) || canManageFileReview(oldRole)
  const isAdmin = isSuperAdmin(opts.role) || canManageFileReview(opts.role)

  const nodeUserOnly = (await db.$queryRawUnsafe(
    `SELECT "nodeId" FROM "FileAccessGrant"
     WHERE "scope" = 'NODE_USER' AND "userId" = ? AND "canRead" = 1 AND "nodeId" IS NOT NULL`,
    opts.userId
  )) as Array<{ nodeId: string }>
  const oldRoleDepts = !wasAdmin && opts.oldRole ? await listRoleDepartmentIds(opts.oldRole) : []
  const oldDeptIds = await listUserGrantedDepartmentIds(opts.userId, oldRole)
  const unshareDeptSet = new Set<string>([
    ...nodeUserOnly.map((r) => r.nodeId),
    ...oldRoleDepts,
    ...oldDeptIds,
  ])

  const newDeptIds = await listUserGrantedDepartmentIds(opts.userId, opts.role)
  const itemDriveIds = await listUserGrantedItemDriveIds(opts.userId)

  if (oldEmailNorm) {
    for (const nodeId of unshareDeptSet) {
      const driveId = await departmentDriveId(nodeId)
      if (!driveId) continue
      // Don't unshare if still needed and same email still in newEmails
      if (newDeptIds.includes(nodeId) && newEmails.includes(oldEmailNorm)) continue
      await unshareDriveTargetFromEmail(driveId, oldEmailNorm)
      unshared += 1
    }
    for (const driveId of itemDriveIds) {
      if (newEmails.includes(oldEmailNorm)) continue
      await unshareDriveTargetFromEmail(driveId, oldEmailNorm)
      unshared += 1
    }
  }

  if (opts.oldRole && opts.oldRole !== opts.role && primary && !isAdmin) {
    const stillNeeded = new Set(newDeptIds)
    for (const nodeId of oldRoleDepts) {
      if (stillNeeded.has(nodeId)) continue
      if (nodeUserOnly.some((r) => r.nodeId === nodeId)) continue
      const driveId = await departmentDriveId(nodeId)
      if (!driveId) continue
      for (const email of newEmails) {
        await unshareDriveTargetFromEmail(driveId, email)
      }
      unshared += 1
    }
  }

  // Root Drive folder: Admin / Super Admin only (staff get their department folders, not the whole tree)
  try {
    const { rootFolderId } = await ensureRootAndReview()
    if (rootFolderId && isAdmin) {
      const result = await shareDriveTargetWithUser(rootFolderId, opts.userId, "writer")
      if (result.ok) shared += 1
      else if (result.error) warnings.push(result.error)
    }
  } catch (e) {
    warnings.push(e instanceof Error ? e.message.slice(0, 120) : "Root share failed")
  }

  if (newEmails.length) {
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

/** Push all department (+ root) Drive shares to every Admin / Super Admin. */
export async function syncAdminDriveAccessForAllAdmins(): Promise<{ users: number; shared: number }> {
  const admins = await db.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true, role: true },
  })
  let shared = 0
  for (const a of admins) {
    const result = await rematerializeUserDriveAccess({ userId: a.id, role: a.role })
    shared += result.shared
  }
  return { users: admins.length, shared }
}

/**
 * When a new department is created, share its Drive folder with everyone who should see it:
 * all Admins/SAs + roles that already have NODE_ROLE grants for... (new dept has none yet)
 * → just admins for a brand-new department.
 */
export async function shareNewDepartmentWithAdmins(nodeId: string): Promise<void> {
  const driveId = await departmentDriveId(nodeId)
  if (!driveId) return
  const admins = await db.user.findMany({
    where: { isActive: true, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  })
  for (const a of admins) {
    await shareDriveTargetWithUser(driveId, a.id, "writer")
  }
}

export async function shareDepartmentWithUser(nodeId: string, userId: string) {
  const driveId = await departmentDriveId(nodeId)
  return shareDriveTargetWithUser(driveId, userId, "writer")
}

export async function unshareDepartmentFromUser(nodeId: string, userId: string, emailOverride?: string | null) {
  const driveId = await departmentDriveId(nodeId)
  await unshareDriveTargetFromUser(driveId, userId, emailOverride)
}
