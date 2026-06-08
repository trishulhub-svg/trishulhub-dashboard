import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"

// POST /api/training/attempts - Submit test attempt
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      console.error("[training/attempts] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 5, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { assignmentId, answers, timeTaken } = body as { assignmentId?: string; answers?: number[]; timeTaken?: number }

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
    let questions: { question: string; options: string[]; correctAnswer: number; explanation?: string }[]
    try {
      questions = JSON.parse(assignment.test.questions)
    } catch {
      return NextResponse.json({ error: "Failed to parse test questions" }, { status: 500 })
    }

    // Validate answers length matches questions count
    if (answers.length !== questions.length) {
      return NextResponse.json(
        { error: `Expected ${questions.length} answers but received ${answers.length}` },
        { status: 400 }
      )
    }

    let score = 0

    const results = questions.map((q, idx: number) => {
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

    const passed = questions.length > 0 ? (score / questions.length) >= 0.7 : score >= 7

    // Create attempt and update assignment status in a transaction
    const [attempt, updatedAssignment] = await db.$transaction(async (tx) => {
      const newAttempt = await tx.testAttempt.create({
        data: {
          assignmentId,
          answers: JSON.stringify(answers),
          score,
          total: questions.length,
          timeTaken: timeTaken || null,
          passed,
        },
      })
      const updated = await tx.trainingAssignment.update({
        where: { id: assignmentId },
        data: {
          status: passed ? "PASSED" : "FAILED",
        },
      })
      return [newAttempt, updated]
    })

    // Notify admins about completion
    // TODO: Phase 7 — Use db.notification.createMany for batch notification creation
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
    } catch (notifyErr: unknown) {
      console.error("[training/attempts] Notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : notifyErr)
    }

    return NextResponse.json({
      attempt,
      score,
      total: questions.length,
      passed,
      results,
      percentage: Math.round((score / questions.length) * 100),
    })
  } catch (error: unknown) {
    console.error("[training/attempts] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
