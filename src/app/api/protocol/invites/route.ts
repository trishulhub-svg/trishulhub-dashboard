import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { storeProtocolOtp, generateInviteCode, generateOtp } from "@/lib/protocol-otp-store";

// GET — list all invites (SUPER_ADMIN only)
export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (statusFilter) where.status = statusFilter;

    const invites = await db.protocolInvite.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        protocol: { select: { id: true, version: true, title: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(invites)));
  } catch (error: any) {
    console.error("[protocol/invites] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — create new OTP invite (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetEmail, targetName, agentAccess, protocolId, expiresInHours } = body;

    if (!targetEmail || typeof targetEmail !== "string") {
      return NextResponse.json({ error: "Target email is required" }, { status: 400 });
    }

    if (!agentAccess || !Array.isArray(agentAccess) || agentAccess.length === 0) {
      return NextResponse.json({ error: "At least one agent access must be selected" }, { status: 400 });
    }

    const validAgents = ["DEV", "CLIENT_HUNTER", "FINANCE", "PROJECT_MANAGER", "HR", "CONTENT", "SUPPORT"];
    const invalidAgents = agentAccess.filter((a: string) => !validAgents.includes(a));
    if (invalidAgents.length > 0) {
      return NextResponse.json({ error: `Invalid agent types: ${invalidAgents.join(", ")}` }, { status: 400 });
    }

    // Determine which protocol version to use
    let targetProtocolId = protocolId;
    if (!targetProtocolId) {
      const activeProtocol = await db.protocolVersion.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (!activeProtocol) {
        return NextResponse.json({ error: "No active protocol version found. Create one first." }, { status: 400 });
      }
      targetProtocolId = activeProtocol.id;
    } else {
      const protocol = await db.protocolVersion.findUnique({ where: { id: targetProtocolId } });
      if (!protocol) {
        return NextResponse.json({ error: "Protocol version not found" }, { status: 404 });
      }
    }

    // Get protocol version string for the OTP store
    const protocol = await db.protocolVersion.findUnique({
      where: { id: targetProtocolId },
      select: { version: true },
    });

    const hours = expiresInHours || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Generate invite code and OTP
    let inviteCode = generateInviteCode();
    // Ensure uniqueness (very unlikely collision but just in case)
    while (await db.protocolInvite.findUnique({ where: { inviteCode } })) {
      inviteCode = generateInviteCode();
    }

    const otp = generateOtp();

    // Create invite in DB
    const invite = await db.protocolInvite.create({
      data: {
        protocolId: targetProtocolId,
        inviteCode,
        targetEmail: targetEmail.toLowerCase(),
        targetName: targetName || null,
        agentAccess: JSON.stringify(agentAccess),
        expiresAt,
        createdBy: token.id as string,
        status: "PENDING",
      },
    });

    // Store OTP in memory
    storeProtocolOtp(inviteCode, {
      otp,
      expiresAt: Date.now() + hours * 60 * 60 * 1000,
      inviteId: invite.id,
      inviteCode,
      targetEmail: targetEmail.toLowerCase(),
      targetName: targetName || null,
      agentAccess,
      protocolVersion: protocol?.version || "unknown",
    });

    return NextResponse.json({
      inviteCode,
      otp,
      expiresAt: expiresAt.toISOString(),
      inviteId: invite.id,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[protocol/invites] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — update invite status / revoke (SUPER_ADMIN only)
export async function PATCH(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Invite ID is required" }, { status: 400 });
    }

    if (status !== "REVOKED" && status !== "EXPIRED") {
      return NextResponse.json({ error: "Only REVOKED or EXPIRED status changes are allowed" }, { status: 400 });
    }

    const existing = await db.protocolInvite.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (existing.status === "USED") {
      return NextResponse.json({ error: "Cannot modify a used invite" }, { status: 400 });
    }

    const updated = await db.protocolInvite.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error: any) {
    console.error("[protocol/invites] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
