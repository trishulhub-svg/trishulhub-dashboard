import { db } from "@/lib/db"

// ── File Access Levels ──
export const FILE_ACCESS = {
  OWNER: "OWNER",   // Creator of the file — full control
  ADMIN: "ADMIN",   // Can manage permissions + edit
  EDIT: "EDIT",     // Can edit content, rename, move
  VIEW: "VIEW",     // Can only view/download
} as const
export type FileAccessLevel = (typeof FILE_ACCESS)[keyof typeof FILE_ACCESS]

/**
 * Check if a user is a super admin (only SUPER_ADMIN)
 */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/**
 * Check if a user is an admin (SUPER_ADMIN or ADMIN)
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/**
 * Get the effective file access level for a user.
 * Super Admin always gets ADMIN. File creator gets OWNER.
 * Otherwise, checks FilePermission table. Checks parent folders if no direct permission.
 */
export async function getFileAccessLevel(
  fileId: string,
  userId: string,
  role: string,
  _depth: number = 0
): Promise<FileAccessLevel | null> {
  // Admin (SUPER_ADMIN and ADMIN) has ADMIN on everything
  if (isAdmin(role)) return FILE_ACCESS.ADMIN

  // Max recursion depth for folder traversal
  if (_depth > 10) return null

  const file = await db.fileMetadata.findUnique({
    where: { id: fileId },
    select: { createdBy: true, parentId: true },
  })

  if (!file) return null

  // Creator is always OWNER
  if (file.createdBy === userId) return FILE_ACCESS.OWNER

  // Check direct permission on this file
  const perm = await db.filePermission.findUnique({
    where: { fileId_userId: { fileId, userId } },
    select: { accessLevel: true },
  })

  if (perm) return perm.accessLevel as FileAccessLevel

  // Check parent folder permission (inheritance)
  if (file.parentId) {
    return getFileAccessLevel(file.parentId, userId, role, _depth + 1)
  }

  return null
}

/**
 * Check if a user can perform a specific action on a file.
 * Actions: view, download, edit, delete, manage_permissions
 */
export async function canPerformFileAction(
  fileId: string,
  userId: string,
  role: string,
  action: "view" | "download" | "edit" | "delete" | "manage_permissions"
): Promise<boolean> {
  const access = await getFileAccessLevel(fileId, userId, role)
  if (!access) return false

  switch (action) {
    case "view":
    case "download":
      return access === FILE_ACCESS.OWNER || access === FILE_ACCESS.ADMIN || access === FILE_ACCESS.EDIT || access === FILE_ACCESS.VIEW
    case "edit":
      return access === FILE_ACCESS.OWNER || access === FILE_ACCESS.ADMIN || access === FILE_ACCESS.EDIT
    case "delete":
      return access === FILE_ACCESS.OWNER || access === FILE_ACCESS.ADMIN
    case "manage_permissions":
      return access === FILE_ACCESS.OWNER || access === FILE_ACCESS.ADMIN
    default:
      return false
  }
}

/**
 * Get all descendant file IDs under a folder (recursive).
 * Returns an array of FileMetadata.id values.
 */
export async function getDescendantFileIds(parentDriveId: string, depth: number = 0): Promise<string[]> {
  if (depth > 10) return []

  const children = await db.fileMetadata.findMany({
    where: { parentId: parentDriveId },
    select: { id: true, driveFileId: true },
  })

  let ids: string[] = children.map(c => c.id)

  for (const child of children) {
    const subIds = await getDescendantFileIds(child.driveFileId, depth + 1)
    ids = ids.concat(subIds)
  }

  return ids
}

/**
 * Get the list of project IDs that a user has access to.
 * SUPER_ADMIN and ADMIN see all projects (returns null to indicate "no filter needed").
 * CLIENT users see projects belonging to their linked client record.
 * DEVELOPER / VIEWER see only projects they are members of.
 * 
 * @returns Array of project IDs the user has access to, or null if admin (all access)
 */
export async function getAssignedProjectIds(userId: string, role: string): Promise<string[] | null> {
  // SUPER_ADMIN and ADMIN can see all projects
  if (isAdmin(role)) return null

  // CLIENT users: find projects via their linked Client record
  if (role === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) return []
    const projects = await db.project.findMany({
      where: { clientId: client.id },
      select: { id: true },
    })
    return projects.map(p => p.id)
  }

  // ADMIN, DEVELOPER, VIEWER: only see projects they are members of
  const memberships = await db.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  })
  
  return memberships.map(m => m.projectId)
}

/**
 * Get the list of client IDs associated with a developer's assigned projects.
 * CLIENT users get their own linked client ID.
 * Useful for filtering clients, invoices, etc.
 */
export async function getAssignedClientIds(userId: string, role: string): Promise<string[] | null> {
  // SUPER_ADMIN and ADMIN can see all clients
  if (isAdmin(role)) return null

  // CLIENT users: return their own linked client ID
  if (role === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    return client ? [client.id] : []
  }

  const projectIds = await getAssignedProjectIds(userId, role)
  if (!projectIds || projectIds.length === 0) return []

  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { clientId: true },
  })
  
  return [...new Set(projects.map(p => p.clientId))]
}
