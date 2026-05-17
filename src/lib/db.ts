import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

// Create the Prisma client with libSQL adapter for Turso
function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || ''
  const authToken = process.env.TURSO_AUTH_TOKEN || ''

  // If Turso credentials are available, use the libSQL adapter
  if (tursoUrl && (tursoUrl.startsWith('libsql://') || tursoUrl.startsWith('https://'))) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken,
    })
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }

  // Fallback to local SQLite for development
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ── Auto-migration: Create timetable tables if they don't exist ──
// This ensures the PersonalTimetableTask and TimetableSettings tables
// are available even if Prisma migrations haven't been applied yet.
let _timetableEnsured = false

export async function ensureTimetableTables(): Promise<void> {
  if (_timetableEnsured) return
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PersonalTimetableTask" (
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
        "updatedAt" DATETIME NOT NULL
      );
    `)
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TimetableSettings" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL UNIQUE,
        "sleepHours" REAL NOT NULL DEFAULT 8,
        "workSplitPercent" REAL NOT NULL DEFAULT 60,
        "weekStartsOn" TEXT NOT NULL DEFAULT 'MONDAY',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
    `)
    // Create indexes for performance
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_PersonalTimetableTask_userId_date" ON "PersonalTimetableTask"("userId", "date");
    `)
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_PersonalTimetableTask_userId_status" ON "PersonalTimetableTask"("userId", "status");
    `)
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_PersonalTimetableTask_date" ON "PersonalTimetableTask"("date");
    `)
    _timetableEnsured = true
  } catch (error) {
    // If table already exists (race condition), that's fine
    const msg = error instanceof Error ? error.message : String(error)
    if (!msg.includes('already exists')) {
      console.error('[db] Failed to ensure timetable tables:', msg)
    }
    // Mark as attempted even on error to avoid infinite retries
    _timetableEnsured = true
  }
}

// Graceful shutdown — only in long-running processes, not serverless/Vercel
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  process.on('beforeExit', async () => {
    await db.$disconnect()
  })
}
