import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import nodemailer from "nodemailer"
import { isIP } from "net"

// SSRF protection: block private/internal IPs
function isPrivateHost(host: string): boolean {
  const cleaned = host.replace(/\[|\]/g, "")
  const ipVersion = isIP(cleaned)
  if (ipVersion === 0) {
    if (cleaned === "localhost" || cleaned.endsWith(".local") || cleaned.endsWith(".internal")) return true
    return false
  }
  if (ipVersion === 4) {
    const parts = cleaned.split(".").map(Number)
    const [a, b] = parts
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true
    if (a === 169 && b === 254) return true
  }
  if (ipVersion === 6) {
    const lower = cleaned.toLowerCase()
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true
  }
  return false
}

// GET /api/smtp - List SMTP configurations (SUPER_ADMIN only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
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
    console.error("[smtp] GET error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/smtp - Create SMTP configuration (SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    const body = await req.json()
    const { host, port, username, password, fromEmail, fromName, secure, isPrimary } = body

    // Validate required fields
    if (!host || !username || !password || !fromEmail) {
      return NextResponse.json({ error: "Host, username, password, and from email are required" }, { status: 400 })
    }

    // SSRF protection: block private/internal IPs
    if (isPrivateHost(host)) {
      return NextResponse.json({ error: "Private/internal IP addresses are not allowed. Use a public SMTP server." }, { status: 400 })
    }

    // Limit to 2 SMTP configurations max
    const existingCount = await db.smtpConfig.count()
    if (existingCount >= 2) {
      return NextResponse.json({ error: "Maximum 2 SMTP configurations allowed. Delete one first." }, { status: 400 })
    }

    // Validate SMTP connection before saving
    const testResult = await testSmtpConnection({ host, port: port || 587, username, password, secure: secure || false })
    if (!testResult.success) {
      return NextResponse.json({ error: `SMTP connection test failed: ${testResult.error}` }, { status: 400 })
    }

    // If this is set as primary, unset any existing primary
    if (isPrimary) {
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
        password, // Stored in DB - protected by Turso auth token
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

    return NextResponse.json(config, { status: 201 })
  } catch (error: any) {
    console.error("[smtp] POST error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// PATCH /api/smtp - Update SMTP configuration (SUPER_ADMIN only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

    const body = await req.json()
    const { id, host, port, username, password, fromEmail, fromName, secure, isPrimary, isActive } = body

    if (!id) return NextResponse.json({ error: "SMTP config ID is required" }, { status: 400 })

    const existing = await db.smtpConfig.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "SMTP config not found" }, { status: 404 })

    // SECURITY: Whitelist allowed fields only
    const data: Record<string, any> = {}
    if (host !== undefined) data.host = host
    if (port !== undefined) data.port = port
    if (username !== undefined) data.username = username
    if (password !== undefined) data.password = password // New password if provided
    if (fromEmail !== undefined) data.fromEmail = fromEmail
    if (fromName !== undefined) data.fromName = fromName
    if (secure !== undefined) data.secure = secure
    if (isActive !== undefined) data.isActive = isActive

    // If setting this as primary, unset any existing primary
    if (isPrimary) {
      await db.smtpConfig.updateMany({
        where: { isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      })
      data.isPrimary = true
    }

    // Test connection if host/credentials changed
    const needsTest = host || port || username || password || secure
    if (needsTest) {
      const testResult = await testSmtpConnection({
        host: (host as string) || existing.host,
        port: (port as number) || existing.port,
        username: (username as string) || existing.username,
        password: (password as string) || existing.password,
        secure: secure !== undefined ? secure : existing.secure,
      })
      if (!testResult.success) {
        return NextResponse.json({ error: `SMTP connection test failed: ${testResult.error}` }, { status: 400 })
      }
    }

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
    console.error("[smtp] PATCH error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/smtp - Delete SMTP configuration (SUPER_ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can manage SMTP settings" }, { status: 403 })
    }

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
    console.error("[smtp] DELETE error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/smtp - Test SMTP connection (handled via query param)
// This is integrated into the POST handler (test before save)

// Helper: Test SMTP connection
async function testSmtpConnection(config: {
  host: string
  port: number
  username: string
  password: string
  secure: boolean
}): Promise<{ success: boolean; error?: string }> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  })

  try {
    await transporter.verify()
    await transporter.close()
    return { success: true }
  } catch (error: any) {
    try { await transporter.close() } catch {}
    return { success: false, error: error.message }
  }
}
