import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  AUTH_MSG,
  AUTH_TIMING_MS,
  gateAuthAttempt,
  getClientIp,
  hashAuthToken,
  recordAuthFailure,
  withConstantTiming,
} from "@/lib/auth-security"

/**
 * POST /api/auth/verify-email
 * Consumes EMAIL_VERIFY token from body (never query string). Activates account.
 */
export async function POST(req: NextRequest) {
  return withConstantTiming(AUTH_TIMING_MS.verify, async () => {
    const ip = getClientIp(req.headers)

    try {
      const body = await req.json()
      const token = typeof body.token === "string" ? body.token : ""
      const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : null

      const gate = await gateAuthAttempt({
        action: "verify",
        ip,
        captchaToken,
      })
      if (!gate.ok) {
        await recordAuthFailure({ action: "verify", ip })
        return NextResponse.json(
          {
            error: AUTH_MSG.verifyInvalid,
            captchaRequired: gate.captchaRequired,
          },
          { status: 429 }
        )
      }

      if (!token) {
        await recordAuthFailure({ action: "verify", ip })
        return NextResponse.json({ error: AUTH_MSG.verifyInvalid }, { status: 400 })
      }

      const tokenHash = hashAuthToken(token)
      const record = await db.passwordReset.findUnique({
        where: { token: tokenHash },
      })

      const purpose = (record as { purpose?: string } | null)?.purpose
      const invalid =
        !record ||
        record.used ||
        new Date(record.expiresAt) < new Date() ||
        purpose !== "EMAIL_VERIFY"

      if (invalid) {
        if (record && new Date(record.expiresAt) < new Date()) {
          try {
            await db.passwordReset.delete({ where: { id: record.id } })
          } catch {
            /* ignore */
          }
        }
        await recordAuthFailure({ action: "verify", ip })
        return NextResponse.json({ error: AUTH_MSG.verifyInvalid }, { status: 400 })
      }

      await db.$transaction([
        db.user.update({
          where: { id: record.userId },
          data: {
            emailVerifiedAt: new Date(),
            isActive: true,
          },
        }),
        db.passwordReset.update({
          where: { id: record.id },
          data: { used: true },
        }),
        db.passwordReset.deleteMany({
          where: {
            userId: record.userId,
            purpose: "EMAIL_VERIFY",
            id: { not: record.id },
          },
        }),
      ])

      return NextResponse.json({ success: true, message: AUTH_MSG.verifySuccess })
    } catch (err) {
      console.error(
        "[verify-email] error:",
        err instanceof Error ? err.message : String(err)
      )
      return NextResponse.json({ error: AUTH_MSG.verifyInvalid }, { status: 400 })
    }
  })
}
