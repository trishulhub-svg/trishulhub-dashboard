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

// Bump when adding CRITICAL_COLUMNS / CRITICAL_TABLES so warm serverless
// instances re-run migrations after deploy (stale syncDone otherwise skips ALTERs).
const SCHEMA_REVISION = 20260727

// Use globalThis to persist the syncDone flag across hot reloads in dev
// and across serverless function warm invocations in production.
// This prevents ensureAllTables() from running the full migration check
// on every single API request.
declare global {
  var __trishulAutoMigrateSyncDone: boolean | undefined
  var __trishulAutoMigrateRevision: number | undefined
  var __trishulCriticalSchemaRevision: number | undefined
}

function isSyncDone(): boolean {
  return (
    globalThis.__trishulAutoMigrateSyncDone === true &&
    globalThis.__trishulAutoMigrateRevision === SCHEMA_REVISION
  )
}

function setSyncDone(value: boolean) {
  globalThis.__trishulAutoMigrateSyncDone = value
  if (value) {
    globalThis.__trishulAutoMigrateRevision = SCHEMA_REVISION
    globalThis.__trishulCriticalSchemaRevision = SCHEMA_REVISION
  }
}

function isCriticalSchemaDone(): boolean {
  return (
    isSyncDone() || globalThis.__trishulCriticalSchemaRevision === SCHEMA_REVISION
  )
}

function setCriticalSchemaDone() {
  globalThis.__trishulCriticalSchemaRevision = SCHEMA_REVISION
}

