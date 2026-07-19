import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateResetToken, sendPasswordResetEmail } from "@/lib/email"
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

/**
 * POST /api/auth/forgot-password
 * Public forgot-password — always identical success wording + padded timing.
 * Never reveals whether the email exists.
 */
export async function POST(req: NextRequest) {
  return withConstantTiming(AUTH_TIMING_MS.forgot, async () => {
    const ip = getClientIp(req.headers)
    let email = ""
    let captchaToken: string | null = null

    try {
      const body = await req.json()
      email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
      captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : null
    } catch {
      return NextResponse.json({ success: true, message: AUTH_MSG.forgotAlways })
    }

    const gate = await gateAuthAttempt({
      action: "forgot",
      ip,
      email: email || undefined,
      captchaToken,
    })

    if (!gate.ok) {
      await recordAuthFailure({ action: "forgot", ip, email: email || undefined })
      // Still return identical success body to avoid oracle — but include captcha hint via header-less field
      // that is always present with same shape when rate-limited after lockout.
      if (gate.captchaRequired) {
        return NextResponse.json({
          success: true,
          message: AUTH_MSG.forgotAlways,
          captchaRequired: true,
        })
      }
      return NextResponse.json({ success: true, message: AUTH_MSG.forgotAlways })
    }

    // Always increment lightly on forgot to slow spray (even for unknown emails)
    await recordAuthFailure({ action: "forgot", ip, email: email || undefined })

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: true, message: AUTH_MSG.forgotAlways })
    }

    try {
      const user = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          emailVerifiedAt: true,
        },
      })

      // Only send when account is eligible — response stays identical either way
      if (user?.isActive && user.emailVerifiedAt) {
        const token = generateResetToken()
        const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_MS)

        await db.passwordReset.deleteMany({
          where: { userId: user.id, used: false, purpose: "PASSWORD_RESET" },
        })

        await db.passwordReset.create({
          data: {
            userId: user.id,
            token: hashAuthToken(token),
            expiresAt,
            purpose: "PASSWORD_RESET",
            triggeredBy: null,
          },
        })

        const emailResult = await sendPasswordResetEmail(
          user.email,
          token,
          user.name,
          undefined
        )

        if (!emailResult.success) {
          await db.passwordReset.deleteMany({
            where: { userId: user.id, token: hashAuthToken(token) },
          })
          console.error("[forgot-password] email send failed")
        }
      }
    } catch (err) {
      console.error(
        "[forgot-password] error:",
        err instanceof Error ? err.message : String(err)
      )
    }

    return NextResponse.json({ success: true, message: AUTH_MSG.forgotAlways })
  })
}
