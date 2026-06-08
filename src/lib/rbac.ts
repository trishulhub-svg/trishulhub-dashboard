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
 * Uses a recursive CTE for a single-query traversal.
 * Returns an array of FileMetadata.id values.
 */
export async function getDescendantFileIds(folderId: string): Promise<string[]> {
  const rows: Array<{ id: string }> = await db.$queryRawUnsafe(
    `WITH RECURSIVE descendants AS (
      SELECT id FROM "FileMetadata" WHERE "parentId" = ?
      UNION ALL
      SELECT f.id FROM "FileMetadata" f JOIN descendants d ON f."parentId" = d.id
    )
    SELECT id FROM descendants`,
    folderId
  )
  return rows.map((r: any) => r.id)
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
  // NOTE: VIEWER role gets project IDs here which may grant indirect access to financial data.
  // Consider adding canViewFinancialData() check in finance API routes.

  // SUPER_ADMIN and ADMIN can see all projects
  if (isAdmin(role)) return null

  // CLIENT users: find projects via their linked Client record
  if (role === "CLIENT") {
    const clientProjects: Array<{ id: string }> = await db.$queryRawUnsafe(
      'SELECT p.id FROM "Project" p JOIN "Client" c ON p."clientId" = c.id WHERE c."userId" = ?',
      userId
    )
    return clientProjects.map((cp) => cp.id)
  }

  // VIEWER: read-only access, filtered by project membership
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
  
  return [...new Set(projects.map(p => p.clientId).filter((id): id is string => !!id))]
}

/** Check if user can manage finance (invoices, expenses, subscriptions) */
export function canManageFinance(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN"].includes(role)
}

/** Check if user can manage contracts (restrict to admins) */
export function canManageContracts(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN"].includes(role)
}

/** Check if user can manage deals (CRM pipeline) */
export function canManageDeals(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role)
}

/** Check if user can view financial data (reports, analytics) */
export function canViewFinancialData(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role)
}

// === HR RBAC Functions ===

export function canManageLeave(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

export function canApproveLeave(role: string, isOwnLeave: boolean): boolean {
  // Users can cancel their own leaves. Admins/Managers can approve/reject.
  if (isOwnLeave) return true;
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

export function canManageAttendance(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

export function canManageTraining(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

export function canManageEmployees(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN"].includes(role);
}

export function canViewHRData(role: string, isOwnData: boolean): boolean {
  if (isOwnData) return true;
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

// TODO: Phase 7 — Add own-data vs team-data separation function:
// canViewTeamHRData(role, userId, targetUserId, teamMemberIds) 
// that checks if targetUserId is in the user's managed team

// === Phase 8 RBAC Functions ===

/** Check if user can manage support tickets (assign, resolve, close) */
export function canManageSupport(role: string): boolean {
  return isAdmin(role)
}

/** Check if user can manage approvals (approve, reject, request improvements) */
export function canManageApprovals(role: string): boolean {
  return isAdmin(role)
}

/** Check if user can manage API keys (create, update, rotate, delete) — restricted to super admins */
export function canManageApiKeys(role: string): boolean {
  return isSuperAdmin(role)
}

/** Check if user can manage protocol settings (versions, invites, access) — restricted to super admins */
export function canManageProtocol(role: string): boolean {
  return isSuperAdmin(role)
}

/** Check if user can manage notifications (send, mark read, preferences) */
export function canManageNotifications(role: string): boolean {
  return isAdmin(role)
}
