import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// ━━ Auto-migration: Ensure training tables exist on Turso ━━
// Tracks whether migration has been attempted in this serverless instance
let migrationAttempted = false

/**
 * Auto-create training tables if they don't exist.
 * This runs once per cold start and handles the case where Turso
 * doesn't have the training tables (added after initial DB setup).
 */
async function ensureTrainingTables(): Promise<{ ok: boolean; error?: string }> {
  if (migrationAttempted) return { ok: true }
  migrationAttempted = true

  try {
    // Quick check — if TrainingDocument table is accessible, all good
    await db.$queryRawUnsafe(`SELECT 1 FROM TrainingDocument LIMIT 0`)
    return { ok: true }
  } catch {
    // Table doesn't exist — create all training tables
    console.log("[training] TrainingDocument table missing — running auto-migration...")
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingDocument" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "topic" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "summary" TEXT,
          "imageUrl" TEXT,
          "imageUrls" TEXT NOT NULL DEFAULT '[]',
          "status" TEXT NOT NULL DEFAULT 'DRAFT',
          "generatedBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingTest" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "level" TEXT NOT NULL,
          "questions" TEXT NOT NULL,
          "timeLimit" INTEGER NOT NULL DEFAULT 20,
          "generatedBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "TrainingDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "TrainingTest_documentId_level_key" UNIQUE ("documentId", "level")
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TrainingAssignment" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "testId" TEXT,
          "assignedTo" TEXT NOT NULL,
          "assignedBy" TEXT NOT NULL,
          "testLevel" TEXT NOT NULL DEFAULT 'LOW',
          "dueDate" DATETIME,
          "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "TrainingDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("testId") REFERENCES "TrainingTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TestAttempt" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "assignmentId" TEXT NOT NULL,
          "answers" TEXT NOT NULL,
          "score" INTEGER NOT NULL,
          "total" INTEGER NOT NULL DEFAULT 10,
          "timeTaken" INTEGER,
          "passed" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      // Create indexes
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_assignedTo_idx" ON "TrainingAssignment"("assignedTo")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_status_idx" ON "TrainingAssignment"("status")`)
      console.log("[training] Auto-migration complete — all training tables created")
      return { ok: true }
    } catch (createErr: any) {
      console.error("[training] Auto-migration FAILED:", createErr.message)
      return { ok: false, error: createErr.message }
    }
  }
}

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
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
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
        test: true,
        attempts: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    // Only admin or the assigned employee can view
    if (!isAdmin(session.user.role) && assignment.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // If employee and assignment not completed, hide correct answers from test
    // If assignment IS completed, show correct answers + the employee's answers for review
    if (assignment.test) {
      try {
        const questions = JSON.parse(assignment.test.questions)
        const isCompleted = ["COMPLETED", "PASSED", "FAILED"].includes(assignment.status)

        if (!isAdmin(session.user.role) && !isCompleted) {
          // Hide answers for employee taking the test
          ;(assignment.test as any).questions = JSON.stringify(
            questions.map((q: any) => ({
              question: q.question,
              options: q.options,
            }))
          )
        }

        // For completed tests, attach the last attempt's answers to each question for review
        if (isCompleted && assignment.attempts.length > 0) {
          try {
            const attemptAnswers: number[] = JSON.parse(assignment.attempts[0].answers || "[]")
            ;(assignment.test as any).questions = JSON.stringify(
              questions.map((q: any, idx: number) => ({
                ...q,
                selectedAnswer: attemptAnswers[idx] ?? null,
              }))
            )
          } catch {
            // ignore parse error — still show questions with correct answers
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return NextResponse.json(assignment)
  } catch (error: any) {
    console.error("[training/assignments/[id]] GET error:", error.message)
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
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params
    const body = await req.json()
    const { status } = body

    const validStatuses = ["ASSIGNED", "READ", "TEST_STARTED", "COMPLETED", "PASSED", "FAILED"]
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const assignment = await db.trainingAssignment.findUnique({ where: { id } })
    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })

    // Only admin or the assigned employee can update
    if (!isAdmin(session.user.role) && assignment.assignedTo !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Status flow validation
    const validTransitions: Record<string, string[]> = {
      ASSIGNED: ["READ", "TEST_STARTED"],
      READ: ["TEST_STARTED"],
      TEST_STARTED: ["COMPLETED"],
    }

    if (!isAdmin(session.user.role) && validTransitions[assignment.status] && !validTransitions[assignment.status].includes(status)) {
      return NextResponse.json({ error: `Cannot transition from ${assignment.status} to ${status}` }, { status: 400 })
    }

    const updated = await db.trainingAssignment.update({
      where: { id },
      data: { status },
      include: {
        document: { select: { id: true, topic: true } },
        employee: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error("[training/assignments/[id]] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
