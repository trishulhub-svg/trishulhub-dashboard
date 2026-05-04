import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import nodemailer from "nodemailer"
import { isPrivateHost } from "@/lib/ssrf"

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

    const isSecure = secure || false
    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
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
    } catch (error: any) {
      try { await transporter.close() } catch {}
      return NextResponse.json({ success: false, error: `Connection failed: ${error.message}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error("[smtp-test] error:", error.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
