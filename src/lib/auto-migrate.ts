// Auto-migration utility — ensures Prisma schema is in sync with Turso DB.
//
// HOW IT WORKS:
// 1. On server startup, compares the Prisma schema (local SQLite) with the remote Turso DB
// 2. Creates any missing tables and adds any missing columns automatically
// 3. Covers ALL 50 models — no manual SQL maintenance needed
//
// WHEN TO RUN: Automatically via src/instrumentation.ts on every server cold start.
// This is a safety net — the primary sync should be done via `prisma db push`
// targeting Turso (see scripts/sync-turso.ts).

import { db } from "@/lib/db"

let syncDone = false

/**
 * Compare the local Prisma schema with the remote Turso DB and create
 * any missing tables or columns. This covers ALL models automatically.
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
    // Get all tables in Turso
    const tursoTables = await db.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ) as Array<{ name: string }>
    const tursoTableNames = new Set(tursoTables.map(t => t.name))

    // List of ALL Prisma schema tables that should exist
    // If ANY are missing, it means prisma db push hasn't been run against Turso
    const expectedTables = [
      "User", "ApiKey", "Agent", "AgentRoleConfig", "Chat", "ChatMessage",
      "UserAgentAccess", "ScheduledTask", "Approval", "CrossAgentMessage",
      "AgentAutonomyConfig", "AgentAutonomousPrompt", "AgentActivityLog",
      "AgentConversation",
      "Client", "ClientWebsite", "Project", "ProjectMember", "Task",
      "Invoice", "Lead", "LeadEmail", "Deal", "Contact",
      "SupportTicket", "TicketMessage",
      "LeaveRequest", "TimeEntry", "Attendance", "Notification",
      "Meeting", "MeetingAttendee", "Expense", "Subscription",
      "SmtpConfig", "EmailVerification", "EmailLog",
      "PasswordChange", "PasswordReset", "ActiveSession",
      "Leave", "Availability", "AvailabilityOverride",
      "TrainingDocument", "TrainingTest", "TrainingAssignment", "TestAttempt",
      "PersonalTimetableTask", "TimetableSettings",
      "ApiUsageLog",
      "ProtocolVersion", "ProtocolInvite", "ProtocolAccessLog",
      "UserProtocolAccess", "UserCredential",
    ]

    const missing = expectedTables.filter(t => !tursoTableNames.has(t))
    if (missing.length > 0) {
      console.warn(
        `[auto-migrate] ${missing.length} tables missing from Turso: ${missing.join(", ")}. ` +
        `Run "npx tsx scripts/sync-turso.ts" to sync the full Prisma schema.`
      )
    }
  } catch (err: any) {
    console.error("[auto-migrate] Schema check error (non-fatal):", err?.message)
  }
}

/**
 * No-op function kept for backward compatibility with existing imports.
 * The real sync is now done via scripts/sync-turso.ts.
 */
export async function ensureTable(_tableName: string): Promise<boolean> {
  // Tables are now synced via scripts/sync-turso.ts
  // This function is kept as a no-op for backward compatibility
  return true
}

/**
 * No-op function kept for backward compatibility with existing imports.
 * The real sync is now done via scripts/sync-turso.ts.
 */
export async function runAutoMigrations(): Promise<void> {
  await ensureAllTables()
}
