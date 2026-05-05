import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"

// GET /api/invoices - List invoices (ADMIN/SUPER_ADMIN see all, CLIENT sees own, DEVELOPER sees assigned projects)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  const userId = session.user.id

  // CLIENT users can only see their own invoices
  if (userRole === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    const invoices = client
      ? await db.invoice.findMany({
          where: { clientId: client.id },
          include: { client: true, project: true },
          orderBy: { createdAt: "desc" },
        })
      : []
    return NextResponse.json(invoices)
  }

  // DEVELOPER users only see invoices from their assigned projects' clients
  const assignedClientIds = await getAssignedClientIds(userId, userRole)
  const invoiceWhere = assignedClientIds ? { clientId: { in: assignedClientIds } } : {}

  const invoices = await db.invoice.findMany({
    where: invoiceWhere,
    include: { client: true, project: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(invoices)
}

// POST /api/invoices - Create invoice (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { invoiceNumber, clientId, projectId, items, subtotal, tax, total, dueDate } = body

  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
  }

  // Negative amount validation
  if (total !== undefined && total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
  if (tax !== undefined && tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })

  // Generate invoice number if not provided
  const autoInvoiceNumber = invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`

  const invoice = await db.invoice.create({
    data: {
      invoiceNumber: autoInvoiceNumber,
      clientId,
      projectId: projectId || null,
      items: items ? (typeof items === "string" ? items : JSON.stringify(items)) : "[]",
      subtotal: subtotal || 0,
      tax: tax || 0,
      total: total || 0,
      // SECURITY: Always create as DRAFT — ignore client-provided status
      status: "DRAFT",
      dueDate: dueDate ? new Date(dueDate) : null,
      // SECURITY: Auto-set sentById from session — ignore client-provided value
      sentById: session.user.id,
    },
  })
  return NextResponse.json(invoice)
}

// PATCH /api/invoices - Update invoice status/details
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...data } = body

  if (!id) {
    return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
  }

  // Negative amount validation
  if (data.total !== undefined && data.total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
  if (data.tax !== undefined && data.tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })

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

  // Sanitize update fields — sentById removed to prevent spoofing
  const allowedFields = ["invoiceNumber", "clientId", "projectId", "items", "subtotal", "tax", "total", "status", "dueDate", "paidAt"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "items" && typeof data[key] !== "string") {
        sanitizedData[key] = JSON.stringify(data[key])
      } else if (key === "dueDate" || key === "paidAt") {
        sanitizedData[key] = data[key] ? new Date(data[key]) : null
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }

  // If marking as PAID, set paidAt automatically
  if (data.status === "PAID" && !data.paidAt) {
    sanitizedData.paidAt = new Date()
  }

  try {
    const invoice = await db.invoice.update({
      where: { id },
      data: sanitizedData,
      include: { client: true, project: true },
    })
    return NextResponse.json(invoice)
  } catch (error: any) {
    return NextResponse.json({ error: "Invoice not found or update failed" }, { status: 404 })
  }
}

// PUT /api/invoices - Full update (kept for backward compat)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, ...data } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
  }

  // Negative amount validation
  if (data.total !== undefined && data.total < 0) return NextResponse.json({ error: "Total cannot be negative" }, { status: 400 })
  if (data.tax !== undefined && data.tax < 0) return NextResponse.json({ error: "Tax cannot be negative" }, { status: 400 })

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

  // SECURITY: Apply same allowed fields whitelist as PATCH handler — sentById removed to prevent spoofing
  const allowedFields = ["invoiceNumber", "clientId", "projectId", "items", "subtotal", "tax", "total", "status", "dueDate", "paidAt"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "items" && typeof data[key] !== "string") {
        sanitizedData[key] = JSON.stringify(data[key])
      } else if (key === "dueDate" || key === "paidAt") {
        sanitizedData[key] = data[key] ? new Date(data[key]) : null
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }

  // If marking as PAID, set paidAt automatically
  if (data.status === "PAID" && !data.paidAt) {
    sanitizedData.paidAt = new Date()
  }

  try {
    const invoice = await db.invoice.update({
      where: { id },
      data: sanitizedData,
      include: { client: true, project: true },
    })
    return NextResponse.json(invoice)
  } catch (error: any) {
    return NextResponse.json({ error: "Invoice not found or update failed" }, { status: 404 })
  }
}

// DELETE /api/invoices - Delete DRAFT invoices only
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only SUPER_ADMIN can delete invoices" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 })
  }

  // Only allow deleting DRAFT invoices
  const invoice = await db.invoice.findUnique({ where: { id } })
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }
  if (invoice.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT invoices can be deleted" }, { status: 400 })
  }

  await db.invoice.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
