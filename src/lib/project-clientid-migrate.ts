import { db } from "@/lib/db"

function getErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Ensure Project.clientId is nullable so "No Client" / internal / demo projects
 * can be created. Detects via sqlite_master (Turso-safe; avoids PRAGMA BigInt).
 */
export async function ensureProjectClientIdNullable(): Promise<boolean> {
  try {
    const rows = (await db.$queryRawUnsafe(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Project' LIMIT 1`
    )) as Array<{ sql?: string | null }>
    const sql = String(rows?.[0]?.sql || "")
    if (!sql) return false
    // Already nullable: `"clientId" TEXT` without NOT NULL (or TEXT NULL)
    const notNull = /"clientId"\s+TEXT\s+NOT\s+NULL/i.test(sql)
    if (!notNull) return true

    console.log("[auto-migrate] Project.clientId is NOT NULL — recreating table…")

    // Child FKs block DROP TABLE Project unless foreign keys are off.
    try {
      await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`)
    } catch {
      /* Turso may ignore; continue */
    }

    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Project_new"`)
    await db.$executeRawUnsafe(`
      CREATE TABLE "Project_new" (
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

    // Copy with column presence tolerance (legacy rows may lack isDemo/startDate)
    await db.$executeRawUnsafe(`
      INSERT INTO "Project_new" (
        "id", "name", "description", "clientId", "status", "progress",
        "isDemo", "startDate", "deadline", "budget", "createdAt", "updatedAt"
      )
      SELECT
        "id",
        "name",
        "description",
        NULLIF("clientId", ''),
        "status",
        COALESCE("progress", 0),
        COALESCE("isDemo", 0),
        "startDate",
        "deadline",
        "budget",
        "createdAt",
        "updatedAt"
      FROM "Project"
    `)

    await db.$executeRawUnsafe(`DROP TABLE "Project"`)
    await db.$executeRawUnsafe(`ALTER TABLE "Project_new" RENAME TO "Project"`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_clientId_idx" ON "Project"("clientId")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_status_idx" ON "Project"("status")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_deadline_idx" ON "Project"("deadline")`)

    try {
      await db.$executeRawUnsafe(`PRAGMA foreign_keys = ON`)
    } catch {
      /* ignore */
    }

    console.log("[auto-migrate] Project.clientId is now nullable")
    return true
  } catch (err: unknown) {
    console.warn(`[auto-migrate] ensureProjectClientIdNullable: ${getErrMsg(err)}`)
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "Project_new"`)
    } catch {
      /* ignore */
    }
    try {
      await db.$executeRawUnsafe(`PRAGMA foreign_keys = ON`)
    } catch {
      /* ignore */
    }
    return false
  }
}
