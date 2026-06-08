import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageTraining } from "@/lib/rbac"
// TODO: Use trainingRateLimit() from rate-limit.ts for consistency (W33)
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"

// GET /api/training/tests/[id] - Get test (strip correct answers for employees)
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
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const test = await db.trainingTest.findUnique({
      where: { id },
      include: {
        document: { select: { id: true, topic: true } },
        generator: { select: { id: true, name: true } },
      },
    })

    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 })

    // Parse questions
    let questions: { question: string; options: string[]; correctAnswer?: number; explanation?: string }[]
    try {
      questions = JSON.parse(test.questions)
    } catch {
      return NextResponse.json({ error: "Failed to parse test questions" }, { status: 500 })
    }

    // C13: Authorization check — non-admin must have a valid assignment for this test
    const assignmentId = new URL(req.url).searchParams.get("assignmentId")
    let hideAnswers = false

    if (!canManageTraining(session.user.role)) {
      if (!assignmentId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
      // Check if assignment exists and belongs to user
      const assignment = await db.trainingAssignment.findFirst({
        where: { id: assignmentId, testId: id, assignedTo: userId },
      })
      if (!assignment) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
      hideAnswers = !["COMPLETED", "PASSED", "FAILED"].includes(assignment.status)
    }

    const responseData = {
      ...test,
      questions: hideAnswers
        ? questions.map((q) => ({
            question: q.question,
            options: q.options,
          }))
        : questions,
    }

    return NextResponse.json(responseData)
  } catch (error: unknown) {
    console.error("[training/tests/[id]] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/training/tests/[id] - Delete test
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageTraining(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 10, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const test = await db.trainingTest.findUnique({ where: { id } })
    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 })

    // Null out testId on assignments before deleting test (FK constraint)
    await db.$transaction(async (tx) => {
      await tx.trainingAssignment.updateMany({ where: { testId: id }, data: { testId: null } })
      await tx.trainingTest.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[training/tests/[id]] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
