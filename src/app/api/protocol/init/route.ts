import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

/**
 * GET /api/protocol/init
 *
 * Single-batch endpoint that returns ALL data the protocol page needs
 * in one request. Replaces 5 separate API calls → 1 request.
 *
 * Returns: { protocol, wsConfig, myUserCode, gitConfig?, allUserCodes? }
 * Admin-only fields (gitConfig, allUserCodes) are included only for SUPER_ADMIN.
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = token.role === "SUPER_ADMIN";
    const userId = (token as any).sub || (token as any).id;

    // ONE call to ensure tables — shared across all data fetches
    await ensureProtocolTables();

    // Fire all queries in parallel
    const [
      protocolResult,
      wsConfigResult,
      myCodeResult,
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
      (async () => {
        try {
          const rows: any[] = await db.$queryRawUnsafe(`SELECT * FROM "WorkspaceConfig" LIMIT 1`);
          if (!rows.length) {
            return { id: null, configToken: "", configTokenMasked: "", configTokenLabel: "Workspace Token", hasToken: false };
          }
          const row = rows[0];
          const tk = row.configToken || "";
          return {
            id: row.id,
            configToken: tk,
            configTokenMasked: tk.length <= 12 ? "••••••••" : tk.slice(0, 4) + "••••••••" + tk.slice(-4),
            configTokenLabel: row.configTokenLabel || "Workspace Token",
            hasToken: !!tk,
          };
        } catch { return { id: null, configToken: "", configTokenMasked: "", configTokenLabel: "Workspace Token", hasToken: false }; }
      })(),

      // 3. Current user's code
      (async () => {
        try {
          const rows: any[] = await db.$queryRawUnsafe(
            `SELECT "code", "updatedAt" FROM "UserCode" WHERE "userId" = ?`, userId
          );
          if (!rows.length) return { hasCode: false, code: "", codeMasked: "" };
          const code = rows[0].code || "";
          return { hasCode: !!code, code, codeMasked: code ? "••••••••" : "", updatedAt: rows[0].updatedAt || null };
        } catch { return { hasCode: false, code: "", codeMasked: "" }; }
      })(),

      // 4. Admin-only: Git config (with stale PENDING reset)
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

      // 5. Admin-only: All user codes
      isAdmin
        ? (async () => {
            try {
              const coded: any[] = await db.$queryRawUnsafe(`
                SELECT uc.id, uc."userId", uc.code, uc."createdAt", uc."updatedAt",
                       u.name, u.email, u.role
                FROM "UserCode" uc LEFT JOIN "User" u ON uc."userId" = u.id
                WHERE u.role != 'CLIENT'
                ORDER BY u.name ASC
              `);
              const allUsers: any[] = await db.$queryRawUnsafe(
                `SELECT id, name, email, role FROM "User" WHERE role != 'CLIENT' ORDER BY name ASC`
              );
              const codedIds = new Set(coded.map((r: any) => r.userId));
              const userCodes = coded.map((r: any) => ({
                id: r.id, userId: r.userId, userName: r.name || "Unknown",
                userEmail: r.email || "", userRole: r.role || "",
                codeMasked: r.code ? "••••••••" : "", hasCode: !!r.code, updatedAt: r.updatedAt || null,
              }));
              const withoutCode = allUsers
                .filter((u: any) => !codedIds.has(u.id))
                .map((u: any) => ({
                  id: null, userId: u.id, userName: u.name || "Unknown",
                  userEmail: u.email || "", userRole: u.role || "",
                  codeMasked: "", hasCode: false, updatedAt: null,
                }));
              return [...userCodes, ...withoutCode];
            } catch { return []; }
          })()
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      protocol: protocolResult,
      wsConfig: wsConfigResult,
      myUserCode: myCodeResult,
      ...(isAdmin ? { gitConfig: adminResults[0], allUserCodes: adminResults[1] } : {}),
    });
  } catch (error: any) {
    console.error("[protocol/init] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
