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

// GET /api/training/assignments - List assignments
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Database migration failed: ${migration.error}` }, { status: 500 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || ""

    const where: any = {}

    // Non-admin users see only their own assignments
    if (!isAdmin(userRole)) {
      where.assignedTo = userId
    } else {
      const filterUserId = searchParams.get("assignedTo")
      if (filterUserId) where.assignedTo = filterUserId
    }

    if (status) where.status = status

    const assignments = await db.trainingAssignment.findMany({
      where,
      include: {
        document: { select: { id: true, topic: true, imageUrl: true } },
        employee: { select: { id: true, name: true, email: true, avatar: true } },
        assigner: { select: { id: true, name: true } },
        test: { select: { id: true, level: true, timeLimit: true, createdAt: true } },
        attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(assignments)
  } catch (error: any) {
    console.error("[training/assignments] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/training/assignments - Create assignment(s)
export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { documentId, employeeIds, testLevel, dueDate } = body

    if (!documentId) return NextResponse.json({ error: "Document ID is required" }, { status: 400 })
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: "At least one employee must be selected" }, { status: 400 })
    }
    if (!testLevel || !["LOW", "MEDIUM", "HIGH"].includes(testLevel)) {
      return NextResponse.json({ error: "Test level must be LOW, MEDIUM, or HIGH" }, { status: 400 })
    }

    // Find the test for this document and level
    const test = await db.trainingTest.findUnique({
      where: { documentId_level: { documentId, level: testLevel } },
    })
    if (!test) return NextResponse.json({ error: "Test not found for this document and level. Generate a test first." }, { status: 404 })

    // Verify document exists
    const document = await db.trainingDocument.findUnique({ where: { id: documentId } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Create assignments for each employee
    const assignments: any[] = []
    for (const empId of employeeIds) {
      // Check if assignment already exists
      const existing = await db.trainingAssignment.findFirst({
        where: {
          documentId,
          assignedTo: empId,
          status: { in: ["ASSIGNED", "READ", "TEST_STARTED"] },
        },
      })
      if (existing) continue

      const assignment = await db.trainingAssignment.create({
        data: {
          documentId,
          testId: test.id,
          assignedTo: empId,
          assignedBy: userId,
          testLevel,
          dueDate: dueDate ? new Date(dueDate) : null,
          status: "ASSIGNED",
        },
        include: {
          employee: { select: { id: true, name: true, email: true } },
          assigner: { select: { id: true, name: true } },
        },
      })
      assignments.push(assignment)

      // Create notification for the employee
      try {
        await db.notification.create({
          data: {
            userId: empId,
            title: "New Training Assigned",
            message: `You have been assigned training: "${document.topic}" (${testLevel} level test)`,
            type: "TASK",
            link: `/dashboard/my-training`,
            metadata: JSON.stringify({ assignmentId: assignment.id, documentId }),
          },
        })
      } catch (notifyErr: any) {
        console.error("[training/assignments] Notification error (non-blocking):", notifyErr.message)
      }
    }

    return NextResponse.json(assignments, { status: 201 })
  } catch (error: any) {
    console.error("[training/assignments] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
