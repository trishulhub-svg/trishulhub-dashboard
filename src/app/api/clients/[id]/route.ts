import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { updateClientSchema, validateRequest } from "@/lib/validations"
import { isAdmin, isAdminOrProjectManager, getAssignedClientIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

function serializeClientDetail(c: any) {
  if (!c) return c
  const result: any = {}
  for (const [k, v] of Object.entries(c)) {
    if (v instanceof Date) result[k] = v.toISOString()
    else if (Array.isArray(v)) result[k] = v.map((item: any) => serializeClientDetail(item))
    else if (typeof v === 'object' && v !== null) result[k] = serializeClientDetail(v)
    else result[k] = v
  }
  return result
}

// GET /api/clients/[id] - Single client detail with full relations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auto-migrate: ensure all tables/columns exist before querying (Turso)
    await ensureAllTables()

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
    const lite = new URL(_req.url).searchParams.get("lite") === "1"

    // SECURITY FIX: Developers can only view clients they are assigned to.
    // PROJECT_MANAGER has admin-like visibility into all clients.
    if (!isAdminOrProjectManager(role)) {
      const assignedClientIds = await getAssignedClientIds(userId, role)
      if (assignedClientIds && !assignedClientIds.includes(id)) {
        return NextResponse.json({ error: "Access denied: Client not in your assigned scope" }, { status: 403 })
      }
    }

    // Fast path for edit dialog — websites + core fields only
    if (lite) {
      const liteClient = await db.client.findUnique({
        where: { id },
        include: {
          websites: {
            select: { id: true, url: true, label: true, isPrimary: true, createdAt: true },
            orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
          },
          projectMethod: { select: { id: true, name: true } },
        },
      })
      if (!liteClient) return NextResponse.json({ error: "Client not found" }, { status: 404 })
      return NextResponse.json(deepSanitize(serializeClientDetail(liteClient)))
    }

    // API-015: Conditionally build include object to skip unnecessary queries for developers.
    // PROJECT_MANAGER gets client management includes (projects/invoices lists/deals/contacts).
    // Revenue totals remain ADMIN/SUPER_ADMIN only (finance).
    const adminOnly = isAdminOrProjectManager(role)
    const canSeeRevenue = isAdmin(role)

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
      include: includeObj as unknown as Prisma.ClientInclude,
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

    // API-016: Revenue is finance — ADMIN/SUPER_ADMIN only
    let revenue: number | undefined
    if (canSeeRevenue) {
      const paidInvoiceSum = await db.invoice.aggregate({
        where: { clientId: id, status: "PAID" },
        _sum: { total: true },
      })
      revenue = paidInvoiceSum._sum.total ?? 0
    }

    return NextResponse.json(deepSanitize(serializeClientDetail({ ...client, portalUser, revenue })))
  } catch (error: unknown) {
    console.error("[clients/[id]] GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to load client details" }, { status: 500 })
  }
}

