import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateResetToken, sendPasswordResetEmail, logEmailEvent } from "@/lib/email"
import { invalidateSession } from "@/lib/session-manager"
import bcrypt from "bcryptjs"
import {
  AUTH_MSG,
  AUTH_TIMING_MS,
  AUTH_TOKEN_TTL_MS,
  gateAuthAttempt,
  getClientIp,
  hashAuthToken,
  recordAuthFailure,
  withConstantTiming,
} from "@/lib/auth-security"

function validatePasswordComplexity(password: string): { valid: boolean; error: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" }
  }
  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const passed = checks.filter(Boolean).length
  if (passed < 3) {
    return {
      valid: false,
      error:
        "Password must contain at least 3 of: uppercase letter, lowercase letter, number, special character",
    }
  }
  return { valid: true, error: "" }
}

// Auto-migrate: ensure PasswordReset table exists
let resetTableChecked = false
let resetTableExists = false
async function ensurePasswordResetTable(): Promise<{ success: boolean; error?: string }> {
  if (resetTableChecked && resetTableExists) return { success: true }

  try {
    await db.passwordReset.count({ take: 1 })
    resetTableChecked = true
    resetTableExists = true
    return { success: true }
  } catch {
    console.log("[password-reset] PasswordReset table not found, auto-creating...")
  }

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PasswordReset" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL,
        "token" TEXT NOT NULL UNIQUE,
        "used" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" TEXT NOT NULL,
        "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET',
        "triggeredBy" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "PasswordReset_token_idx" ON "PasswordReset"("token")`
      )
    } catch {
      /* may exist */
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`
      )
    } catch {
      /* may exist */
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt")`
      )
    } catch {
      /* may exist */
    }
    try {
      await db.$executeRawUnsafe(
        `ALTER TABLE "PasswordReset" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'PASSWORD_RESET'`
      )
    } catch {
      /* may exist */
    }
    console.log("[password-reset] PasswordReset table created successfully")
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("[password-reset] Failed to create PasswordReset table:", errMsg)
    resetTableChecked = false
    resetTableExists = false
    return { success: false, error: "Failed to initialize password reset table" }
  }

  try {
    await db.passwordReset.count({ take: 1 })
    resetTableChecked = true
    resetTableExists = true
    return { success: true }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error("[password-reset] PasswordReset table verification failed:", errMsg)
    resetTableChecked = false
    resetTableExists = false
    return { success: false, error: "Failed to initialize password reset table" }
  }
}

/** Uniform invalid-token response — no used/expired/missing distinction. */
function invalidResetResponse() {
  return NextResponse.json({ error: AUTH_MSG.resetInvalid }, { status: 400 })
}

