import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { syncTasksToGit } from "@/lib/git-sync";

// ── Helper: ensure only SUPER_ADMIN ──
async function requireSuperAdmin(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token || token.role !== "SUPER_ADMIN") {
    return null;
  }
  return token;
}

/**
 * POST /api/task-git-sync — Trigger a full sync with extended timeout.
 *
 * This is the dedicated sync endpoint that should be used for manual sync
 * and auto-sync triggers. It runs with maxDuration to allow more time
 * for the GitHub API calls.
 *
 * The endpoint:
 * 1. Sets status to PENDING
 * 2. Calls syncTasksToGit() (which has its own deduplication)
 * 3. Returns the result
 */
export async function POST(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureProtocolTables();

    // Check if config exists
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id, "isEnabled" FROM "TaskGitConfig" LIMIT 1`
    );
    if (!existing.length) {
      return NextResponse.json(
        { error: "No git config found. Save configuration first." },
        { status: 400 }
      );
    }

    const configId = existing[0].id;

    // Load encryption key from DB before triggering sync
    const keyRow: any[] = await db.$queryRawUnsafe(
      `SELECT "encryptionKey" FROM "TaskGitConfig" WHERE id = ?`,
      configId
    );
    if (keyRow.length > 0 && keyRow[0].encryptionKey) {
      process.env.ENCRYPTION_KEY = keyRow[0].encryptionKey;
    }

    // Set status to PENDING before starting sync
    await db.$executeRawUnsafe(
      `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      configId
    );

    console.log("[task-git-sync] Starting sync...");

    // Run the actual sync (synchronous within this function)
    const result = await syncTasksToGit();

    console.log("[task-git-sync] Sync finished:", JSON.stringify(result));

    return NextResponse.json({
      success: result.success,
      filesUpdated: result.filesUpdated || 0,
      error: result.error || null,
    });
  } catch (error: any) {
    console.error("[task-git-sync] Error:", error?.message || error);

    // Try to update status to ERROR
    try {
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT id FROM "TaskGitConfig" LIMIT 1`
      );
      if (rows.length) {
        await db.$executeRawUnsafe(
          `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
          error?.message || String(error),
          rows[0].id
        );
      }
    } catch {
      // non-fatal
    }

    return NextResponse.json(
      { error: error?.message || "Sync failed" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60; // Allow up to 60s for sync (Pro plan) — Hobby caps at 10s