// PATCH /api/clients/[id] - Update client
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureAllTables()

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  // PROJECT_MANAGER can update clients (admin-like access per requirements)
  if (!isAdminOrProjectManager(role)) {
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
  const sanitizedData: Record<string, any> = {}
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

  // Handle website updates: replace-all strategy (non-transactional-safe)
  if (websitesData !== undefined && Array.isArray(websitesData)) {
    const ws = websitesData as Array<{ url: string; label?: string; isPrimary?: boolean }>
    const urlRegex = /^https?:\/\/(?:[\w-]+\.)+[\w]{2,}(?::\d{1,5})?(?:\/\S*)?$/
    for (const w of ws) {
      if (w.url && !urlRegex.test(w.url)) {
        return NextResponse.json({ error: "Invalid website URL format" }, { status: 400 })
      }
    }
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
    const client = await db.$transaction(async (tx) => {
      return tx.client.update({
        where: { id },
        data: sanitizedData,
        include: { websites: true },
      })
    })
    // Audit: log client update (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "clients", action: "UPDATE",
      entityType: "Client", entityId: id,
      description: `Updated client: ${client.name}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(deepSanitize(serializeClientDetail(client)))
  } catch (updateErr: unknown) {
    console.error("[clients/[id]] PATCH update error:", updateErr instanceof Error ? updateErr.message : String(updateErr))
    // Check for Prisma unique constraint error (duplicate email)
    if ((updateErr as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Client not found or update failed" }, { status: 404 })
  }
  } catch (error: unknown) {
    console.error("[clients/[id]] PATCH error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}

// DELETE /api/clients/[id]
// - Default: soft delete (status → CHURNED). ADMIN / SUPER_ADMIN / PROJECT_MANAGER
// - ?permanent=1 on an already-CHURNED client: hard delete. ADMIN / SUPER_ADMIN only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const role = session.user.role
    if (!isAdminOrProjectManager(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`crm-clients-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const { id } = await params
    const permanent = new URL(_req.url).searchParams.get("permanent") === "1"

    const existing = await db.client.findUnique({ where: { id }, select: { id: true, name: true, status: true } })
    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Permanent wipe — admin only, and only when nothing related remains
    if (permanent) {
      if (!isAdmin(role)) {
        return NextResponse.json({ error: "Only admins can permanently delete clients" }, { status: 403 })
      }
      if (existing.status !== "CHURNED") {
        return NextResponse.json(
          { error: "Deactivate the client first, then delete permanently" },
          { status: 400 }
        )
      }

      const [invoices, projects, tickets, websites, deals, contacts] = await Promise.all([
        db.invoice.count({ where: { clientId: id } }),
        db.project.count({ where: { clientId: id } }),
        db.supportTicket.count({ where: { clientId: id } }),
        db.clientWebsite.count({ where: { clientId: id } }),
        db.deal.count({ where: { clientId: id } }),
        db.contact.count({ where: { clientId: id } }),
      ])
      const blockers = [
        invoices && `${invoices} invoice(s)`,
        projects && `${projects} project(s)`,
        tickets && `${tickets} support ticket(s)`,
        websites && `${websites} website(s)`,
        deals && `${deals} deal(s)`,
        contacts && `${contacts} contact(s)`,
      ].filter(Boolean)
      if (blockers.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot permanently delete client while related records exist: ${blockers.join(", ")}. Remove or reassign them first.`,
            counts: { invoices, projects, tickets, websites, deals, contacts },
          },
          { status: 409 }
        )
      }

      await db.$transaction(async (tx) => {
        await tx.lead.updateMany({ where: { clientId: id }, data: { clientId: null } })
        await tx.client.delete({ where: { id } })
      })

      void logAudit({
        userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
        department: "BUSINESS", page: "clients", action: "DELETE",
        entityType: "Client", entityId: id,
        description: `Permanently deleted client: ${existing.name}`,
        oldValue: existing.status,
        newValue: undefined,
        ipAddress: getIpAddress(_req), userAgent: getUserAgent(_req),
      })
      return NextResponse.json({ success: true, permanent: true })
    }

    if (existing.status === "CHURNED") {
      return NextResponse.json({ error: "Client is already deactivated (churned)", client: existing }, { status: 409 })
    }

    const client = await db.client.update({
      where: { id },
      data: { status: "CHURNED" },
    })
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole: session.user.role,
      department: "BUSINESS", page: "clients", action: "DELETE",
      entityType: "Client", entityId: id,
      description: `Deactivated client (set status to CHURNED): ${client.name}`,
      oldValue: existing.status,
      newValue: "CHURNED",
      ipAddress: getIpAddress(_req), userAgent: getUserAgent(_req),
    })
    return NextResponse.json({ success: true, client: deepSanitize(serializeClientDetail(client)) })
  } catch (error: unknown) {
    console.error("[clients/[id]] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 })
  }
}
