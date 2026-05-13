import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProtocolOtp, consumeProtocolOtp } from "@/lib/protocol-otp-store";

// POST — Step 1: User submits invite code
// Returns step info so user knows to enter OTP
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    // Look up invite in DB
    const invite = await db.protocolInvite.findUnique({
      where: { inviteCode },
      include: {
        protocol: { select: { id: true, version: true, title: true } },
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
    }

    // Check status
    if (invite.status === "USED") {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
    }

    if (invite.status === "REVOKED") {
      return NextResponse.json({ error: "This invite has been revoked" }, { status: 403 });
    }

    if (invite.status === "EXPIRED") {
      return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
    }

    // Check expiry
    if (new Date() > invite.expiresAt) {
      await db.protocolInvite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "This invite has expired" }, { status: 410 });
    }

    return NextResponse.json({
      step: "otp_required",
      inviteCode: invite.inviteCode,
      targetName: invite.targetName,
      protocolVersion: invite.protocol.version,
    });
  } catch (error: any) {
    console.error("[protocol/verify] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — Step 2: User submits OTP for verification
// On success, returns the protocol content filtered by agent access
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { inviteCode, otp } = body;

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    if (!otp || typeof otp !== "string") {
      return NextResponse.json({ error: "OTP is required" }, { status: 400 });
    }

    // Get OTP from in-memory store
    const otpEntry = getProtocolOtp(inviteCode);

    if (!otpEntry) {
      return NextResponse.json({ error: "No OTP found. The invite may have expired. Request a new OTP from your admin." }, { status: 404 });
    }

    // Check OTP expiry
    if (Date.now() > otpEntry.expiresAt) {
      consumeProtocolOtp(inviteCode);
      return NextResponse.json({ error: "OTP has expired. Request a new OTP from your admin." }, { status: 410 });
    }

    // Verify OTP
    if (otpEntry.otp !== otp.trim()) {
      return NextResponse.json({ error: "Invalid OTP. Please check and try again." }, { status: 401 });
    }

    // OTP is valid — consume it (one-time use)
    consumeProtocolOtp(inviteCode);

    // Look up invite in DB and mark as USED
    const invite = await db.protocolInvite.findUnique({
      where: { inviteCode },
      include: {
        protocol: true,
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found in database" }, { status: 404 });
    }

    // Get client IP for logging
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0]?.trim() : request.headers.get("x-real-ip") || null;

    // Parse agent access
    let userAgentAccess: string[] = [];
    try {
      userAgentAccess = JSON.parse(invite.agentAccess);
    } catch {
      userAgentAccess = [];
    }

    // Mark invite as used
    await db.protocolInvite.update({
      where: { id: invite.id },
      data: {
        status: "USED",
        usedAt: new Date(),
      },
    });

    // Create access log
    await db.protocolAccessLog.create({
      data: {
        inviteId: invite.id,
        protocolId: invite.protocolId,
        userEmail: invite.targetEmail,
        agentAccess: invite.agentAccess,
        ipAddress,
      },
    });

    // Parse protocol data
    let stageDescriptions: unknown[] = [];
    let agentSkills: unknown[] = [];
    try {
      stageDescriptions = JSON.parse(invite.protocol.stageDescriptions);
    } catch {
      stageDescriptions = [];
    }
    try {
      agentSkills = JSON.parse(invite.protocol.agentSkills);
    } catch {
      agentSkills = [];
    }

    // Filter agent skills to only include agents the user has access to
    const filteredAgentSkills = agentSkills.filter((agent: any) =>
      userAgentAccess.includes(agent.agentType)
    );

    return NextResponse.json({
      success: true,
      protocol: {
        version: invite.protocol.version,
        title: invite.protocol.title,
        content: invite.protocol.content,
        stageDescriptions,
        agentSkills: filteredAgentSkills,
      },
    });
  } catch (error: any) {
    console.error("[protocol/verify] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
