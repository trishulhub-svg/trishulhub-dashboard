import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { updateClientSchema, validateRequest } from "@/lib/validations"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"

// GET /api/clients/[id] - Single client detail with full relations
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  const userId = (session.user as Record<string, unknown>).id as string
  if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // SECURITY FIX: Developers can only view clients they are assigned to
  if (!isAdmin(role)) {
    const assignedClientIds = await getAssignedClientIds(userId, role)
    if (assignedClientIds && !assignedClientIds.includes(id)) {
      return NextResponse.json({ error: "Access denied: Client not in your assigned scope" }, { status: 403 })
    }
  }

  const client = await db.client.findUnique({
    where: { id },
    include: {
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          progress: true,
          deadline: true,
          budget: isAdmin(role), // SECURITY: Hide budget from developers
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      invoices: {
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
      },
      leads: {
        select: {
          id: true,
          name: true,
          status: true,
          score: true,
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
    },
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

  // Compute revenue from paid invoices
  const revenue = isAdmin(role) ? client.invoices
    .filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + inv.total, 0) : 0

  // SECURITY: Hide financial details from developers
  const safeClient = isAdmin(role) ? client : {
    ...client,
    invoices: [],
    leads: [],
  }

  return NextResponse.json({ ...safeClient, portalUser, revenue })
}

// PATCH /api/clients/[id] - Update client
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  // Ensure id from URL matches body
  const validation = validateRequest(updateClientSchema, { ...body, id })

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

  // Remove id from update data
  const { id: _id, ...updateData } = data

  // Clean up undefined/null fields
  const sanitizedData: {
    name?: string;
    email?: string;
    phone?: string | null;
    company?: string | null;
    website?: string | null;
    status?: string;
    userId?: string | null;
    notes?: string | null;
  } = {}
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined) {
      (sanitizedData as Record<string, unknown>)[key] = value === "" ? null : value
    }
  }

  try {
    const client = await db.client.update({
      where: { id },
      data: sanitizedData,
    })
    return NextResponse.json(client)
  } catch {
    return NextResponse.json({ error: "Client not found or update failed" }, { status: 404 })
  }
}

// DELETE /api/clients/[id] - Soft delete (set status to INACTIVE)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = (session.user as Record<string, unknown>).role as string
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  try {
    const client = await db.client.update({
      where: { id },
      data: { status: "INACTIVE" },
    })
    return NextResponse.json({ success: true, client })
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }
}
