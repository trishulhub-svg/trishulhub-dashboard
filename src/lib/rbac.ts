
import { db } from "@/lib/db"

/** Check if a user is a super admin (only SUPER_ADMIN).
 * @param role - The user's role string.
 * @returns true if the user has SUPER_ADMIN role.
 */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/** Check if a user is an admin (SUPER_ADMIN or ADMIN).
 * NOTE: PROJECT_MANAGER is NOT an admin — it is a separate tier between
 * ADMIN and DEVELOPER. Use `isAdminOrProjectManager` when a feature should
 * also be available to project managers (e.g. project/client/credential
 * management, non-leave approvals).
 * @param role - The user's role string.
 * @returns true if the user has SUPER_ADMIN or ADMIN role.
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/** Check if a user is a project manager.
 * @param role - The user's role string.
 * @returns true if the user has PROJECT_MANAGER role.
 */
export function isProjectManager(role: string): boolean {
  return role === "PROJECT_MANAGER"
}

/** Check if a user is an admin OR a project manager.
 * Use this for features that should be available to project managers as well
 * as admins — e.g. project, client, credential, and non-leave approval
 * management. PROJECT_MANAGER has the same capabilities as ADMIN for these
 * features but is excluded from finance, CRM, team management, training,
 * leave approvals, availability, API keys, and protocol management.
 * @param role - The user's role string.
 * @returns true if the user has SUPER_ADMIN, ADMIN, or PROJECT_MANAGER role.
 */
export function isAdminOrProjectManager(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "PROJECT_MANAGER"
}

/**
 * Get the list of project IDs that a user has access to.
 * SUPER_ADMIN, ADMIN, and PROJECT_MANAGER see all projects (returns null to indicate "no filter needed").
 * CLIENT users see projects belonging to their linked client record.
 * DEVELOPER / VIEWER see only projects they are members of.
 *
 * @returns Array of project IDs the user has access to, or null if admin/pm (all access)
 */
export async function getAssignedProjectIds(userId: string, role: string): Promise<string[] | null> {
  // NOTE: VIEWER role gets project IDs here which may grant indirect access to financial data.
  // Consider adding canViewFinancialData() check in finance API routes.

  // SUPER_ADMIN, ADMIN, and PROJECT_MANAGER can see all projects
  if (isAdminOrProjectManager(role)) return null

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
  // SUPER_ADMIN, ADMIN, and PROJECT_MANAGER can see all clients
  if (isAdminOrProjectManager(role)) return null

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
  // NOTE: PROJECT_MANAGER is intentionally NOT included — leave approvals
  // are restricted to ADMIN/SUPER_ADMIN per requirements.
  if (isOwnLeave) return true;
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role);
}

export function canManageAttendance(role: string): boolean {
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

/** Check if user can manage approvals (approve, reject, request improvements).
 * PROJECT_MANAGER is included so they can manage non-leave approvals
 * (AI approvals, task approvals, etc.). Leave approvals are gated separately
 * via `canApproveLeave`. */
export function canManageApprovals(role: string): boolean {
  return isAdminOrProjectManager(role)
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

// === Audit Trail RBAC ===

/** Check if user can view the audit trail.
 * PROJECT_MANAGER is included so they can view audit logs (read-only —
 * export is gated by `canExportAuditTrail`). */
export function canViewAuditTrail(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"].includes(role)
}

/** Check if user can export audit trail data.
 * PROJECT_MANAGER is intentionally NOT included — export is admin-only. */
export function canExportAuditTrail(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN"].includes(role)
}

/** Get accessible departments for audit trail based on role.
 * PROJECT_MANAGER is treated like DEVELOPER/VIEWER — they only see their
 * own department. Only SUPER_ADMIN/ADMIN see all departments. */
export function getAccessibleDepartments(role: string, userDepartment?: string): string[] {
  const depts = ["BUSINESS", "TEAM_WORK", "HR_PEOPLE", "LEARNING", "SYSTEM"]
  if (["SUPER_ADMIN", "ADMIN"].includes(role)) return depts
  // DEVELOPER, VIEWER, and PROJECT_MANAGER can only see their own department
  if (userDepartment) return [userDepartment]
  return []
}
