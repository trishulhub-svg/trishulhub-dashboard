import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"

// GET /api/training/documents/[id] - Get single document
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const userId = session.user.id
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const document = await db.trainingDocument.findUnique({
      where: { id },
      include: {
        generator: { select: { id: true, name: true } },
        tests: {
          include: {
            generator: { select: { id: true, name: true } },
            _count: { select: { assignments: true } },
          },
          orderBy: { level: "asc" },
        },
        assignments: {
          include: {
            employee: { select: { id: true, name: true, email: true } },
            assigner: { select: { id: true, name: true } },
            test: true,
            attempts: { orderBy: { createdAt: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { tests: true, assignments: true } },
      },
    })

    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    return NextResponse.json(document)
  } catch (error: any) {
    console.error("[training/documents/[id]] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/training/documents/[id] - Delete document
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

    const document = await db.trainingDocument.findUnique({ where: { id } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Delete in correct order to respect FK constraints:
    // 1. Delete test attempts (via assignments)
    // 2. Delete assignments
    // 3. Delete tests (cascade already handled by schema, but be explicit)
    // 4. Delete document
    const assignments = await db.trainingAssignment.findMany({ where: { documentId: id }, select: { id: true } })
    for (const a of assignments) {
      await db.testAttempt.deleteMany({ where: { assignmentId: a.id } })
    }
    await db.trainingAssignment.deleteMany({ where: { documentId: id } })
    await db.trainingTest.deleteMany({ where: { documentId: id } })
    await db.trainingDocument.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[training/documents/[id]] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
