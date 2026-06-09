import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID, timingSafeEqual, createHmac } from "crypto";
import { db } from "@/lib/db";
import { sendEmailWithFailover, isValidEmail, logEmailEvent } from "@/lib/email";

// ── OTP security constants ──
// Secret key for HMAC-SHA256 computation used in timing-safe OTP comparison.
// In production, override via OTP_HMAC_SECRET env var.
function getOtpHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET
  if (!secret || secret.length < 16) {
    throw new Error("OTP_HMAC_SECRET environment variable is not set or too short (min 16 chars). OTP operations are disabled.")
  }
  return secret
}
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Pre-computed dummy bcrypt hash for constant-time operations.
// Used when no OTP record exists so bcrypt.compare always runs (prevents timing-based email enumeration).
let _dummyBcryptHash: string | undefined;
function getDummyBcryptHash(): string {
  if (_dummyBcryptHash) return _dummyBcryptHash;
  const bcrypt = require("bcryptjs");
  _dummyBcryptHash = String(bcrypt.hashSync("protocol-dummy-otp-never-match", 4));
  return _dummyBcryptHash;
}

// ── DB-based rate limiter ──
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_REQUESTS = 5;
const MAX_VERIFY_ATTEMPTS = 5; // Max 5 verify attempts per window

async function checkRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString()
  const now = new Date().toISOString()

  try {
    // Use a transaction to make the check-and-increment atomic
    return await db.$transaction(async (tx) => {
      const record = await tx.protocolRateLimit.findUnique({
        where: { key },
      })

      if (!record || record.windowStart < windowStart) {
        // New window — reset count
        await tx.protocolRateLimit.upsert({
          where: { key },
          update: { count: 1, windowStart: now },
          create: { id: randomUUID(), key, count: 1, windowStart: now },
        })
        return true // allowed
      }

      if (record.count >= maxAttempts) {
        return false // rate limited
      }

      // Increment count
      await tx.protocolRateLimit.update({
        where: { key },
        data: { count: { increment: 1 }, updatedAt: now },
      })
      return true // allowed
    })
  } catch (e) {
    // Fail-closed on DB error — deny the request to prevent abuse
    console.error("[protocol-auth] Rate limit DB error (fail-closed):", e)
    return false
  }
}

// ── Helper: Parse OTP storage format ──
// New format: JSON { b: bcryptHash, h: hmacHex }
// Legacy format: plaintext 6-digit string
function parseOtpStorage(raw: string): { type: "secure"; b: string; h: string } | { type: "legacy"; plaintext: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.b === "string" && typeof parsed.h === "string") {
      return { type: "secure", b: parsed.b, h: parsed.h };
    }
    return null;
  } catch {
    // Not JSON — check if it looks like a legacy plaintext OTP
    if (typeof raw === "string" && /^\d{6}$/.test(raw)) {
      return { type: "legacy", plaintext: raw };
    }
    return null;
  }
}

