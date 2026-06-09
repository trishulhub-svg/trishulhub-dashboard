import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { encrypt, decrypt, encryptWithKey, decryptWithKey } from "@/lib/encryption";
import { parseRepoUrl } from "@/lib/git-sync";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";

// TODO (I25): This route uses getToken() instead of getServerSession().
// Consider standardizing auth pattern across all utility routes.

// ── Helper: ensure only SUPER_ADMIN ──
async function requireSuperAdmin(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as JwtToken;
  if (!token || token.role !== "SUPER_ADMIN") {
    return null;
  }
  return token;
}

// GET — fetch current git config (masked token)
export async function GET(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // W58: Rate limit GET (30 per minute)
    const rlGet = rateLimit(`git-config:${getTokenUserId(token)}`, 30, 60_000);
    if (!rlGet.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    // Auto-reset stale PENDING status (if sync timed out, status gets stuck)
    try {
      const staleRows: any[] = await db.$queryRawUnsafe(
        `SELECT id, "updatedAt" FROM "TaskGitConfig"
         WHERE "lastSyncStatus" = 'PENDING'
           AND "updatedAt" < datetime('now', '-45 seconds')
         LIMIT 1`
      );
      if (staleRows.length > 0) {
        await db.$executeRawUnsafe(
          `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'ERROR', "lastSyncError" = 'Sync timed out (serverless function limit). Click Sync Now to retry.', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
          staleRows[0].id
        );
        console.log("[task-git-config] Auto-reset stale PENDING status to ERROR");
      }
    } catch { /* non-fatal */ }

    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT "repoUrl", "branch", "isEnabled", "lastSyncAt", "lastSyncStatus", "lastSyncError", "createdAt", "updatedAt", "encryptionKey"
       FROM "TaskGitConfig" LIMIT 1`
    );

    if (!rows.length) {
      return NextResponse.json({
        repoUrl: "",
        tokenMasked: "",
        branch: "main",
        isEnabled: false,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        encryptionKeyMasked: "",
        hasEncryptionKey: !!(process.env.ENCRYPTION_KEY),
      });
    }

    const row = rows[0];
    return NextResponse.json({
      repoUrl: row.repoUrl || "",
      tokenMasked: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
      branch: row.branch || "main",
      isEnabled: !!row.isEnabled,
      lastSyncAt: row.lastSyncAt || null,
      lastSyncStatus: row.lastSyncStatus || null,
      lastSyncError: row.lastSyncError || null,
      encryptionKeyMasked: row.encryptionKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "",
      hasEncryptionKey: !!(row.encryptionKey || process.env.ENCRYPTION_KEY),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[task-git-config] GET error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST/PUT — save git config
export async function POST(request: NextRequest) {
  return saveConfig(request);
}

export async function PUT(request: NextRequest) {
  return saveConfig(request);
}

async function saveConfig(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // W58: Rate limit POST/PUT (10 per minute)
    const rlWrite = rateLimit(`git-config-write:${getTokenUserId(token)}`, 10, 60_000);
    if (!rlWrite.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    // W59: Wrap req.json() in try/catch
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { repoUrl, token: gitToken, branch, isEnabled } = body;

    if (!repoUrl || !gitToken) {
      return NextResponse.json({ error: "Repository URL and access token are required" }, { status: 400 });
    }

    // W9: Validate repoUrl format before saving
    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL. Expected: https://github.com/owner/repo or owner/repo" },
        { status: 400 }
      );
    }

    // Use DB-stored encryption key if available
    const configCheck: any[] = await db.$queryRawUnsafe(
      `SELECT "encryptionKey" FROM "TaskGitConfig" LIMIT 1`
    );
    let dbEncryptionKey = "";
    if (configCheck.length > 0 && configCheck[0].encryptionKey) {
      dbEncryptionKey = configCheck[0].encryptionKey;
    }

    // Encrypt the token
    let encrypted: { encrypted: string; iv: string; tag: string };
    try {
      encrypted = dbEncryptionKey ? encryptWithKey(gitToken, dbEncryptionKey) : encrypt(gitToken);
    } catch (encError: unknown) {
      const encMsg = encError instanceof Error ? encError.message : String(encError);
      console.error("[task-git-config] Encryption error:", encMsg);
      return NextResponse.json(
        { error: "Encryption key not configured. Set ENCRYPTION_KEY environment variable." },
        { status: 500 }
      );
    }

    const { owner: repoOwner, repo: repoName } = parsed;

    // Auto-detect default branch from GitHub
    let detectedBranch = "main";
    try {
      const repoRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}`,
        {
          headers: {
            Authorization: `Bearer ${gitToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "TrishulHub-CRM",
          },
        }
      );
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        if (repoData.default_branch) {
          detectedBranch = repoData.default_branch;
        }
      }
    } catch { /* fallback to "main" */ }

    const configBranch = detectedBranch;

    // Check if config exists
    const existing: any[] = await db.$queryRawUnsafe(`SELECT id FROM "TaskGitConfig" LIMIT 1`);

    if (existing.length > 0) {
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET
          "repoUrl" = ?, "repoOwner" = ?, "repoName" = ?, "branch" = ?,
          "tokenEncrypted" = ?, "tokenIv" = ?, "tokenTag" = ?,
          "isEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ?`,
        repoUrl,
        repoOwner,
        repoName,
        configBranch,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.tag,
        isEnabled !== false ? 1 : 0,
        existing[0].id
      );
    } else {
      // P10-014: Validate encryption key before persisting — must be valid 64-char hex
      let currentEncKey = process.env.ENCRYPTION_KEY || ""
      if (currentEncKey && (!/^[0-9a-fA-F]{64}$/.test(currentEncKey))) {
        console.warn("[task-git-config] Existing ENCRYPTION_KEY is invalid, skipping persist")
        currentEncKey = ""
      }

      const id = "tgc_" + crypto.randomUUID()
      await db.$executeRawUnsafe(
        `INSERT INTO "TaskGitConfig" (id, "repoUrl", "repoOwner", "repoName", "branch", "tokenEncrypted", "tokenIv", "tokenTag", "encryptionKey", "isEnabled", "createdBy")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        repoUrl,
        repoOwner,
        repoName,
        configBranch,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.tag,
        currentEncKey,
        isEnabled !== false ? 1 : 0,
        getTokenUserId(token)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[task-git-config] POST error:", msg);
    return NextResponse.json({ error: "Failed to save git configuration" }, { status: 500 });
  }
}

// PATCH — toggle enabled or trigger sync
export async function PATCH(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // W58: Rate limit PATCH (10 per minute)
    const rlPatch = rateLimit(`git-config-write:${getTokenUserId(token)}`, 10, 60_000);
    if (!rlPatch.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    // W59: Wrap req.json() in try/catch
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { isEnabled, triggerSync } = body;

    // Check if config exists
    const existing: any[] = await db.$queryRawUnsafe(`SELECT id FROM "TaskGitConfig" LIMIT 1`);
    if (!existing.length) {
      return NextResponse.json({ error: "No git config found. Save configuration first." }, { status: 400 });
    }

    // ── Manage Encryption Key ──
    if (body.encryptionKey !== undefined) {
      const newKey = String(body.encryptionKey).trim();
      if (!newKey || newKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(newKey)) {
        return NextResponse.json(
          { error: "Encryption key must be a valid 64-character hex string" },
          { status: 400 }
        );
      }

      const oldKey = process.env.ENCRYPTION_KEY || "";

      // If there's an existing git token, re-encrypt with new key
      const configRow: any[] = await db.$queryRawUnsafe(
        `SELECT "tokenEncrypted", "tokenIv", "tokenTag" FROM "TaskGitConfig" WHERE id = ?`,
        existing[0].id
      );

      let needsReEncrypt = false;
      let plainToken = "";

      if (configRow.length > 0 && configRow[0].tokenEncrypted) {
        try {
          // Decrypt with OLD key
          const oldIv = configRow[0].tokenIv;
          const oldTag = configRow[0].tokenTag;
          const oldEnc = configRow[0].tokenEncrypted;

          if (oldIv && oldTag && oldEnc && oldKey && oldKey.length === 64) {
            // Use decryptWithKey() — no process.env mutation
            try {
              plainToken = decryptWithKey(oldEnc, oldIv, oldTag, oldKey);
              needsReEncrypt = true;
            } catch {
              // Old key might not work — user will need to re-enter the git token
              console.warn("[task-git-config] Could not decrypt git token with old key for re-encryption");
            }
          }
        }
      }

      // W28: Only re-encrypt if needed, and DON'T save new key if re-encryption fails
      // This prevents permanent data loss if re-encryption fails mid-operation
      if (needsReEncrypt && plainToken) {
        try {
          const reEncrypted = encryptWithKey(plainToken, newKey);
          await db.$executeRawUnsafe(
            `UPDATE "TaskGitConfig" SET "tokenEncrypted" = ?, "tokenIv" = ?, "tokenTag" = ? WHERE id = ?`,
            reEncrypted.encrypted,
            reEncrypted.iv,
            reEncrypted.tag,
            existing[0].id
          );
        } catch (err: unknown) {
          console.error("[task-git-config] Failed to re-encrypt git token with new key:", err instanceof Error ? err.message : String(err));
          return NextResponse.json(
            { error: "Failed to re-encrypt git token with new key. Old encryption key preserved to prevent data loss." },
            { status: 500 }
          );
        }
      }

      // Store the new key in DB
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "encryptionKey" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        newKey,
        existing[0].id
      );

      return NextResponse.json({ success: true, encryptionKeyUpdated: true });
    }

    if (triggerSync) {
      // Load encryption key from DB before triggering sync (no process.env mutation)
      // The git-sync module will load it from DB independently

      // Set status to PENDING and run sync directly within this request
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        existing[0].id
      );

      // Fire-and-forget sync
      const { syncTasksToGit } = await import("@/lib/git-sync");
      syncTasksToGit().catch((err: unknown) => {
        console.error("[task-git-config] Manual sync failed:", err instanceof Error ? err.message : String(err));
      });

      return NextResponse.json({ success: true, message: "Sync triggered" });
    }

    if (typeof isEnabled === "boolean") {
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "isEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        isEnabled ? 1 : 0,
        existing[0].id
      );

      // Note: The frontend now triggers sync via the dedicated /api/task-git-sync endpoint
      // after enabling, so we don't fire sync here anymore. This avoids timeout issues.

      return NextResponse.json({ success: true, isEnabled });
    }

    return NextResponse.json({ error: "No valid action specified" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[task-git-config] PATCH error:", msg);
    return NextResponse.json({ error: "Failed to update git configuration" }, { status: 500 });
  }
}
