import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

/** Helper: require any authenticated user */
async function requireAuth(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
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

    return NextResponse.json({
      id: row.id,
      configToken: row.configToken || "",
      configTokenMasked: maskToken(row.configToken),
      configTokenLabel: row.configTokenLabel || "Workspace Token",
      hasToken: !!row.configToken,
    });
  } catch (error: any) {
    console.error("[workspace-config] GET error:", error);
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

    await ensureProtocolTables();

    const body = await request.json();
    const { configToken, configTokenLabel } = body;

    // Check existing config
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "WorkspaceConfig" LIMIT 1`
    );

    if (existing.length > 0) {
      // Build dynamic SET clause
      const updates: string[] = [];
      const values: any[] = [];

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
      values.push((token as any).sub || (token as any).id || "unknown");
      updates.push(`"updatedAt" = CURRENT_TIMESTAMP`);
      values.push(existing[0].id);

      await db.$executeRawUnsafe(
        `UPDATE "WorkspaceConfig" SET ${updates.join(", ")} WHERE id = ?`,
        ...values
      );
    } else {
      // Create new config row
      const id = "wc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      await db.$executeRawUnsafe(
        `INSERT INTO "WorkspaceConfig" (id, "configToken", "configTokenLabel", "updatedBy")
         VALUES (?, ?, ?, ?)`,
        id,
        configToken || "",
        configTokenLabel || "Workspace Token",
        (token as any).sub || (token as any).id || "unknown"
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[workspace-config] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
