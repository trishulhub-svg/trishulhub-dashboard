import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";

// GET — List all users with protocol access (SUPER_ADMIN only)
export async function GET(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userAccessList = await db.userProtocolAccess.findMany({
      orderBy: { verifiedAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        protocol: { select: { id: true, version: true, title: true } },
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(userAccessList)));
  } catch (error: any) {
    console.error("[protocol/agent-access] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — Update a user's agent access (SUPER_ADMIN only)
export async function PUT(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, agentAccess } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (!agentAccess || !Array.isArray(agentAccess)) {
      return NextResponse.json({ error: "agentAccess must be an array" }, { status: 400 });
    }

    // Validate agent types
    const validAgents = ["DEV", "CLIENT_HUNTER", "FINANCE", "PROJECT_MANAGER", "HR", "CONTENT", "SUPPORT"];
    const invalidAgents = agentAccess.filter((a: string) => !validAgents.includes(a));
    if (invalidAgents.length > 0) {
      return NextResponse.json({ error: `Invalid agent types: ${invalidAgents.join(", ")}` }, { status: 400 });
    }

    // Find existing record
    const existing = await db.userProtocolAccess.findUnique({ where: { userId } });
    if (!existing) {
      return NextResponse.json({ error: "User has no protocol access record" }, { status: 404 });
    }

    // Update agent access
    const updated = await db.userProtocolAccess.update({
      where: { userId },
      data: {
        agentAccess: JSON.stringify(agentAccess),
        isActive: true, // Reactivate if previously revoked
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error: any) {
    console.error("[protocol/agent-access] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE — Revoke a user's protocol access entirely (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const existing = await db.userProtocolAccess.findUnique({ where: { userId } });
    if (!existing) {
      return NextResponse.json({ error: "User has no protocol access record" }, { status: 404 });
    }

    const updated = await db.userProtocolAccess.update({
      where: { userId },
      data: { isActive: false },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error: any) {
    console.error("[protocol/agent-access] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
