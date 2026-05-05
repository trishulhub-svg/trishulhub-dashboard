import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// GET /api/training/tests/[id] - Get test (strip correct answers for employees)
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
