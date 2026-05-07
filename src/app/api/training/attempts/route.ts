import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
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

// POST /api/training/attempts - Submit test attempt
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 5, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json()
    const { assignmentId, answers, timeTaken } = body

    if (!assignmentId) return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 })
    if (!answers || !Array.isArray(answers)) return NextResponse.json({ error: "Answers must be an array" }, { status: 400 })

    // Get assignment with test
    const assignment = await db.trainingAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        test: true,
        document: { select: { topic: true } },
      },
    })

    if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    if (assignment.assignedTo !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!assignment.test) return NextResponse.json({ error: "No test assigned" }, { status: 400 })
    if (["COMPLETED", "PASSED", "FAILED"].includes(assignment.status)) {
      return NextResponse.json({ error: "Test already completed" }, { status: 400 })
    }

    // Parse questions and validate
    const questions: any[] = JSON.parse(assignment.test.questions)

    // Validate answers length matches questions count
    if (answers.length !== questions.length) {
      return NextResponse.json(
        { error: `Expected ${questions.length} answers but received ${answers.length}` },
        { status: 400 }
      )
    }

    let score = 0

    const results = questions.map((q: any, idx: number) => {
      const selectedAnswer = answers[idx]
      const correctAnswer = q.correctAnswer
      const isCorrect = selectedAnswer === correctAnswer
      if (isCorrect) score++
      return {
        question: q.question,
        options: q.options,
        correctAnswer,
        selectedAnswer,
        isCorrect,
        explanation: q.explanation,
      }
    })

    const passed = score >= 7 // 70% threshold

    // Create attempt
    const attempt = await db.testAttempt.create({
      data: {
        assignmentId,
        answers: JSON.stringify(answers),
        score,
        total: questions.length,
        timeTaken: timeTaken || null,
        passed,
      },
    })

    // Update assignment status
    await db.trainingAssignment.update({
      where: { id: assignmentId },
      data: {
        status: passed ? "PASSED" : "FAILED",
      },
    })

    // Notify admins about completion
    try {
      const admins = await db.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
      })
      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            title: passed ? "Training Test Passed" : "Training Test Failed",
            message: `${session.user.name} ${passed ? "passed" : "failed"} the "${assignment.document.topic}" test with a score of ${score}/${questions.length}`,
            type: passed ? "SUCCESS" : "WARNING",
            link: `/dashboard/training`,
            metadata: JSON.stringify({ assignmentId, score, passed }),
          },
        })
      }
    } catch (notifyErr: any) {
      console.error("[training/attempts] Notification error (non-blocking):", notifyErr.message)
    }

    return NextResponse.json({
      attempt,
      score,
      total: questions.length,
      passed,
      results,
      percentage: Math.round((score / questions.length) * 100),
    })
  } catch (error: any) {
    console.error("[training/attempts] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
