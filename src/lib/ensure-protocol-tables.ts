// Self-healing: create protocol tables if they don't exist in Turso.
// Column names MUST match schema.prisma exactly — Prisma generates SQL using
// the Prisma field names, not the raw SQL column names.
//
// Import and call ensureProtocolTables() at the top of every protocol route handler.

import { db } from "@/lib/db";

let ensured = false;

/** Helper: check if a specific column exists in a SQLite table */
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    const result: any[] = await db.$queryRawUnsafe(
      `PRAGMA table_info("${table}")`
    );
    return result.some((row: any) => row.name === column);
  } catch {
    return false;
  }
}

/** Helper: check if a table exists */
async function tableExists(table: string): Promise<boolean> {
  try {
    const result = await db.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      table
    ) as any[];
    return result.length > 0;
  } catch {
    return false;
  }
}

export async function ensureProtocolTables(): Promise<void> {
  if (ensured) return;

  // ── ProtocolVersion ──
  if (!(await tableExists("ProtocolVersion"))) {
    console.log("[protocol] ProtocolVersion table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "ProtocolVersion" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "version" TEXT NOT NULL,
          "title" TEXT NOT NULL DEFAULT 'Trishul Protocol',
          "content" TEXT NOT NULL DEFAULT '',
          "stageDescriptions" TEXT NOT NULL DEFAULT '[]',
          "agentSkills" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdBy" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProtocolVersion_version_key" UNIQUE ("version")
        )
      `);
      console.log("[protocol] ProtocolVersion table created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to create ProtocolVersion:", msg);
    }
  }

  // ── ProtocolInvite ──
  if (!(await tableExists("ProtocolInvite"))) {
    console.log("[protocol] ProtocolInvite table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "ProtocolInvite" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "protocolId" TEXT NOT NULL,
          "inviteCode" TEXT NOT NULL,
          "targetEmail" TEXT NOT NULL,
          "targetName" TEXT,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "expiresAt" DATETIME NOT NULL,
          "usedAt" DATETIME,
          "usedBy" TEXT,
          "createdBy" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProtocolInvite_inviteCode_key" UNIQUE ("inviteCode")
        )
      `);
      console.log("[protocol] ProtocolInvite table created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to create ProtocolInvite:", msg);
    }
  } else if (!(await columnExists("ProtocolInvite", "protocolId"))) {
    // Schema fix: old table had "protocolVersionId" instead of "protocolId"
    // and was missing "usedBy". Recreate with correct schema.
    console.log("[protocol] ProtocolInvite has wrong schema (missing protocolId), recreating...");
    try {
      await db.$executeRawUnsafe(`DROP TABLE "ProtocolInvite"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE "ProtocolInvite" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "protocolId" TEXT NOT NULL,
          "inviteCode" TEXT NOT NULL,
          "targetEmail" TEXT NOT NULL,
          "targetName" TEXT,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "expiresAt" DATETIME NOT NULL,
          "usedAt" DATETIME,
          "usedBy" TEXT,
          "createdBy" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProtocolInvite_inviteCode_key" UNIQUE ("inviteCode")
        )
      `);
      console.log("[protocol] ProtocolInvite recreated with correct schema.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to recreate ProtocolInvite:", msg);
    }
  } else if (!(await columnExists("ProtocolInvite", "usedBy"))) {
    // Schema fix: missing "usedBy" column — add it
    console.log("[protocol] ProtocolInvite missing 'usedBy' column, adding...");
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "ProtocolInvite" ADD COLUMN "usedBy" TEXT`);
      console.log("[protocol] ProtocolInvite 'usedBy' column added.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to add usedBy column:", msg);
    }
  }

  // ── ProtocolAccessLog ──
  if (!(await tableExists("ProtocolAccessLog"))) {
    console.log("[protocol] ProtocolAccessLog table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "ProtocolAccessLog" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "inviteId" TEXT NOT NULL,
          "protocolId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "ipAddress" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[protocol] ProtocolAccessLog table created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to create ProtocolAccessLog:", msg);
    }
  } else if (!(await columnExists("ProtocolAccessLog", "protocolId"))) {
    // Schema fix: old table had wrong columns (userId, action, userAgent)
    console.log("[protocol] ProtocolAccessLog has wrong schema, recreating...");
    try {
      await db.$executeRawUnsafe(`DROP TABLE "ProtocolAccessLog"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE "ProtocolAccessLog" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "inviteId" TEXT NOT NULL,
          "protocolId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "ipAddress" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[protocol] ProtocolAccessLog recreated with correct schema.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to recreate ProtocolAccessLog:", msg);
    }
  }

  // ── UserProtocolAccess ──
  if (!(await tableExists("UserProtocolAccess"))) {
    console.log("[protocol] UserProtocolAccess table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "UserProtocolAccess" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "userName" TEXT,
          "protocolId" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "verifiedVia" TEXT NOT NULL DEFAULT 'invite',
          "lastAccessAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserProtocolAccess_userId_key" UNIQUE ("userId")
        )
      `);
      console.log("[protocol] UserProtocolAccess table created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to create UserProtocolAccess:", msg);
    }
  } else if (!(await columnExists("UserProtocolAccess", "protocolId"))) {
    // Schema fix: old table was missing protocolId and had inviteId instead
    console.log("[protocol] UserProtocolAccess has wrong schema, recreating...");
    try {
      await db.$executeRawUnsafe(`DROP TABLE "UserProtocolAccess"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE "UserProtocolAccess" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "userEmail" TEXT NOT NULL,
          "userName" TEXT,
          "protocolId" TEXT NOT NULL,
          "agentAccess" TEXT NOT NULL DEFAULT '[]',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "verifiedVia" TEXT NOT NULL DEFAULT 'invite',
          "lastAccessAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserProtocolAccess_userId_key" UNIQUE ("userId")
        )
      `);
      console.log("[protocol] UserProtocolAccess recreated with correct schema.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to recreate UserProtocolAccess:", msg);
    }
  }

  // ── Add downloadEnabled column to ProtocolVersion ──
  if (await tableExists("ProtocolVersion") && !(await columnExists("ProtocolVersion", "downloadEnabled"))) {
    console.log("[protocol] ProtocolVersion missing 'downloadEnabled' column, adding...");
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "ProtocolVersion" ADD COLUMN "downloadEnabled" BOOLEAN NOT NULL DEFAULT true`);
      console.log("[protocol] ProtocolVersion 'downloadEnabled' column added.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to add downloadEnabled column:", msg);
    }
  }

  // ── WorkspaceConfig (workspace-level tokens, e.g. ZAI workspace token) ──
  if (!(await tableExists("WorkspaceConfig"))) {
    console.log("[protocol] WorkspaceConfig table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE "WorkspaceConfig" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "configToken" TEXT NOT NULL DEFAULT '',
          "configTokenLabel" TEXT NOT NULL DEFAULT 'Workspace Token',
          "updatedBy" TEXT NOT NULL DEFAULT '',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("[protocol] WorkspaceConfig table created.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[protocol] Failed to create WorkspaceConfig:", msg);
    }
  }

  // All migrations completed successfully — mark as ensured
  ensured = true;
}
