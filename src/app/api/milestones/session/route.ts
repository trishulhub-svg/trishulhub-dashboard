import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { canAccessProject, isValidProjectId } from "@/lib/project-access"
import { notifyAdmins } from "@/lib/notifications"
import { checkDbRateLimit } from "@/lib/rate-limit"
import {
  formatDueDateLabel,
  isDueOnOrBefore,
  isMilestoneRelevantToUser,
  todayDateKey,
  toDateKey,
} from "@/lib/milestones"

/**
 * GET /api/milestones/session?projectId=&mode=briefing|due
 * Clock-in briefing / clock-out checklist for the current user.
 * Also nudges admins once/day about due milestones on this project (briefing only).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get("projectId") || ""
    const mode = searchParams.get("mode") || "briefing"

    if (!projectId || projectId === "none") {
      return NextResponse.json({ milestones: [], projectId: null })
    }
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const allowed = await canAccessProject(session.user.id, session.user.role, projectId)
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await ensureAllTables()

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    })
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    const milestones = await db.projectMilestone.findMany({
      where: { projectId, done: false },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    })

    const today = todayDateKey()
    const userId = session.user.id

    const filtered =
      mode === "due"
        ? milestones.filter(
            (m) =>
              m.dueDate &&
              isDueOnOrBefore(m.dueDate, today) &&
              isMilestoneRelevantToUser(m.assignees, userId)
          )
        : milestones.filter((m) => isMilestoneRelevantToUser(m.assignees, userId))

    // On clock-in briefing: notify admins about due/overdue items at most once/day/project
    if (mode === "briefing") {
      const dueNow = milestones.filter(
        (m) => m.dueDate && isDueOnOrBefore(m.dueDate, today)
      )
      if (dueNow.length > 0) {
        const gate = await checkDbRateLimit(
          `milestone-due-admin:${projectId}:${today}`,
          1,
          24 * 60 * 60 * 1000
        )
        if (gate.allowed && gate.remaining >= 0) {
          // checkDbRateLimit increments — first call of the day has count 1 and allowed true
          const titles = dueNow
            .slice(0, 5)
            .map((m) => `"${m.title}" (${m.dueDate ? formatDueDateLabel(m.dueDate) : "—"})`)
            .join(", ")
          void notifyAdmins({
            title: `Milestones due — ${project.name}`,
            message: `${dueNow.length} open due/overdue: ${titles}`,
            type: "WARNING",
            link: `/dashboard/projects/${projectId}`,
            metadata: {
              projectId,
              dueKeys: dueNow.map((m) => toDateKey(m.dueDate!)),
              day: today,
            },
          })
        }
      }
    }

    return NextResponse.json(
      deepSanitize({
        projectId: project.id,
        projectName: project.name,
        mode,
        today,
        milestones: filtered,
        blockingCount: mode === "due" ? filtered.length : 0,
      })
    )
  } catch (error: unknown) {
    console.error("[milestones/session] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load session milestones" }, { status: 500 })
  }
}
