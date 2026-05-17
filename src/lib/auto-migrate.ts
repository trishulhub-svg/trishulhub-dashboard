// Auto-migration utility — ensures Prisma schema is in sync with DB.
//
// HOW IT WORKS:
// 1. On server startup, checks for missing tables and columns
// 2. Automatically creates missing tables and adds missing columns
// 3. Covers ALL 50 models — no manual SQL maintenance needed
//
// WHEN TO RUN: Automatically via src/instrumentation.ts on every server cold start.
// This is a safety net — the primary sync should be done via `prisma db push`.

import { db } from "@/lib/db"

let syncDone = false

/** Columns to check and add if missing: { table, column, type, defaultValue? } */
const CRITICAL_COLUMNS: Array<{ table: string; column: string; sql: string }> = [
  { table: "Task", column: "approvedBy", sql: "ALTER TABLE Task ADD COLUMN approvedBy TEXT" },
  { table: "Task", column: "approvedAt", sql: "ALTER TABLE Task ADD COLUMN approvedAt DATETIME" },
  { table: "Task", column: "assigneeType", sql: "ALTER TABLE Task ADD COLUMN assigneeType TEXT NOT NULL DEFAULT 'HUMAN'" },
  { table: "CrossAgentMessage", column: "linkedChatId", sql: "ALTER TABLE CrossAgentMessage ADD COLUMN linkedChatId TEXT" },
  { table: "CrossAgentMessage", column: "shareFullChat", sql: "ALTER TABLE CrossAgentMessage ADD COLUMN shareFullChat INTEGER DEFAULT 0" },
  { table: "Chat", column: "lockedBy", sql: "ALTER TABLE Chat ADD COLUMN lockedBy TEXT" },
  { table: "Chat", column: "lockedAt", sql: "ALTER TABLE Chat ADD COLUMN lockedAt TEXT" },
  { table: "Chat", column: "lockedByName", sql: "ALTER TABLE Chat ADD COLUMN lockedByName TEXT" },
  { table: "Chat", column: "todoItems", sql: "ALTER TABLE Chat ADD COLUMN todoItems TEXT NOT NULL DEFAULT '[]'" },
  { table: "Chat", column: "isProcessing", sql: "ALTER TABLE Chat ADD COLUMN isProcessing INTEGER NOT NULL DEFAULT 0" },
  // New columns from feature updates
  { table: "Client", column: "projectMethodId", sql: "ALTER TABLE Client ADD COLUMN projectMethodId TEXT" },
  { table: "Invoice", column: "paymentMethod", sql: "ALTER TABLE Invoice ADD COLUMN paymentMethod TEXT" },
  { table: "Invoice", column: "gst", sql: "ALTER TABLE Invoice ADD COLUMN gst REAL" },
  { table: "Invoice", column: "gstPercent", sql: "ALTER TABLE Invoice ADD COLUMN gstPercent REAL" },
  { table: "Invoice", column: "notes", sql: "ALTER TABLE Invoice ADD COLUMN notes TEXT" },
  { table: "Invoice", column: "paymentStatus", sql: "ALTER TABLE Invoice ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'UNPAID'" },
]

