import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { generateInviteCode } from "@/lib/protocol-otp-store";

// GET — list all invites (SUPER_ADMIN only)
export async function GET(request: NextRequest) {
  try {
    await ensureProtocolTables();
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

// POST — create new access token (SUPER_ADMIN only)
// Note: OTP is NOT generated here. It's generated when the user submits the token,
// and sent to the SUPER_ADMIN's email at that time.
export async function POST(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetEmail, targetName, agentAccess, protocolId, expiresInHours, mode } = body;

    // mode: "link" (share link, no email needed) or "document" (tracked, email required)
    const isShareLink = mode === "link";

    if (!isShareLink && (!targetEmail || typeof targetEmail !== "string")) {
      return NextResponse.json({ error: "Team member email is required" }, { status: 400 });
    }

    if (!agentAccess || !Array.isArray(agentAccess) || agentAccess.length === 0) {
      return NextResponse.json({ error: "Agent access is required" }, { status: 400 });
    }

    // Accept "ALL" as a shorthand for all agent types
    const validAgents = ["DEV", "CLIENT_HUNTER", "FINANCE", "PROJECT_MANAGER", "HR", "CONTENT", "SUPPORT", "ALL"];
    const resolvedAccess = agentAccess.includes("ALL") ? validAgents.filter(a => a !== "ALL") : agentAccess;
    const invalidAgents = resolvedAccess.filter((a: string) => !validAgents.includes(a));
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

    const hours = expiresInHours || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Generate invite code
    let inviteCode = generateInviteCode();
    while (await db.protocolInvite.findUnique({ where: { inviteCode } })) {
      inviteCode = generateInviteCode();
    }

    // Create invite in DB
    const invite = await db.protocolInvite.create({
      data: {
        protocolId: targetProtocolId,
        inviteCode,
        targetEmail: isShareLink ? "share-link" : (targetEmail as string).toLowerCase(),
        targetName: isShareLink ? "Share Link" : (targetName || null),
        agentAccess: JSON.stringify(resolvedAccess),
        expiresAt,
        createdBy: token.id as string,
        status: "PENDING",
      },
    });

    const shareUrl = isShareLink
      ? `https://trishulhub.com/protocol/view/${inviteCode}`
      : null;

    return NextResponse.json({
      inviteCode,
      expiresAt: expiresAt.toISOString(),
      inviteId: invite.id,
      shareUrl,
      mode: isShareLink ? "link" : "document",
    }, { status: 201 });
  } catch (error: any) {
    console.error("[protocol/invites] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH — update invite status / revoke (SUPER_ADMIN only)
export async function PATCH(request: NextRequest) {
  try {
    await ensureProtocolTables();
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
