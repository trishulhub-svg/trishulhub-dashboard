import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

// GET /api/leads - List leads (ADMIN/SUPER_ADMIN only)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const leads = await db.lead.findMany({
    include: { client: true, emails: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(leads)
}

// POST /api/leads - Create lead (ADMIN/SUPER_ADMIN only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, company, website, phone, source, score, status, notes, clientId } = body

  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
  }

  const lead = await db.lead.create({
    data: {
      name,
      email,
      company: company || null,
      website: website || null,
      phone: phone || null,
      source: source || "MANUAL",
      score: score || 0,
      status: status || "NEW",
      notes: notes || null,
      clientId: clientId || null,
    },
  })
  return NextResponse.json(lead)
}

// PATCH /api/leads - Update lead (for drag-and-drop status change, etc.)
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
    return NextResponse.json({ error: "Lead ID is required" }, { status: 400 })
  }

  // Validate status if provided
  const validStatuses = ["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"]
  if (data.status && !validStatuses.includes(data.status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 })
  }

  // Only allow updating specific fields
  const allowedFields = ["name", "email", "company", "website", "phone", "source", "score", "status", "notes", "clientId"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      sanitizedData[key] = data[key]
    }
  }

  try {
    const lead = await db.lead.update({
      where: { id },
      data: sanitizedData,
    })
    return NextResponse.json(lead)
  } catch (error: any) {
    return NextResponse.json({ error: "Lead not found or update failed" }, { status: 404 })
  }
}

// PUT /api/leads - Full update (kept for backward compat)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userRole = session.user.role
  if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id, ...data } = await req.json()
  if (!id) {
    return NextResponse.json({ error: "Lead ID is required" }, { status: 400 })
  }

  // SECURITY: Apply same allowed fields whitelist as PATCH handler
  const allowedFields = ["name", "email", "company", "website", "phone", "source", "score", "status", "notes", "clientId"]
  const sanitizedData: Record<string, any> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      sanitizedData[key] = data[key]
    }
  }

  try {
    const lead = await db.lead.update({ where: { id }, data: sanitizedData })
    return NextResponse.json(lead)
  } catch (error: any) {
    return NextResponse.json({ error: "Lead not found or update failed" }, { status: 404 })
  }
}
