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
  todayDateKey,
  toDateKey,
} from "@/lib/milestones"

/**
 * GET /api/milestones/session?projectId=&mode=briefing|due
 *
 * briefing (clock-in): ALL open milestones for the selected project
 *   (so the team sees what is coming — e.g. due tomorrow still appears today).
 * due (clock-out): ALL open milestones for the project with dueDate <= today
 *   (due day + overdue; never future). Checkboxes required before clock-out.
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

    // Prompt: clock-in → all project milestones; clock-out → due day, not future
    const filtered =
      mode === "due"
        ? milestones.filter((m) => m.dueDate && isDueOnOrBefore(m.dueDate, today))
        : milestones

    // Due reminder to Admin/SuperAdmin once per project/day (briefing or due checklist)
    const dueNow = milestones.filter(
      (m) => m.dueDate && isDueOnOrBefore(m.dueDate, today)
    )
    if (dueNow.length > 0) {
      const gate = await checkDbRateLimit(
        `milestone-due-admin:${projectId}:${today}`,
        1,
        24 * 60 * 60 * 1000
      )
      if (gate.allowed) {
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
