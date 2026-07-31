import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { notifyRoles, notifyUsers } from "@/lib/notify"
import { ensureTrainingAssignmentSchema } from "@/lib/training-assignment-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { z } from "zod"
import { randomBytes } from "crypto"

const assignSchema = z
  .object({
    /** Single assignee (legacy) */
    userId: z.string().min(1).optional(),
    /** Multiple assignees — preferred */
    userIds: z.array(z.string().min(1)).min(1).max(100).optional(),
    title: z.string().min(1).max(200),
    notes: z.string().max(1000).optional().nullable(),
    dueDate: z.string().min(1),
  })
  .refine((d) => (d.userIds && d.userIds.length > 0) || !!d.userId, {
    message: "Select at least one team member",
    path: ["userIds"],
  })

function newId() {
  return `ta_${randomBytes(12).toString("hex")}`
}

async function ensureTrainingAssignmentTable() {
  await ensureTrainingAssignmentSchema()
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

type RawAssignment = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: Date
  status: string
  assignedById: string
  completedAt: Date | null
  overdueNotifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function serializeAssignment(
  a: RawAssignment,
  userMap: Map<string, { id: string; name: string; email?: string }>
) {
  const now = startOfToday()
  const due = new Date(a.dueDate)
  due.setHours(0, 0, 0, 0)
  const isOverdue = a.status !== "DONE" && due.getTime() < now.getTime()
  const user = userMap.get(a.userId) || null
  const assignedBy = userMap.get(a.assignedById) || null
  return {
    id: a.id,
    userId: a.userId,
    title: a.title,
    notes: a.notes,
    dueDate: a.dueDate,
    status: a.status === "DONE" ? "DONE" : isOverdue ? "OVERDUE" : "ASSIGNED",
    assignedById: a.assignedById,
    completedAt: a.completedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    user: user
      ? { id: user.id, name: user.name, email: user.email || "" }
      : null,
    assignedBy: assignedBy
      ? { id: assignedBy.id, name: assignedBy.name }
      : null,
  }
}

async function loadUserMap(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, { id: string; name: string; email?: string }>()
  if (unique.length === 0) return map
  try {
    const users = await db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    })
    for (const u of users) map.set(u.id, u)
  } catch (err) {
    console.warn("[training/assignments] user map:", err)
  }
  return map
}

async function notifyOverdueIfNeeded() {
  try {
    const today = startOfToday()
    const overdue = await db.trainingAssignment.findMany({
      where: {
        status: "ASSIGNED",
        dueDate: { lt: today },
        overdueNotifiedAt: null,
      },
      take: 30,
    })
    if (overdue.length === 0) return
    const userMap = await loadUserMap(overdue.map((o) => o.userId))
    for (const item of overdue) {
      const name = userMap.get(item.userId)?.name || "A team member"
      await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
        title: "Training overdue",
        message: `${name} has not completed "${item.title}" (due ${new Date(item.dueDate).toLocaleDateString()}).`,
        type: "WARNING",
        link: "/dashboard/training/assign",
        metadata: { kind: "training_overdue", assignmentId: item.id, userId: item.userId },
      })
      await db.trainingAssignment.update({
        where: { id: item.id },
        data: { overdueNotifiedAt: new Date() },
      })
    }
  } catch (err) {
    console.warn(
      "[training/assignments] overdue sweep:",
      err instanceof Error ? err.message : String(err)
    )
  }
}

