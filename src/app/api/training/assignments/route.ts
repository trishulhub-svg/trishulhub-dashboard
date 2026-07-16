import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { notifyRoles, notifyUsers } from "@/lib/notify"
import { z } from "zod"

const assignSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  notes: z.string().max(1000).optional().nullable(),
  dueDate: z.string().min(1),
})

let tableReady = false

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
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TrainingAssignment_userId_status_idx" ON "TrainingAssignment"("userId", "status")`
    )
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "TrainingAssignment_dueDate_status_idx" ON "TrainingAssignment"("dueDate", "status")`
    )
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

function serializeAssignment(a: {
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
  user?: { id: string; name: string; email?: string } | null
  assignedBy?: { id: string; name: string } | null
}) {
  const now = startOfToday()
  const due = new Date(a.dueDate)
  due.setHours(0, 0, 0, 0)
  const isOverdue = a.status !== "DONE" && due.getTime() < now.getTime()
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
    user: a.user || null,
    assignedBy: a.assignedBy || null,
  }
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
      include: { user: { select: { id: true, name: true, email: true } } },
      take: 30,
    })
    for (const item of overdue) {
      await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
        title: "Training overdue",
        message: `${item.user?.name || "A team member"} has not completed "${item.title}" (due ${new Date(item.dueDate).toLocaleDateString()}).`,
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

/**
 * GET /api/training/assignments?mine=1
 * mine=1 → always own assignments (fast path for My Training)
 * default for admin → all + team; for staff → own
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

    const where =
      mineOnly || !admin
        ? { userId: session.user.id }
        : filterUserId
          ? { userId: filterUserId }
          : {}

    const rows = await db.trainingAssignment.findMany({
      where,
      orderBy: [{ dueDate: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    })

    let team: { id: string; name: string; email: string; role: string }[] = []
    if (admin && !mineOnly) {
      team = await db.user.findMany({
        where: {
          isActive: true,
          role: { in: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"] },
        },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      })
    }

    return NextResponse.json({
      assignments: rows.map(serializeAssignment),
      team,
      isAdmin: admin,
    })
  } catch (err) {
    console.error("[training/assignments GET]", err)
    return NextResponse.json(
      {
        error: "Failed to load assignments",
        detail: err instanceof Error ? err.message : String(err),
        assignments: [],
        team: [],
        isAdmin: false,
      },
      { status: 500 }
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
      return NextResponse.json({ error: "Invalid assignment payload" }, { status: 400 })
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
      select: { id: true, name: true, isActive: true },
    })
    if (!target || !target.isActive) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 404 })
    }

    const assignment = await db.trainingAssignment.create({
      data: {
        userId: parsed.data.userId,
        title: parsed.data.title.trim(),
        notes: parsed.data.notes?.trim() || null,
        dueDate: due,
        status: "ASSIGNED",
        assignedById: session.user.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    })

    await notifyUsers({
      userIds: parsed.data.userId,
      title: "New training assigned",
      message: `You have been assigned "${assignment.title}" — due ${due.toLocaleDateString()}. Open Learning → My Training.`,
      type: "INFO",
      link: "/dashboard/training/my",
      metadata: { kind: "training_assigned", assignmentId: assignment.id },
    })

    return NextResponse.json({ ok: true, assignment: serializeAssignment(assignment) }, { status: 201 })
  } catch (err) {
    console.error("[training/assignments POST]", err)
    return NextResponse.json({ error: "Failed to assign training" }, { status: 500 })
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

    const existing = await db.trainingAssignment.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } } },
    })
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
      return NextResponse.json({
        ok: true,
        assignment: serializeAssignment(existing),
        alreadyDone: true,
      })
    }

    const updated = await db.trainingAssignment.update({
      where: { id },
      data: { status: "DONE", completedAt: new Date() },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    })

    const who = updated.user?.name || session.user.name || "A team member"
    await notifyRoles(["SUPER_ADMIN", "ADMIN"], {
      title: "Training completed",
      message: `${who} marked "${updated.title}" as done.`,
      type: "SUCCESS",
      link: "/dashboard/training/assign",
      metadata: { kind: "training_done", assignmentId: updated.id, userId: updated.userId },
    })

    return NextResponse.json({ ok: true, assignment: serializeAssignment(updated) })
  } catch (err) {
    console.error("[training/assignments PATCH]", err)
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 })
  }
}
