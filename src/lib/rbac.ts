import { db } from "@/lib/db"

/**
 * Check if a user is an admin (SUPER_ADMIN or ADMIN)
 */
export function isAdmin(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/**
 * Get the list of project IDs that a developer is assigned to.
 * Admins see all projects (returns null to indicate "no filter needed").
 * CLIENT users see projects belonging to their linked client record.
 * 
 * @returns Array of project IDs the user has access to, or null if admin (all access)
 */
export async function getAssignedProjectIds(userId: string, role: string): Promise<string[] | null> {
  // Admins can see all projects
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

  // Developers only see projects they're members of
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
