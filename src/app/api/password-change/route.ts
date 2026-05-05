import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateOTP, sendPasswordChangeOTP, logEmailEvent } from "@/lib/email"
import { invalidateSession } from "@/lib/session-manager"

// Auto-migrate: ensure PasswordChange table exists
let pwTableChecked = false
let pwTableExists = false
async function ensurePasswordChangeTable(): Promise<{ success: boolean; error?: string }> {
  if (pwTableChecked && pwTableExists) return { success: true }

  try {
    await (db as any).passwordChange.count({ take: 1 })
    pwTableChecked = true
    pwTableExists = true
    return { success: true }
  } catch {
    console.log("[password-change] PasswordChange table not found, auto-creating...")
  }

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PasswordChange" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL,
        "otp" TEXT NOT NULL,
        "verified" INTEGER NOT NULL DEFAULT 0,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordChange_userId_idx" ON "PasswordChange"("userId")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordChange_expiresAt_idx" ON "PasswordChange"("expiresAt")`) } catch {}
    console.log("[password-change] PasswordChange table created successfully")
  } catch (err: any) {
    console.error("[password-change] Failed to create PasswordChange table:", err.message)
    pwTableChecked = false
    pwTableExists = false
    return { success: false, error: err.message }
  }

  try {
    await (db as any).passwordChange.count({ take: 1 })
    pwTableChecked = true
    pwTableExists = true
    return { success: true }
  } catch (err: any) {
    pwTableChecked = false
    pwTableExists = false
    return { success: false, error: err.message }
  }
}

// In-memory rate limiter for OTP verification attempts
const otpVerifyAttempts = new Map<string, { count: number; resetAt: number }>()
const passwordAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(store: Map<string, { count: number; resetAt: number }>, key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count++
  return entry.count <= maxAttempts
}

// POST /api/password-change - Request password change OTP (verifies current password + sends OTP)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-migrate: ensure PasswordChange table exists
    await ensurePasswordChangeTable()

    const userId = session.user.id
    const body = await req.json()
    const { currentPassword } = body

    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 })
    }

    // Rate limit: max 5 password verification attempts per user in 15 minutes
    if (!checkRateLimit(passwordAttempts, `pw-change-verify-${userId}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again after 15 minutes." }, { status: 429 })
    }

    // Verify current password
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const bcrypt = await import("bcryptjs")
    const passwordValid = await bcrypt.default.compare(currentPassword, user.password)
    if (!passwordValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    // Rate limit: max 3 OTP requests per user in 15 minutes
    const recentRequests = await (db as any).passwordChange.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    })
    if (recentRequests >= 3) {
      return NextResponse.json({ error: "Too many OTP requests. Please try again after 15 minutes." }, { status: 429 })
    }

    // Clean up expired OTPs for this user
    await (db as any).passwordChange.deleteMany({
      where: {
        userId,
        verified: false,
        expiresAt: { lt: new Date() },
      },
    })

    // Generate OTP and hash it for storage
    const otp = generateOTP()
    const hashedOtp = await bcrypt.default.hash(otp, 10)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Save verification record with hashed OTP
    await (db as any).passwordChange.create({
      data: {
        userId,
        otp: hashedOtp,
        attempts: 0,
        expiresAt,
      },
    })

    // Send OTP email to the user's registered email
    const emailResult = await sendPasswordChangeOTP(user.email, otp, userId)
    if (!emailResult.success) {
      // Delete the verification record if email failed
      await (db as any).passwordChange.deleteMany({ where: { userId, verified: false } })
      return NextResponse.json({ error: `Failed to send OTP email: ${emailResult.error}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to your email (${user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}). Please check your inbox.`,
    })
  } catch (error: any) {
    console.error("[password-change] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PUT /api/password-change - Verify OTP and change password
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-migrate: ensure PasswordChange table exists
    await ensurePasswordChangeTable()

    const userId = session.user.id
    const body = await req.json()
    const { otp, newPassword } = body

    if (!otp || !newPassword) {
      return NextResponse.json({ error: "OTP and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // SECURITY: Basic password complexity (at least one letter and one number)
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json({ error: "Password must contain at least one letter and one number" }, { status: 400 })
    }

    // Rate limit: max 10 OTP verification attempts per user in 10 minutes
    if (!checkRateLimit(otpVerifyAttempts, `pw-otp-verify-${userId}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many verification attempts. Please request a new OTP." }, { status: 429 })
    }

    // Find the verification record
    const verification = await (db as any).passwordChange.findFirst({
      where: {
        userId,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!verification) {
      return NextResponse.json({ error: "Invalid or expired OTP. Please request a new one." }, { status: 400 })
    }

    // Check max attempts on this OTP
    if (verification.attempts >= 5) {
      await (db as any).passwordChange.delete({ where: { id: verification.id } })
      return NextResponse.json({ error: "Too many failed attempts. Please request a new OTP." }, { status: 429 })
    }

    // Compare the provided OTP with the hashed OTP
    const bcrypt = await import("bcryptjs")
    const otpValid = await bcrypt.default.compare(otp, verification.otp)

    if (!otpValid) {
      // Increment attempts counter
      await (db as any).passwordChange.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      })
      return NextResponse.json({ error: "Invalid OTP. Please try again." }, { status: 400 })
    }

    // Mark as verified
    await (db as any).passwordChange.update({
      where: { id: verification.id },
      data: { verified: true },
    })

    // SECURITY: Check that new password is different from current password
    // (must be done after fetching user record)
    const currentUser = await db.user.findUnique({ where: { id: userId } })
    if (currentUser) {
      const passwordSame = await bcrypt.default.compare(newPassword, currentUser.password)
      if (passwordSame) {
        return NextResponse.json({ error: "New password must be different from your current password" }, { status: 400 })
      }
    }

    // Update the user's password
    const hashedPassword = await bcrypt.default.hash(newPassword, 12)
    await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    // Clean up all verification records for this user
    await (db as any).passwordChange.deleteMany({
      where: { userId },
    })

    // Log the password change event
    await logEmailEvent({
      to: session.user.email || "",
      subject: "Password Changed",
      type: "PASSWORD_CHANGE",
      status: "SENT",
      triggeredBy: userId,
      metadata: JSON.stringify({ action: "password_changed_via_otp" }),
    })

    // SECURITY: Invalidate the user's session after password change.
    // This forces re-login with the new password, ensuring the old
    // session (with the old password) is immediately terminated.
    try {
      await invalidateSession(userId)
      console.log("[password-change] Session invalidated for user", userId, "— must re-login")
    } catch (err) {
      console.error("[password-change] Failed to invalidate session:", err)
      // Non-blocking: the password change still succeeded
    }

    return NextResponse.json({
      success: true,
      message: "Password changed successfully! Please sign in again with your new password.",
      requiresReauth: true,
    })
  } catch (error: any) {
    console.error("[password-change] PUT error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
