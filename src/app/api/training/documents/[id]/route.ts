import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageTraining } from "@/lib/rbac"
// TODO: Use trainingRateLimit() from rate-limit.ts for consistency (W33)
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

// GET /api/training/documents/[id] - Get single document
export async function GET(
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
      console.error("[training/documents/[id]] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

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
  } catch (error: unknown) {
    console.error("[training/documents/[id]] GET error:", error instanceof Error ? error.message : error)
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
    if (!canManageTraining(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      console.error("[training/documents/[id]] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 10, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { id } = await params

    const document = await db.trainingDocument.findUnique({ where: { id } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Capture topic for audit log before deletion
    const documentTopic = document.topic

    // Cascading delete wrapped in transaction for atomicity
    await db.$transaction(async (tx) => {
      const assignments = await tx.trainingAssignment.findMany({ where: { documentId: id } })
      for (const assignment of assignments) {
        await tx.testAttempt.deleteMany({ where: { assignmentId: assignment.id } })
      }
      await tx.trainingAssignment.deleteMany({ where: { documentId: id } })
      await tx.trainingTest.deleteMany({ where: { documentId: id } })
      await tx.trainingDocument.delete({ where: { id } })
    })

    // Audit: log training document deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "LEARNING", page: "training", action: "DELETE",
      entityType: "TrainingDocument", entityId: id,
      description: `Deleted training document: ${documentTopic.slice(0, 100)}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[training/documents/[id]] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
