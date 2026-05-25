import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateResetToken, sendPasswordResetEmail, logEmailEvent } from "@/lib/email"
import { invalidateSession } from "@/lib/session-manager"
import bcrypt from "bcryptjs"
import { createHash } from "crypto"

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

// Auto-migrate: ensure PasswordReset table exists
let resetTableChecked = false
let resetTableExists = false
async function ensurePasswordResetTable(): Promise<{ success: boolean; error?: string }> {
  if (resetTableChecked && resetTableExists) return { success: true }

  try {
    await (db as any).passwordReset.count({ take: 1 })
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
        "triggeredBy" TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordReset_token_idx" ON "PasswordReset"("token")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordReset_userId_idx" ON "PasswordReset"("userId")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PasswordReset_expiresAt_idx" ON "PasswordReset"("expiresAt")`) } catch {}
    console.log("[password-reset] PasswordReset table created successfully")
  } catch (err: any) {
    console.error("[password-reset] Failed to create PasswordReset table:", err.message)
    resetTableChecked = false
    resetTableExists = false
    return { success: false, error: err.message }
  }

  try {
    await (db as any).passwordReset.count({ take: 1 })
    resetTableChecked = true
    resetTableExists = true
    return { success: true }
  } catch (err: any) {
    resetTableChecked = false
    resetTableExists = false
    return { success: false, error: err.message }
  }
}

