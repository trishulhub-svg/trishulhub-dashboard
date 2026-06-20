import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db, getAppSetting } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { JwtToken } from "@/types/jwt";
import { decryptCredentialFromJson } from "@/lib/encryption";

/**
 * GET /api/protocol/init
 *
 * Single-batch endpoint that returns ALL data the protocol page needs
 * in one request. Replaces 5 separate API calls → 1 request.
 *
 * Returns: { protocol, wsConfig, gitConfig? }
 * Admin-only field (gitConfig) is included only for SUPER_ADMIN.
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = token.role === "SUPER_ADMIN";

    // ONE call to ensure tables — shared across all data fetches
    await ensureProtocolTables();

    // Fire all queries in parallel
    const [
      protocolResult,
      wsConfigResult,
      ...adminResults
    ] = await Promise.all([
      // 1. Protocol PDF metadata
      (async () => {
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT id, version, title, content as data, stageDescriptions, agentSkills,
                    isActive, createdBy, createdAt, updatedAt, "downloadEnabled"
             FROM "ProtocolVersion" WHERE isActive = true LIMIT 1`
          );
          if (!rows.length) return null;
          const row = rows[0];
          let meta = { fileName: "trishul-protocol.pdf", fileSize: 0, mimeType: "application/pdf", uploadedBy: "" };
          try {
            if (row.title && row.title.startsWith("{")) meta = { ...meta, ...JSON.parse(row.title) };
          } catch { /* defaults */ }
          return {
            id: row.id,
            fileName: meta.fileName,
            fileSize: meta.fileSize || 0,
            mimeType: meta.mimeType || "application/pdf",
            uploadedBy: meta.uploadedBy || "",
            uploadedAt: row.updatedAt || row.createdAt,
            downloadEnabled: row.downloadEnabled !== false,
          };
        } catch { return null; }
      })(),

      // 2. Workspace config token
      // Phase A8: configToken is now stored encrypted (JSON envelope). Decrypt
      // here and return plaintext ONLY to SUPER_ADMIN — everyone else gets a
      // masked value. Use POST /api/workspace-config/reveal (ADMIN+) to view
      // the plaintext.
      (async () => {
        try {
          const rows: any[] = await db.$queryRawUnsafe(`SELECT * FROM "WorkspaceConfig" LIMIT 1`);
          if (!rows.length) {
            return { id: null, configToken: "", configTokenMasked: "", configTokenLabel: "Workspace Token", hasToken: false };
          }
          const row = rows[0];
          const stored = row.configToken || "";
          const credDbKey = await getAppSetting("credentialEncryptionKey").catch(() => "");
          // decryptCredentialFromJson returns legacy plaintext values as-is
          let plaintext = "";
          try {
            plaintext = decryptCredentialFromJson(stored, credDbKey || undefined);
          } catch {
            plaintext = "";
          }
          const masked = plaintext.length <= 12
            ? (plaintext ? "••••••••" : "")
            : plaintext.slice(0, 4) + "••••••••" + plaintext.slice(-4);
          // Only SUPER_ADMIN sees the plaintext token here
          const visibleToken = isAdmin ? plaintext : "";
          return {
            id: row.id,
            configToken: visibleToken,
            configTokenMasked: masked,
            configTokenLabel: row.configTokenLabel || "Workspace Token",
            hasToken: !!plaintext,
          };
        } catch { return { id: null, configToken: "", configTokenMasked: "", configTokenLabel: "Workspace Token", hasToken: false }; }
      })(),

      // 3. Admin-only: Git config (with stale PENDING reset)
      isAdmin
        ? (async () => {
            try {
              // Auto-reset stale PENDING
              await db.$executeRawUnsafe(
                `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR',
                  "lastSyncError" = 'Sync timed out.', "updatedAt" = CURRENT_TIMESTAMP
                 WHERE "lastSyncStatus" = 'PENDING' AND "updatedAt" < datetime('now', '-45 seconds')`
              ).catch(() => {});

              const rows: any[] = await db.$queryRawUnsafe(
                `SELECT "repoUrl", "branch", "isEnabled", "lastSyncAt", "lastSyncStatus", "lastSyncError", "encryptionKey"
                 FROM "TaskGitConfig" LIMIT 1`
              );
              if (!rows.length) {
                return { repoUrl: "", tokenMasked: "", branch: "main", isEnabled: false, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, hasEncryptionKey: !!process.env.ENCRYPTION_KEY };
              }
              const r = rows[0];
              return {
                repoUrl: r.repoUrl || "",
                tokenMasked: "••••••••",
                branch: r.branch || "main",
                isEnabled: !!r.isEnabled,
                lastSyncAt: r.lastSyncAt || null,
                lastSyncStatus: r.lastSyncStatus || null,
                lastSyncError: r.lastSyncError || null,
                hasEncryptionKey: !!(r.encryptionKey || process.env.ENCRYPTION_KEY),
              };
            } catch { return null; }
          })()
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      protocol: protocolResult,
      wsConfig: wsConfigResult,
      ...(isAdmin ? { gitConfig: adminResults[0] } : {}),
    });
  } catch (error: unknown) {
    console.error("[protocol/init] GET error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
