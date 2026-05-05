import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rate-limit"

// POST /api/training/attempts - Submit test attempt
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
