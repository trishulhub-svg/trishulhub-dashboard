import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { sendEmailWithFailover, isValidEmail, logEmailEvent } from "@/lib/email";

// ── Server-side OTP storage ──
interface OtpEntry {
  otp: string;
  expiresAt: number;
  name: string;
  role: string;
  userId: string;
}

const otpStore = new Map<string, OtpEntry>();

// ── Rate limiters ──
interface RateEntry {
  count: number;
  windowStart: number;
}

const otpRateLimiter = new Map<string, RateEntry>(); // email -> { count, windowStart }
const verifyRateLimiter = new Map<string, RateEntry>(); // email -> { count, windowStart }

const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_REQUESTS = 5;
const MAX_VERIFY_ATTEMPTS = 10;

function checkRateLimit(
  limiter: Map<string, RateEntry>,
  key: string,
  max: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = limiter.get(key);

  if (!entry || now - entry.windowStart > OTP_WINDOW_MS) {
    // New window
    limiter.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

function cleanExpiredOtps() {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(key);
    }
  }
}

// ── POST: Generate and send OTP ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Rate limit check
    const rateCheck = checkRateLimit(otpRateLimiter, email, MAX_OTP_REQUESTS);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many OTP requests. Please try again later." },
        { status: 429 }
      );
    }

    // Look up user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      // Log the failed attempt
      await logEmailEvent({
        to: email,
        subject: "TRISHUL PROTOCOL - Login OTP",
        type: "PROTOCOL_AUTH",
        status: "REJECTED",
        error: "User not found or inactive",
        metadata: JSON.stringify({ reason: "user_not_found_or_inactive" }),
      });
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // Generate 6-digit OTP
    const otpNumber = randomBytes(3).readUIntBE(0, 3) % 1000000;
    const otp = String(otpNumber).padStart(6, "0");

    // Store OTP
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      name: user.name,
      role: user.role,
      userId: user.id,
    });

    // Clean expired OTPs periodically
    cleanExpiredOtps();

    // Build professional Trishul-branded email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trishul Protocol - Login OTP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0ea5e9, #8b5cf6); padding: 32px 32px 24px;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">TRISHUL PROTOCOL</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500;">Authentication Request</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 8px; font-size: 16px; color: #e2e8f0; font-weight: 600;">Hello, ${user.name}</p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">Your one-time verification code for Trishul Protocol authentication is:</p>
              <!-- OTP Code -->
              <div style="background-color: #0f172a; border: 2px dashed #334155; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 36px; font-weight: 900; color: #38bdf8; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
              <p style="margin: 0 0 16px; font-size: 13px; color: #64748b; line-height: 1.5;">This code expires in <strong style="color: #f59e0b;">5 minutes</strong>. Do not share this code with anyone.</p>
              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px; border-top: 1px solid #334155;">
                <tr>
                  <td style="padding-top: 16px;">
                    <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">If you did not request this code, please ignore this email. Your account remains secure.</p>
                    <p style="margin: 12px 0 0; font-size: 11px; color: #334155;">&copy; ${new Date().getFullYear()} TrishulHub &mdash; AI Workspace Dashboard</p>
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
      to: email.toLowerCase(),
      subject: "TRISHUL PROTOCOL - Login OTP",
      html: emailHtml,
      type: "PROTOCOL_AUTH",
      triggeredBy: user.id,
    });

    if (!emailResult.success) {
      await logEmailEvent({
        to: email.toLowerCase(),
        subject: "TRISHUL PROTOCOL - Login OTP",
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
      message: "OTP sent to your email",
    });
  } catch (error) {
    console.error("[protocol-auth] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── PUT: Verify OTP ──
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== "string") {
      return NextResponse.json(
        { error: "OTP is required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Rate limit check
    const rateCheck = checkRateLimit(verifyRateLimiter, email, MAX_VERIFY_ATTEMPTS);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    const normalizedEmail = email.toLowerCase();
    const entry = otpStore.get(normalizedEmail);

    if (!entry) {
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TRISHUL PROTOCOL - OTP Verify",
        type: "PROTOCOL_AUTH",
        status: "FAILED",
        error: "No OTP found for email",
        metadata: JSON.stringify({ reason: "no_otp_found" }),
      });
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalizedEmail);
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TRISHUL PROTOCOL - OTP Verify",
        type: "PROTOCOL_AUTH",
        status: "FAILED",
        error: "OTP expired",
        triggeredBy: entry.userId,
        metadata: JSON.stringify({ reason: "otp_expired" }),
      });
      return NextResponse.json(
        { error: "OTP has expired. Please request a new one." },
        { status: 401 }
      );
    }

    // Verify OTP
    if (entry.otp !== otp.trim()) {
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TRISHUL PROTOCOL - OTP Verify",
        type: "PROTOCOL_AUTH",
        status: "FAILED",
        error: "Incorrect OTP",
        triggeredBy: entry.userId,
        metadata: JSON.stringify({ reason: "wrong_otp" }),
      });
      return NextResponse.json(
        { error: "Invalid OTP. Please try again." },
        { status: 401 }
      );
    }

    // Valid OTP - delete after use (one-time)
    otpStore.delete(normalizedEmail);

    await logEmailEvent({
      to: normalizedEmail,
      subject: "TRISHUL PROTOCOL - OTP Verify",
      type: "PROTOCOL_AUTH",
      status: "SENT",
      triggeredBy: entry.userId,
      metadata: JSON.stringify({ reason: "verified_successfully" }),
    });

    return NextResponse.json({
      success: true,
      user: {
        id: entry.userId,
        name: entry.name,
        email: normalizedEmail,
        role: entry.role,
      },
    });
  } catch (error) {
    console.error("[protocol-auth] PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
