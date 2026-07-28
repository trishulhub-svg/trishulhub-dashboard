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
  /** PROJECT | TRAINING | SUPERVISION | HR_ADMIN | RD_SA | null */
  activityType: string | null
  /** Human label for feed: project name, training title, or activity bucket */
  activityLabel: string | null
  clockInAt: string
  elapsedSec: number
}

function labelForActivity(opts: {
  activityType: string | null | undefined
  projectName: string | null | undefined
  trainingTitle: string | null | undefined
  description: string | null | undefined
}): string | null {
  const type = opts.activityType || null
  if (type === "TRAINING") {
    if (opts.trainingTitle?.trim()) return opts.trainingTitle.trim()
    // Fallback: "Training: Title" stored on the time entry description
    const desc = opts.description?.trim() || ""
    if (desc.toLowerCase().startsWith("training:")) {
      const rest = desc.slice("training:".length).trim()
      if (rest) return rest
    }
    return "Training"
  }
  if (type === "SUPERVISION") return "Supervision"
  if (type === "HR_ADMIN") return "HR & Administration"
  if (type === "RD_SA") return "R&D / SA"
  if (opts.projectName?.trim()) return opts.projectName.trim()
  return null
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
 * - If fewer than 3 active projects, fill with recently *worked* incomplete
 *   projects (by TimeEntry activity, excluding already-listed active ones)
 *   up to 3 total.
 * - If nobody is clocked in, show up to 3 recently worked incomplete projects.
 */
async function findRecentlyWorkedProjects(
  excludeIds: string[],
  need: number
): Promise<ProjectRow[]> {
  if (need <= 0) return []

  // Pull recent clock-ins and keep first-seen project ids (most recent work first).
  const recentEntries = await db.timeEntry.findMany({
    where: {
      projectId: {
        not: null,
        ...(excludeIds.length > 0 ? { notIn: excludeIds } : {}),
      },
    },
    orderBy: { clockIn: "desc" },
    take: 120,
    select: { projectId: true },
  })

  const orderedIds: string[] = []
  const seen = new Set<string>()
  for (const e of recentEntries) {
    const id = e.projectId
    if (!id || seen.has(id)) continue
    seen.add(id)
    orderedIds.push(id)
    // Gather extras in case some are completed / 100% progress
    if (orderedIds.length >= need * 4) break
  }

  if (orderedIds.length === 0) {
    // Fallback: previous behavior (project.updatedAt) if no time history yet
    return db.project.findMany({
      where: {
        AND: [
          { progress: { lt: 100 } },
          { status: { not: "COMPLETED" } },
          ...(excludeIds.length > 0 ? [{ id: { notIn: excludeIds } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: need,
      select: { id: true, name: true, progress: true, status: true },
    })
  }

  const rows = await db.project.findMany({
    where: {
      id: { in: orderedIds },
      // Recently worked projects count even if progress hit 100 but status
      // is not completed yet (common while closing out delivery).
      status: { not: "COMPLETED" },
    },
    select: { id: true, name: true, progress: true, status: true },
  })
  const byId = new Map(rows.map((p) => [p.id, p as ProjectRow]))
  const out: ProjectRow[] = []
  for (const id of orderedIds) {
    const p = byId.get(id)
    if (!p) continue
    out.push(p)
    if (out.length >= need) break
  }

  // If still short (few worked projects), top up via updatedAt — same filters
  if (out.length < need) {
    const already = new Set([...excludeIds, ...out.map((p) => p.id)])
    const topUp = await db.project.findMany({
      where: {
        AND: [
          { progress: { lt: 100 } },
          { status: { not: "COMPLETED" } },
          ...(already.size > 0 ? [{ id: { notIn: [...already] } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: need - out.length,
      select: { id: true, name: true, progress: true, status: true },
    })
    out.push(...(topUp as ProjectRow[]))
  }

  return out
}

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
  const recent = await findRecentlyWorkedProjects(uniqueActiveIds, need)

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

  const trainingIds = [
    ...new Set(
      activeEntries
        .map((e) => e.trainingAssignmentId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ]
  const trainingRows =
    trainingIds.length > 0
      ? await db.trainingAssignment.findMany({
          where: { id: { in: trainingIds } },
          select: { id: true, title: true },
        })
      : []
  const trainingTitleById = new Map(trainingRows.map((t) => [t.id, t.title]))

  const now = Date.now()
  const activeUsers: LiveOpsActiveUser[] = activeEntries
    .filter((e) => e.user)
    .map((e) => {
      const activityType = e.activityType ?? null
      const projectName = e.project?.name ?? null
      const trainingTitle = e.trainingAssignmentId
        ? trainingTitleById.get(e.trainingAssignmentId) ?? null
        : null
      return {
        userId: e.user!.id,
        name: e.user!.name,
        projectId: e.project?.id ?? null,
        projectName,
        activityType,
        activityLabel: labelForActivity({
          activityType,
          projectName,
          trainingTitle,
          description: e.description,
        }),
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
      }
    })

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
