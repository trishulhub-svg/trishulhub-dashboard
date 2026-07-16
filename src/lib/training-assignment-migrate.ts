/**
 * Ensure TrainingAssignment matches the Percipio assign schema.
 *
 * Prod may still have a legacy table from an older training/docs feature:
 *   documentId, testId, assignedTo, assignedBy, testLevel, ...
 * CREATE TABLE IF NOT EXISTS is a no-op on that table, which caused:
 *   "table TrainingAssignment has no column named userId"
 */

import { db } from "@/lib/db"

const CREATE_SQL = `CREATE TABLE "TrainingAssignment" (
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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`

declare global {
  // eslint-disable-next-line no-var
  var __trishulTrainingAssignmentReady: boolean | undefined
}

async function columnExists(column: string): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`SELECT "${column}" FROM "TrainingAssignment" LIMIT 0`)
    return true
  } catch {
    return false
  }
}

async function tableExists(): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`SELECT 1 FROM "TrainingAssignment" LIMIT 0`)
    return true
  } catch {
    return false
  }
}

async function createIndexes() {
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS "TrainingAssignment_userId_status_idx" ON "TrainingAssignment"("userId", "status")`,
    `CREATE INDEX IF NOT EXISTS "TrainingAssignment_dueDate_status_idx" ON "TrainingAssignment"("dueDate", "status")`,
    `CREATE INDEX IF NOT EXISTS "TrainingAssignment_status_idx" ON "TrainingAssignment"("status")`,
  ]) {
    try {
      await db.$executeRawUnsafe(sql)
    } catch { /* ignore */ }
  }
}

async function addMissingNewColumns() {
  const columns: Array<{ name: string; sql: string }> = [
    { name: "title", sql: `ALTER TABLE "TrainingAssignment" ADD COLUMN "title" TEXT NOT NULL DEFAULT ''` },
    { name: "notes", sql: `ALTER TABLE "TrainingAssignment" ADD COLUMN "notes" TEXT` },
    { name: "assignedById", sql: `ALTER TABLE "TrainingAssignment" ADD COLUMN "assignedById" TEXT NOT NULL DEFAULT ''` },
    { name: "completedAt", sql: `ALTER TABLE "TrainingAssignment" ADD COLUMN "completedAt" DATETIME` },
    { name: "overdueNotifiedAt", sql: `ALTER TABLE "TrainingAssignment" ADD COLUMN "overdueNotifiedAt" DATETIME` },
  ]
  for (const col of columns) {
    if (!(await columnExists(col.name))) {
      try {
        await db.$executeRawUnsafe(col.sql)
      } catch (err) {
        console.warn(
          `[training-assignment-migrate] ADD ${col.name}:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
  }
}

async function rebuildAsNewSchema(reason: string) {
  const legacyName = "TrainingAssignment_legacy_docs"
  try {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${legacyName}"`)
  } catch { /* ignore */ }

  try {
    await db.$executeRawUnsafe(`ALTER TABLE "TrainingAssignment" RENAME TO "${legacyName}"`)
    console.log(`[training-assignment-migrate] Renamed legacy table (${reason}) → ${legacyName}`)
  } catch {
    // Table may be broken / missing — drop and recreate
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "TrainingAssignment"`)
    } catch { /* ignore */ }
  }

  await db.$executeRawUnsafe(CREATE_SQL)
  await createIndexes()
  console.log("[training-assignment-migrate] Created TrainingAssignment with Percipio schema")
}

/**
 * Rebuild / upgrade TrainingAssignment so inserts with userId succeed.
 * Safe to call repeatedly.
 */
export async function ensureTrainingAssignmentSchema(): Promise<void> {
  if (globalThis.__trishulTrainingAssignmentReady) return

  try {
    if (!(await tableExists())) {
      await db.$executeRawUnsafe(CREATE_SQL)
      await createIndexes()
      globalThis.__trishulTrainingAssignmentReady = true
      return
    }

    const hasUserId = await columnExists("userId")
    const isLegacy =
      (await columnExists("assignedTo")) ||
      (await columnExists("documentId")) ||
      (await columnExists("assignedBy"))

    // Incompatible old doc/test table, or missing required userId
    if (isLegacy || !hasUserId) {
      await rebuildAsNewSchema(isLegacy ? "legacy doc/test columns" : "missing userId")
      if (await columnExists("userId")) {
        globalThis.__trishulTrainingAssignmentReady = true
      }
      return
    }

    await addMissingNewColumns()
    await createIndexes()
    globalThis.__trishulTrainingAssignmentReady = true
  } catch (err) {
    console.warn(
      "[training-assignment-migrate]",
      err instanceof Error ? err.message : String(err)
    )
  }
}
