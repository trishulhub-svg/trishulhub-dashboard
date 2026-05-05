import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// GET /api/training/assignments/[id] - Get single assignment with full details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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
