/**
 * Shared project access helpers for /api/projects/* routes.
 * Keeps Admin / PROJECT_MANAGER / member checks consistent.
 */

import { db } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"

export const PROJECT_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/

export function isValidProjectId(id: string): boolean {
  return PROJECT_ID_REGEX.test(id)
}

/** Admin or PROJECT_MANAGER can manage any project. */
export function canManageProjects(role: string): boolean {
  return isAdminOrProjectManager(role)
}

/**
 * True if user may view project resources (infra read, etc.).
 * Admin/PM: always. Others: must be a ProjectMember.
 */
export async function canAccessProject(
  userId: string,
  role: string,
  projectId: string
): Promise<boolean> {
  if (isAdminOrProjectManager(role)) return true
  const membership = await db.projectMember.findFirst({
    where: { userId, projectId },
    select: { id: true },
  })
  return !!membership
}

/**
 * True if user may reveal/manage project secrets (credentials + infra tokens).
 * Restricted to Admin / PROJECT_MANAGER (not regular members).
 */
export function canManageProjectSecrets(role: string): boolean {
  return isAdminOrProjectManager(role)
}
