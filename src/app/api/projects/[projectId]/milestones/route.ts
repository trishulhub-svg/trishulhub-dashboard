import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { canAccessProject, isValidProjectId } from "@/lib/project-access"
import {
  formatDueDateLabel,
  isDueOnOrBefore,
  parseDueDateInput,
  syncProjectProgressFromMilestones,
  todayDateKey,
  toDateKey,
} from "@/lib/milestones"
import { notifyOverdueMilestones, parseOptionalDueTime } from "@/lib/milestone-due"
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log"
import { z } from "zod"

function canManageMilestones(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  dueDate: z.string().min(1, "Due date is required"),
  /** Optional UK local time HH:mm — overdue fires after this instant */
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Due time must be HH:mm (UK)")
    .optional()
    .nullable(),
  // Prompt: ask who to assign — at least one project member (single or multi)
  assigneeIds: z.array(z.string().min(1)).min(1, "Select at least one project member").max(50),
})

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().optional().nullable(),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Due time must be HH:mm (UK)")
    .optional()
    .nullable(),
  assigneeIds: z.array(z.string().min(1)).min(1).max(50).optional(),
})

/** Bulk reorder — admin sets first→last order within a week (or any set). */
const reorderSchema = z.object({
  reorder: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int(),
      })
    )
    .min(1)
    .max(100),
})

const milestoneInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} as const

async function assertAssigneesOnProject(projectId: string, assigneeIds: string[]) {
  if (assigneeIds.length === 0) return { ok: true as const }
  const members = await db.projectMember.findMany({
    where: { projectId, userId: { in: assigneeIds } },
    select: { userId: true, user: { select: { isActive: true } } },
  })
  const memberSet = new Set(members.map((m) => m.userId))
  const invalid = assigneeIds.filter((id) => !memberSet.has(id))
  if (invalid.length > 0) {
    return {
      ok: false as const,
      error: "Assignees must already be members of this project",
    }
  }
  const inactive = members.filter((m) => !m.user?.isActive).map((m) => m.userId)
  if (inactive.some((id) => assigneeIds.includes(id))) {
    return {
      ok: false as const,
      error: "Cannot assign deactivated users. Reactivate them in Team first.",
    }
  }
  return { ok: true as const }
}

