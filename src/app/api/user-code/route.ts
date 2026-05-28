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

/**
 * GET /api/user-code
 * Returns current user's own code (masked).
 */
export async function GET(request: NextRequest) {
  try {
    const token = await requireAuth(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureProtocolTables();

    const userId = (token as any).sub || (token as any).id;

    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT "code", "updatedAt" FROM "UserCode" WHERE "userId" = ?`,
      userId
    );

    if (!rows.length) {
      return NextResponse.json({ hasCode: false, code: "", codeMasked: "" });
    }

    const row = rows[0];
    const code = row.code || "";

    return NextResponse.json({
      hasCode: !!code,
      code: code,
      codeMasked: code ? "••••••••" : "",
      updatedAt: row.updatedAt || null,
    });
  } catch (error: any) {
    console.error("[user-code] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/user-code
 * SUPER_ADMIN only — set a user's code.
 * Body: { userId: string, code: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = await requireSuperAdmin(request);
    if (!token) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureProtocolTables();

    const body = await request.json();
    const { userId, code } = body;

    if (!userId || !code || typeof code !== "string") {
      return NextResponse.json({ error: "userId and code are required" }, { status: 400 });
    }

    if (code.length > 256) {
      return NextResponse.json({ error: "Code must be 256 characters or less" }, { status: 400 });
    }

    // Check existing
    const existing: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "UserCode" WHERE "userId" = ?`,
      userId
    );

    if (existing.length > 0) {
      await db.$executeRawUnsafe(
        `UPDATE "UserCode" SET "code" = ?, "updatedBy" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
        code,
        (token as any).sub || (token as any).id || "unknown",
        existing[0].id
      );
    } else {
      const id = "uc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      await db.$executeRawUnsafe(
        `INSERT INTO "UserCode" (id, "userId", "code", "updatedBy")
         VALUES (?, ?, ?, ?)`,
        id,
        userId,
        code,
        (token as any).sub || (token as any).id || "unknown"
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[user-code] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
