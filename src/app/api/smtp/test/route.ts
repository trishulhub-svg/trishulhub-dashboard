import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import nodemailer from "nodemailer"
import { isIP } from "net"

// Check if a host is a private/internal IP (SSRF protection)
function isPrivateHost(host: string): boolean {
  // Remove brackets from IPv6 notation
  const cleaned = host.replace(/\[|\]/g, "")

  // Check if it's an IP address
  const ipVersion = isIP(cleaned)
  if (ipVersion === 0) {
    // It's a domain name, not an IP - check for localhost
    if (cleaned === "localhost" || cleaned.endsWith(".local") || cleaned.endsWith(".internal")) {
      return true
    }
    return false
  }

  // IPv4 checks
  if (ipVersion === 4) {
    const parts = cleaned.split(".").map(Number)
    const [a, b] = parts
    // 127.x.x.x (loopback), 10.x.x.x (private), 172.16-31.x.x (private), 192.168.x.x (private), 0.x.x.x
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return true
    }
    // 169.254.x.x (link-local / cloud metadata)
    if (a === 169 && b === 254) return true
  }

  // IPv6 checks
  if (ipVersion === 6) {
    const lower = cleaned.toLowerCase()
    if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
      return true
    }
  }

  return false
}

// POST /api/smtp/test - Test SMTP connection (SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = (session.user as any)?.role
    if (userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only SUPER_ADMIN can test SMTP" }, { status: 403 })
    }

    const body = await req.json()
    const { host, port, username, password, secure } = body

    if (!host || !username || !password) {
      return NextResponse.json({ error: "Host, username, and password are required" }, { status: 400 })
    }

    // SSRF protection: block private/internal IP addresses
    if (isPrivateHost(host)) {
      return NextResponse.json({ error: "Private/internal IP addresses are not allowed. Use a public SMTP server." }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: secure || false,
      auth: { user: username, pass: password },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    })

    try {
      await transporter.verify()
      await transporter.close()
      return NextResponse.json({ success: true, message: "SMTP connection successful!" })
    } catch (error: any) {
      try { await transporter.close() } catch {}
      return NextResponse.json({ success: false, error: `Connection failed: ${error.message}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[smtp-test] error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
