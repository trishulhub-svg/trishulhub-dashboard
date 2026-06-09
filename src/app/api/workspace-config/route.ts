import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";

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

/**
 * GET /api/workspace-config
 * All authenticated users can fetch. Token is masked for non-admin.
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

    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT * FROM "WorkspaceConfig" LIMIT 1`
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
    // C7: configToken is stored in plaintext.
    // TODO: Encrypt configToken at rest using AES-256-GCM (similar to task-git-config tokenEncrypted pattern)
    return NextResponse.json({
      id: row.id,
      // Return full configToken to all authenticated users (they need it to use it)
      configToken: row.configToken || "",
      configTokenMasked: maskToken(row.configToken),
      configTokenLabel: row.configTokenLabel || "Workspace Token",
      hasToken: !!row.configToken,
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
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const { configToken, configTokenLabel } = body;

    // Check existing config
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "WorkspaceConfig" LIMIT 1`
    );

    if (existing.length > 0) {
      // Build dynamic SET clause
      const updates: string[] = [];
      const values: unknown[] = [];

      if (configToken !== undefined) {
        updates.push(`"configToken" = ?`);
        values.push(configToken);
      }
      if (configTokenLabel !== undefined) {
        updates.push(`"configTokenLabel" = ?`);
        values.push(configTokenLabel);
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      updates.push(`"updatedBy" = ?`);
      values.push(getTokenUserId(token));
      updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
      values.push(existing[0].id);

      await db.$executeRawUnsafe(
        `UPDATE "WorkspaceConfig" SET ${updates.join(", ")} WHERE id = ?`,
        ...values
      );
    } else {
      // Create new config row
      // W65: Use crypto.randomUUID() instead of weak ID generation
      const id = "wc_" + crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "WorkspaceConfig" (id, "configToken", "configTokenLabel", "updatedBy")
         VALUES (?, ?, ?, ?)`,
        id,
        configToken || "",
        configTokenLabel || "Workspace Token",
        getTokenUserId(token)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ws-config] PATCH error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
