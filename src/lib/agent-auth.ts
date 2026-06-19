import crypto from "crypto";

/**
 * Agent Authentication — JWT-based identity verification for external AI sessions.
 *
 * Flow:
 * 1. GLM session calls POST /api/agent-auth/otp/send with email
 * 2. User receives OTP via email, types it into GLM chat
 * 3. GLM session calls POST /api/agent-auth/otp/verify with email + otp
 * 4. Server verifies OTP, returns a JWT (1-hour expiry)
 * 5. GLM session includes JWT as Bearer token in all /api/agent/* calls
 *
 * The JWT contains: userId, email, role, tier, exp, iat
 * Signed with NEXTAUTH_SECRET (same secret used by NextAuth).
 */

const TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour
const REFRESH_THRESHOLD_SECONDS = 10 * 60; // Refresh if less than 10 min remaining

/** Get the signing secret — uses NEXTAUTH_SECRET (required, already configured). */
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("NEXTAUTH_SECRET is not set or too short (min 16 chars). Agent auth is disabled.");
  }
  return secret;
}

/** Agent JWT payload */
export interface AgentTokenPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
  tier: number; // 1 = full access, 2 = dev access
  iat: number; // issued at (unix seconds)
  exp: number; // expiry (unix seconds)
  jti: string; // unique token ID (for revocation if needed later)
}

/**
 * Generate a signed JWT for an agent session.
 * Uses HS256 (HMAC-SHA256) — standard JWT algorithm.
 */
export function generateAgentToken(user: {
  id: string;
  email: string;
  role: string;
  name: string;
}): { token: string; expiresAt: number } {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_EXPIRY_SECONDS;
  const jti = crypto.randomUUID();

  const payload: AgentTokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    tier: user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? 1 : 2,
    iat: now,
    exp,
    jti,
  };

  // JWT header
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  // Sign
  const data = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  const token = `${data}.${signature}`;
  return { token, expiresAt: exp };
}

/**
 * Verify an agent JWT.
 * Returns the payload if valid, throws if invalid/expired/tampered.
 */
export function verifyAgentToken(token: string): AgentTokenPayload {
  const secret = getSecret();

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const data = `${headerB64}.${payloadB64}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(data).digest("base64url");

  // Constant-time comparison
  const sigBuffer = Buffer.from(signatureB64);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid signature");
  }
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new Error("Invalid signature");
  }

  // Parse payload
  let payload: AgentTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid payload");
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error("Token expired");
  }

  return payload;
}

/**
 * Extract and verify agent token from Authorization header.
 * Returns null if no valid token found (does not throw — for middleware use).
 */
export function extractAgentToken(authHeader: string | null): AgentTokenPayload | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return verifyAgentToken(match[1]);
  } catch {
    return null;
  }
}

/**
 * Check if a token should be refreshed (less than 10 min remaining).
 */
export function shouldRefresh(payload: AgentTokenPayload): boolean {
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  return remaining < REFRESH_THRESHOLD_SECONDS;
}

/**
 * Derive tier from role (used when creating tokens and when checking permissions).
 */
export function getTierFromRole(role: string): number {
  return role === "SUPER_ADMIN" || role === "ADMIN" ? 1 : 2;
}

/**
 * Check if a user role has admin-level access.
 */
export function isAgentAdmin(payload: AgentTokenPayload): boolean {
  return payload.role === "SUPER_ADMIN" || payload.role === "ADMIN";
}

/**
 * Check if a user role has super-admin access.
 */
export function isAgentSuperAdmin(payload: AgentTokenPayload): boolean {
  return payload.role === "SUPER_ADMIN";
}
