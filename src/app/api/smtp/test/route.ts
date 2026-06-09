import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import nodemailer from "nodemailer"
import { isPrivateHost } from "@/lib/ssrf"
import { rateLimit } from "@/lib/rate-limit"

// POST /api/smtp/test - Test SMTP connection (SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can test SMTP" }, { status: 403 })
    }

    // C9: Rate limit — 10 attempts per 5 minutes
    const rl = rateLimit(`smtp-test-${session.user.id}`, 10, 300000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many test attempts. Try again in 5 minutes." }, { status: 429 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { host, port, username, password, secure } = body

    if (!host || !username || !password) {
      return NextResponse.json({ error: "Host, username, and password are required" }, { status: 400 })
    }

    // N-012: Validate port range (1-65535)
    const portNum = port || 587
    if (typeof portNum !== "number" || portNum < 1 || portNum > 65535) {
      return NextResponse.json({ error: "Port must be a number between 1 and 65535" }, { status: 400 })
    }

    // SSRF protection: block private/internal IP addresses (async — includes DNS rebinding check)
    if (await isPrivateHost(host)) {
      return NextResponse.json({ error: "Private/internal IP addresses are not allowed. Use a public SMTP server." }, { status: 400 })
    }

    const isSecure = secure || false
    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure: isSecure, // true = implicit TLS (port 465), false = STARTTLS (port 587)
      requireTLS: !isSecure, // When secure=false, upgrade to TLS via STARTTLS
      auth: { user: username, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    })

    try {
      await transporter.verify()
      await transporter.close()
      return NextResponse.json({ success: true, message: "SMTP connection successful!" })
    } catch (error: unknown) {
      try { await transporter.close() } catch {}
      // C9: Sanitize error — don't expose server banners or internal details
      console.error("[smtp-test] Connection failed:", error instanceof Error ? error.message : String(error))
      return NextResponse.json({ success: false, error: "Connection failed. Check host and port settings." })
    }
  } catch (error: unknown) {
    console.error("[smtp-test] Error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
