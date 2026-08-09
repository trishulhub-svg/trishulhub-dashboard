
import { db } from "@/lib/db"

/** Check if a user is a super admin (only SUPER_ADMIN). */
export function isSuperAdmin(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/**
 * Staff admin tier: SUPER_ADMIN, ADMIN, or HR.
 * HR matches ADMIN for people/ops (team, CRM, audit, leaves, etc.)
 * but is excluded from finance and Super-Admin-only systems.
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "HR"
}

/** Classic company admin without HR — finance, billing, money. */
export function canAccessFinance(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/** API Keys vault — Super Admin only. */
export function canManageApiKeys(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/** File module role-access + Drive credentials — Super Admin only. */
export function canManageFileSettings(role: string): boolean {
  return role === "SUPER_ADMIN"
}

/** Soft-delete Review folder managers. */
export function canManageFileReview(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/** Files on mobile browsers — Admin + Super Admin only (staff stay desktop-only). */
export function canUseFilesOnMobile(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/** Check if a user is an admin OR a project manager. */
export function isAdminOrProjectManager(role: string): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "ADMIN" ||
    role === "HR" ||
    role === "PROJECT_MANAGER"
  )
}

/**
 * Get the list of project IDs that a user has access to.
 * SUPER_ADMIN, ADMIN, HR, and PROJECT_MANAGER see all projects (null = no filter).
 */
export async function getAssignedProjectIds(userId: string, role: string): Promise<string[] | null> {
  if (isAdminOrProjectManager(role)) return null

  if (role === "CLIENT") {
    const clientProjects: Array<{ id: string }> = await db.$queryRawUnsafe(
      'SELECT p.id FROM "Project" p JOIN "Client" c ON p."clientId" = c.id WHERE c."userId" = ?',
      userId
    )
    return clientProjects.map((cp) => cp.id)
  }

  const memberships = await db.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  })
  const ids = new Set(memberships.map((m) => m.projectId))

  try {
    const milestoneProjects = (await db.$queryRawUnsafe(
      `SELECT DISTINCT m."projectId" as "projectId"
       FROM "ProjectMilestone" m
       INNER JOIN "ProjectMilestoneAssignee" a ON a."milestoneId" = m."id"
       WHERE a."userId" = ?`,
      userId
    )) as Array<{ projectId: string }>
    for (const row of milestoneProjects) {
      if (row?.projectId) ids.add(row.projectId)
    }
  } catch {
    /* non-fatal */
  }

  return [...ids]
}

export async function getAssignedClientIds(userId: string, role: string): Promise<string[] | null> {
  if (isAdminOrProjectManager(role)) return null

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

  return [...new Set(projects.map((p) => p.clientId).filter((id): id is string => !!id))]
}

export function canManageApprovals(role: string): boolean {
  return isAdminOrProjectManager(role)
}

export function canViewAuditTrail(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "HR", "PROJECT_MANAGER", "DEVELOPER"].includes(role)
}

export function canExportAuditTrail(role: string): boolean {
  return ["SUPER_ADMIN", "ADMIN", "HR"].includes(role)
}

export function getAccessibleDepartments(role: string, userDepartment?: string): string[] {
  const depts = ["BUSINESS", "TEAM_WORK", "HR_PEOPLE", "LEARNING", "SYSTEM", "FILES"]
  if (["SUPER_ADMIN", "ADMIN", "HR"].includes(role)) return depts
  if (userDepartment) return [userDepartment]
  return []
}