async function fetchTeam() {
  // Active staff only — never fall back to deactivated users for assign UI
  try {
    return await db.user.findMany({
      where: {
        isActive: true,
        NOT: { role: "CLIENT" },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 200,
    })
  } catch (err) {
    console.warn("[training/assignments] team active query:", err)
    return []
  }
}

/**
 * GET /api/training/assignments?mine=1
 */
export async function GET(req: NextRequest) {
  try {
    await ensureTrainingAssignmentTable()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    void notifyOverdueIfNeeded()

    const admin = isAdmin(session.user.role || "")
    const { searchParams } = new URL(req.url)
    const mineOnly = searchParams.get("mine") === "1"
    const filterUserId = searchParams.get("userId")

    // Team first — never blocked by assignment query failures
    let team: { id: string; name: string; email: string; role: string }[] = []
    if (admin && !mineOnly) {
      team = await fetchTeam()
    }

    let assignments: ReturnType<typeof serializeAssignment>[] = []
    let assignmentError: string | null = null
    try {
      const where =
        mineOnly || !admin
          ? { userId: session.user.id }
          : filterUserId
            ? { userId: filterUserId }
            : {}

      // No Prisma relation includes — hydrate names manually (more reliable on Turso)
      const rows = await db.trainingAssignment.findMany({
        where,
        orderBy: { dueDate: "asc" },
      })
      const userMap = await loadUserMap([
        ...rows.map((r) => r.userId),
        ...rows.map((r) => r.assignedById),
      ])
      assignments = rows.map((r) => serializeAssignment(r, userMap))
    } catch (err) {
      assignmentError = err instanceof Error ? err.message : String(err)
      console.error("[training/assignments GET] rows:", assignmentError)
    }

    return NextResponse.json({
      assignments,
      team,
      isAdmin: admin,
      warning: assignmentError || undefined,
    })
  } catch (err) {
    console.error("[training/assignments GET]", err)
    // Last-resort: still try to return team for admins so the form works
    let team: { id: string; name: string; email: string; role: string }[] = []
    try {
      const session = await getServerSession(authOptions)
      if (session?.user && isAdmin(session.user.role || "")) {
        team = await fetchTeam()
      }
    } catch { /* ignore */ }
    return NextResponse.json(
      {
        error: "Failed to load assignments",
        detail: err instanceof Error ? err.message : String(err),
        assignments: [],
        team,
        isAdmin: team.length > 0,
      },
      { status: team.length > 0 ? 200 : 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTrainingAssignmentTable()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isAdmin(session.user.role || "")) {
      return NextResponse.json({ error: "Only Admin or Super Admin can assign training" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = assignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid assignment payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const dueRaw = parsed.data.dueDate.trim()
    let due: Date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
      const [y, m, d] = dueRaw.split("-").map(Number)
      due = new Date(y, m - 1, d, 23, 59, 59, 999)
    } else {
      due = new Date(dueRaw)
    }
    if (Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 })
    }

    // Normalize to unique user ids (supports userIds[] and legacy userId)
    const targetIds = Array.from(
      new Set([
        ...(parsed.data.userIds || []),
        ...(parsed.data.userId ? [parsed.data.userId] : []),
      ])
    )
    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Select at least one team member" }, { status: 400 })
    }

    const targets = await db.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true, email: true, isActive: true },
    })
    if (targets.length === 0) {
      return NextResponse.json({ error: "No matching users found" }, { status: 404 })
    }
    const foundIds = new Set(targets.map((t) => t.id))
    const missing = targetIds.filter((id) => !foundIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `User not found: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` },
        { status: 404 }
      )
    }
    const inactive = targets.filter((t) => !t.isActive)
    if (inactive.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot assign deactivated users: ${inactive
            .slice(0, 3)
            .map((t) => t.name || t.email || t.id)
            .join(", ")}${inactive.length > 3 ? "…" : ""}. Reactivate them in Team first.`,
        },
        { status: 400 }
      )
    }

    const title = parsed.data.title.trim()
    const notes = parsed.data.notes?.trim() || null
    const now = new Date()
    const created: RawAssignment[] = []

    for (const userId of targetIds) {
      let assignment: RawAssignment
      try {
        assignment = await db.trainingAssignment.create({
          data: {
            id: newId(),
            userId,
            title,
            notes,
            dueDate: due,
            status: "ASSIGNED",
            assignedById: session.user.id,
            createdAt: now,
            updatedAt: now,
          },
        })
      } catch (createErr) {
        console.warn("[training/assignments POST] prisma create failed, trying raw:", createErr)
        const id = newId()
        await db.$executeRawUnsafe(
          `INSERT INTO "TrainingAssignment" ("id","userId","title","notes","dueDate","status","assignedById","createdAt","updatedAt")
           VALUES (?,?,?,?,?,?,?,?,?)`,
          id,
          userId,
          title,
          notes,
          due.toISOString(),
          "ASSIGNED",
          session.user.id,
          now.toISOString(),
          now.toISOString()
        )
        assignment = {
          id,
          userId,
          title,
          notes,
          dueDate: due,
          status: "ASSIGNED",
          assignedById: session.user.id,
          completedAt: null,
          overdueNotifiedAt: null,
          createdAt: now,
          updatedAt: now,
        }
      }
      created.push(assignment)
    }

    await notifyUsers({
      userIds: targetIds,
      title: "New training assigned",
      message: `You have been assigned "${title}" — due ${due.toLocaleDateString()}. Open Learning → My Training.`,
      type: "INFO",
      link: "/dashboard/training/my",
      metadata: {
        kind: "training_assigned",
        assignmentIds: created.map((a) => a.id),
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "LEARNING",
      page: "training",
      action: "ASSIGN",
      entityType: "TrainingAssignment",
      entityId: created[0]?.id,
      description: `Assigned training "${title}" to ${created.length} member${created.length === 1 ? "" : "s"} (due ${due.toLocaleDateString()})`,
      newValue: JSON.stringify({
        title,
        assigneeIds: targetIds,
        dueDate: due.toISOString(),
        assignmentIds: created.map((a) => a.id),
      }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    const userMap = await loadUserMap([
      ...created.map((a) => a.userId),
      session.user.id,
    ])
    return NextResponse.json(
      {
        ok: true,
        count: created.length,
        assignments: created.map((a) => serializeAssignment(a, userMap)),
        // Keep singular for older clients
        assignment: created[0] ? serializeAssignment(created[0], userMap) : null,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error("[training/assignments POST]", err)
    return NextResponse.json(
      {
        error: "Failed to assign training",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureTrainingAssignmentTable()
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const id = typeof body?.id === "string" ? body.id : ""
    if (!id) {
      return NextResponse.json({ error: "Assignment id required" }, { status: 400 })
    }

    const existing = await db.trainingAssignment.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }

    const admin = isAdmin(session.user.role || "")

    if (body?.action === "DELETE") {
      if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      await db.trainingAssignment.delete({ where: { id } })
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role || "",
        department: "LEARNING",
        page: "training",
        action: "DELETE",
        entityType: "TrainingAssignment",
        entityId: id,
        description: `Deleted training assignment "${existing.title}"`,
        oldValue: JSON.stringify({
          title: existing.title,
          userId: existing.userId,
          status: existing.status,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ ok: true, deleted: true })
    }

    // Admin edit: title / notes / dueDate / assignee / status
    if (body?.action === "UPDATE") {
      if (!admin) {
        return NextResponse.json({ error: "Only Admin or Super Admin can edit assignments" }, { status: 403 })
      }

      const data: {
        title?: string
        notes?: string | null
        dueDate?: Date
        userId?: string
        status?: string
        completedAt?: Date | null
        overdueNotifiedAt?: Date | null
        updatedAt: Date
      } = { updatedAt: new Date() }

      if (typeof body.title === "string") {
        const title = body.title.trim()
        if (!title || title.length > 200) {
          return NextResponse.json({ error: "Title is required (max 200 chars)" }, { status: 400 })
        }
        data.title = title
      }

      if (body.notes !== undefined) {
        if (body.notes === null || body.notes === "") {
          data.notes = null
        } else if (typeof body.notes === "string") {
          const notes = body.notes.trim()
          if (notes.length > 1000) {
            return NextResponse.json({ error: "Notes max 1000 chars" }, { status: 400 })
          }
          data.notes = notes || null
        } else {
          return NextResponse.json({ error: "Invalid notes" }, { status: 400 })
        }
      }

      if (typeof body.dueDate === "string" && body.dueDate.trim()) {
        const dueRaw = body.dueDate.trim()
        let due: Date
        if (/^\d{4}-\d{2}-\d{2}$/.test(dueRaw)) {
          const [y, m, d] = dueRaw.split("-").map(Number)
          due = new Date(y, m - 1, d, 23, 59, 59, 999)
        } else {
          due = new Date(dueRaw)
        }
        if (Number.isNaN(due.getTime())) {
          return NextResponse.json({ error: "Invalid due date" }, { status: 400 })
        }
        data.dueDate = due
        // Future due date → allow overdue notifications again
        const today = startOfToday()
        const dueDay = new Date(due)
        dueDay.setHours(0, 0, 0, 0)
        if (dueDay.getTime() >= today.getTime()) {
          data.overdueNotifiedAt = null
        }
      }

      if (typeof body.userId === "string" && body.userId.trim()) {
        const nextUserId = body.userId.trim()
        if (nextUserId !== existing.userId) {
          const target = await db.user.findUnique({
            where: { id: nextUserId },
            select: { id: true, name: true, email: true, isActive: true },
          })
          if (!target) {
            return NextResponse.json({ error: "Target user not found" }, { status: 404 })
          }
          if (!target.isActive) {
            return NextResponse.json(
              { error: "Cannot reassign to a deactivated user" },
              { status: 400 }
            )
          }
          data.userId = nextUserId
        }
      }

      if (typeof body.status === "string") {
        const nextStatus = body.status.trim().toUpperCase()
        if (nextStatus !== "ASSIGNED" && nextStatus !== "DONE") {
          return NextResponse.json({ error: "Status must be ASSIGNED or DONE" }, { status: 400 })
        }
        data.status = nextStatus
        if (nextStatus === "DONE") {
          data.completedAt = existing.completedAt || new Date()
        } else {
          data.completedAt = null
        }
      }

      const hasFieldChange =
        data.title !== undefined ||
        data.notes !== undefined ||
        data.dueDate !== undefined ||
        data.userId !== undefined ||
        data.status !== undefined
      if (!hasFieldChange) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
      }

      const updated = await db.trainingAssignment.update({
        where: { id },
        data,
      })

      const userMap = await loadUserMap([updated.userId, updated.assignedById, existing.userId])
      const notifyIds = new Set<string>([updated.userId])
      if (existing.userId !== updated.userId) notifyIds.add(existing.userId)

      const dueLabel = new Date(updated.dueDate).toLocaleDateString()
      await notifyUsers({
        userIds: [...notifyIds],
        title: "Training assignment updated",
        message:
          existing.userId !== updated.userId
            ? `"${updated.title}" was reassigned (due ${dueLabel}). Check Learning → My Training.`
            : `"${updated.title}" was updated — due ${dueLabel}. Check Learning → My Training.`,
        type: "INFO",
        link: "/dashboard/training/my",
        metadata: { kind: "training_updated", assignmentId: updated.id },
      })

      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role || "",
        department: "LEARNING",
        page: "training",
        action: "UPDATE",
        entityType: "TrainingAssignment",
        entityId: updated.id,
        description: `Updated training assignment "${updated.title}"`,
        oldValue: JSON.stringify({
          title: existing.title,
          notes: existing.notes,
          dueDate: existing.dueDate,
          userId: existing.userId,
          status: existing.status,
        }),
        newValue: JSON.stringify({
          title: updated.title,
          notes: updated.notes,
          dueDate: updated.dueDate,
          userId: updated.userId,
          status: updated.status,
        }),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })

      return NextResponse.json({ ok: true, assignment: serializeAssignment(updated, userMap) })
    }

    if (existing.userId !== session.user.id && !admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (existing.status === "DONE") {
      const userMap = await loadUserMap([existing.userId, existing.assignedById])
      return NextResponse.json({
        ok: true,
        assignment: serializeAssignment(existing, userMap),
        alreadyDone: true,
      })
    }

    const updated = await db.trainingAssignment.update({
      where: { id },
      data: { status: "DONE", completedAt: new Date() },
    })

    const userMap = await loadUserMap([updated.userId, updated.assignedById])
    const who = userMap.get(updated.userId)?.name || session.user.name || "A team member"
    await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
      title: "Training completed",
      message: `${who} marked "${updated.title}" as done.`,
      type: "SUCCESS",
      link: "/dashboard/training/assign",
      metadata: { kind: "training_done", assignmentId: updated.id, userId: updated.userId },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "LEARNING",
      page: existing.userId === session.user.id ? "my-training" : "training",
      action: "STATUS_CHANGE",
      entityType: "TrainingAssignment",
      entityId: updated.id,
      description: `${who} marked training "${updated.title}" as done`,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({ status: "DONE", completedAt: updated.completedAt }),
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ ok: true, assignment: serializeAssignment(updated, userMap) })
  } catch (err) {
    console.error("[training/assignments PATCH]", err)
    return NextResponse.json(
      {
        error: "Failed to update assignment",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
