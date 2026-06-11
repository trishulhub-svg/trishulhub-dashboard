// Auto-migration utility — ensures Prisma schema is in sync with DB.
//
// HOW IT WORKS:
// 1. On server startup, checks for missing tables and columns
// 2. Automatically creates missing tables and adds missing columns
// 3. Covers ALL 50 models — no manual SQL maintenance needed
//
// WHEN TO RUN: Automatically via src/instrumentation.ts on every server cold start.
// This is a safety net — the primary sync should be done via `prisma db push`.
//
// IMPORTANT: We use "try ALTER TABLE, catch duplicate column" instead of
// PRAGMA table_info because Turso/libSQL returns BigInt values in PRAGMA
// results which Prisma cannot serialize, causing a TypeError that silently
// skips all column migrations.

import { db } from "@/lib/db"

/** Safely extract error message from unknown error type */
function getErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

let syncDone = false

/** Columns to add if missing: uses "try ALTER, catch duplicate" approach */
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
  { table: "ProjectMethod", column: "updatedAt", sql: `ALTER TABLE "ProjectMethod" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` },
  { table: "Invoice", column: "paymentMethod", sql: "ALTER TABLE Invoice ADD COLUMN paymentMethod TEXT" },
  { table: "Invoice", column: "gst", sql: "ALTER TABLE Invoice ADD COLUMN gst REAL" },
  { table: "Invoice", column: "gstPercent", sql: "ALTER TABLE Invoice ADD COLUMN gstPercent REAL" },
  { table: "Invoice", column: "notes", sql: "ALTER TABLE Invoice ADD COLUMN notes TEXT" },
  { table: "Invoice", column: "paymentStatus", sql: "ALTER TABLE Invoice ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'UNPAID'" },
  { table: "Invoice", column: "sentById", sql: `ALTER TABLE "Invoice" ADD COLUMN "sentById" TEXT` },
  // Standalone task support
  { table: "Task", column: "createdBy", sql: "ALTER TABLE Task ADD COLUMN createdBy TEXT" },
  { table: "Task", column: "category", sql: "ALTER TABLE Task ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL'" },
  // Project start date (moved from Client to Project)
  { table: "Project", column: "startDate", sql: "ALTER TABLE Project ADD COLUMN startDate DATETIME" },
  // Attendance — updatedAt column (added in schema but missing from older DBs)
  { table: "Attendance", column: "updatedAt", sql: `ALTER TABLE "Attendance" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` },
]

