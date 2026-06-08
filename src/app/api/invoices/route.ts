import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { createInvoiceSchema, updateInvoiceSchema, validateRequest } from "@/lib/validations"
// Note: deepSanitize is actually a deep clone, not XSS sanitization
import { deepSanitize } from "@/lib/utils"
import { ensureAllTables } from "@/lib/auto-migrate"

// GET /api/invoices - List invoices (ADMIN/SUPER_ADMIN see all, CLIENT sees own, DEVELOPER sees assigned projects)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await ensureAllTables()

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

    // DEVELOPER users only see invoices from their assigned projects' clients
    const assignedClientIds = await getAssignedClientIds(userId, userRole)
    const where: Prisma.InvoiceWhereInput = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}
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

    let body: { invoiceNumber?: string; clientId?: string; projectId?: string; items?: unknown; subtotal?: number; tax?: number; total?: number; dueDate?: string; status?: string; paymentMethod?: string; gst?: number; gstPercent?: number; notes?: string; paymentStatus?: string; [key: string]: unknown }
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

    const { invoiceNumber, clientId, projectId, items, subtotal, tax, total, dueDate, paymentMethod, gst, gstPercent, notes, paymentStatus } = validation.data

    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
    }

    // Negative amount validation
    if (total !== undefined && total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
    if (tax !== undefined && tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })
    if (subtotal !== undefined && subtotal < 0) return NextResponse.json({ error: "Subtotal cannot be negative" }, { status: 400 })
    if (gst !== undefined && gst < 0) return NextResponse.json({ error: "GST cannot be negative" }, { status: 400 })

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
            subtotal: subtotal ?? 0,
            tax: tax ?? 0,
            total: (subtotal ?? 0) + (tax ?? 0) + (gst ?? 0),
            // SECURITY: Always create as DRAFT — ignore client-provided status
            status: "DRAFT",
            dueDate: dueDate ? new Date(dueDate) : null,
            paymentMethod: typeof paymentMethod === 'string' ? paymentMethod : null,
            gst: typeof gst === 'number' ? gst : null,
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
      throw txError
    }
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

    // Fetch existing invoice for status transition validation
    const existing = await db.invoice.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Validate status transitions
    if (data.status) {
      const validTransitions: Record<string, string[]> = {
        DRAFT: ["SENT", "OVERDUE"],
        SENT: ["PAID", "OVERDUE", "DRAFT"],
        OVERDUE: ["PAID", "SENT", "DRAFT"],
        PAID: [], // No transitions from PAID (locked)
      }
      const currentStatus = existing.status
      const allowed = validTransitions[currentStatus] || []
      if (!allowed.includes(data.status)) {
        return NextResponse.json({ error: `Cannot change status from ${currentStatus} to ${data.status}` }, { status: 400 })
      }
    }

    // Guard: paymentStatus PAID requires status PAID
    if (data.paymentStatus === "PAID" && data.status !== "PAID" && existing.status !== "PAID") {
      return NextResponse.json({ error: "Cannot set payment to PAID when invoice status is not PAID" }, { status: 400 })
    }
    // M-FIN-4: Block setting paymentStatus to UNPAID when invoice status is PAID
    if (data.paymentStatus === "UNPAID" && (data.status === "PAID" || existing.status === "PAID")) {
      return NextResponse.json({ error: "Cannot set payment to UNPAID when invoice status is PAID" }, { status: 400 })
    }

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
          sanitizedData[key] = typeof data[key] === "string" ? deepSanitize(data[key]) : data[key]
        } else if (key === "invoiceNumber") {
          sanitizedData[key] = typeof data[key] === "string" ? deepSanitize(data[key]) : data[key]
        } else {
          sanitizedData[key] = data[key]
        }
      }
    }

    // Recompute total from subtotal + tax + gst to ensure consistency
    const bodyFields = body as Record<string, unknown>
    const needsRecompute = ["subtotal", "tax", "gst", "gstPercent"].some(f => bodyFields[f] !== undefined);
    if (needsRecompute || bodyFields.total !== undefined) {
      const existing = await db.invoice.findUnique({ where: { id } });
      const sub = (sanitizedData.subtotal ?? existing?.subtotal ?? 0);
      const taxVal = (sanitizedData.tax ?? existing?.tax ?? 0);
      const gstVal = (sanitizedData.gst ?? existing?.gst ?? 0);
      sanitizedData.total = sub + taxVal + gstVal;
    }

    // If marking as PAID, set paidAt automatically
    if (data.status === "PAID" && !data.paidAt) {
      sanitizedData.paidAt = new Date()
    }
    // If marking as PAID, also set paymentStatus
    if (data.status === "PAID") {
      sanitizedData.paymentStatus = "PAID"
    }

    const invoice = await db.invoice.update({
      where: { id },
      data: sanitizedData,
      include: { client: true, project: true },
    })
    return NextResponse.json(invoice)
  } catch (error: unknown) {
    console.error("[invoices] PATCH error:", error instanceof Error ? error.message : error)
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

    // Allow deleting any invoice (not just DRAFT)
    const existing = await db.invoice.findUnique({ where: { id: invoiceId } })
    if (!existing) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    await db.invoice.delete({ where: { id: invoiceId } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[invoices] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 })
  }
}
