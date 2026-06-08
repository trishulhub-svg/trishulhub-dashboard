import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isPrivateHost } from "@/lib/ssrf"
import { isValidEmail } from "@/lib/email"
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

// ── AES-256-GCM encryption helpers ──
const ALGO = "aes-256-gcm"

function encrypt(text: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "default-dev-key-must-be-32!", "utf8").slice(0, 32)
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGO, key, iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

function decrypt(encrypted: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "default-dev-key-must-be-32!", "utf8").slice(0, 32)
  const [ivHex, authTagHex, encryptedData] = encrypted.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encryptedData, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

// I22: Note — error response formats across endpoints are inconsistent (some use `error`+`detail`+`code`, others just `error`).
// Future: standardize to a single error envelope shape across all API routes.

// GET /api/smtp - List SMTP configurations (SUPER_ADMIN only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    // Auto-migrate: ensure SmtpConfig table exists
    const migrateResult = await ensureTablesExist()
    if (!migrateResult.success) {
      return NextResponse.json({ error: "Failed to process SMTP configuration" }, { status: 500 })
    }

    const configs = await db.smtpConfig.findMany({
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        host: true,
        port: true,
        username: true,
        // SECURITY: Never return password in API response
        fromEmail: true,
        fromName: true,
        secure: true,
        isPrimary: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Mask passwords - indicate if set or not
    const masked = configs.map(c => ({
      ...c,
      passwordSet: true, // If it exists in DB, it's set (we excluded it from select)
    }))

    return NextResponse.json(masked)
  } catch (error: any) {
    console.error("[smtp] Error:", error.message)
    return NextResponse.json({ error: "Failed to process SMTP configuration" }, { status: 500 })
  }
}

