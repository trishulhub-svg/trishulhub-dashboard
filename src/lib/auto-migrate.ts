// Auto-migration utility for runtime table creation
// Used when prisma db push hasn't been run on a database (e.g., production Turso)
// This ensures tables exist before the API routes try to query them.

import { db } from "@/lib/db"

interface TableMigration {
  name: string
  sql: string
  indexes?: string[]
}

// Tables that may not exist in older databases and need auto-creation
const AUTO_MIGRATIONS: TableMigration[] = [
  {
    name: "Leave",
    sql: `CREATE TABLE IF NOT EXISTS "Leave" (
      "id" TEXT PRIMARY KEY NOT NULL,
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
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    indexes: [
      `CREATE INDEX IF NOT EXISTS "Leave_userId_idx" ON "Leave"("userId")`,
      `CREATE INDEX IF NOT EXISTS "Leave_status_idx" ON "Leave"("status")`,
      `CREATE INDEX IF NOT EXISTS "Leave_startDate_idx" ON "Leave"("startDate")`,
      `CREATE INDEX IF NOT EXISTS "Leave_endDate_idx" ON "Leave"("endDate")`,
    ],
  },
  {
    name: "Availability",
    sql: `CREATE TABLE IF NOT EXISTS "Availability" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "userId" TEXT NOT NULL,
      "dayOfWeek" INTEGER NOT NULL,
      "startTime" TEXT NOT NULL,
      "endTime" TEXT NOT NULL,
      "isAvailable" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS "Availability_userId_dayOfWeek_startTime_endTime_key" ON "Availability"("userId", "dayOfWeek", "startTime", "endTime")`,
      `CREATE INDEX IF NOT EXISTS "Availability_userId_idx" ON "Availability"("userId")`,
    ],
  },
  {
    name: "AvailabilityOverride",
    sql: `CREATE TABLE IF NOT EXISTS "AvailabilityOverride" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "userId" TEXT NOT NULL,
      "date" DATETIME NOT NULL,
      "startTime" TEXT,
      "endTime" TEXT,
      "isAvailable" BOOLEAN NOT NULL,
      "reason" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    indexes: [
      `CREATE INDEX IF NOT EXISTS "AvailabilityOverride_userId_idx" ON "AvailabilityOverride"("userId")`,
      `CREATE INDEX IF NOT EXISTS "AvailabilityOverride_date_idx" ON "AvailabilityOverride"("date")`,
    ],
  },
]

// Track which tables have been checked
const checkedTables = new Set<string>()

/**
 * Ensure a specific table exists in the database.
 * Uses CREATE TABLE IF NOT EXISTS for safe idempotent creation.
 * Returns true if the table is ready, false if creation failed.
 */
export async function ensureTable(tableName: string): Promise<boolean> {
  if (checkedTables.has(tableName)) return true

  const migration = AUTO_MIGRATIONS.find(m => m.name === tableName)
  if (!migration) {
    console.error(`[auto-migrate] Unknown table: ${tableName}`)
    return false
  }

  try {
    // Try to access the table first (fast path — table already exists)
    await (db as any)[tableName.charAt(0).toLowerCase() + tableName.slice(1)].count({ take: 1 })
    checkedTables.add(tableName)
    return true
  } catch {
    // Table doesn't exist — create it
  }

  try {
    await db.$executeRawUnsafe(migration.sql)
    console.log(`[auto-migrate] Created table: ${tableName}`)

    // Create indexes
    if (migration.indexes) {
      for (const indexSql of migration.indexes) {
        try {
          await db.$executeRawUnsafe(indexSql)
        } catch (idxErr: any) {
          // Index creation can fail for various reasons (already exists, duplicate, etc.)
          // This is non-critical — the table itself exists
          console.warn(`[auto-migrate] Index creation note for ${tableName}:`, idxErr.message)
        }
      }
    }

    // Verify the table was created
    await (db as any)[tableName.charAt(0).toLowerCase() + tableName.slice(1)].count({ take: 1 })
    checkedTables.add(tableName)
    return true
  } catch (err: any) {
    console.error(`[auto-migrate] Failed to create table ${tableName}:`, err.message)
    return false
  }
}

/**
 * Ensure all auto-migration tables exist.
 * Call this once at app startup (e.g., in instrumentation or a health check).
 */
export async function ensureAllTables(): Promise<void> {
  for (const migration of AUTO_MIGRATIONS) {
    await ensureTable(migration.name)
  }
}