async function syncAssignees(milestoneId: string, assigneeIds: string[]) {
  const unique = [...new Set(assigneeIds)]
  await db.projectMilestoneAssignee.deleteMany({
    where: {
      milestoneId,
      ...(unique.length > 0 ? { userId: { notIn: unique } } : {}),
    },
  })
  if (unique.length === 0) return
  const existing = await db.projectMilestoneAssignee.findMany({
    where: { milestoneId },
    select: { userId: true },
  })
  const have = new Set(existing.map((e) => e.userId))
  const toAdd = unique.filter((id) => !have.has(id))
  if (toAdd.length > 0) {
    await db.projectMilestoneAssignee.createMany({
      data: toAdd.map((userId) => ({ milestoneId, userId })),
    })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const allowed = await canAccessProject(session.user.id, session.user.role, projectId)
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Ensure new milestone columns exist before Prisma SELECT (prevents empty UI)
    await ensureCriticalSchema()

    // Hot path: send overdue UK due reminders (idempotent via dueNotifiedAt)
    void notifyOverdueMilestones().catch(() => undefined)

    const scope = new URL(req.url).searchParams.get("scope") // briefing | due | all
    const milestones = await db.projectMilestone.findMany({
      where: { projectId },
      include: milestoneInclude,
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    })

    const today = todayDateKey()

    let filtered = milestones
    if (scope === "briefing") {
      // Clock-in: ALL open milestones for this project (includes upcoming dues)
      filtered = milestones.filter((m) => !m.done)
    } else if (scope === "due") {
      // Clock-out: ALL open due today/overdue (never future)
      filtered = milestones.filter(
        (m) => !m.done && m.dueDate && isDueOnOrBefore(m.dueDate, today)
      )
    }

    return NextResponse.json(deepSanitize(filtered))
  } catch (error: unknown) {
    console.error("[milestones] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load milestones" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageMilestones(session.user.role)) {
      return NextResponse.json(
        { error: "Forbidden: Only Admin or Super Admin can create milestones" },
        { status: 403 }
      )
    }

    const rl = rateLimit(
      `milestones-write-${session.user.id}`,
      RATE_LIMITS.crmWrite.limit,
      RATE_LIMITS.crmWrite.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    // Skip schema migrate on create — project page GET already ran ensureCriticalSchema.
    // Awaiting migrate here re-runs dozens of ALTER attempts on cold serverless (~10–20s).
    let body: unknown
    const [project, bodyRaw] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true },
      }),
      req.json().catch(() => null),
    ])
    body = bodyRaw
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })
    if (body == null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const due = parseDueDateInput(parsed.data.dueDate.slice(0, 10))
    if (!due) {
      return NextResponse.json({ error: "Invalid due date (use YYYY-MM-DD)" }, { status: 400 })
    }
    const dueTime = parseOptionalDueTime(parsed.data.dueTime ?? null)
    if (dueTime === undefined) {
      return NextResponse.json({ error: "Invalid due time (use HH:mm UK)" }, { status: 400 })
    }

    const [assigneeCheck, maxOrder, assigneeUsers] = await Promise.all([
      assertAssigneesOnProject(projectId, parsed.data.assigneeIds),
      db.projectMilestone.aggregate({
        where: { projectId },
        _max: { sortOrder: true },
      }),
      db.user.findMany({
        where: { id: { in: parsed.data.assigneeIds } },
        select: { id: true, name: true, email: true, role: true },
      }),
    ])
    if (!assigneeCheck.ok) {
      return NextResponse.json({ error: assigneeCheck.error }, { status: 400 })
    }

    // Two-step create (Turso/libSQL nested creates can fail intermittently).
    // Explicit updatedAt avoids null/empty after Turso-safe column backfills.
    const now = new Date()
    const created = await db.projectMilestone.create({
      data: {
        projectId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        dueDate: due,
        dueTime,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        createdById: session.user.id,
        updatedAt: now,
      },
    })

    try {
      await db.projectMilestoneAssignee.createMany({
        data: parsed.data.assigneeIds.map((userId) => ({
          milestoneId: created.id,
          userId,
        })),
      })
    } catch (assignErr) {
      // Roll back milestone if assignees failed
      await db.projectMilestone.delete({ where: { id: created.id } }).catch(() => null)
      console.error(
        "[milestones] assignee create failed:",
        assignErr instanceof Error ? assignErr.message : assignErr
      )
      return NextResponse.json(
        {
          error:
            "Failed to assign team members. Ensure they are project members, then try again.",
        },
        { status: 500 }
      )
    }

    // Build response without a third findUnique round-trip
    const userById = new Map(assigneeUsers.map((u) => [u.id, u]))
    const milestone = {
      ...created,
      assignees: parsed.data.assigneeIds.map((userId) => ({
        milestoneId: created.id,
        userId,
        user: userById.get(userId) || { id: userId, name: null, email: null, role: null },
      })),
    }

    void syncProjectProgressFromMilestones(projectId).catch((err) =>
      console.warn("[milestones] progress sync failed:", err instanceof Error ? err.message : err)
    )

    const dueLabel = formatDueDateLabel(due)
    // No create/assign notifications — overdue UK due reminders only (milestone-due).

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "TEAM_WORK",
      page: "milestones",
      action: "CREATE",
      entityType: "ProjectMilestone",
      entityId: created.id,
      description: `Created milestone "${parsed.data.title}" on ${project.name} (due ${dueLabel}${dueTime ? ` ${dueTime} UK` : ""}, ${parsed.data.assigneeIds.length} assignee${parsed.data.assigneeIds.length === 1 ? "" : "s"})`,
      newValue: JSON.stringify({
        title: parsed.data.title,
        dueDate: toDateKey(due),
        dueTime,
        assigneeIds: parsed.data.assigneeIds,
        projectId,
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({ projectId, projectName: project.name }),
    })

    return NextResponse.json(deepSanitize(milestone), { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("[milestones] POST error:", msg)
    return NextResponse.json(
      { error: msg.includes("no such table") ? "Milestone tables not ready — refresh and retry" : "Failed to create milestone" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const allowed = await canAccessProject(session.user.id, session.user.role, projectId)
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    let body: Record<string, unknown> = {}
    const idFromQuery = new URL(req.url).searchParams.get("id")
    try {
      const json = await req.json().catch(() => ({}))
      if (json && typeof json === "object") body = json as Record<string, unknown>
    } catch {
      /* empty */
    }

    // Bulk reorder (admin) — drag-to-order within a week
    if (Array.isArray(body.reorder)) {
      if (!canManageMilestones(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden: Only Admin or Super Admin can reorder milestones" },
          { status: 403 }
        )
      }
      const parsedReorder = reorderSchema.safeParse({ reorder: body.reorder })
      if (!parsedReorder.success) {
        return NextResponse.json(
          { error: parsedReorder.error.issues[0]?.message || "Invalid reorder" },
          { status: 400 }
        )
      }
      const items = parsedReorder.data.reorder
      const ids = items.map((i) => i.id)
      const existing = await db.projectMilestone.findMany({
        where: { projectId, id: { in: ids } },
        select: { id: true },
      })
      if (existing.length !== ids.length) {
        return NextResponse.json(
          { error: "One or more milestones were not found on this project" },
          { status: 404 }
        )
      }
      await db.$transaction(
        items.map((item) =>
          db.projectMilestone.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          })
        )
      )
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "TEAM_WORK",
        page: "milestones",
        action: "UPDATE",
        entityType: "ProjectMilestone",
        entityId: projectId,
        description: `Reordered ${items.length} milestone${items.length === 1 ? "" : "s"}`,
        newValue: JSON.stringify({ reorder: items }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        metadata: JSON.stringify({ projectId }),
      })
      return NextResponse.json({ success: true, count: items.length })
    }

    const id = (body.id as string) || idFromQuery
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const parsed = patchSchema.safeParse({ ...body, id })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      )
    }

    const {
      id: milestoneId,
      title,
      description,
      done,
      sortOrder,
      dueDate,
      dueTime,
      assigneeIds,
    } = parsed.data

    const existing = await db.projectMilestone.findFirst({
      where: { id: milestoneId, projectId },
      include: { assignees: true },
    })
    if (!existing) return NextResponse.json({ error: "Milestone not found" }, { status: 404 })

    const isAdmin = canManageMilestones(session.user.role)
    const isAssignee = existing.assignees.some((a) => a.userId === session.user.id)
    const isCompletionOnly =
      done !== undefined &&
      title === undefined &&
      description === undefined &&
      sortOrder === undefined &&
      dueDate === undefined &&
      dueTime === undefined &&
      assigneeIds === undefined

    if (!isAdmin) {
      // Assigned team members may mark milestones done/undone (drives project progress)
      if (!isCompletionOnly || !isAssignee) {
        return NextResponse.json(
          { error: "Forbidden: Only Admin/Super Admin can edit milestones (assignees may mark done)" },
          { status: 403 }
        )
      }
    }

    if (assigneeIds !== undefined) {
      const assigneeCheck = await assertAssigneesOnProject(projectId, assigneeIds)
      if (!assigneeCheck.ok) {
        return NextResponse.json({ error: assigneeCheck.error }, { status: 400 })
      }
    }

    let nextDue: Date | null | undefined = undefined
    if (dueDate !== undefined) {
      if (dueDate === null || dueDate === "") {
        nextDue = null
      } else {
        const parsedDue = parseDueDateInput(String(dueDate).slice(0, 10))
        if (!parsedDue) {
          return NextResponse.json({ error: "Invalid due date" }, { status: 400 })
        }
        nextDue = parsedDue
      }
    }

    let nextDueTime: string | null | undefined = undefined
    if (dueTime !== undefined) {
      const parsedTime = parseOptionalDueTime(dueTime)
      if (parsedTime === undefined) {
        return NextResponse.json({ error: "Invalid due time (use HH:mm UK)" }, { status: 400 })
      }
      nextDueTime = parsedTime
    }

    if (assigneeIds !== undefined) {
      await syncAssignees(milestoneId, assigneeIds)
    }

    const dueChanged =
      nextDue !== undefined ||
      nextDueTime !== undefined ||
      (nextDue === null && existing.dueDate != null)

    const milestone = await db.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(nextDue !== undefined ? { dueDate: nextDue } : {}),
        ...(nextDueTime !== undefined ? { dueTime: nextDueTime } : {}),
        // Reset overdue notify flag when due date/time changes so a new deadline can fire once
        ...(dueChanged && (nextDue !== null || existing.dueDate) ? { dueNotifiedAt: null } : {}),
        ...(done !== undefined
          ? {
              done,
              completedAt: done ? new Date() : null,
              completedBy: done ? session.user.id : null,
            }
          : {}),
      },
      include: milestoneInclude,
    })
    // No assignee-change notifications — overdue UK reminders only.

    let projectProgress: number | undefined
    if (done !== undefined) {
      try {
        projectProgress = await syncProjectProgressFromMilestones(projectId)
      } catch (err) {
        console.warn("[milestones] progress sync failed:", err instanceof Error ? err.message : err)
      }
    }

    const action =
      done !== undefined && isCompletionOnly
        ? "STATUS_CHANGE"
        : assigneeIds !== undefined &&
            title === undefined &&
            description === undefined &&
            sortOrder === undefined &&
            dueDate === undefined &&
            dueTime === undefined &&
            done === undefined
          ? "ASSIGN"
          : "UPDATE"

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "TEAM_WORK",
      page: "milestones",
      action,
      entityType: "ProjectMilestone",
      entityId: milestone.id,
      description:
        action === "STATUS_CHANGE"
          ? `${done ? "Marked done" : "Reopened"} milestone "${milestone.title}" (progress ${projectProgress ?? "?"}%)`
          : action === "ASSIGN"
            ? `Updated assignees on milestone "${milestone.title}"`
            : buildDescription("UPDATE", "milestone", milestone.title),
      oldValue:
        done !== undefined
          ? JSON.stringify({ done: existing.done })
          : undefined,
      newValue:
        done !== undefined
          ? JSON.stringify({ done, projectProgress })
          : JSON.stringify({
              title: milestone.title,
              dueDate: milestone.dueDate,
              assigneeCount: milestone.assignees?.length ?? 0,
            }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({ projectId }),
    })

    return NextResponse.json(
      deepSanitize({ ...milestone, ...(projectProgress !== undefined ? { projectProgress } : {}) })
    )
  } catch (error: unknown) {
    console.error("[milestones] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update milestone" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageMilestones(session.user.role)) {
      return NextResponse.json(
        { error: "Forbidden: Only Admin or Super Admin can delete milestones" },
        { status: 403 }
      )
    }

    const { projectId } = await params
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const existing = await db.projectMilestone.findFirst({ where: { id, projectId } })
    if (!existing) return NextResponse.json({ error: "Milestone not found" }, { status: 404 })

    await db.projectMilestone.delete({ where: { id } })
    void syncProjectProgressFromMilestones(projectId).catch((err) =>
      console.warn("[milestones] progress sync failed:", err instanceof Error ? err.message : err)
    )

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "TEAM_WORK",
      page: "milestones",
      action: "DELETE",
      entityType: "ProjectMilestone",
      entityId: id,
      description: buildDescription("DELETE", "milestone", existing.title),
      oldValue: JSON.stringify({ title: existing.title, done: existing.done, projectId }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      metadata: JSON.stringify({ projectId }),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[milestones] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete milestone" }, { status: 500 })
  }
}