// POST /api/password-reset - SuperAdmin sends reset link OR directly resets password
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminRole = session.user.role
    if (adminRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Only SUPER_ADMIN can reset passwords" },
        { status: 403 }
      )
    }

    await ensurePasswordResetTable()

    const adminUserId = session.user.id
    const body = await req.json()
    const { userId, action } = body

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (!action || (action !== "send_link" && action !== "direct_reset")) {
      return NextResponse.json(
        { error: "Action must be 'send_link' or 'direct_reset'" },
        { status: 400 }
      )
    }

    const targetUser = await db.user.findUnique({ where: { id: userId } })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (targetUser.role === "SUPER_ADMIN" && targetUser.id !== adminUserId) {
      return NextResponse.json(
        { error: "Cannot reset another SUPER_ADMIN's password" },
        { status: 403 }
      )
    }

    if (action === "send_link") {
      const token = generateResetToken()
      const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_MS)

      await db.passwordReset.deleteMany({
        where: { userId, used: false, purpose: "PASSWORD_RESET" },
      })

      await db.passwordReset.create({
        data: {
          userId,
          token: hashAuthToken(token),
          expiresAt,
          purpose: "PASSWORD_RESET",
          triggeredBy: adminUserId,
        },
      })

      const emailResult = await sendPasswordResetEmail(
        targetUser.email,
        token,
        targetUser.name,
        adminUserId
      )

      if (!emailResult.success) {
        await db.passwordReset.deleteMany({
          where: { userId, token: hashAuthToken(token) },
        })
        console.error("[password-reset] Failed to send reset email:", emailResult.error)
        return NextResponse.json(
          { error: "Failed to send reset email. Please try again later." },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: `Password reset link sent to ${targetUser.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}`,
      })
    }

    if (action === "direct_reset") {
      const { newPassword } = body

      if (!newPassword) {
        return NextResponse.json(
          { error: "New password is required for direct reset" },
          { status: 400 }
        )
      }

      const pwCheck = validatePasswordComplexity(newPassword)
      if (!pwCheck.valid) {
        return NextResponse.json({ error: pwCheck.error }, { status: 400 })
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12)
      await db.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      })

      try {
        await invalidateSession(userId)
      } catch (err) {
        console.error("[password-reset] Failed to invalidate session after direct reset:", err)
      }

      await logEmailEvent({
        to: targetUser.email,
        subject: "Password Directly Reset by SuperAdmin",
        type: "DIRECT_RESET",
        status: "SENT",
        triggeredBy: adminUserId,
        metadata: JSON.stringify({
          action: "direct_password_reset",
          targetUserId: userId,
          targetUserName: targetUser.name,
        }),
      })

      return NextResponse.json({
        success: true,
        message: `Password reset successfully for ${targetUser.name}`,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: unknown) {
    console.error(
      "[password-reset] POST error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "Password reset failed. Please try again." }, { status: 500 })
  }
}

// PUT /api/password-reset - Consume reset token and set new password (public)
export async function PUT(req: NextRequest) {
  return withConstantTiming(AUTH_TIMING_MS.reset, async () => {
    try {
      await ensurePasswordResetTable()

      const ip = getClientIp(req.headers)
      const body = await req.json()
      const token = typeof body.token === "string" ? body.token : ""
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""
      const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : null

      const gate = await gateAuthAttempt({
        action: "reset",
        ip,
        captchaToken,
      })
      if (!gate.ok) {
        await recordAuthFailure({ action: "reset", ip })
        return NextResponse.json(
          {
            error:
              gate.reason === "captcha_required" || gate.reason === "captcha_failed"
                ? AUTH_MSG.captchaRequired
                : AUTH_MSG.loginRateLimited,
            captchaRequired: gate.captchaRequired,
          },
          { status: 429 }
        )
      }

      if (!token || !newPassword) {
        await recordAuthFailure({ action: "reset", ip })
        return invalidResetResponse()
      }

      const pwCheck = validatePasswordComplexity(newPassword)
      if (!pwCheck.valid) {
        // Password policy errors are OK to return (not enumeration)
        return NextResponse.json({ error: pwCheck.error }, { status: 400 })
      }

      const tokenHash = hashAuthToken(token)
      const resetRecord = await db.passwordReset.findUnique({
        where: { token: tokenHash },
      })

      const purpose = (resetRecord as { purpose?: string } | null)?.purpose ?? "PASSWORD_RESET"
      const invalid =
        !resetRecord ||
        resetRecord.used ||
        new Date(resetRecord.expiresAt) < new Date() ||
        purpose !== "PASSWORD_RESET"

      if (invalid) {
        if (resetRecord && new Date(resetRecord.expiresAt) < new Date()) {
          try {
            await db.passwordReset.delete({ where: { id: resetRecord.id } })
          } catch {
            /* ignore */
          }
        }
        await recordAuthFailure({ action: "reset", ip })
        return invalidResetResponse()
      }

      const user = await db.user.findUnique({ where: { id: resetRecord.userId } })
      if (!user) {
        await recordAuthFailure({ action: "reset", ip })
        return invalidResetResponse()
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12)
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        }),
        db.passwordReset.update({
          where: { id: resetRecord.id },
          data: { used: true },
        }),
        db.passwordReset.deleteMany({
          where: { userId: user.id, id: { not: resetRecord.id }, purpose: "PASSWORD_RESET" },
        }),
      ])

      try {
        await invalidateSession(user.id)
      } catch (err) {
        console.error("[password-reset] Failed to invalidate session after link reset:", err)
      }

      return NextResponse.json({
        success: true,
        message: AUTH_MSG.resetSuccess,
      })
    } catch (error: unknown) {
      console.error(
        "[password-reset] PUT error:",
        error instanceof Error ? error.message : String(error)
      )
      return NextResponse.json({ error: "Password reset failed. Please try again." }, { status: 500 })
    }
  })
}

/**
 * GET intentionally does not validate tokens or reveal validity.
 * Tokens must never appear in query strings (logs/proxies). Clients submit via PUT body.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Submit a reset token via PUT with your new password.",
  })
}
