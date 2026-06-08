import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { sendEmailWithFailover } from "@/lib/email"

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", INR: "₹" }
  return symbols[currency] || currency
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const rl = rateLimit(`contracts-send:${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(rl.resetAt) } }
    )

    await ensureAllTables()

    // Issue #19: req.json() try/catch
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { contractId } = body as Record<string, unknown>
    if (!contractId || typeof contractId !== 'string') return NextResponse.json({ error: "Contract ID is required" }, { status: 400 })

    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(contractId)) {
      return NextResponse.json({ error: "Invalid contract ID format" }, { status: 400 })
    }

    const contract = await db.contract.findUnique({ where: { id: contractId } })
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 })

    // Validate client email format
    if (!contract.clientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contract.clientEmail)) {
      return NextResponse.json({ error: "Client email is invalid or missing" }, { status: 400 })
    }

    // HTML-escape helper to prevent XSS in email
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const currencySymbol = getCurrencySymbol(contract.currency || "INR")

    // Convert markdown-like terms to safe HTML
    const termsHtml = contract.termsAndConditions
      ? contract.termsAndConditions
          .split('\n')
          .map((line: string) => {
            const trimmed = line.trim()
            if (trimmed.startsWith('## ')) {
              return `</p><h3 style="color: #E85D04; margin-top: 20px;">${esc(trimmed.slice(3))}</h3><p>`
            }
            if (trimmed.startsWith('# ')) {
              return `</p><h2 style="color: #333; margin-top: 24px;">${esc(trimmed.slice(2))}</h2><p>`
            }
            // Escape HTML first, then restore **bold** markers
            const escaped = esc(trimmed)
            return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          })
          .join('<br/>')
      : "<p>Contract terms and conditions will be available in the signed document.</p>"

    // Build HTML email with contract content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="background: #E85D04; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">TrishulHub</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">AI-Powered Web Development</p>
        </div>
        <div style="border: 1px solid #e5e7eb; padding: 30px; background: white;">
          <h2 style="color: #333; margin-top: 0;">Contract: ${esc(contract.title)}</h2>
          <p><strong>Contract Number:</strong> ${esc(contract.contractNumber)}</p>
          <p><strong>Client:</strong> ${esc(contract.clientName)}</p>
          <p><strong>Project:</strong> ${esc(contract.projectName || "N/A")}</p>
          ${contract.totalValue ? `<p><strong>Contract Value:</strong> ${esc(currencySymbol)}${Number(contract.totalValue).toLocaleString()}</p>` : ""}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <div style="line-height: 1.6; color: #444;">
            ${termsHtml}
          </div>
        </div>
        <div style="background: #f9fafb; padding: 15px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; text-align: center; color: #6b7280; font-size: 12px;">
          <p>This contract was sent via TrishulHub Contract Management System.</p>
          <p>&copy; ${new Date().getFullYear()} TrishulHub. All rights reserved.</p>
        </div>
      </div>
    `

    const textContent = `Contract: ${contract.title}\nContract Number: ${contract.contractNumber}\nClient: ${contract.clientName}\n\nPlease review the contract terms and conditions.\n\n${contract.termsAndConditions || "Terms to be provided in signed document."}`

    const result = await sendEmailWithFailover({
      to: contract.clientEmail,
      subject: `Contract: ${contract.title} [${contract.contractNumber}]`,
      html: htmlContent,
      text: textContent,
      type: "CONTRACT",
      triggeredBy: session.user.id,
    })

    if (result.success) {
      await db.contract.update({
        where: { id: contractId }, // contractId is validated as string above
        data: { status: "SENT", sentAt: new Date(), sentVia: "email" },
      })
      return NextResponse.json({ success: true, message: "Contract sent successfully" })
    } else {
      return NextResponse.json({ error: result.error || "Failed to send contract" }, { status: 500 })
    }
  } catch (error: unknown) {
    console.error("[contracts/send] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to send contract" }, { status: 500 })
  }
}
