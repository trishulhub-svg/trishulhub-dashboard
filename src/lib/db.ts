import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

// Ensure the database directory and file exist before Prisma tries to connect
function ensureDatabaseExists() {
  try {
    const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
    if (dbUrl.startsWith('file:')) {
      let dbPath = dbUrl.replace('file:', '')

      // Resolve relative paths to absolute
      if (!path.isAbsolute(dbPath)) {
        // Use process.cwd() to resolve relative to the project root
        dbPath = path.resolve(process.cwd(), dbPath)
      }

      const dbDir = path.dirname(dbPath)

      // Create directory if it doesn't exist
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
        console.log('[db] Created database directory:', dbDir)
      }

      // Touch the database file if it doesn't exist (SQLite will create it on first query,
      // but having it beforehand prevents some "unable to open" errors)
      if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '')
        console.log('[db] Created empty database file:', dbPath)
      }

      // Update DATABASE_URL to absolute path so Prisma can always find it
      if (process.env.DATABASE_URL !== 'file:' + dbPath) {
        process.env.DATABASE_URL = 'file:' + dbPath
        console.log('[db] DATABASE_URL resolved to:', process.env.DATABASE_URL)
      }
    }
  } catch (err) {
    console.error('[db] Warning: Could not ensure database path:', err)
  }
}

// Run before creating PrismaClient
ensureDatabaseExists()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect()
})
