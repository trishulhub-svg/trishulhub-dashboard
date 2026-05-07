// ━━ Vercel Cron Endpoint — Triggers Autonomous Thinking Cycles ━━
// This endpoint is called by Vercel Cron every 2 minutes.
// It checks which agents are due for a thinking cycle and runs them.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { runAutonomyCycle, initAutonomyConfigs } from "@/lib/ai/autonomy-engine"

// ━━ Auto-migration for Turso ━━
let migrationAttempted = false

async function ensureAutonomyTables(): Promise<{ ok: boolean; error?: string }> {
  if (migrationAttempted) return { ok: true }
  migrationAttempted = true

  try {
    await db.$queryRawUnsafe(`SELECT 1 FROM AgentAutonomyConfig LIMIT 0`)
    return { ok: true }
  } catch {
    console.log("[autonomy] AgentAutonomyConfig table missing — running auto-migration...")
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AgentAutonomyConfig" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "agentId" TEXT NOT NULL,
          "enabled" BOOLEAN NOT NULL DEFAULT 0,
          "interval" INTEGER NOT NULL DEFAULT 5,
          "lastRunAt" DATETIME,
          "nextRunAt" DATETIME,
          "totalRuns" INTEGER NOT NULL DEFAULT 0,
          "totalErrors" INTEGER NOT NULL DEFAULT 0,
          "lastError" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PAUSED',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AgentAutonomyConfig_agentId_key" UNIQUE ("agentId"),
          FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AgentActivityLog" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "agentId" TEXT NOT NULL,
          "configId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "result" TEXT,
          "status" TEXT NOT NULL DEFAULT 'SUCCESS',
          "tokensUsed" INTEGER NOT NULL DEFAULT 0,
          "cost" REAL NOT NULL DEFAULT 0,
          "duration" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("configId") REFERENCES "AgentAutonomyConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentActivityLog_agentId_createdAt_idx" ON "AgentActivityLog"("agentId", "createdAt")`)
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentActivityLog_configId_createdAt_idx" ON "AgentActivityLog"("configId", "createdAt")`)
      // Add isAutonomous column to CrossAgentMessage if missing
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "CrossAgentMessage" ADD COLUMN "isAutonomous" BOOLEAN NOT NULL DEFAULT 0`)
      } catch { /* column may already exist */ }
      console.log("[autonomy] Auto-migration complete")
      return { ok: true }
    } catch (err: any) {
      console.error("[autonomy] Auto-migration FAILED:", err.message)
      return { ok: false, error: err.message }
    }
  }
}

// Verify cron secret to prevent unauthorized calls
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true // No secret = dev mode, allow all
  return authHeader === `Bearer ${cronSecret}`
}

async function handleRequest(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ensure tables exist (for Turso)
    const migration = await ensureAutonomyTables()
    if (!migration.ok) {
      return NextResponse.json({ error: `Migration failed: ${migration.error}` }, { status: 500 })
    }

    // Initialize configs for agents that don't have one
    await initAutonomyConfigs()

    // Run autonomy cycle
    const result = await runAutonomyCycle()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    })
  } catch (error: any) {
    console.error("[autonomy/cron] Fatal error:", error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function GET(request: Request) { return handleRequest(request) }
export async function POST(request: Request) { return handleRequest(request) }
