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

// ── Auto-migration: Ensure ProjectCredential table exists with correct schema ──
// prisma db push is NOT run during Vercel build, so we must create tables manually.
// Handles: table missing, table exists with missing columns (schema drift).
let _projectCredentialEnsured = false

export async function ensureProjectCredentialTable(): Promise<void> {
  if (_projectCredentialEnsured) return
  try {
    // Step 1: Create table if missing
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectCredential" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "username" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "iv" TEXT NOT NULL,
        "tag" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
    `)
    // Step 2: Add any missing columns (handles schema drift from older versions)
    const columns = [
      ['iv', 'TEXT NOT NULL DEFAULT ""'],
      ['tag', 'TEXT NOT NULL DEFAULT ""'],
      ['password', 'TEXT NOT NULL DEFAULT ""'],
      ['username', 'TEXT NOT NULL DEFAULT ""'],
      ['title', 'TEXT NOT NULL DEFAULT ""'],
      ['projectId', 'TEXT NOT NULL DEFAULT ""'],
      ['createdAt', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'],
      ['updatedAt', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'],
    ]
    for (const [col, def] of columns) {
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "ProjectCredential" ADD COLUMN "${col}" ${def};`)
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e)
        // "duplicate column name" is expected — column already exists
        if (!m.includes('duplicate column')) {
          console.error(`[db] Failed to add column ${col} to ProjectCredential:`, m)
        }
      }
    }
    // Step 3: Create index
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ProjectCredential_projectId" ON "ProjectCredential"("projectId");
    `)
    _projectCredentialEnsured = true
  } catch (error) {
    console.error('[db] Failed to ensure ProjectCredential table:', error instanceof Error ? error.message : error)
  }
}

// ── Auto-migration: Create ProjectAttachment table if it doesn't exist ──
let _projectAttachmentEnsured = false

export async function ensureProjectAttachmentTable(): Promise<void> {
  if (_projectAttachmentEnsured) return
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectAttachment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "fileName" TEXT NOT NULL,
        "fileData" TEXT NOT NULL,
        "fileSize" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ProjectAttachment_projectId" ON "ProjectAttachment"("projectId");
    `)
    _projectAttachmentEnsured = true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already exists')) {
      _projectAttachmentEnsured = true
    } else {
      console.error('[db] Failed to ensure ProjectAttachment table:', msg)
    }
  }
}

// ── Auto-migration: Create ProjectWebsite table if it doesn't exist ──
let _projectWebsiteEnsured = false

export async function ensureProjectWebsiteTable(): Promise<void> {
  if (_projectWebsiteEnsured) return
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProjectWebsite" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "url" TEXT NOT NULL,
        "label" TEXT,
        "isPrimary" BOOLEAN NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "projectId" TEXT NOT NULL
      );
    `)
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "idx_ProjectWebsite_projectId" ON "ProjectWebsite"("projectId");
    `)
    _projectWebsiteEnsured = true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already exists')) {
      _projectWebsiteEnsured = true
    } else {
      console.error('[db] Failed to ensure ProjectWebsite table:', msg)
    }
  }
}

// ── AppSetting helpers (key-value store for system settings) ──

let _appSettingEnsured = false

export async function ensureAppSettingTable(): Promise<void> {
  if (_appSettingEnsured) return
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL DEFAULT '', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
    _appSettingEnsured = true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('already exists')) {
      _appSettingEnsured = true
    } else {
      console.error('[db] Failed to ensure AppSetting table:', msg)
      // Don't set flag — allow retry on next call
    }
  }
}

/** Get a setting value from the AppSetting table. Returns empty string if not found. */
export async function getAppSetting(key: string): Promise<string> {
  try {
    await ensureAppSettingTable()
    const row = await db.$queryRawUnsafe<Array<{ value: string }>>('SELECT value FROM "AppSetting" WHERE "key" = ?', key)
    return row.length > 0 ? row[0].value : ''
  } catch {
    return ''
  }
}

/** Set a setting value in the AppSetting table (upsert).
 * Uses DELETE + INSERT as a reliable fallback for Turso/libsql compatibility.
 */
export async function setAppSetting(key: string, value: string): Promise<void> {
  await ensureAppSettingTable()

  // Strategy 1: Try SQLite UPSERT syntax first
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT("key") DO UPDATE SET "value" = ?, "updatedAt" = CURRENT_TIMESTAMP',
      key, value, value
    )
    return
  } catch (upsertErr) {
    const upsertMsg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr)
    console.warn('[db] UPSERT failed, falling back to DELETE+INSERT:', upsertMsg)
  }

  // Strategy 2: Fallback — delete then insert (safe for all SQLite-compatible drivers)
  await db.$executeRawUnsafe('DELETE FROM "AppSetting" WHERE "key" = ?', key)
  await db.$executeRawUnsafe(
    'INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES (?, ?, CURRENT_TIMESTAMP)',
    key, value
  )
}

/** Delete a setting from the AppSetting table. No-op if key doesn't exist. */
export async function delAppSetting(key: string): Promise<void> {
  await ensureAppSettingTable()
  try {
    await db.$executeRawUnsafe('DELETE FROM "AppSetting" WHERE "key" = ?', key)
  } catch (err) {
    console.error('[db] Failed to delete AppSetting:', err)
  }
}

// Graceful shutdown — only in long-running processes, not serverless/Vercel
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  process.on('beforeExit', async () => {
    try { await db.$disconnect() } catch {}
  })
}