// POST /api/smtp - Create SMTP configuration (SUPER_ADMIN only)
// NOTE: We do NOT re-test SMTP connection here to avoid Vercel Hobby 10s timeout.
// The user must test via the separate /api/smtp/test endpoint before clicking Add.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    // Auto-migrate: ensure SmtpConfig and EmailVerification tables exist
    const migrateResult = await ensureTablesExist()
    if (!migrateResult.success) {
      return NextResponse.json({ error: "Failed to process SMTP configuration" }, { status: 500 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { host, port, username, password, fromEmail, fromName, secure, isPrimary } = body

    // Validate required fields
    if (!host || !username || !password || !fromEmail) {
      return NextResponse.json({ error: "Host, username, password, and from email are required" }, { status: 400 })
    }

    // SSRF protection: block private/internal IPs (async — includes DNS rebinding check)
    if (await isPrivateHost(host)) {
      return NextResponse.json({ error: "Private/internal IP addresses are not allowed. Use a public SMTP server." }, { status: 400 })
    }

    // Validate fromEmail format
    if (!isValidEmail(fromEmail)) {
      return NextResponse.json({ error: "Invalid from email format" }, { status: 400 })
    }

    // Validate port range
    const portNum = port || 587
    if (portNum < 1 || portNum > 65535) {
      return NextResponse.json({ error: "Port must be between 1 and 65535" }, { status: 400 })
    }

    // NOTE: SMTP connection test is NOT performed here anymore.
    // The user must test the connection via the /api/smtp/test endpoint first.
    // This prevents Vercel Hobby 10-second function timeouts caused by
    // the SMTP handshake (5-10s) + DB operations combined exceeding the limit.

    // If this is set as primary, unset any existing primary
    if (isPrimary !== false) {
      await db.smtpConfig.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const config = await db.smtpConfig.create({
      data: {
        host,
        port: port || 587,
        username,
        password: encrypt(password), // C7: Encrypt password before storage
        fromEmail,
        fromName: fromName || "TrishulHub",
        secure: secure || false,
        isPrimary: isPrimary !== false,
        isActive: true,
      },
      select: {
        id: true,
        host: true,
        port: true,
        username: true,
        fromEmail: true,
        fromName: true,
        secure: true,
        isPrimary: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    console.log("[smtp] POST: SMTP config created successfully:", config.id)
    return NextResponse.json(config, { status: 201 })
  } catch (error: any) {
    console.error("[smtp] Error:", error.message)
    // C8: Generic error message — don't leak internal details
    let errorMsg = "Failed to process SMTP configuration"
    if (error.code === "P2002") {
      errorMsg = "An SMTP config with these details already exists"
    }
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}

// PATCH /api/smtp - Update SMTP configuration (SUPER_ADMIN only)
// NOTE: We do NOT re-test SMTP connection here to avoid Vercel Hobby 10s timeout.
// The user must test via the separate /api/smtp/test endpoint before saving changes.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { id, host, port, username, password, fromEmail, fromName, secure, isPrimary, isActive } = body

    if (!id) return NextResponse.json({ error: "SMTP config ID is required" }, { status: 400 })

    const existing = await db.smtpConfig.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "SMTP config not found" }, { status: 404 })

    // SECURITY: SSRF protection — block private/internal IPs on host update (async — includes DNS rebinding check)
    if (host && (await isPrivateHost(host))) {
      return NextResponse.json({ error: "Private/internal IP addresses are not allowed. Use a public SMTP server." }, { status: 400 })
    }

    // SECURITY: Validate fromEmail format if provided
    if (fromEmail && !isValidEmail(fromEmail)) {
      return NextResponse.json({ error: "Invalid from email format" }, { status: 400 })
    }

    // SECURITY: Validate port range
    if (port !== undefined && (port < 1 || port > 65535)) {
      return NextResponse.json({ error: "Port must be between 1 and 65535" }, { status: 400 })
    }

    // SECURITY: Whitelist allowed fields only
    const data: Record<string, any> = {}
    if (host !== undefined) data.host = host
    if (port !== undefined) data.port = port
    if (username !== undefined) data.username = username
    if (password) data.password = encrypt(password) // C7: Encrypt password before storage
    if (fromEmail !== undefined) data.fromEmail = fromEmail
    if (fromName !== undefined) data.fromName = fromName
    if (secure !== undefined) data.secure = secure
    if (isActive !== undefined) data.isActive = isActive

    // C12: If setting this as primary, wrap in transaction to prevent race condition
    if (isPrimary) {
      await db.$transaction([
        db.smtpConfig.updateMany({
          where: { isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        }),
        db.smtpConfig.update({
          where: { id },
          data: { ...data, isPrimary: true },
          select: {
            id: true, host: true, port: true, username: true, fromEmail: true, fromName: true,
            secure: true, isPrimary: true, isActive: true, createdAt: true, updatedAt: true,
          },
        }),
      ])

      // Fetch the updated config for the response
      const config = await db.smtpConfig.findUnique({
        where: { id },
        select: {
          id: true, host: true, port: true, username: true, fromEmail: true, fromName: true,
          secure: true, isPrimary: true, isActive: true, createdAt: true, updatedAt: true,
        },
      })
      return NextResponse.json(config)
    }

    // NOTE: SMTP connection test is NOT performed here anymore to avoid timeouts.
    // Use /api/smtp/test to verify connection before saving.

    const config = await db.smtpConfig.update({
      where: { id },
      data,
      select: {
        id: true,
        host: true,
        port: true,
        username: true,
        fromEmail: true,
        fromName: true,
        secure: true,
        isPrimary: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(config)
  } catch (error: any) {
    console.error("[smtp] Error:", error.message)
    // C8: Generic error message — don't leak internal details
    return NextResponse.json({ error: "Failed to process SMTP configuration" }, { status: 500 })
  }
}

// DELETE /api/smtp - Delete SMTP configuration (SUPER_ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    // W36: NOTE — Currently uses query param for ID. In a future refactor, the frontend
    // should send the ID in the request body or use a path parameter (e.g., DELETE /api/smtp/:id).
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "SMTP config ID is required" }, { status: 400 })

    const existing = await db.smtpConfig.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "SMTP config not found" }, { status: 404 })

    await db.smtpConfig.delete({ where: { id } })

    // If we deleted the primary, make the remaining one primary (if any)
    if (existing.isPrimary) {
      const remaining = await db.smtpConfig.findFirst({ orderBy: { createdAt: "asc" } })
      if (remaining) {
        await db.smtpConfig.update({ where: { id: remaining.id }, data: { isPrimary: true } })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[smtp] Error:", error.message)
    return NextResponse.json({ error: "Failed to process SMTP configuration" }, { status: 500 })
  }
}

// Helper: Auto-migrate - create SmtpConfig and EmailVerification tables if they don't exist
// This avoids needing to run `npx prisma db push` manually on Turso
// Returns { success, error? } so callers know if migration succeeded
let tablesChecked = false
let tablesExist = false
async function ensureTablesExist(): Promise<{ success: boolean; error?: string }> {
  if (tablesChecked && tablesExist) return { success: true }

  try {
    // Quick check: try to count SmtpConfig - if table exists, this succeeds
    await db.smtpConfig.count({ take: 1 })
    tablesChecked = true
    tablesExist = true
    return { success: true }
  } catch (initialErr: any) {
    // Table doesn't exist - create it
    console.log("[smtp] SmtpConfig table not found, auto-creating...", initialErr.message)
  }

  // Try creating tables with raw SQL
  let smtpTableCreated = false
  let emailTableCreated = false

  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SmtpConfig" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "host" TEXT NOT NULL,
        "port" INTEGER NOT NULL DEFAULT 587,
        "username" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "fromEmail" TEXT NOT NULL,
        "fromName" TEXT NOT NULL DEFAULT 'TrishulHub',
        "secure" INTEGER NOT NULL DEFAULT 0,
        "isPrimary" INTEGER NOT NULL DEFAULT 1,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    smtpTableCreated = true
    console.log("[smtp] SmtpConfig table created successfully")
  } catch (err: any) {
    console.error("[smtp] Failed to create SmtpConfig table:", err.message)
    return { success: false, error: `Failed to create SmtpConfig: ${err.message}` }
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
    emailTableCreated = true
    console.log("[smtp] EmailVerification table created successfully")
  } catch (err: any) {
    console.error("[smtp] Failed to create EmailVerification table:", err.message)
    // SmtpConfig is the critical one - EmailVerification is non-blocking
  }

  // Create indexes (non-blocking)
  if (emailTableCreated) {
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_userId_idx" ON "EmailVerification"("userId")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_newEmail_idx" ON "EmailVerification"("newEmail")`) } catch {}
    try { await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt")`) } catch {}
  }

  // Verify the SmtpConfig table actually exists now
  try {
    await db.smtpConfig.count({ take: 1 })
    tablesChecked = true
    tablesExist = true
    console.log("[smtp] Tables verified and ready")
    return { success: true }
  } catch (verifyErr: any) {
    console.error("[smtp] Table verification failed after creation:", verifyErr.message)
    tablesChecked = false
    tablesExist = false
    return { success: false, error: `Table creation may have failed: ${verifyErr.message}` }
  }
}
