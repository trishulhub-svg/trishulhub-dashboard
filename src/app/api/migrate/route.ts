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

  try {
    // Create SmtpConfig table if it doesn't exist
    await db.$executeSqlUnsafe(`
      CREATE TABLE IF NOT EXISTS "SmtpConfig" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "host" TEXT NOT NULL,
        "port" INTEGER NOT NULL DEFAULT 587,
        "username" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "fromEmail" TEXT NOT NULL,
        "fromName" TEXT NOT NULL DEFAULT 'TrishulHub',
        "secure" BOOLEAN NOT NULL DEFAULT false,
        "isPrimary" BOOLEAN NOT NULL DEFAULT true,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    results.SmtpConfig = "created/verified"

    // Create EmailVerification table if it doesn't exist
    await db.$executeSqlUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailVerification" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL,
        "newEmail" TEXT NOT NULL,
        "otp" TEXT NOT NULL,
        "verified" BOOLEAN NOT NULL DEFAULT false,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    results.EmailVerification = "created/verified"

    // Create indexes if they don't exist (SQLite ignores IF NOT EXISTS for indexes)
    try {
      await db.$executeSqlUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")`)
    } catch { /* index may already exist */ }
    try {
      await db.$executeSqlUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_newEmail_idx" ON "EmailVerification"("newEmail")`)
    } catch { /* index may already exist */ }
    try {
      await db.$executeSqlUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt")`)
    } catch { /* index may already exist */ }

    results.indexes = "created/verified"

    return NextResponse.json({
      success: true,
      message: "Database migration completed successfully",
      results,
    })
  } catch (error: any) {
    console.error("[migrate] Error:", error)
    return NextResponse.json({
      success: false,
      error: `Migration failed: ${error.message}`,
      results,
    }, { status: 500 })
  }
}
