import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { logEmailEvent } from "@/lib/email";
import { generateAgentToken } from "@/lib/agent-auth";

// ── Constants ──
const MAX_VERIFY_ATTEMPTS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;

function getOtpHmacSecret(): string {
  const secret = process.env.OTP_HMAC_SECRET
  if (!secret || secret.length < 16) {
    throw new Error("OTP_HMAC_SECRET environment variable is not set.")
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
    console.error("[agent-auth/otp/verify] Rate limit DB error (fail-closed):", e)
    return false
  }
}

// ── Parse OTP storage ──
function parseOtpStorage(raw: string): { b: string; h: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.b === "string" && typeof parsed.h === "string") {
      return { b: parsed.b, h: parsed.h };
    }
    return null;
  } catch {
    return null;
  }
}

// Pre-computed dummy bcrypt hash for constant-time operations
let _dummyBcryptHash: string | undefined;
function getDummyBcryptHash(): string {
  if (_dummyBcryptHash) return _dummyBcryptHash;
  const bcrypt = require("bcryptjs");
  _dummyBcryptHash = String(bcrypt.hashSync("agent-dummy-otp-never-match", 4));
  return _dummyBcryptHash;
}

// ── POST: Verify OTP and issue JWT ──
// Public endpoint — no auth required.
// Body: { email: string, otp: string }
// Returns on success: { success: true, token: "...", user: {...}, expiresAt: ... }
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, otp } = body as { email: unknown; otp: unknown };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "OTP must be a 6-digit code" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();

    // Rate limit verify attempts — 5 per email per 15 min
    const rateAllowed = await checkRateLimit(`agent-otp-verify:${normalizedEmail}`, MAX_VERIFY_ATTEMPTS, OTP_WINDOW_MS);
    if (!rateAllowed) {
      return NextResponse.json(
        { error: "Too many verify attempts. Please try again in 15 minutes." },
        { status: 429 }
      );
    }

    // Find OTP record by email only (never include OTP in query — prevents timing attacks)
    const otpRecord = await db.protocolOtp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: "desc" },
    });

    // Always run both bcrypt and HMAC comparisons (constant-time, prevents email enumeration via timing)
    const stored = otpRecord ? parseOtpStorage(otpRecord.otp) : null;
    const dummyHash = getDummyBcryptHash();
    const bcryptHashToCompare = stored?.b || dummyHash;
    const hmacToCompare = stored?.h || createHmac("sha256", getOtpHmacSecret()).update("dummy-never-match").digest("hex");

    // HMAC comparison (constant-time, fixed 32 bytes)
    const userHmac = createHmac("sha256", getOtpHmacSecret()).update(otp).digest("hex");
    const userHmacBuf = Buffer.from(userHmac, "hex");
    const storedHmacBuf = Buffer.from(hmacToCompare, "hex");
    let hmacMatch = false;
    if (userHmacBuf.length === storedHmacBuf.length) {
      hmacMatch = timingSafeEqual(userHmacBuf, storedHmacBuf);
    }

    // bcrypt comparison (inherently constant-time)
    const bcrypt = await import("bcryptjs");
    const bcryptMatch = await bcrypt.default.compare(otp, bcryptHashToCompare);

    // Both must pass
    if (!hmacMatch || !bcryptMatch || !otpRecord || !stored) {
      // Don't delete the OTP record here — let user retry until rate limit or expiry
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
    }

    // Check expiry
    const expiryDate = new Date(otpRecord.expiresAt);
    if (expiryDate.getTime() < Date.now()) {
      await db.protocolOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      return NextResponse.json({ error: "OTP has expired. Please request a new one." }, { status: 401 });
    }

    // Look up user
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Edge case: user was deactivated after OTP was sent
      await db.protocolOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      return NextResponse.json({ error: "Account not found or inactive" }, { status: 403 });
    }

    // Delete used OTP (one-time use)
    await db.protocolOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});

    // Generate JWT
    const { token, expiresAt } = generateAgentToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    // Log successful auth
    await logEmailEvent({
      to: normalizedEmail,
      subject: "TrishulHub Technology — Agent Login OTP",
      type: "PROTOCOL_AUTH",
      status: "SENT",
      metadata: JSON.stringify({ action: "agent_otp_verified", userId: user.id }),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // PROJECT_MANAGER is treated as tier 1 (admin-like) for agent API access
        tier: user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "PROJECT_MANAGER" ? 1 : 2,
      },
    });
  } catch (error) {
    console.error("[agent-auth/otp/verify] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
