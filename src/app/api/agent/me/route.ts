import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractAgentToken, isAgentAdmin, isAgentSuperAdmin } from "@/lib/agent-auth";

// ── GET /api/agent/me ──
// Returns the authenticated user's identity, role, tier.
// This is the "who am I" endpoint — called right after OTP verification.
export async function GET(request: NextRequest) {
  try {
    const payload = extractAgentToken(request.headers.get("authorization"));

    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user still exists and is active
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        department: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Account no longer active" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tier: payload.tier,
        department: user.department || null,
        isAdmin: isAgentAdmin(payload),
        isSuperAdmin: isAgentSuperAdmin(payload),
      },
      tokenExpiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    console.error("[agent/me] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
