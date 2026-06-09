import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";

// NOTE [I19]: This route uses getToken() instead of getServerSession() like other routes.
// This is intentional to avoid potential session deserialization issues with raw JWT tokens.
// Changing to getServerSession could break existing clients depending on this pattern.
// TODO (I25): Consider standardizing auth pattern across all utility routes.

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

    // W58: Rate limit GET (30 per minute)
    const rlResult = rateLimit(`user-code:${getTokenUserId(token)}`, 30, 60_000);
    if (!rlResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    const userId = getTokenUserId(token);

    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT "code", "updatedAt" FROM "UserCode" WHERE "userId" = ?`,
      userId
    );

    if (!rows.length) {
      return NextResponse.json({ hasCode: false, code: "", codeMasked: "" });
    }

    const row = rows[0];
    const code = row.code || "";

    // Return the full code to the owning user so they can copy & use it
    return NextResponse.json({
      hasCode: !!code,
      code: code,
      codeMasked: code ? (code.length <= 8 ? "••••••••" : code.slice(0, 3) + "••••" + code.slice(-3)) : "",
      updatedAt: row.updatedAt || null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[user-code] GET error:", msg);
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

    // W58: Rate limit PATCH (10 per minute)
    const rlWrite = rateLimit(`user-code-write:${getTokenUserId(token)}`, 10, 60_000);
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
        getTokenUserId(token),
        existing[0].id
      );
    } else {
      // W65: Use crypto.randomUUID() instead of weak ID generation
      const id = "uc_" + crypto.randomUUID();
      await db.$executeRawUnsafe(
        `INSERT INTO "UserCode" (id, "userId", "code", "updatedBy")
         VALUES (?, ?, ?, ?)`,
        id,
        userId,
        code,
        getTokenUserId(token)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[user-code] PATCH error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
