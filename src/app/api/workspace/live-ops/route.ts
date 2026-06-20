import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

/**
 * GET /api/workspace/live-ops
 *
 * Live Operations feed for the TrishulHub Workspace page.
 * Auth: browser session via getServerSession (NOT agent JWT).
 *
 * Returns:
 *   - activeUsers:  every user currently clocked in (TimeEntry.status === "ACTIVE")
 *                   with userId, name, projectId, projectName, clockInAt, elapsedSec
 *   - liveProjects: 2–3 most recently updated projects, enriched with their live
 *                   status (activeUserCount + isActive flag), progress and status.
 *
 * If nobody is working, both arrays are returned empty.
 */
export async function GET() {
  try {
    // ── Auth: browser session only (not agent JWT) ──
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rl = rateLimit(
      `workspace-live-ops-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // ── 1. All active TimeEntries (clocked in, not yet clocked out) ──
    const activeEntries = await db.timeEntry.findMany({
      where: { status: "ACTIVE", clockOut: null },
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { clockIn: "desc" },
      take: 100,
    })

    const now = Date.now()
    const activeUsers = activeEntries
      .filter((e) => e.user)
      .map((e) => ({
        userId: e.user!.id,
        name: e.user!.name,
        projectId: e.project?.id ?? null,
        projectName: e.project?.name ?? null,
        clockInAt: e.clockIn instanceof Date ? e.clockIn.toISOString() : new Date(e.clockIn).toISOString(),
        elapsedSec: Math.max(
          0,
          Math.floor(
            (now - (e.clockIn instanceof Date ? e.clockIn.getTime() : new Date(e.clockIn).getTime())) / 1000
          )
        ),
      }))

    // Set of project IDs that currently have ≥1 active user
    const activeProjectIdSet = new Set(
      activeUsers
        .map((u) => u.projectId)
        .filter((p): p is string => Boolean(p))
    )

    // Count active users per project
    const activeUserCountByProject = new Map<string, number>()
    for (const u of activeUsers) {
      if (u.projectId) {
        activeUserCountByProject.set(
          u.projectId,
          (activeUserCountByProject.get(u.projectId) ?? 0) + 1
        )
      }
    }

    // ── 2. Recently active projects (by updatedAt) — top 3 ──
    const recentProjects = await db.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        name: true,
        progress: true,
        status: true,
        updatedAt: true,
      },
    })

    const liveProjects = recentProjects.map((p) => ({
      projectId: p.id,
      name: p.name,
      progress: p.progress ?? 0,
      status: p.status,
      activeUserCount: activeUserCountByProject.get(p.id) ?? 0,
      isActive: activeProjectIdSet.has(p.id),
    }))

    return NextResponse.json({
      activeUsers,
      liveProjects,
    })
  } catch (error: unknown) {
    console.error(
      "[api/workspace/live-ops] GET error:",
      error instanceof Error ? error.message : error
    )
    return NextResponse.json(
      { error: "An error occurred", activeUsers: [], liveProjects: [] },
      { status: 500 }
    )
  }
}