// POST /api/password-reset - SuperAdmin sends reset link OR directly resets password
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminRole = session.user.role
    if (adminRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can reset passwords" }, { status: 403 })
    }

    // Auto-migrate: ensure PasswordReset table exists
    await ensurePasswordResetTable()

    const adminUserId = session.user.id
    const body = await req.json()
    const { userId, action } = body

    // action: "send_link" or "direct_reset"
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    if (!action || (action !== "send_link" && action !== "direct_reset")) {
      return NextResponse.json({ error: "Action must be 'send_link' or 'direct_reset'" }, { status: 400 })
    }

    // Find the target user
    const targetUser = await db.user.findUnique({ where: { id: userId } })
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Prevent resetting SUPER_ADMIN passwords
    if (targetUser.role === "SUPER_ADMIN" && targetUser.id !== adminUserId) {
      return NextResponse.json({ error: "Cannot reset another SUPER_ADMIN's password" }, { status: 403 })
    }

    if (action === "send_link") {
      // ── Send reset link to user's registered email ──
      // Generate secure token
      const token = generateResetToken()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Clean up any existing unused tokens for this user
      await (db as any).passwordReset.deleteMany({
        where: { userId, used: false },
      })

      // Save the reset token
      await (db as any).passwordReset.create({
        data: {
          userId,
          token: hashToken(token),
          expiresAt,
          triggeredBy: adminUserId,
        },
      })

      // Send reset email
      const emailResult = await sendPasswordResetEmail(
        targetUser.email,
        token,
        targetUser.name,
        adminUserId
      )

      if (!emailResult.success) {
        // Delete the token if email failed
        await (db as any).passwordReset.deleteMany({ where: { userId, token: hashToken(token) } })
        return NextResponse.json({ error: `Failed to send reset email: ${emailResult.error}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: `Password reset link sent to ${targetUser.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")}`,
      })
    }

    if (action === "direct_reset") {
      // ── Direct password reset by SuperAdmin (for inaccessible email) ──
      const { newPassword } = body

      if (!newPassword) {
        return NextResponse.json({ error: "New password is required for direct reset" }, { status: 400 })
      }

      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
      }

      // FIX: Enforce password complexity (same as self-service password change)
      if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        return NextResponse.json({ error: "Password must contain at least one letter and one number" }, { status: 400 })
      }

      // Hash and update the password
      const hashedPassword = await bcrypt.hash(newPassword, 12)
      await db.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      })

      // SECURITY: Invalidate the target user's session so they must re-login with new password
      try {
        await invalidateSession(userId)
        console.log("[password-reset] Session invalidated for user", userId, "after direct reset")
      } catch (err) {
        console.error("[password-reset] Failed to invalidate session after direct reset:", err)
        // Non-blocking: the password reset still succeeded
      }

      // Log this action for audit
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
          targetUserEmail: targetUser.email,
        }),
      })

      return NextResponse.json({
        success: true,
        message: `Password reset successfully for ${targetUser.name}`,
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error: any) {
    console.error("[password-reset] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PUT /api/password-reset - Verify reset token and set new password (public - no auth required)
export async function PUT(req: NextRequest) {
  try {
    // Auto-migrate: ensure PasswordReset table exists
    await ensurePasswordResetTable()

    const body = await req.json()
    const { token, newPassword } = body

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Enforce password complexity (same as self-service password change)
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json({ error: "Password must contain at least one letter and one number" }, { status: 400 })
    }

    // Find the reset token
    const resetRecord = await (db as any).passwordReset.findUnique({
      where: { token: hashToken(token) },
    })

    if (!resetRecord) {
      return NextResponse.json({ error: "Invalid reset token. Please request a new one." }, { status: 400 })
    }

    // Check if token is already used
    if (resetRecord.used) {
      return NextResponse.json({ error: "This reset link has already been used. Please request a new one." }, { status: 400 })
    }

    // Check if token is expired
    if (new Date(resetRecord.expiresAt) < new Date()) {
      await (db as any).passwordReset.delete({ where: { id: resetRecord.id } })
      return NextResponse.json({ error: "Reset link has expired. Please request a new one." }, { status: 400 })
    }

    // Find the user
    const user = await db.user.findUnique({ where: { id: resetRecord.userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Hash and update the password
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })

    // SECURITY: Invalidate the user's session so they must re-login with new password
    try {
      await invalidateSession(user.id)
      console.log("[password-reset] Session invalidated for user", user.id, "after link reset")
    } catch (err) {
      console.error("[password-reset] Failed to invalidate session after link reset:", err)
      // Non-blocking: the password reset still succeeded
    }

    // Mark token as used
    await (db as any).passwordReset.update({
      where: { id: resetRecord.id },
      data: { used: true },
    })

    // Clean up all other reset tokens for this user
    await (db as any).passwordReset.deleteMany({
      where: { userId: user.id, id: { not: resetRecord.id } },
    })

    // Log the event
    await logEmailEvent({
      to: user.email,
      subject: "Password Reset Completed",
      type: "RESET_LINK",
      status: "SENT",
      triggeredBy: resetRecord.triggeredBy,
      metadata: JSON.stringify({ action: "password_reset_via_link", userId: user.id }),
    })

    return NextResponse.json({
      success: true,
      message: "Password reset successfully! You can now log in with your new password.",
    })
  } catch (error: any) {
    console.error("[password-reset] PUT error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// GET /api/password-reset - Validate a reset token (check if valid before showing form)
export async function GET(req: NextRequest) {
  try {
    // Auto-migrate: ensure PasswordReset table exists
    await ensurePasswordResetTable()

    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 })
    }

    const resetRecord = await (db as any).passwordReset.findUnique({
      where: { token: hashToken(token) },
    })

    if (!resetRecord) {
      return NextResponse.json({ valid: false, error: "Invalid token" })
    }

    if (resetRecord.used) {
      return NextResponse.json({ valid: false, error: "Token already used" })
    }

    if (new Date(resetRecord.expiresAt) < new Date()) {
      await (db as any).passwordReset.delete({ where: { id: resetRecord.id } })
      return NextResponse.json({ valid: false, error: "Token expired" })
    }

    // Get user info for the form
    const user = await db.user.findUnique({
      where: { id: resetRecord.userId },
      select: { name: true, email: true },
    })

    return NextResponse.json({
      valid: true,
      userName: user?.name,
      userEmail: user?.email?.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    })
  } catch (error: any) {
    console.error("[password-reset] GET error:", error.message)
    return NextResponse.json({ valid: false, error: "An error occurred" })
  }
}
