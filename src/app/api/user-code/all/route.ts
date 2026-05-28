import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

/**
 * GET /api/user-code/all
 * SUPER_ADMIN only — returns all user codes with user info.
 * Each code is masked (never send raw codes).
 */
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureProtocolTables();

    // Join UserCode with User to get user info
    const rows: any[] = await db.$queryRawUnsafe(`
      SELECT
        uc.id, uc."userId", uc.code, uc."updatedBy" as "codeUpdatedBy",
        uc."createdAt", uc."updatedAt",
        u.name, u.email, u.role
      FROM "UserCode" uc
      LEFT JOIN "User" u ON uc."userId" = u.id
      ORDER BY u.name ASC
    `);

    // Also fetch all users who don't have a code yet
    const allUsers: any[] = await db.$queryRawUnsafe(
      `SELECT id, name, email, role FROM "User" ORDER BY name ASC`
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
  } catch (error: any) {
    console.error("[user-code/all] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
