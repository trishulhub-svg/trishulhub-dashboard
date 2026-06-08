import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

// Create the Prisma client with libSQL adapter for Turso
function createPrismaClient(): PrismaClient {
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

  // No valid Turso URL — in production this is fatal, in dev fall back to local SQLite
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[db] FATAL: TURSO_DATABASE_URL is not configured or has invalid format. Refusing to start with empty local SQLite in production.'
    )
  }

  console.warn(
    '[db] WARNING: TURSO_DATABASE_URL is not configured. Using local SQLite for development.',
    { url: tursoUrl ? `${tursoUrl.substring(0, 20)}...` : 'undefined' }
  )
  return new PrismaClient({
    log: ['warn', 'error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Lazy initialization: create client only when first accessed.
// This avoids throwing during `next build` on machines without Turso credentials.
// At Vercel runtime, env vars are always configured so the Turso path is taken.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

/**
 * Database client — lazily initialized on first use.
 * Typed as PrismaClient so all existing code (`db.user.findMany(...)` etc.) works unchanged.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver)
    // Bind methods to the real client so `this` is correct
    if (typeof value === 'function') return value.bind(client)
    return value
  },
  set(_target, prop, value) {
    return Reflect.set(getPrismaClient(), prop, value)
  },
})

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
    try { await db.$disconnect() } catch {}
  })
}
