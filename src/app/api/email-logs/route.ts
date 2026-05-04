import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// Auto-migrate: ensure EmailLog table exists
let logTableChecked = false
let logTableExists = false
async function ensureEmailLogTable(): Promise<{ success: boolean; error?: string }> {
  if (logTableChecked && logTableExists) return { success: true }

  try {
    await (db as any).emailLog.count({ take: 1 })
    logTableChecked = true
    logTableExists = true
    return { success: true }
  } catch {
    console.log("[email-logs] EmailLog table not found, auto-creating...")
  }

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailLog" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "to" TEXT NOT NULL,
        "subject" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "smtpConfigId" TEXT,
        "smtpHost" TEXT,
        "method" TEXT,
        "error" TEXT,
        "triggeredBy" TEXT,
        "metadata" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_type_idx" ON "EmailLog"("type")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_status_idx" ON "EmailLog"("status")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_triggeredBy_idx" ON "EmailLog"("triggeredBy")`) } catch {}
    console.log("[email-logs] EmailLog table created successfully")
  } catch (err: any) {
    console.error("[email-logs] Failed to create EmailLog table:", err.message)
    logTableChecked = false
    logTableExists = false
    return { success: false, error: err.message }
  }

  try {
    await (db as any).emailLog.count({ take: 1 })
    logTableChecked = true
    logTableExists = true
    return { success: true }
  } catch (err: any) {
    logTableChecked = false
    logTableExists = false
    return { success: false, error: err.message }
  }
}

// GET /api/email-logs - List email logs (SUPER_ADMIN only)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can view email logs" }, { status: 403 })
    }

    // Auto-migrate: ensure EmailLog table exists
    const migrateResult = await ensureEmailLogTable()
    if (!migrateResult.success) {
      return NextResponse.json({ error: `Database migration needed: ${migrateResult.error}` }, { status: 500 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || undefined
    const status = searchParams.get("status") || undefined
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: any = {}
    if (type) where.type = type
    if (status) where.status = status

    const [logs, total] = await Promise.all([
      (db as any).emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      (db as any).emailLog.count({ where }),
    ])

    return NextResponse.json({ logs, total })
  } catch (error: any) {
    console.error("[email-logs] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/email-logs - Clear old email logs (SUPER_ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can delete email logs" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const olderThanDays = parseInt(searchParams.get("olderThanDays") || "30")

    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const result = await (db as any).emailLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate.toISOString() },
      },
    })

    return NextResponse.json({ success: true, deleted: result.count })
  } catch (error: any) {
    console.error("[email-logs] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
