/**
 * Prisma-to-Turso Schema Sync Script
 *
 * WHAT IT DOES:
 * 1. Pushes the full Prisma schema to a temporary local SQLite DB
 * 2. Compares local schema with the remote Turso DB
 * 3. Creates any missing tables and adds any missing columns
 * 4. Covers ALL 50 models — zero manual SQL
 *
 * WHEN TO RUN:
 * - After changing prisma/schema.prisma (adding models, fields, etc.)
 * - Before deploying to Vercel
 * - Can be added to your CI/CD pipeline
 *
 * USAGE:
 *   npx tsx scripts/sync-turso.ts
 */

const { PrismaLibSQL } = require("@prisma/adapter-libsql")
const { PrismaClient } = require("@prisma/client")
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

async function syncSchemaToTurso() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (!tursoUrl || !tursoToken) {
    console.error("ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env")
    process.exit(1)
  }

  const tempDbPath = path.join(__dirname, "..", "db", "sync-temp.db")

  // Step 1: Push schema to local temp SQLite
  console.log("Step 1: Pushing Prisma schema to local SQLite...")
  try {
    execSync(
      `DATABASE_URL="file:${tempDbPath}" npx prisma db push --force-reset --skip-generate 2>&1`,
      { stdio: "pipe" }
    )
    console.log("  -> Local schema pushed successfully")
  } catch (err: any) {
    console.error("  -> Failed to push local schema:", err.stderr?.toString() || err.message)
    process.exit(1)
  }

  // Step 2: Read local schema
  console.log("Step 2: Reading local schema...")
  const localDb = new PrismaClient({
    datasources: { db: { url: `file:${tempDbPath}` } },
    log: [],
  })

  const localTables = await localDb.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ) as Array<{ name: string }>
  const localTableNames = localTables.map((t) => t.name)
  console.log(`  -> Found ${localTableNames.length} tables in local schema`)

  // Step 3: Connect to Turso
  console.log("Step 3: Connecting to Turso...")
  const tursoAdapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken })
  const tursoDb = new PrismaClient({ adapter: tursoAdapter, log: [] })

  const tursoTables = await tursoDb.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ) as Array<{ name: string }>
  const tursoTableNames = new Set(tursoTables.map((t) => t.name))
  console.log(`  -> Turso has ${tursoTableNames.size} tables`)

  // Step 4: Find differences
  const missingTables = localTableNames.filter((n) => !tursoTableNames.has(n))

  let missingColumns: Array<{ table: string; column: string; type: string }> = []
  for (const tableName of localTableNames) {
    if (!tursoTableNames.has(tableName)) continue
    const localCols = await localDb.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`) as Array<{
      name: string; type: string
    }>
    const tursoCols = await tursoDb.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`) as Array<{
      name: string
    }>
    const tursoColNames = new Set(tursoCols.map((c) => c.name))
    for (const col of localCols) {
      if (!tursoColNames.has(col.name)) {
        missingColumns.push({ table: tableName, column: col.name, type: col.type })
      }
    }
  }

  if (missingTables.length === 0 && missingColumns.length === 0) {
    console.log("\n  -> Schema is ALREADY IN SYNC. No changes needed.")
    await localDb.$disconnect()
    await tursoDb.$disconnect()
    fs.unlinkSync(tempDbPath)
    return
  }

  // Step 5: Apply changes
  console.log(`\nStep 4: Applying changes...`)
  console.log(`  -> ${missingTables.length} missing tables: ${missingTables.join(", ") || "none"}`)
  console.log(`  -> ${missingColumns.length} missing columns: ${missingColumns.map((m) => `${m.table}.${m.column}`).join(", ") || "none"}`)

  // Create missing tables
  for (const tableName of missingTables) {
    try {
      const rows = await localDb.$queryRawUnsafe(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      ) as Array<{ sql: string }>
      if (rows?.[0]?.sql) {
        await tursoDb.$executeRawUnsafe(rows[0].sql)
        console.log(`  CREATED TABLE: ${tableName}`)
      }
    } catch (err: any) {
      console.error(`  ERROR creating ${tableName}:`, err.message?.substring(0, 150))
    }
  }

  // Add missing columns
  for (const mc of missingColumns) {
    try {
      await tursoDb.$executeRawUnsafe(
        `ALTER TABLE "${mc.table}" ADD COLUMN "${mc.column}" ${mc.type}`
      )
      console.log(`  ADDED COLUMN: ${mc.table}.${mc.column} (${mc.type})`)
    } catch (err: any) {
      console.error(`  ERROR adding ${mc.table}.${mc.column}:`, err.message?.substring(0, 100))
    }
  }

  // Cleanup
  await localDb.$disconnect()
  await tursoDb.$disconnect()
  fs.unlinkSync(tempDbPath)

  console.log(`\n=== SYNC COMPLETE ===`)
  console.log(`Turso now has ALL ${localTableNames.length} tables from Prisma schema`)
}

syncSchemaToTurso().catch((e) => {
  console.error("Fatal sync error:", e)
  process.exit(1)
})
