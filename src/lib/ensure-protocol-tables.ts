// Self-healing: create protocol tables if they don't exist in Turso.
// These tables were added to schema.prisma but never pushed to remote DB.
// Column names MUST match schema.prisma exactly — Prisma generates SQL using
// the Prisma field names, not the raw SQL column names.
//
// Import and call ensureProtocolTables() at the top of every protocol route handler.

import { db } from "@/lib/db";

let ensured = false;

export async function ensureProtocolTables(): Promise<void> {
  if (ensured) return;
  ensured = true;

  // ── ProtocolVersion ──
  try {
    await db.protocolVersion.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolVersion table missing, creating...");
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolVersion" (
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
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolVersion:", err?.message);
    }
  }

  // ── ProtocolInvite — CRITICAL: column is "protocolId" (not protocolVersionId),
  //    must include "usedBy" column, and inviteCode must be UNIQUE. ──
  try {
    await db.protocolInvite.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolInvite table missing, creating...");
    try {
      // Drop if exists with wrong schema (old ensureProtocolTables bug)
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "ProtocolInvite"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolInvite" (
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
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolInvite:", err?.message);
    }
  }

  // ── ProtocolAccessLog — must match Prisma schema fields exactly ──
  try {
    await (db as any).protocolAccessLog.count({ take: 1 });
  } catch {
    console.log("[protocol] ProtocolAccessLog table missing, creating...");
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "ProtocolAccessLog"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ProtocolAccessLog" (
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
    } catch (err: any) {
      console.error("[protocol] Failed to create ProtocolAccessLog:", err?.message);
    }
  }

  // ── UserProtocolAccess — must include protocolId, lastAccessAt (not inviteId) ──
  try {
    await (db as any).userProtocolAccess.count({ take: 1 });
  } catch {
    console.log("[protocol] UserProtocolAccess table missing, creating...");
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "UserProtocolAccess"`);
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "UserProtocolAccess" (
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
    } catch (err: any) {
      console.error("[protocol] Failed to create UserProtocolAccess:", err?.message);
    }
  }
}
