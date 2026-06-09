import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { rateLimit } from "@/lib/rate-limit";
import { JwtToken, getTokenUserId } from "@/types/jwt";

// TODO (I25): This route uses getToken() instead of getServerSession().
// Consider standardizing auth pattern across all utility routes.

/**
 * GET /api/user-code/all
 * SUPER_ADMIN only — returns all user codes with user info.
 * Each code is masked (never send raw codes).
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }) as unknown as JwtToken;
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // W58: Rate limit GET (30 per minute)
    const rlResult = rateLimit(`user-code-all:${getTokenUserId(token)}`, 30, 60_000);
    if (!rlResult.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await ensureProtocolTables();

    // W63: Limit results to prevent unbounded queries
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT
        uc.id, uc."userId", uc.code, uc."updatedBy" as "codeUpdatedBy",
        uc."createdAt", uc."updatedAt",
        u.name, u.email, u.role
      FROM "UserCode" uc
      LEFT JOIN "User" u ON uc."userId" = u.id
      ORDER BY u.name ASC
      LIMIT 100
    `);

    // Also fetch all users who don't have a code yet
    const allUsers: any[] = await db.$queryRawUnsafe(
      `SELECT id, name, email, role FROM "User" ORDER BY name ASC LIMIT 100`
    );

    const codedUserIds = new Set(rows.map((r: any) => r.userId));

    const userCodes = rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      userName: r.name || "Unknown",
      userEmail: r.email || "",
      userRole: r.role || "",
      codeMasked: r.code ? "••••••••" : "",
      hasCode: r.code ? true : false,
      updatedAt: r.updatedAt || null,
    }));

    const usersWithoutCode = allUsers
      .filter((u: any) => !codedUserIds.has(u.id))
      .map((u: any) => ({
        id: null,
        userId: u.id,
        userName: u.name || "Unknown",
        userEmail: u.email || "",
        userRole: u.role || "",
        codeMasked: "",
        hasCode: false,
        updatedAt: null,
      }));

    return NextResponse.json({
      userCodes: [...userCodes, ...usersWithoutCode],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[user-code/all] GET error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