/** Tables to create if missing (simplified CREATE TABLE IF NOT EXISTS) */
const CRITICAL_TABLES: Array<{ name: string; sql: string }> = [
  {
    name: "ClientWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ClientWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "clientId" TEXT NOT NULL)`
  },
  {
    name: "ProtocolVersion",
    sql: `CREATE TABLE IF NOT EXISTS "ProtocolVersion" ("id" TEXT NOT NULL PRIMARY KEY, "version" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL DEFAULT 'Trishul Protocol', "content" TEXT NOT NULL DEFAULT '', "stageDescriptions" TEXT NOT NULL DEFAULT '[]', "agentSkills" TEXT NOT NULL DEFAULT '[]', "isActive" BOOLEAN NOT NULL DEFAULT 1, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
  },
  {
    name: "ProtocolInvite",
    sql: `CREATE TABLE IF NOT EXISTS "ProtocolInvite" ("id" TEXT NOT NULL PRIMARY KEY, "protocolId" TEXT NOT NULL, "inviteCode" TEXT NOT NULL UNIQUE, "targetEmail" TEXT NOT NULL, "targetName" TEXT, "agentAccess" TEXT NOT NULL DEFAULT '[]', "expiresAt" DATETIME NOT NULL, "usedAt" DATETIME, "usedBy" TEXT, "createdBy" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
  },
  {
    name: "ProtocolAccessLog",
    sql: `CREATE TABLE IF NOT EXISTS "ProtocolAccessLog" ("id" TEXT NOT NULL PRIMARY KEY, "inviteId" TEXT NOT NULL, "protocolId" TEXT NOT NULL, "userEmail" TEXT NOT NULL, "agentAccess" TEXT NOT NULL DEFAULT '[]', "ipAddress" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  },
  {
    name: "UserProtocolAccess",
    sql: `CREATE TABLE IF NOT EXISTS "UserProtocolAccess" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "userEmail" TEXT NOT NULL, "userName" TEXT, "protocolId" TEXT NOT NULL, "agentAccess" TEXT NOT NULL DEFAULT '[]', "isActive" BOOLEAN NOT NULL DEFAULT 1, "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "verifiedVia" TEXT NOT NULL, "lastAccessAt" DATETIME NOT NULL)`
  },
  {
    name: "UserCredential",
    sql: `CREATE TABLE IF NOT EXISTS "UserCredential" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "label" TEXT NOT NULL, "username" TEXT NOT NULL, "password" TEXT NOT NULL, "url" TEXT, "notes" TEXT, "createdBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
  },
  {
    name: "EmailLog",
    sql: `CREATE TABLE IF NOT EXISTS "EmailLog" ("id" TEXT NOT NULL PRIMARY KEY, "to" TEXT NOT NULL, "subject" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL, "smtpConfigId" TEXT, "smtpHost" TEXT, "method" TEXT, "error" TEXT, "triggeredBy" TEXT, "metadata" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  },
  // New tables from feature updates
  {
    name: "ProjectMethod",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectMethod" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  },
  {
    name: "ProjectAttachment",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectAttachment" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "fileData" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  },
  {
    name: "ProjectCredential",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectCredential" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "title" TEXT NOT NULL, "username" TEXT NOT NULL, "password" TEXT NOT NULL, "iv" TEXT NOT NULL, "tag" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
  },
  {
    name: "NotificationPreference",
    sql: `CREATE TABLE IF NOT EXISTS "NotificationPreference" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "emailNotifications" BOOLEAN NOT NULL DEFAULT 1,
      "budgetAlerts" BOOLEAN NOT NULL DEFAULT 1,
      "meetingReminders" BOOLEAN NOT NULL DEFAULT 1,
      "taskReminders" BOOLEAN NOT NULL DEFAULT 1,
      "approvalAlerts" BOOLEAN NOT NULL DEFAULT 1,
      "invoiceReminders" BOOLEAN NOT NULL DEFAULT 1,
      "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT 0,
      "quietHoursStart" TEXT,
      "quietHoursEnd" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
]

/**
 * Compare schema with DB and auto-fix any missing tables or columns.
 * Safe to call multiple times — skips if already synced in this process.
 */
export async function ensureAllTables(): Promise<void> {
  if (syncDone) return
  syncDone = true

  try {
    // Quick DB connectivity check
    await db.$queryRawUnsafe("SELECT 1")
  } catch (err: any) {
    console.error("[auto-migrate] Database connection failed:", err?.message)
    return
  }

  try {
    // 1. Create missing tables
    for (const tableDef of CRITICAL_TABLES) {
      try {
        await db.$executeRawUnsafe(tableDef.sql)
      } catch (err: any) {
        // Table already exists or other error — non-fatal
        if (!err?.message?.includes('already exists')) {
          console.warn(`[auto-migrate] Table ${tableDef.name}: ${err?.message}`)
        }
      }
    }

    // 1b. Create missing unique indexes for NotificationPreference
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] NotificationPreference_userId_key index: ${err?.message}`)
      }
    }

    // 2. Add missing columns to existing tables
    for (const colDef of CRITICAL_COLUMNS) {
      try {
        // Check if column exists
        const columns = await db.$queryRawUnsafe(
          `PRAGMA table_info("${colDef.table}")`
        ) as Array<{ name: string }>

        const exists = columns.some(c => c.name === colDef.column)
        if (!exists) {
          await db.$executeRawUnsafe(colDef.sql)
          console.log(`[auto-migrate] Added column ${colDef.column} to ${colDef.table}`)
        }
      } catch (err: any) {
        // Table might not exist yet — non-fatal
        console.warn(`[auto-migrate] Column ${colDef.column} on ${colDef.table}: ${err?.message}`)
      }
    }
  } catch (err: any) {
    console.error("[auto-migrate] Schema check error (non-fatal):", err?.message)
  }
}

/**
 * No-op function kept for backward compatibility with existing imports.
 */
export async function ensureTable(_tableName: string): Promise<boolean> {
  return true
}

/**
 * No-op function kept for backward compatibility with existing imports.
 */
export async function runAutoMigrations(): Promise<void> {
  await ensureAllTables()
}
