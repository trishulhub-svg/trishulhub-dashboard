import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { getAdminOtp, consumeAdminOtp } from "@/lib/protocol-otp-store";
import { wrapProtocolWithSecurity } from "@/lib/protocol-security";

// POST /api/protocol/external/verify-otp
// Public endpoint — no auth required. Called by activation page.
// Verifies OTP, marks invite as USED, returns the full protocol with security rules.
export async function POST(request: NextRequest) {
  try {
    await ensureProtocolTables();

    const body = await request.json();
    const { accessCode, otp } = body;

    if (!accessCode || typeof accessCode !== "string") {
      return NextResponse.json({ error: "Access code is required" }, { status: 400 });
    }
    if (!otp || typeof otp !== "string") {
      return NextResponse.json({ error: "OTP is required" }, { status: 400 });
    }

    const code = accessCode.trim().toUpperCase();

    // Check OTP
    const otpEntry = getAdminOtp(code);
    if (!otpEntry) {
      return NextResponse.json(
        { error: "No OTP found. Request a new OTP first." },
        { status: 404 }
      );
    }
    if (Date.now() > otpEntry.expiresAt) {
      consumeAdminOtp(code);
      return NextResponse.json(
        { error: "OTP has expired. Request a new OTP." },
        { status: 410 }
      );
    }
    if (otpEntry.otp !== otp.trim()) {
      return NextResponse.json(
        { error: "Invalid OTP. Check with your administrator." },
        { status: 401 }
      );
    }

    // OTP valid — consume it
    consumeAdminOtp(code);

    // Find invite
    const invite = await db.protocolInvite.findUnique({
      where: { inviteCode: code },
      include: { protocol: true },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (invite.status !== "PENDING") {
      return NextResponse.json({ error: "This code is no longer valid" }, { status: 410 });
    }

    // Mark invite as USED
    await db.protocolInvite.update({
      where: { id: invite.id },
      data: { status: "USED", usedAt: new Date() },
    });

    // Get the master protocol content
    const protocol = invite.protocol;
    if (!protocol || !protocol.content) {
      return NextResponse.json(
        { error: "Protocol not found. Contact administrator." },
        { status: 404 }
      );
    }

    // Wrap with security rules and return
    const securedProtocol = wrapProtocolWithSecurity(protocol.content);

    return NextResponse.json({
      success: true,
      protocol: securedProtocol,
      protocolVersion: protocol.version,
      protocolTitle: protocol.title,
    });
  } catch (error: any) {
    console.error("[external/verify-otp] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
