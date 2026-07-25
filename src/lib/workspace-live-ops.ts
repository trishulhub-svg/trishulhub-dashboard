/**
 * Shared Live Operations / Long Horizon payload for workspace.
 * Used by /api/workspace/live-ops and /api/bootstrap/workspace.
 */
import { db } from "@/lib/db"

export type LiveOpsActiveUser = {
  userId: string
  name: string | null
  projectId: string | null
  projectName: string | null
  clockInAt: string
  elapsedSec: number
}

export type LiveOpsProject = {
  projectId: string
  name: string
  progress: number
  status: string
  activeUserCount: number
  isActive: boolean
}

type ProjectRow = {
  id: string
  name: string
  progress: number | null
  status: string
}

function toLiveProject(
  p: ProjectRow,
  activeUserCount: number,
  isActive: boolean
): LiveOpsProject {
  return {
    projectId: p.id,
    name: p.name,
    progress: Math.min(99, p.progress ?? 0),
    status: p.status,
    activeUserCount,
    isActive,
  }
}

/**
 * Long Horizon list rules:
 * - Always include every distinct project with a clocked-in user (no cap).
 * - If fewer than 3 active projects, fill with recent incomplete projects
 *   (excluding already-listed active ones) up to 3 total.
 * - If nobody is clocked in, show up to 3 recent incomplete projects.
 */
async function buildLiveProjects(
  activeProjectIdsOrdered: string[],
  activeUserCountByProject: Map<string, number>
): Promise<LiveOpsProject[]> {
  const uniqueActiveIds: string[] = []
  const seen = new Set<string>()
  for (const id of activeProjectIdsOrdered) {
    if (!seen.has(id)) {
      seen.add(id)
      uniqueActiveIds.push(id)
    }
  }

  const activeRows =
    uniqueActiveIds.length > 0
      ? await db.project.findMany({
          where: { id: { in: uniqueActiveIds } },
          select: { id: true, name: true, progress: true, status: true },
        })
      : []

  const byId = new Map(activeRows.map((p) => [p.id, p as ProjectRow]))
  const activeLive: LiveOpsProject[] = []
  for (const id of uniqueActiveIds) {
    const p = byId.get(id)
    if (!p) continue
    activeLive.push(toLiveProject(p, activeUserCountByProject.get(p.id) ?? 0, true))
  }

  // 3+ distinct active projects → show all of them (may exceed 3)
  if (activeLive.length >= 3) return activeLive

  const need = 3 - activeLive.length
  const recent = await db.project.findMany({
    where: {
      AND: [
        { progress: { lt: 100 } },
        { status: { not: "COMPLETED" } },
        ...(uniqueActiveIds.length > 0 ? [{ id: { notIn: uniqueActiveIds } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: need,
    select: { id: true, name: true, progress: true, status: true },
  })

  return [
    ...activeLive,
    ...recent.map((p) => toLiveProject(p, 0, false)),
  ]
}

export async function loadLiveOpsPayload(currentUserId?: string): Promise<{
  activeUsers: LiveOpsActiveUser[]
  liveProjects: LiveOpsProject[]
  hasActiveSession: boolean
}> {
  const [activeEntries, myActiveCount] = await Promise.all([
    db.timeEntry.findMany({
      where: { status: "ACTIVE", clockOut: null },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: "desc" },
      take: 100,
    }),
    currentUserId
      ? db.timeEntry.count({
          where: { userId: currentUserId, status: "ACTIVE", clockOut: null },
        })
      : Promise.resolve(0),
  ])

  const now = Date.now()
  const activeUsers: LiveOpsActiveUser[] = activeEntries
    .filter((e) => e.user)
    .map((e) => ({
      userId: e.user!.id,
      name: e.user!.name,
      projectId: e.project?.id ?? null,
      projectName: e.project?.name ?? null,
      clockInAt:
        e.clockIn instanceof Date
          ? e.clockIn.toISOString()
          : new Date(e.clockIn).toISOString(),
      elapsedSec: Math.max(
        0,
        Math.floor(
          (now -
            (e.clockIn instanceof Date
              ? e.clockIn.getTime()
              : new Date(e.clockIn).getTime())) /
            1000
        )
      ),
    }))

  const activeUserCountByProject = new Map<string, number>()
  const activeProjectIdsOrdered: string[] = []
  for (const u of activeUsers) {
    if (!u.projectId) continue
    activeProjectIdsOrdered.push(u.projectId)
    activeUserCountByProject.set(
      u.projectId,
      (activeUserCountByProject.get(u.projectId) ?? 0) + 1
    )
  }

  const liveProjects = await buildLiveProjects(
    activeProjectIdsOrdered,
    activeUserCountByProject
  )

  return {
    activeUsers,
    liveProjects,
    hasActiveSession: myActiveCount > 0,
  }
}
