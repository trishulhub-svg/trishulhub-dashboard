import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageTraining } from "@/lib/rbac"
// TODO: Use trainingRateLimit() from rate-limit.ts for consistency (W33)
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"

// GET /api/training/assignments/[id] - Get single assignment with full details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      console.error("[training/assignments/[id]] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const assignment = await db.trainingAssignment.findUnique({
      where: { id },
      include: {
        document: true,
        employee: { select: { id: true, name: true, email: true, avatar: true } },
        assigner: { select: { id: true, name: true } },
        test: { select: { id: true, level: true, timeLimit: true, createdAt: true, documentId: true, questions: true, generatedBy: true } },
        attempts: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    // Only admin or the assigned employee can view
    if (!canManageTraining(session.user.role) && assignment.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // C12: Reconstruct response without leaking correct answers to non-completed employees
    if (assignment.test && assignment.test.questions) {
      try {
        const questions = typeof assignment.test.questions === 'string'
          ? JSON.parse(assignment.test.questions)
          : assignment.test.questions || []
        const isCompleted = ["COMPLETED", "PASSED", "FAILED"].includes(assignment.status)

        if (!canManageTraining(session.user.role) && !isCompleted) {
          // Strip correct answers for employee taking the test
          assignment.test.questions = JSON.stringify(
            (questions as Array<{ question: string; options: string[] }>).map((q) => ({
              question: q.question,
              options: q.options,
            }))
          )
        }

        // For completed tests, attach the last attempt's answers for review
        if (isCompleted && assignment.attempts.length > 0) {
          try {
            const attemptAnswers: number[] = JSON.parse(assignment.attempts[0].answers || "[]")
            assignment.test.questions = JSON.stringify(
              (questions as Array<{ question: string; options: string[]; correctAnswer?: number; explanation?: string }>).map((q, idx: number) => ({
                ...q,
                selectedAnswer: attemptAnswers[idx] ?? null,
              }))
            )
          } catch {
            // ignore parse error
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return NextResponse.json(assignment)
  } catch (error: unknown) {
    console.error("[training/assignments/[id]] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/training/assignments/[id] - Update assignment status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      console.error("[training/assignments/[id]] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { status } = body as { status?: string }

    const validStatuses = ["ASSIGNED", "READ", "TEST_STARTED", "COMPLETED", "PASSED", "FAILED"]
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // PASSED/FAILED can only be set via test submission endpoint
    if (["PASSED", "FAILED"].includes(status)) {
      return NextResponse.json({ error: "This status is set automatically by test submission" }, { status: 400 })
    }

    const assignment = await db.trainingAssignment.findUnique({ where: { id } })
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    // Only admin or the assigned employee can update
    if (!canManageTraining(session.user.role) && assignment.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Status flow validation (W42: Admin bypass for any valid status transition)
    const validTransitions: Record<string, string[]> = {
      ASSIGNED: ["READ", "TEST_STARTED"],
      READ: ["TEST_STARTED"],
      TEST_STARTED: ["COMPLETED"],
    }

    if (!canManageTraining(session.user.role) && validTransitions[assignment.status] && !validTransitions[assignment.status].includes(status)) {
      return NextResponse.json({ error: `Cannot transition from ${assignment.status} to ${status}` }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const existing = await tx.trainingAssignment.findUnique({ where: { id } })
      if (!existing) throw new Error("NOT_FOUND")
      return await tx.trainingAssignment.update({
        where: { id },
        data: { status },
        include: {
          document: { select: { id: true, topic: true } },
          employee: { select: { id: true, name: true } },
        },
      })
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }
    console.error("[training/assignments/[id]] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
