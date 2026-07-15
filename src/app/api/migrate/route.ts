import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rate-limit"

// TODO (I23): This endpoint duplicates auto-migrate.ts logic.
// Consider consolidating into a single migration source.

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

  // C5/W66: Rate limit migration endpoint (1 per 5 minutes)
  const rl = rateLimit(`migrate:${session.user.id}`, 1, 5 * 60 * 1000)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[migrate] SmtpConfig table creation failed:", err)
      results.SmtpConfig = "failed: table creation error"
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[migrate] EmailVerification table creation failed:", err)
      results.EmailVerification = "failed: table creation error"
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[migrate] Leave table creation failed:", err)
      results.Leave = "failed: table creation error"
    }
  }

  // Check if Availability table exists
  try {
    await db.availability.count({ take: 1 })
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[migrate] Availability table creation failed:", err)
      results.Availability = "failed: table creation error"
    }
  }

  // Check if AvailabilityOverride table exists
  try {
    await db.availabilityOverride.count({ take: 1 })
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[migrate] AvailabilityOverride table creation failed:", err)
      results.AvailabilityOverride = "failed: table creation error"
    }
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
  ]
  for (const idx of indexes) {
    try {
      await db.$executeRawUnsafe(idx.sql)
      indexResults.push(`${idx.name}: ok`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[migrate] Index creation failed (${idx.name}):`, err)
      indexResults.push(`${idx.name}: index creation error`)
    }
  }
  results.indexes = indexResults.join("; ")

  // Verify tables exist
  const verification: Record<string, string> = {}
  try {
    const count = await db.smtpConfig.count({ take: 1 })
    verification.SmtpConfig = `verified (${count} rows)`
  } catch (err: unknown) {
    console.error("[migrate] SmtpConfig verification failed:", err)
    verification.SmtpConfig = "failed: verification error"
  }
  try {
    const count = await db.emailVerification.count({ take: 1 })
    verification.EmailVerification = `verified (${count} rows)`
  } catch (err: unknown) {
    console.error("[migrate] EmailVerification verification failed:", err)
    verification.EmailVerification = "failed: verification error"
  }

  try {
    const count = await db.leave.count({ take: 1 })
    verification.Leave = `verified (${count} rows)`
  } catch (err: unknown) {
    console.error("[migrate] Leave verification failed:", err)
    verification.Leave = "failed: verification error"
  }
  try {
    const count = await db.availability.count({ take: 1 })
    verification.Availability = `verified (${count} rows)`
  } catch (err: unknown) {
    console.error("[migrate] Availability verification failed:", err)
    verification.Availability = "failed: verification error"
  }
  try {
    const count = await db.availabilityOverride.count({ take: 1 })
    verification.AvailabilityOverride = `verified (${count} rows)`
  } catch (err: unknown) {
    console.error("[migrate] AvailabilityOverride verification failed:", err)
    verification.AvailabilityOverride = "failed: verification error"
  }

  const allSuccess = verification.SmtpConfig.startsWith("verified") && verification.EmailVerification.startsWith("verified") && verification.Leave?.startsWith("verified") && verification.Availability?.startsWith("verified") && verification.AvailabilityOverride?.startsWith("verified")

  return NextResponse.json({
    success: allSuccess,
    message: allSuccess ? "Database migration completed successfully" : "Some tables failed to create. Check results below.",
    results,
    verification,
  }, { status: allSuccess ? 200 : 500 })
}