// ── POST: Generate and send OTP ──
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

    // Clean up expired OTPs
    try {
      await db.protocolOtp.deleteMany({
        where: { expiresAt: { lt: new Date().toISOString() } },
      });
    } catch (e) {
      // Non-fatal cleanup
    }

    // Rate limit check
    const rateAllowed = await checkRateLimit(`otp:${email.toLowerCase()}`, MAX_OTP_REQUESTS, OTP_WINDOW_MS);
    if (!rateAllowed) {
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

    // W4: Log the actual reason server-side, return same message to client
    if (!user || !user.isActive) {
      await logEmailEvent({
        to: email,
        subject: "TRISHUL PROTOCOL - Login OTP",
        type: "PROTOCOL_AUTH",
        status: "REJECTED",
        error: "User not found or inactive",
        metadata: JSON.stringify({ reason: "user_not_found_or_inactive" }),
      });
      console.log("[protocol-auth] POST: user not found or inactive for", email.toLowerCase());

      // W4: Return same success-like message to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: "If this email is registered, you will receive a code",
      });
    }

    // Generate 6-digit OTP
    const otpNumber = randomBytes(3).readUIntBE(0, 3) % 1000000;
    const otp = String(otpNumber).padStart(6, "0");

    // C1: Hash OTP with bcrypt for secure storage (never store plaintext)
    const bcrypt = await import("bcryptjs");
    const hashedOtp = await bcrypt.default.hash(otp, 10);

    // W3: Compute HMAC-SHA256 for timing-safe comparison (fixed-length 32-byte digest)
    const otpHmac = createHmac("sha256", getOtpHmacSecret()).update(otp).digest("hex");

    // Store both hashes: bcrypt for security, HMAC for constant-time comparison
    await db.protocolOtp.create({
      data: {
        id: randomUUID(),
        email: email.toLowerCase(),
        otp: JSON.stringify({ b: hashedOtp, h: otpHmac }),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
      },
    });

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
      message: "If this email is registered, you will receive a code",
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { email, otp } = body as { email: unknown; otp: unknown };

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
    const rateAllowed = await checkRateLimit(`verify:${email.toLowerCase()}`, MAX_VERIFY_ATTEMPTS, OTP_WINDOW_MS);
    if (!rateAllowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    const normalizedEmail = email.toLowerCase();
    const otpStr = otp.toString();

    // W3: Find OTP by email only — never include OTP in DB query (prevents timing attacks on query)
    const record = await db.protocolOtp.findFirst({
      where: {
        email: normalizedEmail,
        expiresAt: { gt: new Date().toISOString() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse stored OTP data (handle both new secure format and legacy plaintext)
    const otpData = record ? parseOtpStorage(record.otp) : null;

    // W3: Constant-time OTP comparison to prevent timing attacks
    // Always perform verification work regardless of whether a record exists,
    // to prevent timing-based email enumeration.

    let otpValid = false;

    if (otpData?.type === "secure") {
      // New format: bcrypt + HMAC
      // 1. HMAC-SHA256 comparison using timingSafeEqual on fixed-length 32-byte buffers
      const providedHmacBuf = createHmac("sha256", getOtpHmacSecret()).update(otpStr).digest();
      const storedHmacBuf = Buffer.from(otpData.h, "hex");
      let hmacValid = false;
      try {
        hmacValid = timingSafeEqual(providedHmacBuf, storedHmacBuf);
      } catch {
        hmacValid = false;
      }

      // 2. Authoritative bcrypt comparison (inherently constant-time hash comparison)
      const bcrypt = await import("bcryptjs");
      let bcryptValid = false;
      try {
        bcryptValid = await bcrypt.default.compare(otpStr, otpData.b);
      } catch {
        bcryptValid = false;
      }

      // Both checks must pass
      otpValid = record !== null && hmacValid && bcryptValid;
    } else if (otpData?.type === "legacy") {
      // Legacy plaintext OTP — use timingSafeEqual on fixed-length padded buffers
      const providedBuf = Buffer.from(otpStr.padStart(8, "0"), "utf8");
      const storedBuf = Buffer.from(otpData.plaintext.padStart(8, "0"), "utf8");
      try {
        otpValid = record !== null && timingSafeEqual(providedBuf, storedBuf);
      } catch {
        otpValid = false;
      }
    } else {
      // No record or unparseable data — always run dummy bcrypt to prevent timing leak
      const bcrypt = await import("bcryptjs");
      try {
        await bcrypt.default.compare(otpStr, getDummyBcryptHash());
      } catch {
        // Intentionally swallowed — timing-safe dummy work
      }
      otpValid = false;
    }

    if (!otpValid) {
      await logEmailEvent({
        to: normalizedEmail,
        subject: "TRISHUL PROTOCOL - OTP Verify",
        type: "PROTOCOL_AUTH",
        status: "FAILED",
        error: "Invalid or expired OTP",
        metadata: JSON.stringify({ reason: "invalid_or_expired_otp" }),
      });
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 400 }
      );
    }

    // Delete used OTP (one-time use)
    await db.protocolOtp.deleteMany({
      where: { id: record!.id },
    });

    // Look up user (user info not stored in OTP record)
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    await logEmailEvent({
      to: normalizedEmail,
      subject: "TRISHUL PROTOCOL - OTP Verify",
      type: "PROTOCOL_AUTH",
      status: "SENT",
      triggeredBy: user.id,
      metadata: JSON.stringify({ reason: "verified_successfully" }),
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: normalizedEmail,
        role: user.role,
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
