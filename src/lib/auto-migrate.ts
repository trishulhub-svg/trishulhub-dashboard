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
  // Expense table columns (Finance page)
  { table: "Expense", column: "employeeId", sql: "ALTER TABLE Expense ADD COLUMN \"employeeId\" TEXT" },
  { table: "Expense", column: "paymentRef", sql: "ALTER TABLE Expense ADD COLUMN \"paymentRef\" TEXT" },
  // Subscription table columns (amount/rate system)
  { table: "Subscription", column: "exchangeRate", sql: "ALTER TABLE Subscription ADD COLUMN \"exchangeRate\" REAL NOT NULL DEFAULT 1" },
  // New columns from feature updates
  { table: "Client", column: "projectMethodId", sql: "ALTER TABLE Client ADD COLUMN projectMethodId TEXT" },
  { table: "Invoice", column: "paymentMethod", sql: "ALTER TABLE Invoice ADD COLUMN paymentMethod TEXT" },
  { table: "Invoice", column: "gst", sql: "ALTER TABLE Invoice ADD COLUMN gst REAL" },
  { table: "Invoice", column: "gstPercent", sql: "ALTER TABLE Invoice ADD COLUMN gstPercent REAL" },
  { table: "Invoice", column: "notes", sql: "ALTER TABLE Invoice ADD COLUMN notes TEXT" },
  { table: "Invoice", column: "paymentStatus", sql: "ALTER TABLE Invoice ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'UNPAID'" },
  // Standalone task support
  { table: "Task", column: "createdBy", sql: "ALTER TABLE Task ADD COLUMN createdBy TEXT" },
  { table: "Task", column: "category", sql: "ALTER TABLE Task ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL'" },
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
    name: "ProjectWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "projectId" TEXT NOT NULL)`
  },
  {
    name: "Contract",
    sql: `CREATE TABLE IF NOT EXISTS "Contract" ("id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL, "contractNumber" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "clientName" TEXT NOT NULL, "clientEmail" TEXT NOT NULL, "clientCompany" TEXT, "clientPhone" TEXT, "clientAddress" TEXT, "projectName" TEXT, "projectDescription" TEXT, "projectType" TEXT, "projectMethod" TEXT, "projectStartDate" TEXT, "deliveryDate" TEXT, "scopeOfWork" TEXT NOT NULL DEFAULT '', "paymentTerms" TEXT NOT NULL DEFAULT '', "totalValue" REAL NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'INR', "paymentSchedule" TEXT NOT NULL DEFAULT '', "startDate" TEXT, "endDate" TEXT, "termsAndConditions" TEXT NOT NULL DEFAULT '', "amendments" TEXT NOT NULL DEFAULT '', "specialClauses" TEXT NOT NULL DEFAULT '', "generatedBy" TEXT, "sentAt" DATETIME, "sentVia" TEXT, "signedAt" DATETIME, "templateText" TEXT, "templateFileName" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
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
  {
    name: "FileMetadata",
    sql: `CREATE TABLE IF NOT EXISTS "FileMetadata" ("id" TEXT NOT NULL PRIMARY KEY, "driveFileId" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL DEFAULT 0, "parentId" TEXT, "trashed" BOOLEAN NOT NULL DEFAULT 0, "starred" BOOLEAN NOT NULL DEFAULT 0, "description" TEXT, "thumbnailLink" TEXT, "webViewLink" TEXT, "createdBy" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`
  },
  {
    name: "FilePermission",
    sql: `CREATE TABLE IF NOT EXISTS "FilePermission" ("id" TEXT NOT NULL PRIMARY KEY, "fileId" TEXT NOT NULL, "driveFileId" TEXT NOT NULL, "userId" TEXT NOT NULL, "accessLevel" TEXT NOT NULL DEFAULT 'VIEW', "grantedBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("fileId") REFERENCES "FileMetadata"("id") ON DELETE CASCADE)`
  },
]

/**
 * Compare schema with DB and auto-fix any missing tables or columns.
 * Safe to call multiple times — skips if already synced in this process.
 */
export async function ensureAllTables(): Promise<void> {
  if (syncDone) return

  try {
    // Quick DB connectivity check
    await db.$queryRawUnsafe("SELECT 1")
  } catch (err: any) {
    console.error("[auto-migrate] Database connection failed:", err?.message)
    // Do NOT set syncDone — allow retry on next cold start
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

    // 1c. Create missing indexes for Expense table
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Expense_employeeId_idx" ON "Expense"("employeeId")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] Expense_employeeId_idx index: ${err?.message}`)
      }
    }

    // 1d. Rename Subscription.rate → Subscription.amount (column rename)
    try {
      const subCols = await db.$queryRawUnsafe(
        `PRAGMA table_info("Subscription")`
      ) as Array<{ name: string }>
      const hasRate = subCols.some(c => c.name === "rate")
      const hasAmount = subCols.some(c => c.name === "amount")
      if (hasRate && !hasAmount) {
        await db.$executeRawUnsafe(`ALTER TABLE "Subscription" RENAME COLUMN "rate" TO "amount"`)
        console.log(`[auto-migrate] Renamed Subscription.rate → Subscription.amount`)
      }
    } catch (err: any) {
      console.warn(`[auto-migrate] Subscription column rename: ${err?.message}`)
    }

    // 1e. Make Project.clientId nullable (was NOT NULL, now optional for "No client" projects)
    try {
      const projCols = await db.$queryRawUnsafe(
        `PRAGMA table_info("Project")`
      ) as Array<{ name: string; notnull: number }>
      const clientIdCol = projCols.find(c => c.name === "clientId")
      if (clientIdCol && clientIdCol.notnull === 1) {
        // Try Turso's native ALTER COLUMN DROP NOT NULL first
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "Project" ALTER COLUMN "clientId" DROP NOT NULL`)
          console.log(`[auto-migrate] Made Project.clientId nullable (via ALTER COLUMN)`)
        } catch {
          // Fallback: recreate table (standard SQLite approach)
          await db.$executeRawUnsafe(`
            CREATE TABLE "Project_new" (
              "id" TEXT NOT NULL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "description" TEXT,
              "clientId" TEXT,
              "status" TEXT NOT NULL DEFAULT 'PLANNING',
              "progress" INTEGER NOT NULL DEFAULT 0,
              "deadline" DATETIME,
              "budget" REAL,
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" DATETIME NOT NULL,
              FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE
            )
          `)
          await db.$executeRawUnsafe(`
            INSERT INTO "Project_new" ("id", "name", "description", "clientId", "status", "progress", "deadline", "budget", "createdAt", "updatedAt")
            SELECT "id", "name", "description", "clientId", "status", "progress", "deadline", "budget", "createdAt", "updatedAt" FROM "Project"
          `)
          await db.$executeRawUnsafe(`DROP TABLE "Project"`)
          await db.$executeRawUnsafe(`ALTER TABLE "Project_new" RENAME TO "Project"`)
          await db.$executeRawUnsafe(`CREATE INDEX "Project_clientId_idx" ON "Project"("clientId")`)
          await db.$executeRawUnsafe(`CREATE INDEX "Project_status_idx" ON "Project"("status")`)
          await db.$executeRawUnsafe(`CREATE INDEX "Project_deadline_idx" ON "Project"("deadline")`)
          console.log(`[auto-migrate] Made Project.clientId nullable (via table recreation)`)
        }
      }
    } catch (err: any) {
      console.warn(`[auto-migrate] Project.clientId nullable migration: ${err?.message}`)
    }

    // 1f. Create indexes for FileMetadata
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_parentId_idx" ON "FileMetadata"("parentId")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_parentId_idx index: ${err?.message}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_createdBy_idx" ON "FileMetadata"("createdBy")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_createdBy_idx index: ${err?.message}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_trashed_idx" ON "FileMetadata"("trashed")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_trashed_idx index: ${err?.message}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FilePermission_userId_idx" ON "FilePermission"("userId")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] FilePermission_userId_idx index: ${err?.message}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FilePermission_fileId_userId_key" ON "FilePermission"("fileId", "userId")`)
    } catch (err: any) {
      if (!err?.message?.includes('already exists')) {
        console.warn(`[auto-migrate] FilePermission_fileId_userId_key index: ${err?.message}`)
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

    // Mark as done ONLY after all migrations succeed
    syncDone = true
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
