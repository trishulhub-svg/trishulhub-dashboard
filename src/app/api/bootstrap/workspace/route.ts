/**
 * GET /api/bootstrap/workspace
 * Workspace page: live-ops + whether current user has an ACTIVE session.
 * One session check; same auth as live-ops / time-tracking.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-workspace")
    if ("error" in auth) return auth.error

    const userId = auth.session.user.id

    const [activeEntries, recentProjects, myActiveCount] = await Promise.all([
      db.timeEntry.findMany({
        where: { status: "ACTIVE", clockOut: null },
        include: {
          user: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
        take: 100,
      }),
      db.project.findMany({
        where: {
          AND: [{ progress: { lt: 100 } }, { status: { not: "COMPLETED" } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: {
          id: true,
          name: true,
          progress: true,
          status: true,
          updatedAt: true,
        },
      }),
      db.timeEntry.count({
        where: { userId, status: "ACTIVE", clockOut: null },
      }),
    ])

    const now = Date.now()
    const activeUsers = activeEntries
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

    const activeProjectIdSet = new Set(
      activeUsers.map((u) => u.projectId).filter((p): p is string => Boolean(p))
    )
    const activeUserCountByProject = new Map<string, number>()
    for (const u of activeUsers) {
      if (u.projectId) {
        activeUserCountByProject.set(
          u.projectId,
          (activeUserCountByProject.get(u.projectId) ?? 0) + 1
        )
      }
    }

    const liveProjects = recentProjects.map((p) => ({
      projectId: p.id,
      name: p.name,
      progress: Math.min(99, p.progress ?? 0),
      status: p.status,
      activeUserCount: activeUserCountByProject.get(p.id) ?? 0,
      isActive: activeProjectIdSet.has(p.id),
    }))

    return NextResponse.json({
      activeUsers,
      liveProjects,
      hasActiveSession: myActiveCount > 0,
    })
  } catch (error: unknown) {
    console.error(
      "[bootstrap/workspace] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json(
      {
        error: "An error occurred",
        activeUsers: [],
        liveProjects: [],
        hasActiveSession: false,
      },
      { status: 500 }
    )
  }
}
