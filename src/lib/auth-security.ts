/**
 * Auth security helpers — anti-enumeration, constant timing, rate limits,
 * CAPTCHA (Cloudflare Turnstile), and token hashing for reset/verify flows.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto"
import bcrypt from "bcryptjs"
import { checkDbRateLimit, peekDbRateLimit } from "@/lib/rate-limit"

/** Precomputed bcrypt (cost 12) of a never-used password — equalizes login timing. */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$a42BNF5qdEcs07DpEXcC5.w1cpvZW1C1HtCkgIcYBG1Rw0uNcx73O"

/** Uniform client-facing messages (no existence leaks). */
export const AUTH_MSG = {
  loginFailed: "Invalid email or password.",
  loginLocked: "Too many attempts. Complete the security check and try again.",
  loginRateLimited: "Too many attempts. Please wait and try again.",
  forgotAlways:
    "If an account exists for that email, you will receive reset instructions shortly.",
  resetInvalid: "This reset link is invalid or has expired. Please request a new one.",
  resetSuccess: "Password updated. You can now sign in with your new password.",
  verifyInvalid: "This verification link is invalid or has expired.",
  verifySuccess: "Email verified. You can now sign in.",
  signupGeneric:
    "If this account can be created, a verification email will be sent to the address provided.",
  captchaRequired: "Security check required. Please complete the CAPTCHA and try again.",
  captchaFailed: "Security check failed. Please try again.",
} as const

export const AUTH_TIMING_MS = {
  login: 450,
  forgot: 500,
  reset: 400,
  verify: 400,
  signup: 500,
} as const

/** Reset / ownership tokens expire in 1 hour. */
export const AUTH_TOKEN_TTL_MS = 60 * 60 * 1000

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Cryptographically random opaque token (256-bit). Never log or store raw. */
export function generateAuthToken(): string {
  return randomBytes(32).toString("hex")
}

export function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** Pad async work so success/failure paths take similar wall time. */
export async function withConstantTiming<T>(
  minMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now()
  try {
    return await fn()
  } finally {
    const elapsed = Date.now() - started
    const remaining = minMs - elapsed
    if (remaining > 0) {
      await new Promise((r) => setTimeout(r, remaining))
    }
  }
}

export function getClientIp(headers: Headers | { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  const real = headers.get("x-real-ip")
  if (real) return real.slice(0, 64)
  return "unknown"
}

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}

export function isTurnstileSiteKeyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim())
}

/**
 * Verify Cloudflare Turnstile token.
 * Returns true only on successful siteverify.
 * When secret is not configured, returns false (caller decides fail-open vs require).
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  ip?: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return false
  if (!token || typeof token !== "string" || token.length < 10 || token.length > 4096) {
    return false
  }

  try {
    const body = new URLSearchParams()
    body.set("secret", secret)
    body.set("response", token)
    if (ip && ip !== "unknown") body.set("remoteip", ip)

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

export type AuthAction = "login" | "forgot" | "reset" | "verify" | "signup"

const LIMITS: Record<
  AuthAction,
  { softMax: number; softWindow: number; hardMax: number; hardWindow: number; lockMax: number; lockWindow: number }
> = {
  login: {
    softMax: 5,
    softWindow: 30_000,
    hardMax: 15,
    hardWindow: 15 * 60_000,
    lockMax: 8,
    lockWindow: 15 * 60_000,
  },
  forgot: {
    softMax: 3,
    softWindow: 60_000,
    hardMax: 8,
    hardWindow: 60 * 60_000,
    lockMax: 5,
    lockWindow: 60 * 60_000,
  },
  reset: {
    softMax: 5,
    softWindow: 60_000,
    hardMax: 15,
    hardWindow: 60 * 60_000,
    lockMax: 8,
    lockWindow: 60 * 60_000,
  },
  verify: {
    softMax: 10,
    softWindow: 60_000,
    hardMax: 30,
    hardWindow: 60 * 60_000,
    lockMax: 15,
    lockWindow: 60 * 60_000,
  },
  signup: {
    softMax: 5,
    softWindow: 60_000,
    hardMax: 20,
    hardWindow: 60 * 60_000,
    lockMax: 10,
    lockWindow: 60 * 60_000,
  },
}

function keysFor(action: AuthAction, ip: string, email?: string) {
  const e = email?.trim().toLowerCase() || "_"
  return {
    soft: `auth:${action}:soft:${ip}`,
    hard: `auth:${action}:hard:${ip}`,
    lock: `auth:${action}:lock:${ip}:${e}`,
    emailHard: `auth:${action}:email:${e}`,
  }
}

export type AuthGateResult =
  | { ok: true; captchaRequired: boolean }
  | { ok: false; reason: "rate_limited" | "captcha_required" | "captcha_failed"; captchaRequired: boolean }

/**
 * Rate limit + optional CAPTCHA gate for auth endpoints.
 * After lock threshold, CAPTCHA is required when Turnstile is configured;
 * otherwise the request is blocked until the window resets.
 */
