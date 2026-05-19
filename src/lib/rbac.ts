import { db } from "@/lib/db"

/**
 * Check if a user is an admin (SUPER_ADMIN or ADMIN)
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/**
 * Combined scope resolver: returns both project IDs and client IDs
 * in a single DB round-trip for developers (admins get null = all access).
 *
 * Previously getAssignedProjectIds and getAssignedClientIds were separate,
 * and getAssignedClientIds called getAssignedProjectIds again internally,
 * causing 3 sequential DB calls for every developer request.
 */
export async function getUserScope(userId: string, role: string): Promise<{
  projectIds: string[] | null
  clientIds: string[] | null
}> {
  // Admins see everything
  if (isAdmin(role)) return { projectIds: null, clientIds: null }

  // CLIENT users: get their linked client ID
  if (role === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) return { projectIds: [], clientIds: [] }
    const projects = await db.project.findMany({
      where: { clientId: client.id },
      select: { id: true },
    })
    return { projectIds: projects.map(p => p.id), clientIds: [client.id] }
  }

  // Developers: get project memberships + client IDs in one pass
  const memberships = await db.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  })
  const projectIds = memberships.map(m => m.projectId)

  if (projectIds.length === 0) return { projectIds: [], clientIds: [] }

  const projects = await db.project.findMany({
    where: { id: { in: projectIds } },
    select: { clientId: true },
  })
  const clientIds = [...new Set(projects.map(p => p.clientId).filter(Boolean))]

  return { projectIds, clientIds }
}

/**
 * Get the list of project IDs that a user is assigned to.
 * Kept for backward compatibility — delegates to getUserScope.
 */
export async function getAssignedProjectIds(userId: string, role: string): Promise<string[] | null> {
  const { projectIds } = await getUserScope(userId, role)
  return projectIds
}

/**
 * Get the list of client IDs associated with a user's projects.
 * Kept for backward compatibility — delegates to getUserScope.
 */
export async function getAssignedClientIds(userId: string, role: string): Promise<string[] | null> {
  const { clientIds } = await getUserScope(userId, role)
  return clientIds
}
