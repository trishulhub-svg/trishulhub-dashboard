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

// GET /api/training/documents/[id] - Get single document
export async function GET(
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

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

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
