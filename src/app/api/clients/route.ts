import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { createClientSchema, validateRequest } from "@/lib/validations"
import { isAdmin, getAssignedClientIds } from "@/lib/rbac"

// GET /api/clients - List all clients with aggregated data
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role === "CLIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = session.user.id
  const assignedClientIds = await getAssignedClientIds(userId, role)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const status = searchParams.get("status") || ""
  const sortBy = searchParams.get("sortBy") || "createdAt"
  const sortOrder = searchParams.get("sortOrder") || "desc"

  // Build where clause
  const where: Record<string, unknown> = {}

  // Developers only see clients from their assigned projects
  if (assignedClientIds) {
    where.id = { in: assignedClientIds }
  }

  if (status && status !== "ALL") {
    where.status = status
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { company: { contains: search } },
    ]
  }

  // Determine sort order
  type OrderBy = Record<string, string>
  let orderBy: OrderBy = { createdAt: "desc" }
  if (sortBy === "name") {
    orderBy = { name: sortOrder === "asc" ? "asc" : "desc" }
  } else if (sortBy === "createdAt") {
    orderBy = { createdAt: sortOrder === "asc" ? "asc" : "desc" }
  }

  const clients = await db.client.findMany({
    where,
    include: {
      _count: {
        select: {
          projects: true,
          invoices: true,
          tickets: true,
        },
      },
      invoices: {
        where: { status: "PAID" },
        select: { total: true },
      },
    },
    orderBy,
  })

  // Compute aggregated revenue per client
  const enriched = clients.map((client) => {
    const revenue = client.invoices.reduce((sum, inv) => sum + inv.total, 0)
    const { invoices, ...rest } = client
    return {
      ...rest,
      // Hide revenue for developers
      revenue: isAdmin(role) ? revenue : undefined,
    }
  })

  return NextResponse.json(enriched)
}

// POST /api/clients - Create client with validation
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const validation = validateRequest(createClientSchema, body)

  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const data = validation.data

  // Check for duplicate email
  const existing = await db.client.findFirst({ where: { email: data.email } })
  if (existing) {
    return NextResponse.json({ error: "A client with this email already exists" }, { status: 409 })
  }

  // Build create data
  const createData: {
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    website: string | null;
    status: string;
    userId: string | null;
    notes: string | null;
    createdAt?: Date;
  } = {
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    company: data.company || null,
    website: data.website || null,
    status: data.status || "ACTIVE",
    userId: data.userId || null,
    notes: data.notes || null,
  }

  // Support createdAt override for historical data
  if (data.createdAt) {
    createData.createdAt = new Date(data.createdAt)
  }

  try {
    const client = await db.client.create({ data: createData })
    return NextResponse.json(client, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 })
  }
}
