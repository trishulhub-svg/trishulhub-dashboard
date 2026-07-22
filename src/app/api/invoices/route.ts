import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { createInvoiceSchema, updateInvoiceSchema, validateRequest } from "@/lib/validations"
// Note: deepSanitize is actually a deep clone, not XSS sanitization
import { deepSanitize } from "@/lib/utils"
import { ensureAllTables } from "@/lib/auto-migrate"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { COMPANY_DEFAULT_CURRENCY, normalizeCurrency, roundMoney } from "@/lib/money"

// GET /api/invoices — CLIENT sees own; staff finance is ADMIN/SUPER_ADMIN only
// (PROJECT_MANAGER / DEVELOPER / VIEWER must not read finance data)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`invoices-get:${userId}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const userRole = session.user.role
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 100)
    const offset = (page - 1) * limit
    const status = searchParams.get("status") || ""

    // CLIENT users can only see their own invoices
    if (userRole === "CLIENT") {
      const client = await db.client.findFirst({ where: { userId } })
      const where: Prisma.InvoiceWhereInput = client ? { clientId: client.id } : { clientId: "__none__" }
      if (status && status !== "ALL") where.status = status

      const [invoices, total] = await Promise.all([
        db.invoice.findMany({
          where,
          include: { client: true, project: true },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        db.invoice.count({ where }),
      ])
      return NextResponse.json({
        data: invoices,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      })
    }

    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const where: Prisma.InvoiceWhereInput = {}
    if (status && status !== "ALL") where.status = status

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, company: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.invoice.count({ where }),
    ])
    return NextResponse.json({
      data: invoices,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: unknown) {
    console.error("[invoices] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 })
  }
}

// POST /api/invoices - Create invoice (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureAllTables()

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`invoices-post:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { invoiceNumber?: string; clientId?: string; projectId?: string; items?: unknown; subtotal?: number; tax?: number; total?: number; dueDate?: string; status?: string; paymentMethod?: string; gst?: number; gstPercent?: number; notes?: string; paymentStatus?: string; currency?: string; [key: string]: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // Zod validation as an additional layer
    const validation = validateRequest(createInvoiceSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { invoiceNumber, clientId, projectId, items, subtotal, tax, total, dueDate, paymentMethod, gst, gstPercent, notes, paymentStatus, currency } = validation.data

    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
    }

    // Negative amount validation
    if (total !== undefined && total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
    if (tax !== undefined && tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })
    if (subtotal !== undefined && subtotal < 0) return NextResponse.json({ error: "Subtotal cannot be negative" }, { status: 400 })
    if (gst !== undefined && gst < 0) return NextResponse.json({ error: "GST cannot be negative" }, { status: 400 })

    const safeSub = roundMoney(subtotal ?? 0)
    const safeTax = roundMoney(tax ?? 0)
    const safeGst = roundMoney(typeof gst === "number" ? gst : 0)
    const safeCurrency = normalizeCurrency(currency, COMPANY_DEFAULT_CURRENCY)

    // Generate invoice number if not provided (crypto-based for uniqueness)
    const autoInvoiceNumber = invoiceNumber || `INV-${crypto.randomUUID().split("-")[0].toUpperCase()}`

    // H-FIN-4: Uniqueness check on invoiceNumber — wrapped in transaction to prevent race conditions
    let invoice
    try {
      invoice = await db.$transaction(async (tx) => {
        const existingInvoice = await tx.invoice.findFirst({ where: { invoiceNumber: autoInvoiceNumber } })
        if (existingInvoice) throw new Error("DUPLICATE_INVOICE_NUMBER")

        const inv = await tx.invoice.create({
          data: {
            invoiceNumber: deepSanitize(autoInvoiceNumber),
            clientId,
            projectId: projectId || null,
            items: items ? (typeof items === "string" ? items : JSON.stringify(items)) : "[]",
            subtotal: safeSub,
            tax: safeTax,
            total: roundMoney(safeSub + safeTax + safeGst),
            currency: safeCurrency,
            // SECURITY: Always create as DRAFT — ignore client-provided status
            status: "DRAFT",
            dueDate: dueDate ? new Date(dueDate) : null,
            paymentMethod: typeof paymentMethod === 'string' ? paymentMethod : null,
            gst: typeof gst === 'number' ? safeGst : null,
            gstPercent: typeof gstPercent === 'number' ? gstPercent : null,
            // INV-04: length-limit user-controlled string fields
            notes: typeof notes === 'string' ? deepSanitize(notes.slice(0, 5000)) : null,
            paymentStatus: typeof paymentStatus === 'string' ? paymentStatus : "UNPAID",
            // SECURITY: Auto-set sentById from session — ignore client-provided value
            sentById: session.user.id,
          },
        })
        return inv
      })
    } catch (txError: unknown) {
      if (txError instanceof Error && txError.message === "DUPLICATE_INVOICE_NUMBER") {
        return NextResponse.json({ error: "Invoice number already exists" }, { status: 409 })
      }
      // P2002 = Prisma unique constraint violation (race condition: two concurrent
      // inserts picked the same invoice number). Surface a friendly 409 to the user.
      if (txError && typeof txError === "object" && "code" in txError && (txError as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Invoice number already exists. Please try again." }, { status: 409 })
      }
      throw txError
    }
    // Audit: log invoice creation (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "invoices", action: "CREATE",
      entityType: "Invoice", entityId: invoice.id,
      description: `Created invoice: ${invoice.invoiceNumber}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json({ data: invoice, message: "Invoice created" }, { status: 201 })
  } catch (error: unknown) {
    console.error("[invoices] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 })
  }
}

