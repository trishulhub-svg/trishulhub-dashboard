import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isValidEmail, isDisposableEmail, generateOTP, sendOTPEmail } from "@/lib/email"

// Auto-migrate: ensure EmailVerification table exists
let emailTableChecked = false
let emailTableExists = false
async function ensureEmailTableExists(): Promise<{ success: boolean; error?: string }> {
  if (emailTableChecked && emailTableExists) return { success: true }

  try {
    await db.emailVerification.count({ take: 1 })
    emailTableChecked = true
    emailTableExists = true
    return { success: true }
  } catch {
    console.log("[email-change] EmailVerification table not found, auto-creating...")
  }

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmailVerification" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "userId" TEXT NOT NULL,
        "newEmail" TEXT NOT NULL,
        "otp" TEXT NOT NULL,
        "verified" INTEGER NOT NULL DEFAULT 0,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "expiresAt" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_newEmail_idx" ON "EmailVerification"("newEmail")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt")`) } catch {}
    console.log("[email-change] EmailVerification table created successfully")
  } catch (err: any) {
    console.error("[email-change] Failed to create EmailVerification table:", err.message)
    emailTableChecked = false
    emailTableExists = false
    return { success: false, error: err.message }
  }

  // Verify the table actually works
  try {
    await db.emailVerification.count({ take: 1 })
    emailTableChecked = true
    emailTableExists = true
    return { success: true }
  } catch (err: any) {
    emailTableChecked = false
    emailTableExists = false
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

// POST /api/email-change - Request email change (sends OTP to new email)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-migrate: ensure EmailVerification table exists
    await ensureEmailTableExists()

    const userId = (session.user as any).id
    const body = await req.json()
    const { newEmail, currentPassword } = body

    if (!newEmail || !currentPassword) {
      return NextResponse.json({ error: "New email and current password are required" }, { status: 400 })
    }

    // Rate limit: max 5 password verification attempts per user in 15 minutes
    if (!checkRateLimit(passwordAttempts, `email-change-pwd-${userId}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many attempts. Please try again after 15 minutes." }, { status: 429 })
    }

    // Validate email format
    if (!isValidEmail(newEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Block disposable/temp emails
    if (isDisposableEmail(newEmail)) {
      return NextResponse.json({ error: "Disposable/temporary email addresses are not allowed. Please use a permanent email." }, { status: 400 })
    }

    // Verify current password
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const bcrypt = await import("bcryptjs")
    const passwordValid = await bcrypt.default.compare(currentPassword, user.password)
    if (!passwordValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    // Check if new email is same as current
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return NextResponse.json({ error: "New email is the same as your current email" }, { status: 400 })
    }

    // Check if new email is already in use
    const existingUser = await db.user.findUnique({ where: { email: newEmail } })
    if (existingUser) {
      return NextResponse.json({ error: "This email is already registered with another account" }, { status: 409 })
    }

    // Rate limit: max 3 OTP requests per user in 15 minutes
    const recentRequests = await db.emailVerification.count({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    })
    if (recentRequests >= 3) {
      return NextResponse.json({ error: "Too many OTP requests. Please try again after 15 minutes." }, { status: 429 })
    }

    // Clean up expired OTPs for this user
    await db.emailVerification.deleteMany({
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
    await db.emailVerification.create({
      data: {
        userId,
        newEmail,
        otp: hashedOtp,
        attempts: 0,
        expiresAt,
      },
    })

    // Send OTP email (plain text OTP is only in the email, not stored)
    const emailResult = await sendOTPEmail(newEmail, otp)
    if (!emailResult.success) {
      // Delete the verification record if email failed
      await db.emailVerification.deleteMany({ where: { userId, newEmail, verified: false } })
      return NextResponse.json({ error: `Failed to send verification email: ${emailResult.error}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `OTP sent to ${newEmail}. Please check your inbox.`,
    })
  } catch (error: any) {
    console.error("[email-change] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PUT /api/email-change - Verify OTP and change email
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Auto-migrate: ensure EmailVerification table exists
    await ensureEmailTableExists()

    const userId = (session.user as any).id
    const body = await req.json()
    const { otp, newEmail } = body

    if (!otp || !newEmail) {
      return NextResponse.json({ error: "OTP and new email are required" }, { status: 400 })
    }

    // Rate limit: max 10 OTP verification attempts per user in 10 minutes
    if (!checkRateLimit(otpVerifyAttempts, `otp-verify-${userId}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json({ error: "Too many verification attempts. Please request a new OTP." }, { status: 429 })
    }

    // Find the verification record (without OTP in where clause since it's hashed)
    const verification = await db.emailVerification.findFirst({
      where: {
        userId,
        newEmail,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!verification) {
      return NextResponse.json({ error: "Invalid or expired OTP. Please request a new one." }, { status: 400 })
    }

    // Check max attempts on this OTP
    if ((verification as any).attempts >= 5) {
      await db.emailVerification.delete({ where: { id: verification.id } })
      return NextResponse.json({ error: "Too many failed attempts. Please request a new OTP." }, { status: 429 })
    }

    // Compare the provided OTP with the hashed OTP
    const bcrypt = await import("bcryptjs")
    const otpValid = await bcrypt.default.compare(otp, verification.otp)

    if (!otpValid) {
      // Increment attempts counter
      await db.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      })
      return NextResponse.json({ error: "Invalid or expired OTP. Please try again." }, { status: 400 })
    }

    // Mark as verified
    await db.emailVerification.update({
      where: { id: verification.id },
      data: { verified: true },
    })

    // Use transaction for atomic email update (prevents race condition)
    try {
      await db.$transaction(async (tx) => {
        // Update will fail if unique constraint is violated
        await tx.user.update({
          where: { id: userId },
          data: { email: newEmail },
        })
      })
    } catch (error: any) {
      // Prisma P2002 = unique constraint violation
      if (error.code === "P2002") {
        return NextResponse.json({ error: "This email is already registered with another account" }, { status: 409 })
      }
      throw error
    }

    // Clean up all verification records for this user
    await db.emailVerification.deleteMany({
      where: { userId },
    })

    return NextResponse.json({
      success: true,
      message: "Email changed successfully!",
    })
  } catch (error: any) {
    console.error("[email-change] PUT error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
