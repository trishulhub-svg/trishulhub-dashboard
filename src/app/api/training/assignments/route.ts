import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { notifyRoles, notifyUsers } from "@/lib/notify"
import { z } from "zod"
import { randomBytes } from "crypto"

const assignSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  notes: z.string().max(1000).optional().nullable(),
  dueDate: z.string().min(1),
})

let tableReady = false

function newId() {
  return `ta_${randomBytes(12).toString("hex")}`
}

async function ensureTrainingAssignmentTable() {
  if (tableReady) return
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TrainingAssignment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "dueDate" DATETIME NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
      "assignedById" TEXT NOT NULL,
      "completedAt" DATETIME,
      "overdueNotifiedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "TrainingAssignment_userId_status_idx" ON "TrainingAssignment"("userId", "status")`
      )
    } catch { /* ignore */ }
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "TrainingAssignment_dueDate_status_idx" ON "TrainingAssignment"("dueDate", "status")`
      )
    } catch { /* ignore */ }
    tableReady = true
  } catch (err) {
    console.warn(
      "[training/assignments] ensure table:",
      err instanceof Error ? err.message : String(err)
    )
  }
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
  // Prefer active staff; fall back to all non-CLIENT if isActive filter is empty/odd on Turso
  try {
    const active = await db.user.findMany({
      where: {
        isActive: true,
        NOT: { role: "CLIENT" },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    })
    if (active.length > 0) return active
  } catch (err) {
    console.warn("[training/assignments] team active query:", err)
  }
  try {
    return await db.user.findMany({
      where: { NOT: { role: "CLIENT" } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 200,
    })
  } catch (err) {
    console.warn("[training/assignments] team fallback query:", err)
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

    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true, isActive: true },
    })
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const now = new Date()
    let assignment: RawAssignment
    try {
      assignment = await db.trainingAssignment.create({
        data: {
          id: newId(),
          userId: parsed.data.userId,
          title: parsed.data.title.trim(),
          notes: parsed.data.notes?.trim() || null,
          dueDate: due,
          status: "ASSIGNED",
          assignedById: session.user.id,
          createdAt: now,
          updatedAt: now,
        },
      })
    } catch (createErr) {
      // Fallback raw insert if Prisma client/model mismatch
      console.warn("[training/assignments POST] prisma create failed, trying raw:", createErr)
      const id = newId()
      await db.$executeRawUnsafe(
        `INSERT INTO "TrainingAssignment" ("id","userId","title","notes","dueDate","status","assignedById","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?)`,
        id,
        parsed.data.userId,
        parsed.data.title.trim(),
        parsed.data.notes?.trim() || null,
        due.toISOString(),
        "ASSIGNED",
        session.user.id,
        now.toISOString(),
        now.toISOString()
      )
      assignment = {
        id,
        userId: parsed.data.userId,
        title: parsed.data.title.trim(),
        notes: parsed.data.notes?.trim() || null,
        dueDate: due,
        status: "ASSIGNED",
        assignedById: session.user.id,
        completedAt: null,
        overdueNotifiedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    }

    await notifyUsers({
      userIds: parsed.data.userId,
      title: "New training assigned",
      message: `You have been assigned "${assignment.title}" — due ${due.toLocaleDateString()}. Open Learning → My Training.`,
      type: "INFO",
      link: "/dashboard/training/my",
      metadata: { kind: "training_assigned", assignmentId: assignment.id },
    })

    const userMap = await loadUserMap([assignment.userId, assignment.assignedById])
    return NextResponse.json(
      { ok: true, assignment: serializeAssignment(assignment, userMap) },
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
      return NextResponse.json({ ok: true, deleted: true })
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
