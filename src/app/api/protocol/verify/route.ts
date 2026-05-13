import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { storeAdminOtp, getAdminOtp, consumeAdminOtp, generateOtp } from "@/lib/protocol-otp-store";
import { sendEmailWithFailover } from "@/lib/email";

// GET — Check if logged-in user has active protocol access
export async function GET(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.sub) {
      return NextResponse.json({ hasAccess: false }, { status: 401 });
    }

    const userId = token.sub as string;

    // Check for active UserProtocolAccess
    const userAccess = await db.userProtocolAccess.findUnique({
      where: { userId },
      include: {
        protocol: true,
      },
    });

    if (!userAccess || !userAccess.isActive) {
      return NextResponse.json({ hasAccess: false });
    }

    // Parse agent access
    let userAgentAccess: string[] = [];
    try {
      userAgentAccess = JSON.parse(userAccess.agentAccess);
    } catch {
      userAgentAccess = [];
    }

    // Update lastAccessAt
    await db.userProtocolAccess.update({
      where: { userId },
      data: { lastAccessAt: new Date() },
    });

    // SECURITY: Never send protocol content to non-SUPER_ADMIN users
    // They only need to know their agent access list
    return NextResponse.json({
      hasAccess: true,
      protocolVersion: userAccess.protocol.version,
      agentAccess: userAgentAccess,
    });
  } catch (error: any) {
    console.error("[protocol/verify] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — Step 1: User submits access token, OTP generated and sent to SUPER_ADMIN email
export async function POST(request: NextRequest) {
  try {
    await ensureProtocolTables();
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
      return NextResponse.json({ error: "Invalid access token" }, { status: 404 });
    }

    // Check status
    if (invite.status === "USED") {
      return NextResponse.json({ error: "This token has already been used" }, { status: 410 });
    }

    if (invite.status === "REVOKED") {
      return NextResponse.json({ error: "This token has been revoked" }, { status: 403 });
    }

    if (invite.status === "EXPIRED") {
      return NextResponse.json({ error: "This token has expired" }, { status: 410 });
    }

    // Check expiry
    if (new Date() > invite.expiresAt) {
      await db.protocolInvite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "This token has expired" }, { status: 410 });
    }

    // Get SUPER_ADMIN email
    const admin = await db.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { email: true, name: true },
    });

    if (!admin) {
      return NextResponse.json({ error: "No administrator found. Please contact support." }, { status: 500 });
    }

    // Generate a new 6-digit OTP
    const otp = generateOtp();
    const otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store OTP in adminOtpStore keyed by inviteCode
    storeAdminOtp(inviteCode, otp, otpExpiresAt);

    // Send OTP to SUPER_ADMIN's email
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
          <p style="color: #6b7280; margin: 4px 0 0;">Protocol Access OTP</p>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">A user is requesting protocol access using token <strong>${inviteCode}</strong>.</p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">Their OTP is:</p>
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1f2937;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">Share this OTP with the user verbally. This OTP expires in <strong>5 minutes</strong>.</p>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">This is an automated message from TrishulHub Dashboard. Do not reply.</p>
      </div>
    `;

    const emailResult = await sendEmailWithFailover({
      to: admin.email,
      subject: `Protocol Access OTP — ${inviteCode}`,
      html,
      text: `A user is requesting protocol access using token ${inviteCode}. Their OTP is: ${otp}. Share this OTP with the user verbally. This OTP expires in 5 minutes.`,
      type: "PROTOCOL_OTP",
    });

    if (!emailResult.success) {
      console.error("[protocol/verify] Failed to send OTP email to admin:", emailResult.error);
      // Still proceed — OTP is in memory, admin might check server logs
    }

    return NextResponse.json({
      step: "otp_sent",
      inviteCode: invite.inviteCode,
      message: "OTP sent to administrator. Please contact your admin for the OTP.",
    });
  } catch (error: any) {
    console.error("[protocol/verify] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — Step 2: User submits OTP, on success links protocol to user account
export async function PUT(request: NextRequest) {
  try {
    await ensureProtocolTables();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.sub) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const { inviteCode, otp } = body;

    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    if (!otp || typeof otp !== "string") {
      return NextResponse.json({ error: "OTP is required" }, { status: 400 });
    }

    // Get OTP from adminOtpStore
    const otpEntry = getAdminOtp(inviteCode);

    if (!otpEntry) {
      return NextResponse.json({ error: "No OTP found. The token may have expired. Please submit your token again." }, { status: 404 });
    }

    // Check OTP expiry
    if (Date.now() > otpEntry.expiresAt) {
      consumeAdminOtp(inviteCode);
      return NextResponse.json({ error: "OTP has expired. Please submit your token again to generate a new OTP." }, { status: 410 });
    }

    // Verify OTP
    if (otpEntry.otp !== otp.trim()) {
      return NextResponse.json({ error: "Invalid OTP. Please check with your administrator and try again." }, { status: 401 });
    }

    // OTP is valid — consume it (one-time use)
    consumeAdminOtp(inviteCode);

    // Look up invite in DB
    const invite = await db.protocolInvite.findUnique({
      where: { inviteCode },
      include: {
        protocol: true,
      },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found in database" }, { status: 404 });
    }

    // Re-check invite status (could have changed)
    if (invite.status !== "PENDING") {
      return NextResponse.json({ error: "This token is no longer valid" }, { status: 410 });
    }

    // Get the current user from token
    const userId = token.sub as string;
    const userEmail = token.email as string;
    const userName = token.name as string;

    // Get client IP for logging
    const forwarded = request.headers.get("x-forwarded-for");
    const ipAddress = forwarded ? forwarded.split(",")[0]?.trim() : request.headers.get("x-real-ip") || null;

    // Parse agent access from invite
    let userAgentAccess: string[] = [];
    try {
      userAgentAccess = JSON.parse(invite.agentAccess);
    } catch {
      userAgentAccess = [];
    }

    // Mark invite as used and link to user
    await db.protocolInvite.update({
      where: { id: invite.id },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedBy: userId,
      },
    });

    // Create access log
    await db.protocolAccessLog.create({
      data: {
        inviteId: invite.id,
        protocolId: invite.protocolId,
        userEmail: userEmail || invite.targetEmail,
        agentAccess: invite.agentAccess,
        ipAddress,
      },
    });

    // Create or update UserProtocolAccess (persistent)
    await db.userProtocolAccess.upsert({
      where: { userId },
      create: {
        userId,
        userEmail: userEmail || invite.targetEmail,
        userName: userName || invite.targetName || null,
        protocolId: invite.protocolId,
        agentAccess: invite.agentAccess,
        isActive: true,
        verifiedVia: inviteCode,
      },
      update: {
        protocolId: invite.protocolId,
        agentAccess: invite.agentAccess,
        isActive: true,
        verifiedVia: inviteCode,
        lastAccessAt: new Date(),
      },
    });

    // SECURITY: Never send protocol content to non-SUPER_ADMIN users
    return NextResponse.json({
      success: true,
      protocolVersion: invite.protocol.version,
      agentAccess: userAgentAccess,
    });
  } catch (error: any) {
    console.error("[protocol/verify] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
