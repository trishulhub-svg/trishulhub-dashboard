import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageTraining } from "@/lib/rbac"
// TODO: Use trainingRateLimit() from rate-limit.ts for consistency (W33)
import { rateLimit } from "@/lib/rate-limit"
import { ensureTrainingTables } from "@/lib/training-migration"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

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
    const page = Math.max(Number(searchParams.get("page")) || 1, 1)
    const skip = (page - 1) * 50

    const where: Record<string, unknown> = {}

    // Non-admin users see only their own assignments
    if (!canManageTraining(userRole)) {
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
      skip,
    })

    const total = await db.trainingAssignment.count({ where })
    return NextResponse.json({ assignments, total, page, totalPages: Math.ceil(total / 50) })
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
    if (!canManageTraining(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // TODO: Use validateRequest() with createAssignmentSchema from validations.ts (W32)
    // TODO: Align body field `employeeIds` with Zod schema `assignedTo` naming (W36)
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
    if (!Array.isArray(employeeIds) || employeeIds.length === 0 || employeeIds.length > 100) {
      return NextResponse.json({ error: "employeeIds must be an array of 1-100 user IDs" }, { status: 400 })
    }
    if (!testLevel || !["LOW", "MEDIUM", "HIGH"].includes(testLevel)) {
      return NextResponse.json({ error: "Test level must be LOW, MEDIUM, or HIGH" }, { status: 400 })
    }
    const parsedTimeLimit = timeLimit ? Math.max(5, Math.min(120, parseInt(String(timeLimit)) || 20)) : null

    if (dueDate && isNaN(Date.parse(String(dueDate)))) {
      return NextResponse.json({ error: "dueDate must be a valid date string" }, { status: 400 })
    }

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

    // Verify document exists
    const document = await db.trainingDocument.findUnique({ where: { id: documentId } })
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Create assignments for each employee (atomic transaction)
    const assignments: { id: string; assignedTo: string; documentId: string }[] = []
    const notifications: { userId: string; title: string; message: string; type: string; link: string; metadata: string }[] = []

    await db.$transaction(async (tx) => {
      for (const empId of employeeIds) {
        // Check if assignment already exists
        const existing = await tx.trainingAssignment.findFirst({
          where: {
            documentId,
            assignedTo: empId,
            status: { in: ["ASSIGNED", "READ", "TEST_STARTED"] },
          },
        })
        if (existing) continue

        const assignment = await tx.trainingAssignment.create({
          data: {
            documentId,
            testId: test.id,
            assignedTo: empId,
            assignedBy: userId,
            testLevel,
            timeLimit: parsedTimeLimit,
            dueDate: dueDate ? new Date(String(dueDate)) : null,
            status: "ASSIGNED",
          },
          include: {
            employee: { select: { id: true, name: true, email: true } },
            assigner: { select: { id: true, name: true } },
          },
        })
        assignments.push(assignment)

        notifications.push({
          userId: empId,
          title: "New Training Assigned",
          message: `You have been assigned training: "${document.topic}" (${testLevel} level test)`,
          type: "TASK",
          link: `/dashboard/my-training`,
          metadata: JSON.stringify({ assignmentId: assignment.id, documentId }),
        })
      }
    })

    // Send notifications (batch createMany for atomicity)
    if (notifications.length > 0) {
      try {
        await db.notification.createMany({
          data: notifications,
        })
      } catch (notifyErr: unknown) {
        console.error("[training/assignments] Notification error (non-blocking):", notifyErr instanceof Error ? notifyErr.message : notifyErr)
      }
    }

    // Audit: log training assignment creation (fire-and-forget) — one entry per assignment
    for (const assignment of assignments) {
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "LEARNING", page: "training", action: "ASSIGN",
        entityType: "TrainingAssignment", entityId: assignment.id,
        description: `Assigned training "${document.topic.slice(0, 80)}" (${testLevel} level) to user ${assignment.assignedTo}`,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
    }

    return NextResponse.json(assignments, { status: 201 })
  } catch (error: unknown) {
    console.error("[training/assignments] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