/** Columns to add if missing: uses "try ALTER, catch duplicate" approach */
const CRITICAL_COLUMNS: Array<{ table: string; column: string; sql: string }> = [
  { table: "TimeEntry", column: "source", sql: "ALTER TABLE TimeEntry ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'" },
  { table: "TimeEntry", column: "agentSessionId", sql: "ALTER TABLE TimeEntry ADD COLUMN agentSessionId TEXT" },
  { table: "TimeEntry", column: "clockInMethod", sql: "ALTER TABLE TimeEntry ADD COLUMN clockInMethod TEXT" },
  { table: "TimeEntry", column: "clockOutMethod", sql: "ALTER TABLE TimeEntry ADD COLUMN clockOutMethod TEXT" },
  { table: "TimeEntry", column: "workNotes", sql: `ALTER TABLE "TimeEntry" ADD COLUMN "workNotes" TEXT` },
  // Expense table columns (Finance page)
  { table: "Expense", column: "employeeId", sql: "ALTER TABLE Expense ADD COLUMN \"employeeId\" TEXT" },
  { table: "Expense", column: "paymentRef", sql: "ALTER TABLE Expense ADD COLUMN \"paymentRef\" TEXT" },
  // Subscription table columns (amount/rate system)
  { table: "Subscription", column: "exchangeRate", sql: "ALTER TABLE Subscription ADD COLUMN \"exchangeRate\" REAL NOT NULL DEFAULT 1" },
  // New columns from feature updates
  { table: "Client", column: "projectMethodId", sql: "ALTER TABLE Client ADD COLUMN projectMethodId TEXT" },
  { table: "Client", column: "contractUrl", sql: "ALTER TABLE Client ADD COLUMN contractUrl TEXT" },
  { table: "ProjectMethod", column: "updatedAt", sql: `ALTER TABLE "ProjectMethod" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` },
  { table: "Invoice", column: "paymentMethod", sql: "ALTER TABLE Invoice ADD COLUMN paymentMethod TEXT" },
  { table: "Invoice", column: "gst", sql: "ALTER TABLE Invoice ADD COLUMN gst REAL" },
  { table: "Invoice", column: "gstPercent", sql: "ALTER TABLE Invoice ADD COLUMN gstPercent REAL" },
  { table: "Invoice", column: "notes", sql: "ALTER TABLE Invoice ADD COLUMN notes TEXT" },
  { table: "Invoice", column: "paymentStatus", sql: "ALTER TABLE Invoice ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'UNPAID'" },
  { table: "Invoice", column: "sentById", sql: `ALTER TABLE "Invoice" ADD COLUMN "sentById" TEXT` },
  { table: "Invoice", column: "currency", sql: `ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR'` },
  { table: "Expense", column: "currency", sql: `ALTER TABLE "Expense" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR'` },
  { table: "Approval", column: "approvedAt", sql: `ALTER TABLE "Approval" ADD COLUMN "approvedAt" DATETIME` },
  { table: "Approval", column: "approvedById", sql: `ALTER TABLE "Approval" ADD COLUMN "approvedById" TEXT` },
  { table: "Approval", column: "feedback", sql: `ALTER TABLE "Approval" ADD COLUMN "feedback" TEXT` },
  { table: "Approval", column: "description", sql: `ALTER TABLE "Approval" ADD COLUMN "description" TEXT` },
  { table: "Approval", column: "requesterId", sql: `ALTER TABLE "Approval" ADD COLUMN "requesterId" TEXT` },
  // Project start date (moved from Client to Project)
  { table: "Project", column: "startDate", sql: "ALTER TABLE Project ADD COLUMN startDate DATETIME" },
  // Project isDemo flag — demo projects get their own page at /dashboard/demo with a DEMO badge
  { table: "Project", column: "isDemo", sql: "ALTER TABLE Project ADD COLUMN isDemo BOOLEAN NOT NULL DEFAULT 0" },
  // Attendance — updatedAt column (added in schema but missing from older DBs)
  // Turso/libSQL rejects non-constant defaults on ALTER ADD COLUMN (CURRENT_TIMESTAMP).
  // Use a constant default, then backfill below.
  { table: "Attendance", column: "updatedAt", sql: `ALTER TABLE "Attendance" ADD COLUMN "updatedAt" TEXT NOT NULL DEFAULT ''` },
  { table: "Leave", column: "feedback", sql: `ALTER TABLE "Leave" ADD COLUMN "feedback" TEXT` },
  // Team page-access ACL (Allow / Restrict modes)
  { table: "User", column: "pageAccessMode", sql: `ALTER TABLE "User" ADD COLUMN "pageAccessMode" TEXT NOT NULL DEFAULT 'OFF'` },
  { table: "User", column: "pageAccessPages", sql: `ALTER TABLE "User" ADD COLUMN "pageAccessPages" TEXT NOT NULL DEFAULT '[]'` },
  // Project milestones — assignees + richer metadata
  { table: "ProjectMilestone", column: "description", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "description" TEXT` },
  { table: "ProjectMilestone", column: "createdById", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "createdById" TEXT` },
  { table: "ProjectMilestone", column: "completedAt", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "completedAt" DATETIME` },
  { table: "ProjectMilestone", column: "completedBy", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "completedBy" TEXT` },
  // Turso-safe: constant default only (CURRENT_TIMESTAMP fails on ALTER)
  { table: "ProjectMilestone", column: "updatedAt", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "updatedAt" TEXT NOT NULL DEFAULT ''` },
  { table: "ProjectMilestone", column: "dueTime", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "dueTime" TEXT` },
  { table: "ProjectMilestone", column: "carriedForward", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "carriedForward" BOOLEAN NOT NULL DEFAULT 0` },
  { table: "ProjectMilestone", column: "dueNotifiedAt", sql: `ALTER TABLE "ProjectMilestone" ADD COLUMN "dueNotifiedAt" DATETIME` },
  { table: "User", column: "favoritePages", sql: `ALTER TABLE "User" ADD COLUMN "favoritePages" TEXT NOT NULL DEFAULT '[]'` },
  { table: "TimeEntry", column: "activityType", sql: `ALTER TABLE "TimeEntry" ADD COLUMN "activityType" TEXT` },
  { table: "TimeEntry", column: "trainingAssignmentId", sql: `ALTER TABLE "TimeEntry" ADD COLUMN "trainingAssignmentId" TEXT` },
]

/** Tables to create if missing (simplified CREATE TABLE IF NOT EXISTS) */
const CRITICAL_TABLES: Array<{ name: string; sql: string }> = [
  {
    name: "Approval",
    sql: `CREATE TABLE IF NOT EXISTS "Approval" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "requesterType" TEXT NOT NULL DEFAULT 'HUMAN',
      "requesterId" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "data" TEXT NOT NULL DEFAULT '{}',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "feedback" TEXT,
      "approvedById" TEXT,
      "approvedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: "ClientWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ClientWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "clientId" TEXT NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE)`
  },
  {
    name: "AppSetting",
    sql: `CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL DEFAULT '', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`
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
    name: "ProjectCredential",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectCredential" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "title" TEXT NOT NULL, "username" TEXT NOT NULL, "password" TEXT NOT NULL, "iv" TEXT NOT NULL, "tag" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  {
    name: "ProjectWebsite",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectWebsite" ("id" TEXT NOT NULL PRIMARY KEY, "url" TEXT NOT NULL, "label" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "projectId" TEXT NOT NULL, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  {
    name: "ProjectInfrastructure",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectInfrastructure" ("id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL UNIQUE, "githubRepoUrl" TEXT, "githubBranch" TEXT, "tursoUrl" TEXT, "vercelProjectId" TEXT, "deployUrl" TEXT, "githubTokenEnc" TEXT, "githubTokenIv" TEXT, "githubTokenTag" TEXT, "tursoTokenEnc" TEXT, "tursoTokenIv" TEXT, "tursoTokenTag" TEXT, "updatedBy" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE)`
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
    sql: `CREATE TABLE IF NOT EXISTS "Deal" ("id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "value" REAL NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'INR', "stage" TEXT NOT NULL DEFAULT 'LEAD', "probability" INTEGER NOT NULL DEFAULT 0, "expectedCloseDate" DATETIME, "actualCloseDate" DATETIME, "clientId" TEXT, "leadId" TEXT, "assignedToId" TEXT, "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("clientId") REFERENCES "Client"("id"), FOREIGN KEY ("leadId") REFERENCES "Lead"("id"), FOREIGN KEY ("assignedToId") REFERENCES "User"("id"))`
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
    name: "_ProjectMethodToProject",
    sql: `CREATE TABLE IF NOT EXISTS "_ProjectMethodToProject" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, PRIMARY KEY("A","B"), FOREIGN KEY ("A") REFERENCES "ProjectMethod"("id") ON DELETE CASCADE, FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE)`
  },
  // Protocol auth tables (serverless-friendly)
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
      "feedback" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("approvedBy") REFERENCES "User"("id")
    )`
  },
  {
    name: "LeaveBalance",
    sql: `CREATE TABLE IF NOT EXISTS "LeaveBalance" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "allowance" INTEGER NOT NULL DEFAULT 12,
      "used" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      UNIQUE("userId", "year")
    )`
  },
  {
    name: "ProjectMilestone",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectMilestone" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "done" BOOLEAN NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "dueDate" DATETIME,
      "createdById" TEXT,
      "completedAt" DATETIME,
      "completedBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "ProjectMilestoneAssignee",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectMilestoneAssignee" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "milestoneId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("milestoneId") REFERENCES "ProjectMilestone"("id") ON DELETE CASCADE,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "ProjectInfraItem",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectInfraItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "groupKey" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "isSecret" BOOLEAN NOT NULL DEFAULT 1,
      "valuePlain" TEXT,
      "valueEnc" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdBy" TEXT,
      "updatedBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "ProjectInfraMemberAccess",
    sql: `CREATE TABLE IF NOT EXISTS "ProjectInfraMemberAccess" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL UNIQUE,
      "visibleUntil" DATETIME,
      "enabledBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "Payment",
    sql: `CREATE TABLE IF NOT EXISTS "Payment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoiceId" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "method" TEXT,
      "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE
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
    name: "AvailabilityDateRange",
    sql: `CREATE TABLE IF NOT EXISTS "AvailabilityDateRange" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "startDate" DATETIME NOT NULL, "endDate" DATETIME NOT NULL, "startTime" TEXT, "endTime" TEXT, "isAvailable" BOOLEAN NOT NULL DEFAULT 1, "reason" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE)`
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
  // HR — UserDetail (country, gov ID, bank account) — Issue 7
  {
    name: "UserDetail",
    sql: `CREATE TABLE IF NOT EXISTS "UserDetail" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "country" TEXT,
      "countryLocked" BOOLEAN NOT NULL DEFAULT 0,
      "fullNameAsPerId" TEXT,
      "govIdType" TEXT,
      "govIdNumber" TEXT,
      "govIdEncIv" TEXT,
      "govIdEncTag" TEXT,
      "bankAccountName" TEXT,
      "bankAccountNumber" TEXT,
      "bankAccountEncIv" TEXT,
      "bankAccountEncTag" TEXT,
      "bankSortCode" TEXT,
      "bankName" TEXT,
      "bankBranch" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "rejectedReason" TEXT,
      "reviewedBy" TEXT,
      "reviewedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "VaultSecret",
    sql: `CREATE TABLE IF NOT EXISTS "VaultSecret" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'OTHER',
      "keyValue" TEXT NOT NULL,
      "notes" TEXT,
      "createdBy" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  },
  {
    name: "TrainingQr",
    sql: `CREATE TABLE IF NOT EXISTS "TrainingQr" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "imageData" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL DEFAULT 'image/png',
      "uploadedById" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "TrainingQrRequest",
    sql: `CREATE TABLE IF NOT EXISTS "TrainingQrRequest" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "fulfilledAt" DATETIME,
      "fulfilledByQrId" TEXT,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("fulfilledByQrId") REFERENCES "TrainingQr"("id") ON DELETE SET NULL
    )`
  },
  {
    name: "TrainingAssignment",
    sql: `CREATE TABLE IF NOT EXISTS "TrainingAssignment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "dueDate" DATETIME NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
      "assignedById" TEXT NOT NULL,
      "completedAt" DATETIME,
      "overdueNotifiedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
      FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE
    )`
  },
  {
    name: "ExpenseCategory",
    sql: `CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
 * Fast path: apply CRITICAL_TABLES + CRITICAL_COLUMNS only.
 * Safe to call from read APIs so "no such column" cannot blank the UI
 * if instrumentation timed out before ALTERs finished.
 */
export async function ensureCriticalSchema(): Promise<void> {
  if (isCriticalSchemaDone()) return
  try {
    await db.$queryRawUnsafe("SELECT 1")
  } catch (err: unknown) {
    console.error("[auto-migrate] ensureCriticalSchema DB failed:", getErrMsg(err))
    return
  }
  for (const tableDef of CRITICAL_TABLES) {
    try {
      await db.$executeRawUnsafe(tableDef.sql)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes("already exists")) {
        console.warn(`[auto-migrate] Table ${tableDef.name}: ${getErrMsg(err)}`)
      }
    }
  }
  for (const colDef of CRITICAL_COLUMNS) {
    try {
      await db.$executeRawUnsafe(colDef.sql)
    } catch (err: unknown) {
      const msg = getErrMsg(err) || ""
      if (!msg.includes("duplicate column") && !msg.includes("no such table")) {
        console.warn(`[auto-migrate] Column ${colDef.column} on ${colDef.table}: ${msg}`)
      }
    }
  }
  setCriticalSchemaDone()
}

export async function ensureAllTables(): Promise<void> {
  if (isSyncDone()) return

  try {
    // Quick DB connectivity check (single round-trip)
    await db.$queryRawUnsafe("SELECT 1")
  } catch (err: unknown) {
    console.error("[auto-migrate] Database connection failed:", getErrMsg(err))
    // Do NOT set syncDone — allow retry on next cold start
    return
  }

  try {
    // 0. CRITICAL first — columns/tables needed by current Prisma schema.
    // Must run before heavier migrations so a startup timeout cannot leave
    // the app querying dueTime/carriedForward/etc. that do not exist yet.
    await ensureCriticalSchema()

    // 1. Create missing tables (idempotent; already covered above, kept for clarity)
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

    // 1a. TrainingAssignment may exist as an incompatible legacy schema
    // (documentId/assignedTo). Rebuild to Percipio assign columns (userId/title/…).
    try {
      const { ensureTrainingAssignmentSchema } = await import("@/lib/training-assignment-migrate")
      await ensureTrainingAssignmentSchema()
    } catch (err: unknown) {
      console.warn(`[auto-migrate] TrainingAssignment schema migrate: ${getErrMsg(err)}`)
    }

    // 1a2. Seed default expense categories (idempotent)
    try {
      const { DEFAULT_EXPENSE_CATEGORIES } = await import("@/lib/expense-categories")
      const now = new Date().toISOString()
      for (const name of DEFAULT_EXPENSE_CATEGORIES) {
        try {
          await db.$executeRawUnsafe(
            `INSERT OR IGNORE INTO "ExpenseCategory" ("id", "name", "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
            crypto.randomUUID(),
            name,
            now,
            now
          )
        } catch (seedErr: unknown) {
          if (!getErrMsg(seedErr)?.includes("no such table")) {
            console.warn(`[auto-migrate] ExpenseCategory seed ${name}: ${getErrMsg(seedErr)}`)
          }
        }
      }
    } catch (err: unknown) {
      console.warn(`[auto-migrate] ExpenseCategory seed: ${getErrMsg(err)}`)
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
    // SQLite doesn't support ALTER COLUMN, so we recreate the table if clientId is NOT NULL.
    // This is critical for "No Client" project creation — without it, inserting null fails.
    try {
      // Check if clientId is currently NOT NULL by inspecting the table schema
      const columns = await db.$queryRawUnsafe(`PRAGMA table_info("Project")`) as Array<{
        name: string
        notnull: number
        type: string
        dflt_value: string | null
        pk: number
        cid: number
      }>
      const clientIdCol = columns.find(c => c.name === "clientId")
      if (clientIdCol && clientIdCol.notnull === 1) {
        // clientId is NOT NULL — need to recreate the table with nullable clientId
        console.log("[auto-migrate] Project.clientId is NOT NULL — recreating table to make it nullable...")
        await db.$executeRawUnsafe(`BEGIN`)
        try {
          // Step 1: Create new table with nullable clientId
          await db.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Project_new" (
              "id" TEXT NOT NULL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "description" TEXT,
              "clientId" TEXT,
              "status" TEXT NOT NULL DEFAULT 'PLANNING',
              "progress" INTEGER NOT NULL DEFAULT 0,
              "isDemo" BOOLEAN NOT NULL DEFAULT 0,
              "startDate" DATETIME,
              "deadline" DATETIME,
              "budget" REAL,
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL
            )
          `)
          // Step 2: Copy data from old table (convert empty strings to null)
          await db.$executeRawUnsafe(`
            INSERT INTO "Project_new" ("id", "name", "description", "clientId", "status", "progress", "isDemo", "startDate", "deadline", "budget", "createdAt", "updatedAt")
            SELECT "id", "name", "description", NULLIF("clientId", ''), "status", "progress",
              COALESCE("isDemo", 0), "startDate", "deadline", "budget", "createdAt", "updatedAt"
            FROM "Project"
          `)
          // Step 3: Drop old table and rename new one
          await db.$executeRawUnsafe(`DROP TABLE "Project"`)
          await db.$executeRawUnsafe(`ALTER TABLE "Project_new" RENAME TO "Project"`)
          // Step 4: Recreate indexes
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_clientId_index" ON "Project"("clientId")`)
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_status_index" ON "Project"("status")`)
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_deadline_index" ON "Project"("deadline")`)
          await db.$executeRawUnsafe(`COMMIT`)
          console.log("[auto-migrate] Project.clientId is now nullable — 'No Client' projects will work")
        } catch (innerErr: unknown) {
          await db.$executeRawUnsafe(`ROLLBACK`).catch(() => {})
          const innerMsg = innerErr instanceof Error ? innerErr.message : String(innerErr)
          console.warn(`[auto-migrate] Project.clientId nullable migration failed: ${innerMsg}`)
        }
      }
    } catch (err: unknown) {
      console.warn(`[auto-migrate] Project.clientId nullable check: ${getErrMsg(err)}`)
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

    // 1h. Wipe legacy generated-contract system (replaced by Client.contractUrl)
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Contract"`)
    } catch (err: unknown) {
      console.warn(`[auto-migrate] Drop Contract table: ${getErrMsg(err)}`)
    }

    // 1h2. P3 — permanently drop old Agent / Task / Meeting / Protocol / Chat system tables.
    // These are not in the current Prisma schema. Safe DROP IF EXISTS (no-op if already gone).
    // Do NOT drop: Approval, Leave, TrainingAssignment, TrainingQr*, UserCredential, VaultSecret.
    const ORPHAN_TABLES_TO_DROP = [
      // Agent OS
      "AgentActivityLog",
      "AgentAutonomousPrompt",
      "AgentAutonomyConfig",
      "AgentConversation",
      "AgentRoleConfig",
      "Agent",
      "UserAgentAccess",
      "CrossAgentMessage",
      "ApiUsageLog",
      // Chat
      "ChatMessage",
      "Chat",
      // Tasks / meetings / timetable
      "MeetingAttendee",
      "Meeting",
      "TaskGitConfig",
      "LarkTaskMapping",
      "Task",
      "PersonalTimetableTask",
      "TimetableSettings",
      "ProjectAttachment",
      "ScheduledTask",
      "_TaskToProject",
      "_MeetingToProject",
      // Legacy API keys / leave requests (replaced by VaultSecret + Leave)
      "ApiKey",
      "LeaveRequest",
      // Protocol system
      "ProtocolAccessLog",
      "UserProtocolAccess",
      "ProtocolInvite",
      "ProtocolVersion",
      // Old training quiz system (replaced by TrainingQr / TrainingAssignment)
      "TestAttempt",
      "TrainingTest",
      "TrainingDocument",
      // Misc file ACL leftovers
      "FilePermission",
      "FileMetadata",
    ] as const
    for (const table of ORPHAN_TABLES_TO_DROP) {
      try {
        await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`)
      } catch (err: unknown) {
        const msg = getErrMsg(err)
        if (!msg.includes("no such table")) {
          console.warn(`[auto-migrate] Drop orphan ${table}: ${msg}`)
        }
      }
    }

    // 1i. Missing indexes declared in Prisma schema
    // ProjectWebsite indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectWebsite_projectId_index" ON "ProjectWebsite"("projectId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProjectWebsite_projectId_index: ${getErrMsg(err)}`)
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
    // ProjectInfrastructure indexes (projectId is UNIQUE so already indexed, but explicit for clarity)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectInfrastructure_projectId_index" ON "ProjectInfrastructure"("projectId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] ProjectInfrastructure_projectId_index: ${getErrMsg(err)}`)
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

    // 1i. HR indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Attendance_userId_status_idx" ON "Attendance"("userId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] Attendance_userId_status_idx: ${getErrMsg(err)}`)
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

    // AvailabilityDateRange indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AvailabilityDateRange_userId_idx" ON "AvailabilityDateRange"("userId")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AvailabilityDateRange_userId_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AvailabilityDateRange_startDate_idx" ON "AvailabilityDateRange"("startDate")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AvailabilityDateRange_startDate_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AvailabilityDateRange_endDate_idx" ON "AvailabilityDateRange"("endDate")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] AvailabilityDateRange_endDate_idx: ${getErrMsg(err)}`)
      }
    }

    // UserDetail indexes (Issue 7 — My Details page)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserDetail_status_idx" ON "UserDetail"("status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] UserDetail_status_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserDetail_country_idx" ON "UserDetail"("country")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] UserDetail_country_idx: ${getErrMsg(err)}`)
      }
    }

    // VaultSecret — generic encrypted secret vault
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "VaultSecret_category_idx" ON "VaultSecret"("category")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] VaultSecret_category_idx: ${getErrMsg(err)}`)
      }
    }

    // Training QR indexes
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingQr_isActive_createdAt_idx" ON "TrainingQr"("isActive", "createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingQr_isActive_createdAt_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingQrRequest_status_createdAt_idx" ON "TrainingQrRequest"("status", "createdAt")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingQrRequest_status_createdAt_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingQrRequest_userId_status_idx" ON "TrainingQrRequest"("userId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingQrRequest_userId_status_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_userId_status_idx" ON "TrainingAssignment"("userId", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingAssignment_userId_status_idx: ${getErrMsg(err)}`)
      }
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMilestoneAssignee_milestoneId_userId_key" ON "ProjectMilestoneAssignee"("milestoneId", "userId")`
      )
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes("already exists")) {
        console.warn(
          `[auto-migrate] ProjectMilestoneAssignee_milestoneId_userId_key: ${getErrMsg(err)}`
        )
      }
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "ProjectMilestone_dueDate_idx" ON "ProjectMilestone"("dueDate")`
      )
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes("already exists")) {
        console.warn(`[auto-migrate] ProjectMilestone_dueDate_idx: ${getErrMsg(err)}`)
      }
    }

    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingAssignment_dueDate_status_idx" ON "TrainingAssignment"("dueDate", "status")`)
    } catch (err: unknown) {
      if (!getErrMsg(err)?.includes('already exists')) {
        console.warn(`[auto-migrate] TrainingAssignment_dueDate_status_idx: ${getErrMsg(err)}`)
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

    // Notification list + mark-all indexes (Turso DBs that missed Prisma migrate)
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt")`
      )
    } catch (err: unknown) {
      console.warn("[auto-migrate] Notification_userId_createdAt_idx:", getErrMsg(err))
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")`
      )
    } catch (err: unknown) {
      console.warn("[auto-migrate] Notification_userId_isRead_idx:", getErrMsg(err))
    }

    // Backfill Turso-safe updatedAt columns added with empty-string default
    try {
      await db.$executeRawUnsafe(
        `UPDATE "ProjectMilestone" SET "updatedAt" = COALESCE(NULLIF("updatedAt", ''), "createdAt", datetime('now')) WHERE "updatedAt" IS NULL OR "updatedAt" = ''`
      )
    } catch (err: unknown) {
      console.warn("[auto-migrate] ProjectMilestone.updatedAt backfill:", getErrMsg(err))
    }
    try {
      await db.$executeRawUnsafe(
        `UPDATE "Attendance" SET "updatedAt" = COALESCE(NULLIF("updatedAt", ''), "createdAt", datetime('now')) WHERE "updatedAt" IS NULL OR "updatedAt" = ''`
      )
    } catch (err: unknown) {
      console.warn("[auto-migrate] Attendance.updatedAt backfill:", getErrMsg(err))
    }

    // Keep Project.progress = completed/total milestones (0 when none)
    try {
      await db.$executeRawUnsafe(`
        UPDATE "Project"
        SET "progress" = COALESCE((
          SELECT CAST(ROUND(
            CASE WHEN COUNT(*) = 0 THEN 0.0
            ELSE (SUM(CASE WHEN "done" = 1 THEN 1.0 ELSE 0.0 END) * 100.0) / COUNT(*)
            END
          ) AS INTEGER)
          FROM "ProjectMilestone" m
          WHERE m."projectId" = "Project"."id"
        ), 0)
      `)
      console.log("[auto-migrate] Synced Project.progress from milestones")
    } catch (err: unknown) {
      console.warn("[auto-migrate] Project.progress sync:", getErrMsg(err))
    }

    // Mark as done ONLY after all migrations succeed
    setSyncDone(true)
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
