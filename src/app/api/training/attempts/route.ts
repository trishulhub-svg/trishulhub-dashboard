import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rate-limit"
// TODO: Use trainingRateLimit() from rate-limit.ts for consistency (W33)
// TODO: Use validateRequest() with submitTestAttemptSchema from validations.ts (W32)
import { ensureTrainingTables } from "@/lib/training-migration"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// POST /api/training/attempts - Submit test attempt
// Auth: ANY logged-in user can submit. We verify the user is the assignee of
// the TrainingAssignment — we do NOT require admin role. This allows DEVELOPER
// (and MANAGER/ADMIN acting as the assignee) to submit their own training tests.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Defensive: legacy JWT tokens (created before token.id was added) can have
    // session.user.id === undefined. Without this check, the assignment.assignedTo
    // (a real user ID string) would never equal undefined, causing a confusing
    // 403 "Forbidden" error. Fail fast with a clear 401 instead so the user
    // knows to log out and back in.
    if (!session.user.id) {
      console.error("[training/attempts] session.user.id is missing — user likely has a stale JWT. Instruct user to log out and back in.")
      return NextResponse.json(
        { error: "Your session is stale. Please log out and log back in, then try submitting again." },
        { status: 401 }
      )
    }

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
    // Authorization: only the assigned user can submit their own test.
    // We deliberately do NOT check role here — DEVELOPER, MANAGER, and ADMIN
    // are all allowed to submit if they are the assignee. If the check fails,
    // log diagnostic detail server-side (never leak to the client) so we can
    // troubleshoot ID mismatches (e.g. recreated user accounts).
    if (assignment.assignedTo !== userId) {
      console.error(
        `[training/attempts] Forbidden: assignment.assignedTo="${assignment.assignedTo}" !== session.user.id="${userId}" (user=${session.user.email}, role=${session.user.role}, assignmentId=${assignmentId})`
      )
      void logAudit({
        userId,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "LEARNING",
        page: "my-training",
        action: "ACCESS",
        entityType: "TrainingAssignment",
        entityId: assignmentId,
        description: `Forbidden submit attempt: assignment assigned to a different user`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
        status: "FAILURE",
      })
      return NextResponse.json(
        { error: "You are not assigned to this training. If you believe this is an error, ask an admin to reassign it to you, or try logging out and back in." },
        { status: 403 }
      )
    }
    if (!assignment.test) return NextResponse.json({ error: "No test assigned" }, { status: 400 })

    // C14: Transactional submission with TOCTOU re-check to prevent double submission race
    const result = await db.$transaction(async (tx) => {
      const current = await tx.trainingAssignment.findUnique({
        where: { id: assignmentId },
        include: { test: true, document: { select: { topic: true } } },
      })
      if (!current) throw new Error("NOT_FOUND")
      if (current.assignedTo !== userId) throw new Error("FORBIDDEN")
      if (!current.test) throw new Error("NO_TEST")
      if (["COMPLETED", "PASSED", "FAILED"].includes(current.status)) {
        throw new Error("ALREADY_COMPLETED")
      }

      // Parse questions and validate
      let questions: { question: string; options: string[]; correctAnswer: number; explanation?: string }[]
      try {
        questions = JSON.parse(current.test.questions)
      } catch {
        throw new Error("PARSE_ERROR")
      }

      if (answers.length !== questions.length) {
        throw new Error(`WRONG_COUNT:${questions.length}:${answers.length}`)
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

      const passed = questions.length > 0 ? (score / questions.length) >= 0.7 : false

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
        data: { status: passed ? "PASSED" : "FAILED" },
      })
      return { attempt: newAttempt, assignment: updated, score, questions, results, passed }
    })

    // Notify admins about completion (W40: batch createMany)
    try {
      const admins = await db.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN", "MANAGER"] }, isActive: true },
      })
      if (admins.length > 0) {
        await db.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            title: result.passed ? "Training Test Passed" : "Training Test Failed",
            message: `${session.user.name} ${result.passed ? "passed" : "failed"} the "${assignment.document.topic}" test with a score of ${result.score}/${result.questions.length}`,
            type: result.passed ? "SUCCESS" : "WARNING",
            link: `/dashboard/training`,
            metadata: JSON.stringify({ assignmentId, score: result.score, passed: result.passed }),
          })),
        })
      }
    } catch (notifyErr: unknown) {
      console.error("[training/attempts] Notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : notifyErr)
    }

    // Audit: log test submission (fire-and-forget)
    void logAudit({
      userId,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "LEARNING",
      page: "my-training",
      action: "STATUS_CHANGE",
      entityType: "TrainingAssignment",
      entityId: assignmentId,
      description: `Submitted training test "${assignment.document.topic.slice(0, 80)}" — score ${result.score}/${result.questions.length} (${result.passed ? "PASSED" : "FAILED"})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
      status: "SUCCESS",
      metadata: JSON.stringify({ assignmentId, score: result.score, total: result.questions.length, passed: result.passed }),
    })

    return NextResponse.json({
      attempt: result.attempt,
      score: result.score,
      total: result.questions.length,
      passed: result.passed,
      results: result.results,
      percentage: Math.round((result.score / result.questions.length) * 100),
    })
  } catch (error: unknown) {
    if (error instanceof Error) {
      switch (error.message) {
        case "ALREADY_COMPLETED":
          return NextResponse.json({ error: "Test already completed" }, { status: 400 })
        case "NOT_FOUND":
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
        case "FORBIDDEN":
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        case "NO_TEST":
          return NextResponse.json({ error: "No test assigned" }, { status: 400 })
        case "PARSE_ERROR":
          return NextResponse.json({ error: "Failed to parse test questions" }, { status: 500 })
      }
      if (error.message.startsWith("WRONG_COUNT:")) {
        const parts = error.message.split(":")
        return NextResponse.json(
          { error: `Expected ${parts[1]} answers but received ${parts[2]}` },
          { status: 400 }
        )
      }
    }
    console.error("[training/attempts] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