export async function gateAuthAttempt(options: {
  action: AuthAction
  ip: string
  email?: string
  captchaToken?: string | null
}): Promise<AuthGateResult> {
  const { action, ip, email, captchaToken } = options
  const lim = LIMITS[action]
  const k = keysFor(action, ip, email)

  const [softPeek, hardPeek, lockPeek, emailPeek] = await Promise.all([
    peekDbRateLimit(k.soft, lim.softMax, lim.softWindow),
    peekDbRateLimit(k.hard, lim.hardMax, lim.hardWindow),
    peekDbRateLimit(k.lock, lim.lockMax, lim.lockWindow),
    peekDbRateLimit(k.emailHard, lim.hardMax, lim.hardWindow),
  ])

  const overSoft = !softPeek.allowed
  const overHard = !hardPeek.allowed || !emailPeek.allowed
  const overLock = !lockPeek.allowed
  const captchaConfigured = isTurnstileConfigured()
  const captchaRequired = overLock || (overSoft && captchaConfigured)

  if (overHard && !captchaConfigured) {
    return { ok: false, reason: "rate_limited", captchaRequired: false }
  }

  if (captchaRequired) {
    if (!captchaConfigured) {
      return { ok: false, reason: "rate_limited", captchaRequired: false }
    }
    const valid = await verifyTurnstileToken(captchaToken, ip)
    if (!valid) {
      return { ok: false, reason: "captcha_required", captchaRequired: true }
    }
  }

  return { ok: true, captchaRequired }
}

/** Record a failed auth attempt (increments counters). */
export async function recordAuthFailure(options: {
  action: AuthAction
  ip: string
  email?: string
}): Promise<void> {
  const { action, ip, email } = options
  const lim = LIMITS[action]
  const k = keysFor(action, ip, email)
  await Promise.all([
    checkDbRateLimit(k.soft, lim.softMax, lim.softWindow),
    checkDbRateLimit(k.hard, lim.hardMax, lim.hardWindow),
    checkDbRateLimit(k.lock, lim.lockMax, lim.lockWindow),
    checkDbRateLimit(k.emailHard, lim.hardMax, lim.hardWindow),
  ])
}

/** Always run bcrypt.compare so missing users take the same time as bad passwords. */
export async function verifyPasswordConstantTime(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  const hash =
    storedHash && storedHash.startsWith("$2") ? storedHash : DUMMY_PASSWORD_HASH
  const match = await bcrypt.compare(password, hash)
  // If we used the dummy hash, never treat as valid even if somehow matched
  if (!storedHash || !storedHash.startsWith("$2")) return false
  return match
}

export function redactEmail(email: string): string {
  return email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
}

/** Strip tokens from strings before logging. */
export function scrubSecretsForLog(value: string): string {
  return value
    .replace(/[?&#]t=[a-f0-9]{32,}/gi, "#t=REDACTED")
    .replace(/[?&#]token=[a-f0-9]{32,}/gi, "#token=REDACTED")
    .replace(/\b[a-f0-9]{64}\b/gi, "[REDACTED_TOKEN]")
}
