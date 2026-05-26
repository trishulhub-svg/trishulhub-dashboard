import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { encrypt } from "@/lib/encryption";

// ── Helper: ensure only SUPER_ADMIN ──
async function requireSuperAdmin(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
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

    await ensureProtocolTables();

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
      tokenMasked: "••••••••",
      branch: row.branch || "main",
      isEnabled: !!row.isEnabled,
      lastSyncAt: row.lastSyncAt || null,
      lastSyncStatus: row.lastSyncStatus || null,
      lastSyncError: row.lastSyncError || null,
      encryptionKeyMasked: row.encryptionKey ? "••••••••••••••••••••" : "",
      hasEncryptionKey: !!(row.encryptionKey || process.env.ENCRYPTION_KEY),
    });
  } catch (error: any) {
    console.error("[task-git-config] GET error:", error);
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

    await ensureProtocolTables();

    const body = await request.json();
    const { repoUrl, token: gitToken, branch, isEnabled } = body;

    if (!repoUrl || !gitToken) {
      return NextResponse.json({ error: "Repository URL and access token are required" }, { status: 400 });
    }

    // Use DB-stored encryption key if available
    const configCheck: any[] = await db.$queryRawUnsafe(
      `SELECT "encryptionKey" FROM "TaskGitConfig" LIMIT 1`
    );
    if (configCheck.length > 0 && configCheck[0].encryptionKey) {
      process.env.ENCRYPTION_KEY = configCheck[0].encryptionKey;
    }

    // Encrypt the token
    let encrypted: { encrypted: string; iv: string; tag: string };
    try {
      encrypted = encrypt(gitToken);
    } catch (encError: any) {
      console.error("[task-git-config] Encryption error:", encError?.message);
      return NextResponse.json(
        { error: "Encryption key not configured. Set ENCRYPTION_KEY environment variable." },
        { status: 500 }
      );
    }

    // Parse owner/repo from URL
    let repoOwner = "";
    let repoName = "";
    try {
      const urlMatch = repoUrl.match(/\/([^/]+)\/([^/]+?)(\.git)?$/);
      if (urlMatch) {
        repoOwner = urlMatch[1];
        repoName = urlMatch[2].replace(/\.git$/, "");
      }
    } catch { /* ignore */ }

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
      const id = "tgc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const currentEncKey = process.env.ENCRYPTION_KEY || "";
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
        (token as any).sub || (token as any).id || "unknown"
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[task-git-config] POST error:", error?.message || error);
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

    await ensureProtocolTables();

    const body = await request.json();
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
            const crypto = require("crypto");
            const keyBuffer = Buffer.from(oldKey, "hex");
            const ivBuffer = Buffer.from(oldIv, "base64");
            const tagBuffer = Buffer.from(oldTag, "base64");
            const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, ivBuffer);
            decipher.setAuthTag(tagBuffer);
            plainToken = decipher.update(oldEnc, "base64", "utf8");
            plainToken += decipher.final("utf8");
            needsReEncrypt = true;
          }
        } catch {
          // Old key might not work — user will need to re-enter the git token
          console.warn("[task-git-config] Could not decrypt git token with old key for re-encryption");
        }
      }

      // Set new key in process.env
      process.env.ENCRYPTION_KEY = newKey;

      // Re-encrypt git token with new key if needed
      if (needsReEncrypt && plainToken) {
        try {
          const { encrypt: encryptFn } = await import("@/lib/encryption");
          const reEncrypted = encryptFn(plainToken);
          await db.$executeRawUnsafe(
            `UPDATE "TaskGitConfig" SET "tokenEncrypted" = ?, "tokenIv" = ?, "tokenTag" = ? WHERE id = ?`,
            reEncrypted.encrypted,
            reEncrypted.iv,
            reEncrypted.tag,
            existing[0].id
          );
        } catch (err: any) {
          console.error("[task-git-config] Failed to re-encrypt git token:", err?.message);
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
      // Load encryption key from DB before triggering sync
      const keyRow: any[] = await db.$queryRawUnsafe(
        `SELECT "encryptionKey" FROM "TaskGitConfig" WHERE id = ?`,
        existing[0].id
      );
      if (keyRow.length > 0 && keyRow[0].encryptionKey) {
        process.env.ENCRYPTION_KEY = keyRow[0].encryptionKey;
      }

      // Trigger async sync — just set a pending status and let the caller handle the actual sync
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        existing[0].id
      );

      // Fire-and-forget sync
      const { syncTasksToGit } = await import("@/lib/git-sync");
      syncTasksToGit().catch((err: any) => {
        console.error("[task-git-config] Manual sync failed:", err?.message);
      });

      return NextResponse.json({ success: true, message: "Sync triggered" });
    }

    if (typeof isEnabled === "boolean") {
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "isEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        isEnabled ? 1 : 0,
        existing[0].id
      );

      // When enabling autosync, also trigger an immediate sync
      if (isEnabled) {
        // Load encryption key from DB if stored
        const keyRow: any[] = await db.$queryRawUnsafe(
          `SELECT "encryptionKey" FROM "TaskGitConfig" WHERE id = ?`,
          existing[0].id
        );
        if (keyRow.length > 0 && keyRow[0].encryptionKey) {
          process.env.ENCRYPTION_KEY = keyRow[0].encryptionKey;
        }

        await db.$executeRawUnsafe(
          `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
          existing[0].id
        );
        const { syncTasksToGit } = await import("@/lib/git-sync");
        syncTasksToGit().catch((err: any) => {
          console.error("[task-git-config] Auto-sync on enable failed:", err?.message);
        });
      }

      return NextResponse.json({ success: true, isEnabled });
    }

    return NextResponse.json({ error: "No valid action specified" }, { status: 400 });
  } catch (error: any) {
    console.error("[task-git-config] PATCH error:", error?.message || error);
    return NextResponse.json({ error: "Failed to update git configuration" }, { status: 500 });
  }
}
