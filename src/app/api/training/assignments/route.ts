import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"

// GET /api/training/assignments - List assignments
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-create training tables if missing (e.g. Turso DB not yet migrated)
    const migration = await ensureTrainingTables()
    if (!migration.ok) {
      console.error("[training/assignments] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const userRole = session.user.role
    const rl = rateLimit(userId, 30, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") || ""

    const where: Record<string, unknown> = {}

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
        document: { select: { id: true, topic: true, imageUrl: true, imageUrls: true } },
        employee: { select: { id: true, name: true, email: true, avatar: true } },
        assigner: { select: { id: true, name: true } },
        test: { select: { id: true, level: true, timeLimit: true, createdAt: true } },
        attempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json(assignments)
  } catch (error: unknown) {
    console.error("[training/assignments] GET error:", error instanceof Error ? error.message : error)
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
      console.error("[training/assignments] Migration error")
      return NextResponse.json({ error: "Database migration error" }, { status: 500 })
    }

    const userId = session.user.id
    const rl = rateLimit(userId, 10, 60000)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { documentId, employeeIds, testLevel, dueDate, timeLimit } = body as { documentId?: string; employeeIds?: string[]; testLevel?: string; dueDate?: string; timeLimit?: number }

    if (!documentId) return NextResponse.json({ error: "Document ID is required" }, { status: 400 })
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: "At least one employee must be selected" }, { status: 400 })
    }
    if (!testLevel || !["LOW", "MEDIUM", "HIGH"].includes(testLevel)) {
      return NextResponse.json({ error: "Test level must be LOW, MEDIUM, or HIGH" }, { status: 400 })
    }
    const parsedTimeLimit = timeLimit ? Math.max(5, Math.min(120, parseInt(String(timeLimit)) || 20)) : null

    // Permission check: ADMIN cannot assign training to SUPER_ADMIN users
    if (session.user.role === "ADMIN") {
      const targetUsers = await db.user.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, role: true },
      })
      const superAdminTargets = targetUsers.filter((u) => u.role === "SUPER_ADMIN")
      if (superAdminTargets.length > 0) {
        return NextResponse.json({ error: "Admin cannot assign training to Super Admin users" }, { status: 403 })
      }
    }

    // Find the test for this document and level
    const test = await db.trainingTest.findUnique({
      where: { documentId_level: { documentId, level: testLevel } },
    })
    if (!test) return NextResponse.json({ error: "Test not found for this document and level. Generate a test first." }, { status: 404 })

    // Update test timeLimit if admin provides a custom one
    const customTimeLimit = typeof timeLimit === "number" && timeLimit >= 5 && timeLimit <= 120 ? timeLimit : null
    if (customTimeLimit !== null && test.timeLimit !== customTimeLimit) {
      await db.trainingTest.update({
        where: { id: test.id },
        data: { timeLimit: customTimeLimit },
      })
    }

    // Verify document exists
    const document = await db.trainingDocument.findUnique({ where: { id: documentId } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Create assignments for each employee
    // TODO: Phase 7 — Use db.$transaction with createMany for batch assignment creation
    const assignments: { id: string; assignedTo: string; documentId: string }[] = []
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
          timeLimit: parsedTimeLimit,
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
      } catch (notifyErr: unknown) {
        console.error("[training/assignments] Notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : notifyErr)
      }
    }

    return NextResponse.json(assignments, { status: 201 })
  } catch (error: unknown) {
    console.error("[training/assignments] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
