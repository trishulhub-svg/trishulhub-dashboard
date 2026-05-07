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
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
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
    const questions = JSON.parse(test.questions)

    // Check if this is an employee taking the test (via assignment check)
    const assignmentId = new URL(req.url).searchParams.get("assignmentId")
    let hideAnswers = false

    if (assignmentId) {
      const assignment = await db.trainingAssignment.findFirst({
        where: { id: assignmentId, assignedTo: userId, testId: id },
      })
      if (assignment && !["COMPLETED", "PASSED", "FAILED"].includes(assignment.status)) {
        hideAnswers = true
      }
    }

    // If user is not admin, hide answers
    if (!isAdmin(session.user.role)) {
      hideAnswers = true
    }

    const responseData = {
      ...test,
      questions: hideAnswers
        ? questions.map((q: any) => ({
            question: q.question,
            options: q.options,
          }))
        : questions,
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error("[training/tests/[id]] GET error:", error.message)
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
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 10, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const test = await db.trainingTest.findUnique({ where: { id } })
    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 })

    // Null out testId on assignments before deleting test (FK constraint)
    await db.trainingAssignment.updateMany({ where: { testId: id }, data: { testId: null } })
    await db.trainingTest.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[training/tests/[id]] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
