import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// POST /api/migrate - Create missing database tables (SUPER_ADMIN only)
// This ensures SmtpConfig and EmailVerification tables exist without needing
// to run `npx prisma db push` manually on the Turso database.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can run migrations" }, { status: 403 })
  }

  const results: Record<string, string> = {}

  // Check if SmtpConfig table already exists
  try {
    await db.smtpConfig.count({ take: 1 })
    results.SmtpConfig = "already exists"
  } catch {
    // Table doesn't exist - create it
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SmtpConfig" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "host" TEXT NOT NULL,
          "port" INTEGER NOT NULL DEFAULT 587,
          "username" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "fromEmail" TEXT NOT NULL,
          "fromName" TEXT NOT NULL DEFAULT 'TrishulHub',
          "secure" INTEGER NOT NULL DEFAULT 0,
          "isPrimary" INTEGER NOT NULL DEFAULT 1,
          "isActive" INTEGER NOT NULL DEFAULT 1,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      results.SmtpConfig = "created"
    } catch (err: any) {
      results.SmtpConfig = `failed: ${err.message}`
    }
  }

  // Check if EmailVerification table already exists
  try {
    await db.emailVerification.count({ take: 1 })
    results.EmailVerification = "already exists"
  } catch {
    // Table doesn't exist - create it
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "EmailVerification" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "newEmail" TEXT NOT NULL,
          "otp" TEXT NOT NULL,
          "verified" INTEGER NOT NULL DEFAULT 0,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "expiresAt" TEXT NOT NULL,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      results.EmailVerification = "created"
    } catch (err: any) {
      results.EmailVerification = `failed: ${err.message}`
    }
  }

  // Check if Leave table exists
  try {
    await db.leave.count({ take: 1 })
    results.Leave = "already exists"
  } catch {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Leave" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "leaveType" TEXT NOT NULL,
          "startDate" TEXT NOT NULL,
          "endDate" TEXT NOT NULL,
          "reason" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "approvedBy" TEXT,
          "approvedAt" TEXT,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `)
      results.Leave = "created"
    } catch (err: any) {
      results.Leave = `failed: ${err.message}`
    }
  }

  // Check if Availability table exists
  try {
    await (db as any).availability.count({ take: 1 })
    results.Availability = "already exists"
  } catch {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Availability" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "dayOfWeek" INTEGER NOT NULL,
          "startTime" TEXT NOT NULL,
          "endTime" TEXT NOT NULL,
          "isAvailable" INTEGER NOT NULL DEFAULT 1,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "Availability_userId_dayOfWeek_startTime_endTime_key" UNIQUE ("userId", "dayOfWeek", "startTime", "endTime")
        )
      `)
      results.Availability = "created"
    } catch (err: any) {
      results.Availability = `failed: ${err.message}`
    }
  }

  // Check if AvailabilityOverride table exists
  try {
    await (db as any).availabilityOverride.count({ take: 1 })
    results.AvailabilityOverride = "already exists"
  } catch {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AvailabilityOverride" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "date" TEXT NOT NULL,
          "startTime" TEXT,
          "endTime" TEXT,
          "isAvailable" INTEGER NOT NULL DEFAULT 0,
          "reason" TEXT,
          "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
          "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      results.AvailabilityOverride = "created"
    } catch (err: any) {
      results.AvailabilityOverride = `failed: ${err.message}`
    }
  }

  // ━━ Training System Tables (added in training feature commit) ━━

  // Check if TrainingDocument table exists
  try {
    await (db as any).trainingDocument.count({ take: 1 })
    results.TrainingDocument = "already exists"
  } catch {
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
      results.TrainingDocument = "created"
    } catch (err: any) {
      results.TrainingDocument = `failed: ${err.message}`
    }
  }

  // Check if TrainingTest table exists
  try {
    await (db as any).trainingTest.count({ take: 1 })
    results.TrainingTest = "already exists"
  } catch {
    try {
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
      results.TrainingTest = "created"
    } catch (err: any) {
      results.TrainingTest = `failed: ${err.message}`
    }
  }

  // Check if TrainingAssignment table exists
  try {
    await (db as any).trainingAssignment.count({ take: 1 })
    results.TrainingAssignment = "already exists"
  } catch {
    try {
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
      results.TrainingAssignment = "created"
    } catch (err: any) {
      results.TrainingAssignment = `failed: ${err.message}`
    }
  }

  // Check if TestAttempt table exists
  try {
    await (db as any).testAttempt.count({ take: 1 })
    results.TestAttempt = "already exists"
  } catch {
    try {
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
      results.TestAttempt = "created"
    } catch (err: any) {
      results.TestAttempt = `failed: ${err.message}`
    }
  }

  // Create indexes if they don't exist
  const indexResults: string[] = []
  const indexes = [
    { name: "EmailVerification_userId_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")` },
    { name: "EmailVerification_newEmail_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_newEmail_idx" ON "EmailVerification"("newEmail")` },
    { name: "EmailVerification_expiresAt_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt")` },
    { name: "Leave_userId_idx", sql: `CREATE INDEX IF NOT EXISTS "Leave_userId_idx" ON "Leave"("userId")` },
    { name: "Leave_status_idx", sql: `CREATE INDEX IF NOT EXISTS "Leave_status_idx" ON "Leave"("status")` },
    { name: "Leave_startDate_idx", sql: `CREATE INDEX IF NOT EXISTS "Leave_startDate_idx" ON "Leave"("startDate")` },
    { name: "Availability_userId_idx", sql: `CREATE INDEX IF NOT EXISTS "Availability_userId_idx" ON "Availability"("userId")` },
    { name: "AvailabilityOverride_userId_idx", sql: `CREATE INDEX IF NOT EXISTS "AvailabilityOverride_userId_idx" ON "AvailabilityOverride"("userId")` },
    { name: "AvailabilityOverride_date_idx", sql: `CREATE INDEX IF NOT EXISTS "AvailabilityOverride_date_idx" ON "AvailabilityOverride"("date")` },
    // Training system indexes
    { name: "TrainingAssignment_assignedTo_idx", sql: `CREATE INDEX IF NOT EXISTS "TrainingAssignment_assignedTo_idx" ON "TrainingAssignment"("assignedTo")` },
    { name: "TrainingAssignment_status_idx", sql: `CREATE INDEX IF NOT EXISTS "TrainingAssignment_status_idx" ON "TrainingAssignment"("status")` },
  ]
  for (const idx of indexes) {
    try {
      await db.$executeRawUnsafe(idx.sql)
      indexResults.push(`${idx.name}: ok`)
    } catch (err: any) {
      indexResults.push(`${idx.name}: ${err.message}`)
    }
  }
  results.indexes = indexResults.join("; ")

  // Verify tables exist
  const verification: Record<string, string> = {}
  try {
    const count = await db.smtpConfig.count({ take: 1 })
    verification.SmtpConfig = `verified (${count} rows)`
  } catch (err: any) {
    verification.SmtpConfig = `failed: ${err.message}`
  }
  try {
    const count = await db.emailVerification.count({ take: 1 })
    verification.EmailVerification = `verified (${count} rows)`
  } catch (err: any) {
    verification.EmailVerification = `failed: ${err.message}`
  }

  try {
    const count = await db.leave.count({ take: 1 })
    verification.Leave = `verified (${count} rows)`
  } catch (err: any) {
    verification.Leave = `failed: ${err.message}`
  }
  try {
    const count = await (db as any).availability.count({ take: 1 })
    verification.Availability = `verified (${count} rows)`
  } catch (err: any) {
    verification.Availability = `failed: ${err.message}`
  }
  try {
    const count = await (db as any).availabilityOverride.count({ take: 1 })
    verification.AvailabilityOverride = `verified (${count} rows)`
  } catch (err: any) {
    verification.AvailabilityOverride = `failed: ${err.message}`
  }

  // Verify training tables
  try {
    const count = await (db as any).trainingDocument.count({ take: 1 })
    verification.TrainingDocument = `verified (${count} rows)`
  } catch (err: any) {
    verification.TrainingDocument = `failed: ${err.message}`
  }
  try {
    const count = await (db as any).trainingTest.count({ take: 1 })
    verification.TrainingTest = `verified (${count} rows)`
  } catch (err: any) {
    verification.TrainingTest = `failed: ${err.message}`
  }
  try {
    const count = await (db as any).trainingAssignment.count({ take: 1 })
    verification.TrainingAssignment = `verified (${count} rows)`
  } catch (err: any) {
    verification.TrainingAssignment = `failed: ${err.message}`
  }
  try {
    const count = await (db as any).testAttempt.count({ take: 1 })
    verification.TestAttempt = `verified (${count} rows)`
  } catch (err: any) {
    verification.TestAttempt = `failed: ${err.message}`
  }

  const allSuccess = verification.SmtpConfig.startsWith("verified") && verification.EmailVerification.startsWith("verified") && verification.Leave?.startsWith("verified") && verification.Availability?.startsWith("verified") && verification.AvailabilityOverride?.startsWith("verified") && verification.TrainingDocument?.startsWith("verified") && verification.TrainingTest?.startsWith("verified") && verification.TrainingAssignment?.startsWith("verified") && verification.TestAttempt?.startsWith("verified")

  return NextResponse.json({
    success: allSuccess,
    message: allSuccess ? "Database migration completed successfully" : "Some tables failed to create. Check results below.",
    results,
    verification,
  }, { status: allSuccess ? 200 : 500 })
}
