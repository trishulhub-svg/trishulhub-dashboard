import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { sendInvoiceEmail, isValidEmail } from "@/lib/email"

/**
 * POST /api/invoices/send
 *
 * Sends an invoice to the client's email address via the configured SMTP servers
 * (with automatic failover). On successful delivery the invoice's status is
 * updated to "SENT" and sentById is recorded. All email events are logged to the
 * EmailLog table with type="INVOICE" for the audit trail.
 *
 * Body: { invoiceId: string }
 *
 * Auth: ADMIN / SUPER_ADMIN only.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const userId = session.user.id
    const rl = rateLimit(`invoices-send:${userId}`, RATE_LIMITS.invoiceSend.limit, RATE_LIMITS.invoiceSend.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const { invoiceId } = body as { invoiceId?: unknown }
    if (!invoiceId || typeof invoiceId !== "string") {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoice ID format" }, { status: 400 })
    }

    // Fetch invoice + client + project
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        client: { select: { id: true, name: true, company: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    })
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    if (!invoice.client) {
      return NextResponse.json({ error: "Invoice has no associated client" }, { status: 400 })
    }

    const clientEmail = invoice.client.email
    if (!clientEmail || !isValidEmail(clientEmail)) {
      return NextResponse.json(
        { error: "Client email is invalid or missing. Update the client's email before sending." },
        { status: 400 }
      )
    }

    // Send the email via SMTP failover pipeline (logs to EmailLog automatically)
    const result = await sendInvoiceEmail({
      to: clientEmail,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        gst: invoice.gst,
        gstPercent: invoice.gstPercent,
        total: invoice.total,
        dueDate: invoice.dueDate,
        paymentMethod: invoice.paymentMethod,
        paymentStatus: invoice.paymentStatus,
        notes: invoice.notes,
      },
      client: {
        name: invoice.client.name,
        company: invoice.client.company,
      },
      project: invoice.project
        ? { name: invoice.project.name }
        : null,
      triggeredBy: session.user.id,
    })

    if (!result.success) {
      // Audit the failed send attempt (fire-and-forget)
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole,
        department: "BUSINESS", page: "invoices", action: "SEND",
        entityType: "Invoice", entityId: invoice.id,
        description: `Failed to email invoice ${invoice.invoiceNumber} to ${clientEmail}: ${result.error || "unknown error"}`,
        status: "FAILURE",
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      return NextResponse.json(
        { error: result.error || "Failed to send invoice email" },
        { status: 500 }
      )
    }

    // Email delivered (or at least queued by SMTP). Record the sender and — only
    // if the invoice is still a DRAFT — promote the status to SENT. We do NOT
    // downgrade PAID / OVERDUE invoices: emailing a paid invoice is treated as
    // "send a receipt", not a status change.
    const prevStatus = invoice.status
    const shouldPromoteToSent = prevStatus === "DRAFT"
    const updated = await db.$transaction(async (tx) => {
      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          // Only flip DRAFT → SENT; leave PAID / OVERDUE / SENT alone.
          ...(shouldPromoteToSent ? { status: "SENT" as const } : {}),
          sentById: session.user.id,
        },
        include: {
          client: { select: { id: true, name: true, company: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      })
    })

    // Audit: log successful invoice send (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "invoices", action: "SEND",
      entityType: "Invoice", entityId: invoice.id,
      description: shouldPromoteToSent
        ? `Emailed invoice ${invoice.invoiceNumber} to ${clientEmail} (method: ${result.method || "primary"}) — status changed ${prevStatus} → SENT`
        : `Emailed invoice ${invoice.invoiceNumber} to ${clientEmail} (method: ${result.method || "primary"}) — status remained ${prevStatus}`,
      oldValue: shouldPromoteToSent ? prevStatus : undefined,
      newValue: shouldPromoteToSent ? "SENT" : undefined,
      status: "SUCCESS",
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      metadata: JSON.stringify({ to: clientEmail, method: result.method || "primary" }),
    })

    return NextResponse.json({
      success: true,
      message: `Invoice emailed to ${clientEmail}`,
      data: updated,
    })
  } catch (error: unknown) {
    console.error("[invoices/send] POST error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to send invoice" }, { status: 500 })
  }
}
