import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateClientSchema, validateRequest } from "@/lib/validations"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/clients/[id] - Single client detail with full relations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    const userId = session.user.id
    if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limit
    const rl = rateLimit(`crm-clients-get-${session.user.id}`, RATE_LIMITS.crm.limit, RATE_LIMITS.crm.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    // SECURITY FIX: Developers can only view clients they are assigned to
    if (!isAdmin(role)) {
      const assignedClientIds = await getAssignedClientIds(userId, role)
      if (assignedClientIds && !assignedClientIds.includes(id)) {
        return NextResponse.json({ error: "Access denied: Client not in your assigned scope" }, { status: 403 })
      }
    }

    // API-015: Conditionally build include object to skip unnecessary queries for developers
    const adminOnly = isAdmin(role)

    const includeObj: Record<string, unknown> = {
      websites: {
        select: { id: true, url: true, label: true, isPrimary: true, createdAt: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
      projectMethod: {
        select: { id: true, name: true },
      },
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          progress: true,
          deadline: true,
          budget: adminOnly, // SECURITY: Hide budget from developers
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    }

    // Only include invoices and leads for admin users (avoid fetching & discarding for developers)
    if (adminOnly) {
      includeObj.invoices = {
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          status: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }
      includeObj.leads = {
        select: {
          id: true,
          name: true,
          status: true,
          score: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }
      includeObj.deals = {
        select: {
          id: true,
          title: true,
          value: true,
          stage: true,
          expectedCloseDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }
      includeObj.contacts = {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isPrimary: true,
        },
        orderBy: { createdAt: "desc" },
      }
    }

    const client = await db.client.findUnique({
      where: { id },
      include: includeObj as Parameters<typeof db.client.findUnique>[0]["include"],
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // If userId exists, fetch linked portal user info
    let portalUser: { id: string; name: string; email: string; isActive: boolean } | null = null
    if (client.userId) {
      portalUser = await db.user.findUnique({
        where: { id: client.userId },
        select: { id: true, name: true, email: true, isActive: true },
      })
    }

    // API-016: Compute revenue from DB-level filtered PAID invoices instead of JS filter
    let revenue = 0
    if (adminOnly) {
      const paidInvoiceSum = await db.invoice.aggregate({
        where: { clientId: id, status: "PAID" },
        _sum: { total: true },
      })
      revenue = paidInvoiceSum._sum.total ?? 0
    }

    return NextResponse.json(JSON.parse(JSON.stringify({ ...client, portalUser, revenue })))
  } catch (error: any) {
    console.error("[clients/[id]] GET error:", error?.message)
    return NextResponse.json({ error: "Failed to load client details" }, { status: 500 })
  }
}

// PATCH /api/clients/[id] - Update client
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Rate limit
  const rl = rateLimit(`crm-clients-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const { id } = await params

  // BUG FIX: Wrap req.json() in try/catch for malformed JSON
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Ensure id from URL matches body
  const validation = validateRequest(updateClientSchema, { ...(body as Record<string, unknown>), id })

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

  // If email is being updated, check for duplicates
  if (data.email) {
    const existing = await db.client.findFirst({
      where: { email: data.email, NOT: { id } },
    })
    if (existing) {
      return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 })
    }
  }

  // Remove id and websites from update data (websites handled separately)
  const { id: _id, websites: websitesData, ...updateData } = data

  // Clean up undefined/null fields
  const sanitizedData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined) {
      sanitizedData[key] = value === "" ? null : value
    }
  }

  // Handle date fields
  if (sanitizedData.projectStartDate && typeof sanitizedData.projectStartDate === "string") {
    sanitizedData.projectStartDate = new Date(sanitizedData.projectStartDate)
  }
  if (sanitizedData.deliveryDate && typeof sanitizedData.deliveryDate === "string") {
    sanitizedData.deliveryDate = new Date(sanitizedData.deliveryDate)
  }

  // Handle website updates: replace-all strategy
  if (websitesData !== undefined && Array.isArray(websitesData)) {
    const ws = websitesData as Array<{ url: string; label?: string; isPrimary?: boolean }>
    sanitizedData.websites = {
      deleteMany: {},
      create: ws.map((w, idx) => ({
        url: w.url,
        label: w.label || null,
        isPrimary: w.isPrimary ?? (idx === 0),
      })),
    }
    // Keep legacy website field in sync with primary
    const primary = ws.find((w) => w.isPrimary) || ws[0]
    sanitizedData.website = primary?.url || null
  }

  try {
    const client = await db.client.update({
      where: { id },
      data: sanitizedData,
      include: { websites: true },
    })
    return NextResponse.json(JSON.parse(JSON.stringify(client)))
  } catch (updateErr: any) {
    console.error("[clients/[id]] PATCH update error:", updateErr?.message)
    // Check for Prisma unique constraint error (duplicate email)
    if (updateErr?.code === "P2002") {
      return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Client not found or update failed" }, { status: 404 })
  }
  } catch (error: any) {
    console.error("[clients/[id]] PATCH error:", error?.message)
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

// DELETE /api/clients/[id] - Soft delete (set status to CHURNED)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Rate limit
    const rl = rateLimit(`crm-clients-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params

    const existing = await db.client.findUnique({ where: { id }, select: { status: true } })
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }
    if (existing.status === "CHURNED") {
      return NextResponse.json({ error: "Client is already deactivated (churned)", client: existing }, { status: 409 })
    }

    const client = await db.client.update({
      where: { id },
      data: { status: "CHURNED" },
    })
    return NextResponse.json({ success: true, client })
  } catch (error: any) {
    console.error("[clients/[id]] DELETE error:", error?.message)
    return NextResponse.json({ error: "Failed to deactivate client" }, { status: 500 })
  }
}
