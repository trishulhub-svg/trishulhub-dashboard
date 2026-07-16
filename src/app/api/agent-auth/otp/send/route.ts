import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID, createHmac } from "crypto";
import { db } from "@/lib/db";
import { sendEmailWithFailover, isValidEmail, logEmailEvent } from "@/lib/email";

// ── OTP security constants ──
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_REQUESTS = 5;

function getOtpHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET
  if (!secret || secret.length < 16) {
    throw new Error("OTP_HMAC_SECRET environment variable is not set or too short.")
  }
  return secret
}

// ── DB-based rate limiter (fail-closed) ──
async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString()
  const now = new Date().toISOString()

  try {
    return await db.$transaction(async (tx) => {
      const record = await tx.protocolRateLimit.findUnique({ where: { key } })

      if (!record || record.windowStart < windowStart) {
        await tx.protocolRateLimit.upsert({
          where: { key },
          update: { count: 1, windowStart: now },
          create: { id: randomUUID(), key, count: 1, windowStart: now },
        })
        return true
      }

      if (record.count >= maxAttempts) {
        return false
      }

      await tx.protocolRateLimit.update({
        where: { key },
        data: { count: { increment: 1 }, updatedAt: now },
      })
      return true
    })
  } catch (e) {
    console.error("[agent-auth/otp/send] Rate limit DB error (fail-closed):", e)
    return false
  }
}

// ── POST: Send OTP to user's email ──
// Public endpoint — no auth required.
// Body: { email: string }
// Returns: { success: true, message: "..." } regardless of whether user exists (anti-enumeration)
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email } = body as { email: unknown };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    // Clean up expired OTPs
    try {
      await db.protocolOtp.deleteMany({
        where: { expiresAt: { lt: new Date().toISOString() } },
      });
    } catch {
      // Non-fatal cleanup
    }

    // Rate limit check — 5 OTP requests per email per 15 min
    const rateAllowed = await checkRateLimit(`agent-otp:${normalizedEmail}`, MAX_OTP_REQUESTS, OTP_WINDOW_MS);
    if (!rateAllowed) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    // Look up user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    // Anti-enumeration: return same success-like message whether user exists or not
    if (!user || !user.isActive) {
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TrishulHub Technology — Agent Login OTP",
        type: "PROTOCOL_AUTH",
        status: "REJECTED",
        error: "User not found or inactive",
        metadata: JSON.stringify({ reason: "agent_otp_user_not_found_or_inactive" }),
      });
      console.log("[agent-auth/otp/send] User not found or inactive:", normalizedEmail);

      return NextResponse.json({
        success: true,
        message: "If this email is registered, you will receive a code",
      });
    }

    // Generate 6-digit OTP
    const otpNumber = randomBytes(3).readUIntBE(0, 3) % 1000000;
    const otp = String(otpNumber).padStart(6, "0");

    // Hash OTP with bcrypt + HMAC for dual-layer secure storage
    const bcrypt = await import("bcryptjs");
    const hashedOtp = await bcrypt.default.hash(otp, 10);
    const otpHmac = createHmac("sha256", getOtpHmacSecret()).update(otp).digest("hex");

    // Store OTP — overwrite any existing for this email
    await db.protocolOtp.deleteMany({ where: { email: normalizedEmail } }).catch(() => {});
    await db.protocolOtp.create({
      data: {
        id: randomUUID(),
        email: normalizedEmail,
        otp: JSON.stringify({ b: hashedOtp, h: otpHmac }),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
      },
    });

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrishulHub Technology — Agent Login OTP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          <tr>
            <td style="background: linear-gradient(135deg, #0ea5e9, #8b5cf6); padding: 32px 32px 24px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">TRISHULHUB DASHBOARD</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500;">Agent Session Authentication</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 8px; font-size: 16px; color: #e2e8f0; font-weight: 600;">Hello, ${user.name}</p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">Your one-time verification code for AI agent session login is:</p>
              <div style="background-color: #0f172a; border: 2px dashed #334155; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 36px; font-weight: 900; color: #38bdf8; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
              <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">This code expires in <strong style="color: #f59e0b;">5 minutes</strong>. Do not share this code with anyone.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; border-top: 1px solid #334155;">
                <tr>
                  <td style="padding-top: 16px;">
                    <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">If you did not request this code, please ignore this email. Your account remains secure.</p>
                    <p style="margin: 12px 0 0; font-size: 11px; color: #334155;">&copy; ${new Date().getFullYear()} TrishulHub Technology</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send OTP email
    const emailResult = await sendEmailWithFailover({
      to: normalizedEmail,
      subject: "TrishulHub Technology — Agent Login OTP",
      html: emailHtml,
      type: "PROTOCOL_AUTH",
      triggeredBy: user.id,
    });

    if (!emailResult.success) {
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TrishulHub Technology — Agent Login OTP",
        type: "PROTOCOL_AUTH",
        status: "FAILED",
        error: emailResult.error,
        triggeredBy: user.id,
      });
      return NextResponse.json(
        { error: "Failed to send OTP email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "If this email is registered, you will receive a code",
    });
  } catch (error) {
    console.error("[agent-auth/otp/send] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
