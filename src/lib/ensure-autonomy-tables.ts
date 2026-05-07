// ━━ Shared Autonomy Tables Auto-Migration ━━
// Creates all autonomy-related tables in Turso if they don't exist.
// Used by ALL autonomy API routes to ensure tables are available.
// This replaces the old pattern of each route having its own migration logic.

import { db } from "@/lib/db"

let migrationDone = false

export async function ensureAutonomyTables(): Promise<void> {
  if (migrationDone) return
  migrationDone = true

  try {
    // Try a quick check — if the table exists, we're done
    try {
      await db.$queryRawUnsafe(`SELECT 1 FROM "AgentAutonomyConfig" LIMIT 0`)
      // Table exists — try adding any missing columns (safe: fails silently if column exists)
      try { await db.$executeRawUnsafe(`ALTER TABLE "AgentAutonomyConfig" ADD COLUMN "startedBy" TEXT`) } catch { /* ok */ }
      try { await db.$executeRawUnsafe(`ALTER TABLE "AgentAutonomyConfig" ADD COLUMN "startedByRole" TEXT`) } catch { /* ok */ }
      try { await db.$executeRawUnsafe(`ALTER TABLE "CrossAgentMessage" ADD COLUMN "isAutonomous" BOOLEAN NOT NULL DEFAULT 0`) } catch { /* ok */ }
      return
    } catch {
      // Table doesn't exist — fall through to create it
    }

    console.log("[autonomy-migration] Creating autonomy tables...")

    // 1. AgentAutonomyConfig
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
        "startedBy" TEXT,
        "startedByRole" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AgentAutonomyConfig_agentId_key" UNIQUE ("agentId"),
        FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)

    // 2. AgentActivityLog
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
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentActivityLog_agentId_createdAt_idx" ON "AgentActivityLog"("agentId", "createdAt")`) } catch { /* ok */ }
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentActivityLog_configId_createdAt_idx" ON "AgentActivityLog"("configId", "createdAt")`) } catch { /* ok */ }

    // 3. AgentAutonomousPrompt
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AgentAutonomousPrompt" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "agentId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT 0,
        "isDefault" BOOLEAN NOT NULL DEFAULT 0,
        "createdBy" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentAutonomousPrompt_agentId_isActive_idx" ON "AgentAutonomousPrompt"("agentId", "isActive")`) } catch { /* ok */ }

    console.log("[autonomy-migration] All autonomy tables created successfully")
  } catch (err: any) {
    console.error("[autonomy-migration] FAILED to create tables:", err.message)
    // Reset flag so next request can retry
    migrationDone = false
    throw new Error(`Autonomy tables migration failed: ${err.message}`)
  }
}
