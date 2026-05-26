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
      `SELECT "repoUrl", "branch", "isEnabled", "lastSyncAt", "lastSyncStatus", "lastSyncError", "createdAt", "updatedAt"
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

    const configBranch = branch || "main";

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
      await db.$executeRawUnsafe(
        `INSERT INTO "TaskGitConfig" (id, "repoUrl", "repoOwner", "repoName", "branch", "tokenEncrypted", "tokenIv", "tokenTag", "isEnabled", "createdBy")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        repoUrl,
        repoOwner,
        repoName,
        configBranch,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.tag,
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

    if (triggerSync) {
      // Trigger async sync — just set a pending status and let the caller handle the actual sync
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "lastSyncStatus" = 'PENDING', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        existing[0].id
      );

      // Fire-and-forget sync
      const { syncTasksToGit } = await import("@/lib/git-sync");
      syncTasksToGit().catch(() => {});

      return NextResponse.json({ success: true, message: "Sync triggered" });
    }

    if (typeof isEnabled === "boolean") {
      await db.$executeRawUnsafe(
        `UPDATE "TaskGitConfig" SET "isEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        isEnabled ? 1 : 0,
        existing[0].id
      );
      return NextResponse.json({ success: true, isEnabled });
    }

    return NextResponse.json({ error: "No valid action specified" }, { status: 400 });
  } catch (error: any) {
    console.error("[task-git-config] PATCH error:", error?.message || error);
    return NextResponse.json({ error: "Failed to update git configuration" }, { status: 500 });
  }
}
