import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureProtocolTables } from "@/lib/ensure-protocol-tables";
import { generateOtp, storeAdminOtp } from "@/lib/protocol-otp-store";
import { sendEmailWithFailover } from "@/lib/email";

// In-memory rate limiting (simple — per access code)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(accessCode: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(accessCode);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(accessCode, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_REQUESTS) return true;
  entry.count++;
  return false;
}

// POST /api/protocol/external/request-otp
// Public endpoint — no auth required. Called by GLM or activation page.
// Sends 6-digit OTP to SUPER_ADMIN's email via TrishulHub SMTP.
export async function POST(request: NextRequest) {
  try {
    await ensureProtocolTables();

    const body = await request.json();
    const { accessCode } = body;

    if (!accessCode || typeof accessCode !== "string") {
      return NextResponse.json({ error: "Access code is required" }, { status: 400 });
    }

    // Rate limit
    if (isRateLimited(accessCode)) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please wait and try again later." },
        { status: 429 }
      );
    }

    // Find the invite by access code
    const invite = await db.protocolInvite.findUnique({
      where: { inviteCode: accessCode.trim().toUpperCase() },
      include: { protocol: { select: { id: true, version: true, title: true } } },
    });

    if (!invite) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 404 });
    }

    // Check status
    if (invite.status === "USED") {
      return NextResponse.json({ error: "This access code has already been used" }, { status: 410 });
    }
    if (invite.status === "REVOKED") {
      return NextResponse.json({ error: "This access code has been revoked" }, { status: 403 });
    }

    // Check expiry
    if (new Date() > invite.expiresAt) {
      // Auto-expire
      await db.protocolInvite.update({
        where: { id: invite.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "This access code has expired" }, { status: 410 });
    }

    // Get SUPER_ADMIN email for OTP delivery
    const admin = await db.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { email: true, name: true },
    });

    if (!admin) {
      return NextResponse.json(
        { error: "System error: no administrator configured" },
        { status: 500 }
      );
    }

    // Generate OTP
    const otp = generateOtp();
    const otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    storeAdminOtp(accessCode.trim().toUpperCase(), otp, otpExpiresAt);

    // Send OTP to SUPER_ADMIN via existing SMTP
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1f2937; font-size: 24px; margin: 0;">TrishulHub</h1>
          <p style="color: #6b7280; margin: 4px 0 0;">Protocol Access OTP</p>
        </div>
        <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <p style="color: #374151; font-size: 16px; margin: 0 0 16px;">A team member is requesting protocol access using code <strong>${accessCode}</strong>.</p>
          <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">Issued for: <strong>${invite.targetEmail}</strong></p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px;">OTP:</p>
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1f2937;">${otp}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px; margin: 12px 0 0;">Share this OTP with the team member. It expires in <strong>5 minutes</strong>.</p>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">TrishulHub Protocol System. Do not reply.</p>
      </div>
    `;

    const emailResult = await sendEmailWithFailover({
      to: admin.email,
      subject: `Protocol OTP — ${accessCode}`,
      html,
      text: `TrishulHub Protocol Access OTP\n\nAccess Code: ${accessCode}\nIssued For: ${invite.targetEmail}\nOTP: ${otp}\n\nShare this OTP with the team member. Expires in 5 minutes.`,
      type: "PROTOCOL_OTP",
    });

    if (!emailResult.success) {
      console.error("[external/request-otp] SMTP failed:", emailResult.error);
      // Still proceed — OTP is in memory
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent to administrator",
      targetEmail: invite.targetEmail,
    });
  } catch (error: any) {
    console.error("[external/request-otp] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
