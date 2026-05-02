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
  const userRole = (session.user as any)?.role
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

  // Create indexes if they don't exist
  const indexResults: string[] = []
  const indexes = [
    { name: "EmailVerification_userId_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")` },
    { name: "EmailVerification_newEmail_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_newEmail_idx" ON "EmailVerification"("newEmail")` },
    { name: "EmailVerification_expiresAt_idx", sql: `CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt")` },
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

  const allSuccess = verification.SmtpConfig.startsWith("verified") && verification.EmailVerification.startsWith("verified")

  return NextResponse.json({
    success: allSuccess,
    message: allSuccess ? "Database migration completed successfully" : "Some tables failed to create. Check results below.",
    results,
    verification,
  }, { status: allSuccess ? 200 : 500 })
}
