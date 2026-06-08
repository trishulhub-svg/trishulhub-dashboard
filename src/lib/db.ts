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

  if (!tursoUrl || (!tursoUrl.startsWith('libsql://') && !tursoUrl.startsWith('https://'))) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[db] FATAL: TURSO_DATABASE_URL is not configured or has invalid format. Refusing to start with empty local SQLite in production.'
      )
    }
    console.error(
      '[db] WARNING: TURSO_DATABASE_URL is not configured. Using local SQLite for development.',
      { url: tursoUrl ? `${tursoUrl.substring(0, 20)}...` : 'undefined' }
    )
    return new PrismaClient({
      log: ['warn', 'error'],
    })
  }
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
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already exists')) {
      _timetableEnsured = true // Tables exist, no need to retry
    } else {
      console.error('[db] Failed to ensure timetable tables:', msg)
      // Do NOT set _timetableEnsured — allow retry on next call
    }
  }
}

// Graceful shutdown — only in long-running processes, not serverless/Vercel
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  process.on('beforeExit', async () => {
    await db.$disconnect()
  })
}
