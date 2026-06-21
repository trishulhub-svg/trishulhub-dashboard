import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAgentToken, generateAgentToken, extractAgentToken, shouldRefresh } from "@/lib/agent-auth";

// ── POST: Refresh agent JWT ──
// Requires a valid (non-expired) agent JWT in Authorization header.
// Returns a new JWT with fresh 1-hour expiry.
//
// Use this when the GLM session detects the token is close to expiry
// (less than 10 min remaining) to maintain session continuity.
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const payload = extractAgentToken(authHeader);

    if (!payload) {
      return NextResponse.json({ error: "Invalid or missing token" }, { status: 401 });
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    // Issue a fresh token
    const { token, expiresAt } = generateAgentToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return NextResponse.json({
      success: true,
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // PROJECT_MANAGER is treated as tier 1 (admin-like) for agent API access
        tier: user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "PROJECT_MANAGER" ? 1 : 2,
      },
      refreshed: !shouldRefresh(payload) ? false : true,
    });
  } catch (error) {
    console.error("[agent-auth/refresh] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