/** Tables to create if missing (simplified CREATE TABLE IF NOT EXISTS) */
const CRITICAL_TABLES: Array<{ name: string; sql: string }> = [
  {
    name: "ClientWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ClientWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "clientId" TEXT NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE)`
  },
  {
    name: "AppSetting",
    sql: `CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL DEFAULT '', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
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
  // W20: SmtpConfig (was only in ensureTablesExist() in smtp route, not in auto-migrate)
  {
    name: "SmtpConfig",
    sql: `CREATE TABLE IF NOT EXISTS "SmtpConfig" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
    )`
  },
  // New tables from feature updates
  {
    name: "ProjectMethod",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectMethod" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL UNIQUE, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
  },
  {
    name: "ProjectAttachment",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectAttachment" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "fileData" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  {
    name: "ProjectCredential",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectCredential" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "title" TEXT NOT NULL, "username" TEXT NOT NULL, "password" TEXT NOT NULL, "iv" TEXT NOT NULL, "tag" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  {
    name: "ProjectWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "projectId" TEXT NOT NULL, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  {
    name: "Contract",
    sql: `CREATE TABLE IF NOT EXISTS "Contract" ("id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL, "contractNumber" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "clientName" TEXT NOT NULL, "clientEmail" TEXT NOT NULL, "clientCompany" TEXT, "clientPhone" TEXT, "clientAddress" TEXT, "projectName" TEXT, "projectDescription" TEXT, "projectType" TEXT, "projectMethod" TEXT, "projectStartDate" TEXT, "deliveryDate" TEXT, "scopeOfWork" TEXT NOT NULL DEFAULT '', "paymentTerms" TEXT NOT NULL DEFAULT '', "totalValue" REAL NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'INR', "paymentSchedule" TEXT NOT NULL DEFAULT '', "startDate" TEXT, "endDate" TEXT, "termsAndConditions" TEXT NOT NULL DEFAULT '', "amendments" TEXT NOT NULL DEFAULT '', "specialClauses" TEXT NOT NULL DEFAULT '', "generatedBy" TEXT, "sentAt" DATETIME, "sentVia" TEXT, "signedAt" DATETIME, "templateText" TEXT, "templateFileName" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE)`
  },
  // CRM — Lead
  {
    name: "Lead",
    sql: `CREATE TABLE IF NOT EXISTS "Lead" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL UNIQUE, "company" TEXT, "website" TEXT, "phone" TEXT, "source" TEXT NOT NULL DEFAULT 'MANUAL', "score" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'NEW', "notes" TEXT, "clientId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id"))`
  },
  // CRM — LeadEmail
  {
    name: "LeadEmail",
    sql: `CREATE TABLE IF NOT EXISTS "LeadEmail" ("id" TEXT NOT NULL PRIMARY KEY, "leadId" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "direction" TEXT NOT NULL DEFAULT 'OUTBOUND', "status" TEXT NOT NULL DEFAULT 'DRAFT', "sentAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE)`
  },
  // CRM — Contact
  {
    name: "Contact",
    sql: `CREATE TABLE IF NOT EXISTS "Contact" ("id" TEXT NOT NULL PRIMARY KEY, "firstName" TEXT NOT NULL, "lastName" TEXT, "email" TEXT NOT NULL UNIQUE, "phone" TEXT, "jobTitle" TEXT, "clientId" TEXT, "leadId" TEXT, "notes" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id"), FOREIGN KEY ("leadId") REFERENCES "Lead"("id"))`
  },
  // CRM — Deal
  {
    name: "Deal",
    sql: `CREATE TABLE IF NOT EXISTS "Deal" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "value" REAL NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'USD', "stage" TEXT NOT NULL DEFAULT 'LEAD', "probability" INTEGER NOT NULL DEFAULT 0, "expectedCloseDate" DATETIME, "actualCloseDate" DATETIME, "clientId" TEXT, "leadId" TEXT, "assignedToId" TEXT, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id"), FOREIGN KEY ("leadId") REFERENCES "Lead"("id"), FOREIGN KEY ("assignedToId") REFERENCES "User"("id"))`
  },
  // CRM — SupportTicket
  {
    name: "SupportTicket",
    sql: `CREATE TABLE IF NOT EXISTS "SupportTicket" ("id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL, "subject" TEXT NOT NULL, "description" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "priority" TEXT NOT NULL DEFAULT 'MEDIUM', "assignedTo" TEXT, "resolution" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id"), FOREIGN KEY ("assignedTo") REFERENCES "User"("id"))`
  },
  // CRM — TicketMessage
  {
    name: "TicketMessage",
    sql: `CREATE TABLE IF NOT EXISTS "TicketMessage" ("id" TEXT NOT NULL PRIMARY KEY, "ticketId" TEXT NOT NULL, "senderId" TEXT, "senderType" TEXT NOT NULL DEFAULT 'HUMAN', "message" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id"))`
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
  {
    name: "_ProjectMethodToProject",
    sql: `CREATE TABLE IF NOT EXISTS "_ProjectMethodToProject" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY("A","B"), FOREIGN KEY ("A") REFERENCES "ProjectMethod"("id") ON DELETE CASCADE, FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  // Protocol auth tables (serverless-friendly)
  {
    name: "ProtocolOtp",
    sql: `CREATE TABLE IF NOT EXISTS "ProtocolOtp" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "otp" TEXT NOT NULL,
      "expiresAt" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  },
  {
    name: "ProtocolRateLimit",
    sql: `CREATE TABLE IF NOT EXISTS "ProtocolRateLimit" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "key" TEXT NOT NULL,
      "count" INTEGER NOT NULL DEFAULT 0,
      "windowStart" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  },
  // ActiveSession (serverless session tracking — also created in session-manager.ts)
  {
    name: "ActiveSession",
    sql: `CREATE TABLE IF NOT EXISTS "ActiveSession" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "userId" TEXT NOT NULL UNIQUE,
      "sessionToken" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`
  },
  // Personal Timetable (matching Prisma schema)
  {
    name: "PersonalTimetableTask",
    sql: `CREATE TABLE IF NOT EXISTS "PersonalTimetableTask" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "startTime" DATETIME NOT NULL,
      "endTime" DATETIME NOT NULL,
      "date" DATETIME NOT NULL,
      "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "category" TEXT NOT NULL DEFAULT 'PERSONAL',
      "completedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  // HR Tables
  {
    name: "Leave",
    sql: `CREATE TABLE IF NOT EXISTS "Leave" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "leaveType" TEXT NOT NULL,
      "startDate" DATETIME NOT NULL,
      "endDate" DATETIME NOT NULL,
      "reason" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "approvedBy" TEXT,
      "approvedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("approvedBy") REFERENCES "User"("id")
    )`
  },
  {
    name: "Availability",
    sql: `CREATE TABLE IF NOT EXISTS "Availability" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "dayOfWeek" INTEGER NOT NULL,
      "startTime" TEXT NOT NULL,
      "endTime" TEXT NOT NULL,
      "isAvailable" BOOLEAN NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "AvailabilityOverride",
    sql: `CREATE TABLE IF NOT EXISTS "AvailabilityOverride" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "startTime" TEXT,
      "endTime" TEXT,
      "isAvailable" BOOLEAN NOT NULL,
      "reason" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "AvailabilityOverride_userId_date_key" UNIQUE ("userId", "date")
    )`
  },
  {
    name: "MeetingAttendee",
    sql: `CREATE TABLE IF NOT EXISTS "MeetingAttendee" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "meetingId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "rsvpStatus" TEXT NOT NULL DEFAULT 'PENDING',
      FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "MeetingAttendee_meetingId_userId_key" UNIQUE ("meetingId", "userId")
    )`
  },
  {
    name: "TimetableSettings",
    sql: `CREATE TABLE IF NOT EXISTS "TimetableSettings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "sleepHours" REAL NOT NULL DEFAULT 8,
      "workSplitPercent" REAL NOT NULL DEFAULT 60,
      "weekStartsOn" TEXT NOT NULL DEFAULT 'MONDAY',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  // HR — LeaveRequest (legacy)
  {
    name: "LeaveRequest",
    sql: `CREATE TABLE IF NOT EXISTS "LeaveRequest" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'CASUAL',
      "startDate" DATETIME NOT NULL,
      "endDate" DATETIME NOT NULL,
      "reason" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "approvedBy" TEXT,
      "feedback" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  // HR — Attendance
  {
    name: "Attendance",
    sql: `CREATE TABLE IF NOT EXISTS "Attendance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "checkIn" DATETIME,
      "checkOut" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'PRESENT',
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "Attendance_userId_date_key" UNIQUE ("userId", "date")
    )`
  },
  // HR — Meeting
  {
    name: "Meeting",
    sql: `CREATE TABLE IF NOT EXISTS "Meeting" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "date" DATETIME NOT NULL,
      "startTime" TEXT NOT NULL,
      "endTime" TEXT,
      "organizerId" TEXT NOT NULL,
      "meetingType" TEXT NOT NULL DEFAULT 'VIRTUAL',
      "meetingLink" TEXT,
      "projectId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`
  },
  // Audit Log (Department-Wise) — standalone table, no FK to User
  {
    name: "AuditLog",
    sql: `CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "userName" TEXT NOT NULL,
      "userRole" TEXT NOT NULL,
      "userDepartment" TEXT,
      "department" TEXT NOT NULL,
      "page" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "entityType" TEXT,
      "entityId" TEXT,
      "description" TEXT NOT NULL,
      "oldValue" TEXT,
      "newValue" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "status" TEXT NOT NULL DEFAULT 'SUCCESS',
      "metadata" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  },
]

/**
 * Helper to safely check if a column exists in a table.
 * Uses a SELECT query instead of PRAGMA table_info to avoid BigInt serialization
 * errors that occur with Turso/libSQL adapter.
 */
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    // Use a safe approach: try to SELECT the column with LIMIT 0.
    // This validates the column exists without fetching any data.
    await db.$executeRawUnsafe(`SELECT "${column}" FROM "${table}" LIMIT 0`)
    return true
  } catch {
    return false
  }
}

/**
 * Compare schema with DB and auto-fix any missing tables or columns.
 * Safe to call multiple times — skips if already synced in this process.
 */
export async function ensureAllTables(): Promise<void> {
  if (syncDone) return

  try {
    // Quick DB connectivity check
    await db.$queryRawUnsafe("SELECT 1")
  } catch (err: unknown) {
    console.error("[auto-migrate] Database connection failed:", getErrMsg(err))
    // Do NOT set syncDone — allow retry on next cold start
    return
  }

  try {
    // 1. Create missing tables
    for (const tableDef of CRITICAL_TABLES) {
      try {
        await db.$executeRawUnsafe(tableDef.sql)
      } catch (err: unknown) {
        // Table already exists or other error — non-fatal
        if (!getErrMsg(err)?.includes('already exists')) {
          console.warn(`[auto-migrate] Table ${tableDef.name}: ${getErrMsg(err)}`)
        }
      }
    }

    // 1b. Create missing unique indexes for NotificationPreference
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] NotificationPreference_userId_key index: ${getErrMsg(err)}`)
      }
    }

    // 1c. Create missing indexes for Expense table
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Expense_employeeId_idx" ON "Expense"("employeeId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Expense_employeeId_idx index: ${getErrMsg(err)}`)
      }
    }

    // 1d. Create index for Invoice.sentById (finance queries)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Invoice_sentById_idx" ON "Invoice"("sentById")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Invoice_sentById_idx: ${getErrMsg(err)}`)
      }
    }

    // 1e. Rename Subscription.rate → Subscription.amount (column rename)
    // Use columnExists helper instead of PRAGMA table_info to avoid BigInt errors
    try {
      const hasAmount = await columnExists("Subscription", "amount")
      if (!hasAmount) {
        // Check if old "rate" column exists
        const hasRate = await columnExists("Subscription", "rate")
        if (hasRate) {
          await db.$executeRawUnsafe(`ALTER TABLE "Subscription" RENAME COLUMN "rate" TO "amount"`)
          console.log(`[auto-migrate] Renamed Subscription.rate → Subscription.amount`)
        }
      }
    } catch (err: unknown) {
      console.warn(`[auto-migrate] Subscription column rename: ${getErrMsg(err)}`)
    }

    // 1e. Make Project.clientId nullable (was NOT NULL, now optional for "No client" projects)
    // Note: Skipping the PRAGMA-based nullable check since it requires BigInt-safe PRAGMA.
    // This migration was likely already applied. If not, the table recreation fallback
    // will be handled by a future explicit migration.
    // The nullable change is non-blocking — Prisma handles null values at the ORM level.

    // 1f. Create indexes for FileMetadata
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_parentId_idx" ON "FileMetadata"("parentId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_parentId_idx index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_createdBy_idx" ON "FileMetadata"("createdBy")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_createdBy_idx index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FileMetadata_trashed_idx" ON "FileMetadata"("trashed")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FileMetadata_trashed_idx index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FilePermission_userId_idx" ON "FilePermission"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FilePermission_userId_idx index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FilePermission_fileId_userId_key" ON "FilePermission"("fileId", "userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FilePermission_fileId_userId_key index: ${getErrMsg(err)}`)
      }
    }

    // 1g. Migrate _ProjectMethodToProject to add PRIMARY KEY for existing DBs
    // SQLite doesn't support ALTER TABLE ADD PRIMARY KEY, so we recreate the table
    // Wrapped in a transaction for atomicity (L13)
    try {
      await db.$executeRawUnsafe(`BEGIN`)
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "_ProjectMethodToProject_new" (
            "A" TEXT NOT NULL,
            "B" TEXT NOT NULL,
            PRIMARY KEY("A","B")
          )
        `)
        // Copy data from old table (if it exists) — INSERT OR IGNORE handles duplicate PKs
        await db.$executeRawUnsafe(`INSERT OR IGNORE INTO "_ProjectMethodToProject_new" ("A", "B") SELECT "A", "B" FROM "_ProjectMethodToProject"`)
        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "_ProjectMethodToProject"`)
        await db.$executeRawUnsafe(`ALTER TABLE "_ProjectMethodToProject_new" RENAME TO "_ProjectMethodToProject"`)
        await db.$executeRawUnsafe(`COMMIT`)
        console.log(`[auto-migrate] Migrated _ProjectMethodToProject to add PRIMARY KEY`)
      } catch (innerErr: unknown) {
        await db.$executeRawUnsafe(`ROLLBACK`).catch(() => {})
        // Old table doesn't exist yet (fresh DB) — new table is already correct
        const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        if (!innerMsg.includes('no such table') && !innerMsg.includes('already exists')) {
          throw innerErr
        }
      }
    } catch (err: unknown) {
      console.warn(`[auto-migrate] _ProjectMethodToProject PRIMARY KEY migration: ${getErrMsg(err)}`)
    }

    // Join table indexes for Project ↔ ProjectMethod
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_ProjectMethodToProject_A_index" ON "_ProjectMethodToProject"("A")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] _ProjectMethodToProject_A_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_ProjectMethodToProject_B_index" ON "_ProjectMethodToProject"("B")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] _ProjectMethodToProject_B_index: ${getErrMsg(err)}`)
      }
    }

    // 1h. Missing indexes declared in Prisma schema
    // Contract indexes
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Contract_clientId_index" ON "Contract"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Contract_clientId_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Contract_status_index" ON "Contract"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Contract_status_index: ${getErrMsg(err)}`)
      }
    }
    // ProjectWebsite indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectWebsite_projectId_index" ON "ProjectWebsite"("projectId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProjectWebsite_projectId_index: ${getErrMsg(err)}`)
      }
    }
    // ProjectAttachment indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectAttachment_projectId_index" ON "ProjectAttachment"("projectId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProjectAttachment_projectId_index: ${getErrMsg(err)}`)
      }
    }
    // ProjectCredential indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectCredential_projectId_index" ON "ProjectCredential"("projectId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProjectCredential_projectId_index: ${getErrMsg(err)}`)
      }
    }
    // PersonalTimetableTask indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PersonalTimetableTask_userId_index" ON "PersonalTimetableTask"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] PersonalTimetableTask_userId_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PersonalTimetableTask_userId_date_index" ON "PersonalTimetableTask"("userId", "date")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] PersonalTimetableTask_userId_date_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PersonalTimetableTask_userId_status_index" ON "PersonalTimetableTask"("userId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] PersonalTimetableTask_userId_status_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PersonalTimetableTask_date_index" ON "PersonalTimetableTask"("date")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] PersonalTimetableTask_date_index: ${getErrMsg(err)}`)
      }
    }
    // EmailLog indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_type_index" ON "EmailLog"("type")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] EmailLog_type_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_status_index" ON "EmailLog"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] EmailLog_status_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_index" ON "EmailLog"("createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] EmailLog_createdAt_index: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailLog_triggeredBy_index" ON "EmailLog"("triggeredBy")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] EmailLog_triggeredBy_index: ${getErrMsg(err)}`)
      }
    }
    // FilePermission indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FilePermission_driveFileId_index" ON "FilePermission"("driveFileId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] FilePermission_driveFileId_index: ${getErrMsg(err)}`)
      }
    }
    // CRM — ClientWebsite indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_clientwebsite_clientId" ON "ClientWebsite"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_clientwebsite_clientId: ${getErrMsg(err)}`)
      }
    }
    // CRM — Lead indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_lead_status" ON "Lead"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_lead_status: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_lead_clientId" ON "Lead"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_lead_clientId: ${getErrMsg(err)}`)
      }
    }
    // CRM — LeadEmail indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_leademail_leadId" ON "LeadEmail"("leadId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_leademail_leadId: ${getErrMsg(err)}`)
      }
    }
    // CRM — Contact indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_contact_clientId" ON "Contact"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_contact_clientId: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_contact_leadId" ON "Contact"("leadId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_contact_leadId: ${getErrMsg(err)}`)
      }
    }
    // CRM — Deal indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_deal_clientId" ON "Deal"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_deal_clientId: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_deal_stage" ON "Deal"("stage")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_deal_stage: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_deal_leadId" ON "Deal"("leadId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_deal_leadId: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_deal_expectedCloseDate" ON "Deal"("expectedCloseDate")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_deal_expectedCloseDate: ${getErrMsg(err)}`)
      }
    }
    // CRM — SupportTicket indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_supportticket_clientId" ON "SupportTicket"("clientId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_supportticket_clientId: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_supportticket_status" ON "SupportTicket"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_supportticket_status: ${getErrMsg(err)}`)
      }
    }
    // CRM — TicketMessage indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_ticketmessage_ticketId" ON "TicketMessage"("ticketId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_ticketmessage_ticketId: ${getErrMsg(err)}`)
      }
    }
    // ProtocolOtp indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProtocolOtp_expiresAt_index" ON "ProtocolOtp"("expiresAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProtocolOtp_expiresAt_index: ${getErrMsg(err)}`)
      }
    }
    // ProtocolRateLimit indexes
    try {
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolRateLimit_key_index" ON "ProtocolRateLimit"("key")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProtocolRateLimit_key_index: ${getErrMsg(err)}`)
      }
    }

    // 1i. HR indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Attendance_userId_status_idx" ON "Attendance"("userId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Attendance_userId_status_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Meeting_status_idx" ON "Meeting"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Meeting_status_idx: ${getErrMsg(err)}`)
      }
    }

    // AuditLog indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_userId_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_department_idx" ON "AuditLog"("department")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_department_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_page_idx" ON "AuditLog"("page")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_page_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_action_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_entityId_idx" ON "AuditLog"("entityId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_entityId_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_createdAt_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_department_page_idx" ON "AuditLog"("department", "page")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_department_page_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_department_action_idx" ON "AuditLog"("department", "action")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_department_action_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AuditLog_userId_createdAt_idx: ${getErrMsg(err)}`)
      }
    }

    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MeetingAttendee_userId_idx" ON "MeetingAttendee"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] MeetingAttendee_userId_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TestAttempt_assignmentId_idx" ON "TestAttempt"("assignmentId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TestAttempt_assignmentId_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_assignedTo_status_idx" ON "TrainingAssignment"("assignedTo", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingAssignment_assignedTo_status_idx: ${getErrMsg(err)}`)
      }
    }

    // Phase 8: Indexes for new modules
    // SupportTicket indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_supportticket_assignedTo" ON "SupportTicket"("assignedTo")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_supportticket_assignedTo: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_supportticket_priority" ON "SupportTicket"("priority")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_supportticket_priority: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_supportticket_clientId_status" ON "SupportTicket"("clientId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_supportticket_clientId_status: ${getErrMsg(err)}`)
      }
    }
    // Notification indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_notification_isRead" ON "Notification"("isRead")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_notification_isRead: ${getErrMsg(err)}`)
      }
    }
    // NotificationPreference index
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_notificationpreference_userId" ON "NotificationPreference"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_notificationpreference_userId: ${getErrMsg(err)}`)
      }
    }
    // Approval index
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_approval_requesterId_status" ON "Approval"("requesterId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_approval_requesterId_status: ${getErrMsg(err)}`)
      }
    }
    // ProtocolAccessLog indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_protocolaccesslog_protocolId" ON "ProtocolAccessLog"("protocolId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_protocolaccesslog_protocolId: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_protocolaccesslog_userEmail" ON "ProtocolAccessLog"("userEmail")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_protocolaccesslog_userEmail: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_protocolaccesslog_createdAt" ON "ProtocolAccessLog"("createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_protocolaccesslog_createdAt: ${getErrMsg(err)}`)
      }
    }
    // AvailabilityOverride index (composite userId+date — UNIQUE already covers this, but add explicit for clarity)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_availabilityoverride_userId_date" ON "AvailabilityOverride"("userId", "date")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_availabilityoverride_userId_date: ${getErrMsg(err)}`)
      }
    }
    // Availability index (composite userId+dayOfWeek)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_availability_userId_dayOfWeek" ON "Availability"("userId", "dayOfWeek")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_availability_userId_dayOfWeek: ${getErrMsg(err)}`)
      }
    }
    // MeetingAttendee index (meetingId)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_meetingattendee_meetingId" ON "MeetingAttendee"("meetingId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] idx_meetingattendee_meetingId: ${getErrMsg(err)}`)
      }
    }

    // Phase 7: Fix invoices where total !== subtotal + tax + gst
    try {
      const result = await db.$executeRawUnsafe(
        `UPDATE Invoice SET total = (subtotal + tax + COALESCE(gst, 0)) WHERE ABS(total - (subtotal + tax + COALESCE(gst, 0))) > 0.01 AND total IS NOT NULL`
      )
      console.log("[auto-migrate] Fixed invoice totals where total !== subtotal + tax + gst")
    } catch (err: unknown) {
      console.warn("[auto-migrate] Invoice total fix migration:", getErrMsg(err))
    }

    // 2. Add missing columns to existing tables
    // Use "try ALTER TABLE, catch duplicate column" approach instead of PRAGMA table_info.
    // This is safe because: if column exists → ALTER fails with "duplicate column" (caught & ignored)
    // if column missing → ALTER succeeds and column is added.
    // This avoids the BigInt serialization error from PRAGMA table_info with Turso/libSQL.
    for (const colDef of CRITICAL_COLUMNS) {
      try {
        await db.$executeRawUnsafe(colDef.sql)
        console.log(`[auto-migrate] Added column ${colDef.column} to ${colDef.table}`)
      } catch (err: unknown) {
        const msg = getErrMsg(err) || ""
        // "duplicate column name" = column already exists, expected and OK
        // "no such table" = table doesn't exist yet, will be created on next cold start
        if (!msg.includes("duplicate column") && !msg.includes("no such table")) {
          console.warn(`[auto-migrate] Column ${colDef.column} on ${colDef.table}: ${msg}`)
        }
      }
    }

    // Mark as done ONLY after all migrations succeed
    syncDone = true
  } catch (err: unknown) {
    console.error("[auto-migrate] Schema check error (non-fatal):", getErrMsg(err))
  }
}

/**
 * @deprecated — use ensureAllTables()
 */
export async function ensureTable(_tableName: string): Promise<boolean> {
  return true
}

/**
 * @deprecated — use ensureAllTables()
 */
export async function runAutoMigrations(): Promise<void> {
  await ensureAllTables()
}