// PATCH /api/invoices - Update invoice status/details
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureAllTables()

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`invoices-patch:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // M-FIN-11: Zod validation for PATCH
    const validation = validateRequest(updateInvoiceSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { id, ...data } = validation.data

    if (!id) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
    }

    // Negative amount validation
    if (data.total !== undefined && data.total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
    if (data.tax !== undefined && data.tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })
    if (data.subtotal !== undefined && data.subtotal < 0) return NextResponse.json({ error: "Subtotal cannot be negative" }, { status: 400 })
    if (data.gst !== undefined && data.gst < 0) return NextResponse.json({ error: "GST cannot be negative" }, { status: 400 })

    // M-FIN-1: Sanitize notes and invoiceNumber for stored XSS
    // Record<string, any> used for dynamic field loop assignment — intentional
    const sanitizedData: Record<string, any> = {}
    const allowedFields = ["invoiceNumber", "clientId", "projectId", "items", "subtotal", "tax", "total", "status", "dueDate", "paidAt", "paymentMethod", "gst", "gstPercent", "notes", "paymentStatus"]
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        if (key === "items" && typeof data[key] !== "string") {
          sanitizedData[key] = JSON.stringify(data[key])
        } else if (key === "dueDate" || key === "paidAt") {
          sanitizedData[key] = data[key] ? new Date(data[key] as string) : null
        } else if (key === "notes") {
          // Phase 7c: Defensive length slice (zod schema enforces max 5000, but explicit guard
          // protects against any future schema drift and ensures we never store oversized notes).
          sanitizedData[key] = typeof data[key] === "string" ? deepSanitize(data[key]).slice(0, 5000) : data[key]
        } else if (key === "invoiceNumber") {
          sanitizedData[key] = typeof data[key] === "string" ? deepSanitize(data[key]) : data[key]
        } else {
          sanitizedData[key] = data[key]
        }
      }
    }

    // If marking as PAID, set paidAt + paymentStatus automatically (unless caller explicitly set them)
    if (data.status === "PAID") {
      if (!data.paidAt && sanitizedData.paidAt === undefined) {
        sanitizedData.paidAt = new Date()
      }
      if (data.paymentStatus === undefined) {
        sanitizedData.paymentStatus = "PAID"
      }
    }

    // Requirement: the user MUST be able to edit ANY invoice regardless of status,
    // including changing status from PAID back to DRAFT / SENT / OVERDUE. Therefore
    // no status-transition guard and no paymentStatus-vs-status mismatch guard is
    // enforced. The only side-effect we apply is below (inside the transaction):
    // transitioning FROM PAID → non-PAID clears paidAt + resets paymentStatus
    // (unless the caller explicitly set those fields).

    // P11-INTEG-04: Wrap all DB operations in a transaction to prevent TOCTOU races
    // Use a sentinel to distinguish validation errors from the successful invoice result
    const TX_ERR = Symbol("TX_ERR")
    // Phase 7c: Fetch previous state INSIDE the transaction so the audit log
    // captures the true pre-update status (avoids stale reads from a separate
    // pre-transaction query that races with concurrent updates).
    const result = await db.$transaction(async (tx) => {
      // Fetch existing invoice for status-aware side-effects & total recompute
      const existing = await tx.invoice.findUnique({ where: { id } })
      if (!existing) {
        return { kind: TX_ERR, code: "NOT_FOUND" as const }
      }

      // Side-effect: transitioning away from PAID should reset paidAt + paymentStatus
      // (unless the caller explicitly set these fields in the request body).
      if (data.status && data.status !== "PAID" && existing.status === "PAID") {
        if (data.paidAt === undefined) {
          sanitizedData.paidAt = null
        }
        if (data.paymentStatus === undefined) {
          sanitizedData.paymentStatus = "UNPAID"
        }
      }

      // Recompute total from subtotal + tax + gst to ensure consistency.
      // Use existing values as fallback for any field the caller didn't provide.
      const bodyFields = body as Record<string, unknown>
      const needsRecompute = ["subtotal", "tax", "gst", "gstPercent"].some(f => bodyFields[f] !== undefined)
      if (needsRecompute || bodyFields.total !== undefined) {
        const sub = (sanitizedData.subtotal ?? existing.subtotal ?? 0)
        const taxVal = (sanitizedData.tax ?? existing.tax ?? 0)
        const gstVal = (sanitizedData.gst ?? existing.gst ?? 0)
        sanitizedData.total = sub + taxVal + gstVal
      }

      const invoice = await tx.invoice.update({
        where: { id },
        data: sanitizedData,
        include: { client: true, project: true },
      })
      // Return previous status + invoiceNumber captured atomically alongside the update
      // so the audit log accurately reflects the state transition that just occurred.
      return {
        kind: Symbol("OK"),
        invoice,
        prevStatus: existing.status,
        prevInvoiceNumber: existing.invoiceNumber,
      }
    })

    // Handle transaction-internal validation errors
    if (result.kind === TX_ERR) {
      if (result.code === "NOT_FOUND") {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
      }
      // Defensive: unknown error code — return generic 400 instead of silently returning null
      return NextResponse.json({ error: "Invoice update failed validation" }, { status: 400 })
    }

    // Audit: log invoice update — use STATUS_CHANGE when the status field was the primary change
    const updatedInvoice = result.invoice
    if (updatedInvoice) {
      const statusChanged = data.status !== undefined
      const prevStatus = result.prevStatus || "unknown"
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole,
        department: "BUSINESS", page: "invoices",
        action: statusChanged ? "STATUS_CHANGE" : "UPDATE",
        entityType: "Invoice", entityId: id,
        description: statusChanged
          ? `Changed invoice status: ${updatedInvoice.invoiceNumber} (${prevStatus} → ${data.status})`
          : `Updated invoice: ${updatedInvoice.invoiceNumber}`,
        oldValue: statusChanged ? prevStatus : undefined,
        newValue: statusChanged ? String(data.status) : undefined,
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
    }

    return NextResponse.json(result.invoice)
  } catch (error: unknown) {
    console.error("[invoices] PATCH error:", error instanceof Error ? error.message : error)
    // P2002 = unique constraint violation (e.g., user changed invoiceNumber to one that already exists)
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Invoice number already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Invoice update failed" }, { status: 500 })
  }
}

// PUT /api/invoices - Full update (kept for backward compat)
export async function PUT(req: NextRequest) {
  // PUT is identical to PATCH for invoices — delegate
  return PATCH(req)
}

// DELETE /api/invoices - Delete any invoice (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Only admins can delete invoices" }, { status: 403 })
    }

    await ensureAllTables()

    const userId = session.user.id
    const { success: rateOk } = rateLimit(`invoices-delete:${userId}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rateOk) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    // TODO: Migrate to DELETE /api/invoices/[id] for proper REST
    // Prefer query param approach: check urlId first, then bodyId as fallback
    const urlId = new URL(req.url).searchParams.get("id")
    let bodyId: string | undefined
    try {
      const delBody = await req.json()
      bodyId = delBody?.id
    } catch {
      // No JSON body — use query param
    }
    const invoiceId = bodyId || urlId

    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
    }

    const existing = await db.invoice.findUnique({ where: { id: invoiceId } })
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // P11-SEC-01: Block deletion of PAID invoices — financial records must be preserved
    if (existing.status === "PAID") {
      // Phase 7c: Audit log the rejected deletion attempt so admins can review
      // suspicious or accidental attempts to delete paid financial records.
      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole,
        department: "BUSINESS", page: "invoices", action: "DELETE",
        entityType: "Invoice", entityId: invoiceId,
        description: `Blocked deletion of PAID invoice: ${existing.invoiceNumber}`,
        status: "FAILURE",
        ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
      })
      return NextResponse.json({ error: "Cannot delete a paid invoice. Financial records must be preserved." }, { status: 403 })
    }

    // Capture invoice number before deletion for the audit log
    const invoiceNumber = existing.invoiceNumber

    await db.invoice.delete({ where: { id: invoiceId } })

    // Audit: log invoice deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "invoices", action: "DELETE",
      entityType: "Invoice", entityId: invoiceId,
      description: `Deleted invoice: ${invoiceNumber}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[invoices] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 })
  }
}
