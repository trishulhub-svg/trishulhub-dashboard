/**
 * GET /api/bootstrap/time-tracking
 * Time tracking page: week entries + minimal projects + team users (admin).
 * One session check; same RBAC / field stripping as individual APIs.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { getAssignedProjectIds } from "@/lib/rbac"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-tt")
    if ("error" in auth) return auth.error

    const userId = auth.session.user.id
    const userRole = auth.session.user.role
    const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN"

    const today = new Date()
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() + mondayOffset)
    startOfWeek.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    const entryWhere: Prisma.TimeEntryWhereInput = {}
    if (!isAdminUser) entryWhere.userId = userId

    const assignedProjectIds = await getAssignedProjectIds(userId, userRole)
    const projectWhere: Prisma.ProjectWhereInput = {}
    if (assignedProjectIds) projectWhere.id = { in: assignedProjectIds }

    const [entries, activeEntries, projects, teamUsers] = await Promise.all([
      db.timeEntry.findMany({
        where: {
          ...entryWhere,
          OR: [
            { date: { gte: startOfWeek, lte: endOfWeek } },
            { status: "ACTIVE" },
          ],
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true },
          },
          project: { select: { id: true, name: true } },
        },
        orderBy: { clockIn: "desc" },
        take: isAdminUser ? 200 : 50,
      }),
      isAdminUser
        ? db.timeEntry.findMany({
            where: { status: "ACTIVE" },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  role: true,
                },
              },
              project: { select: { id: true, name: true } },
            },
            orderBy: { clockIn: "desc" },
            take: 200,
          })
        : Promise.resolve([]),
      db.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, status: true, progress: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      isAdminUser
        ? db.user.findMany({
            where: { role: { not: "CLIENT" } },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
              isActive: true,
              avatar: true,
            },
            orderBy: { name: "asc" },
            take: 100,
          })
        : Promise.resolve([]),
    ])

    // Yellow blink: open assigned milestones for current user
    const openAssigned = new Set<string>()
    const ids = projects.map((p) => p.id)
    if (ids.length > 0 && userId) {
      try {
        const placeholders = ids.map(() => "?").join(",")
        const rows = (await db.$queryRawUnsafe(
          `SELECT DISTINCT m."projectId" as "projectId"
           FROM "ProjectMilestone" m
           INNER JOIN "ProjectMilestoneAssignee" a ON a."milestoneId" = m."id"
           WHERE m."projectId" IN (${placeholders})
             AND m."done" = 0
             AND a."userId" = ?`,
          ...ids,
          userId
        )) as Array<{ projectId: string }>
        for (const row of rows) openAssigned.add(row.projectId)
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({
      entries,
      activeEntries,
      page: 1,
      limit: 100,
      totalPages: 1,
      projects: projects.map((p) => ({
        ...p,
        hasOpenAssignedMilestones: openAssigned.has(p.id),
      })),
      teamUsers: teamUsers.map((u) => ({ id: u.id, name: u.name })),
    })
  } catch (error: unknown) {
    console.error(
      "[bootstrap/time-tracking] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
