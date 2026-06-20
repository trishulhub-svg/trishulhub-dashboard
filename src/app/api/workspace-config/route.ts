import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db, getAppSetting } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";
import { encryptCredentialToJson, decryptCredentialFromJson } from "@/lib/encryption";
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log";

// TODO (I25): This route uses getToken() instead of getServerSession().
// Consider standardizing auth pattern across all utility routes.

/** Helper: require any authenticated user */
async function requireAuth(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
  if (!token) return null;
  return token;
}

/** Helper: require SUPER_ADMIN */
async function requireSuperAdmin(request: NextRequest) {
  const token = await requireAuth(request);
  if (!token || token.role !== "SUPER_ADMIN") return null;
  return token;
}

/** Mask a token string: show first 4 and last 4 chars, rest as dots */
function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "••••••••";
  return token.slice(0, 4) + "••••••••" + token.slice(-4);
}

/** Load the credential encryption key from DB (or empty string if not set) */
async function loadCredDbKey(): Promise<string> {
  try { return await getAppSetting("credentialEncryptionKey") } catch { return "" }
}

/**
 * GET /api/workspace-config
 * All authenticated users can fetch. The plaintext configToken is returned
 * ONLY to SUPER_ADMIN — everyone else receives a masked value and must use
 * POST /api/workspace-config/reveal (ADMIN+) to view the plaintext.
 */
export async function GET(request: NextRequest) {
  try {
    const token = await requireAuth(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // W58: Rate limit GET (30 per minute)
    const rlResult = rateLimit(`ws-config:${getTokenUserId(token)}`, 30, 60_000);
    if (!rlResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    const rows: Array<{ id: string; configToken: string; configTokenLabel: string }> =
      await db.$queryRawUnsafe(
        `SELECT id, "configToken", "configTokenLabel" FROM "WorkspaceConfig" LIMIT 1`
      );

    if (!rows.length) {
      return NextResponse.json({
        id: null,
        configToken: "",
        configTokenMasked: "",
        configTokenLabel: "Workspace Token",
        hasToken: false,
      });
    }

    const row = rows[0];
    const stored = row.configToken || "";
    const dbKey = await loadCredDbKey();
    const isSuperAdmin = token.role === "SUPER_ADMIN";

    // Decrypt the stored value (handles both JSON-envelope encrypted form and
    // legacy plaintext — decryptCredentialFromJson returns legacy values as-is).
    let plaintext = "";
    try {
      plaintext = decryptCredentialFromJson(stored, dbKey || undefined);
    } catch (err) {
      console.error("[ws-config] decrypt error:", err instanceof Error ? err.message : String(err));
      plaintext = "";
    }

    // SECURITY: Only SUPER_ADMIN sees the plaintext token in GET.
    // Everyone else gets the masked form (use reveal endpoint to view plaintext).
    const visibleToken = isSuperAdmin ? plaintext : "";

    return NextResponse.json({
      id: row.id,
      configToken: visibleToken,
      configTokenMasked: maskToken(plaintext),
      configTokenLabel: row.configTokenLabel || "Workspace Token",
      hasToken: !!plaintext,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ws-config] GET error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/workspace-config
 * SUPER_ADMIN only — set or update the workspace config token.
 * The configToken is encrypted at rest with encryptCredentialToJson()
 * (uses CREDENTIAL_ENCRYPTION_KEY or DB-stored credential key).
 * Body: { configToken?: string, configTokenLabel?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // W58: Rate limit PATCH (10 per minute)
    const rlWrite = rateLimit(`ws-config-write:${getTokenUserId(token)}`, 10, 60_000);
    if (!rlWrite.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    // W59: Wrap req.json() in try/catch
    let body: { configToken?: string; configTokenLabel?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { configToken, configTokenLabel } = body;

    // Check existing config
    const existing: Array<{ id: string }> = await db.$queryRawUnsafe(
      `SELECT id FROM "WorkspaceConfig" LIMIT 1`
    );

    const dbKey = await loadCredDbKey();
    const userId = getTokenUserId(token);
    const userName = token.name || "unknown";

    if (existing.length > 0) {
      // Build dynamic SET clause
      const updates: string[] = [];
      const values: unknown[] = [];

      if (configToken !== undefined) {
        // Encrypt the plaintext token before storing. Empty string stays empty.
        const storedValue = configToken
          ? safeEncryptCredential(configToken, dbKey || undefined)
          : "";
        updates.push(`"configToken" = ?`);
        values.push(storedValue);
      }
      if (configTokenLabel !== undefined) {
        updates.push(`"configTokenLabel" = ?`);
        values.push(configTokenLabel);
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      updates.push(`"updatedBy" = ?`);
      values.push(userId);
      updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
      values.push(existing[0].id);

      await db.$executeRawUnsafe(
        `UPDATE "WorkspaceConfig" SET ${updates.join(", ")} WHERE id = ?`,
        ...values
      );

      // Audit log the config change (do not include the token value itself)
      void logAudit({
        userId,
        userName,
        userRole: token.role || "",
        department: "SYSTEM",
        page: "workspace",
        action: "CONFIG_CHANGE",
        entityType: "WorkspaceConfig",
        entityId: existing[0].id,
        description: configToken !== undefined
          ? `Updated workspace config token${configTokenLabel ? ` (label: ${configTokenLabel})` : ""}`
          : `Updated workspace config label to ${configTokenLabel}`,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      });
    } else {
      // Create new config row
      // W65: Use crypto.randomUUID() instead of weak ID generation
      const id = "wc_" + crypto.randomUUID();
      const storedValue = configToken
        ? safeEncryptCredential(configToken, dbKey || undefined)
        : "";

      await db.$executeRawUnsafe(
        `INSERT INTO "WorkspaceConfig" (id, "configToken", "configTokenLabel", "updatedBy")
         VALUES (?, ?, ?, ?)`,
        id,
        storedValue,
        configTokenLabel || "Workspace Token",
        userId
      );

      void logAudit({
        userId,
        userName,
        userRole: token.role || "",
        department: "SYSTEM",
        page: "workspace",
        action: "CONFIG_CHANGE",
        entityType: "WorkspaceConfig",
        entityId: id,
        description: `Created workspace config token${configTokenLabel ? ` (label: ${configTokenLabel})` : ""}`,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ws-config] PATCH error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Encrypt with encryptCredentialToJson, falling back to plaintext if encryption is unavailable.
 * The fallback keeps the system working in dev when no key is configured, but logs a warning. */
function safeEncryptCredential(plaintext: string, dbKey?: string): string {
  try {
    return encryptCredentialToJson(plaintext, dbKey);
  } catch (err) {
    console.warn(
      "[ws-config] Encryption failed — storing plaintext as fallback. " +
      "Configure ENCRYPTION_KEY / CREDENTIAL_ENCRYPTION_KEY to enable at-rest encryption:",
      err instanceof Error ? err.message : String(err)
    );
    return plaintext;
  }
}
