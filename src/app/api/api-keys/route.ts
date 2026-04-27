import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const keys = await db.apiKey.findMany({
    orderBy: { priority: "asc" },
    include: {
      _count: {
        select: { usageLogs: true, agents: true },
      },
    },
  })
  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as any).role === "CLIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    // Validate required fields
    if (!body.keyName || !body.keyValue) {
      return NextResponse.json({ error: "Key Name and API Key Value are required" }, { status: 400 })
    }

    const key = await db.apiKey.create({
      data: {
        provider: body.provider || "OPENROUTER",
        keyName: body.keyName,
        keyValue: body.keyValue,
        monthlyBudget: body.monthlyBudget || 18,
        currentSpend: 0,
        status: body.status || "ACTIVE",
        priority: body.priority || 1,
        assignedAgents: body.assignedAgents || "[]",
      },
    })
    return NextResponse.json(key)
  } catch (error: any) {
    console.error("API Key POST error:", error)
    return NextResponse.json({ error: error.message || "Failed to create API key" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role === "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, ...data } = await req.json()
  const key = await db.apiKey.update({ where: { id }, data })
  return NextResponse.json(key)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Support both query param and JSON body for the ID
  let id: string | null = null

  // Try query param first
  const urlId = req.nextUrl.searchParams.get("id")
  if (urlId) {
    id = urlId
  } else {
    // Try JSON body
    try {
      const body = await req.json()
      id = body.id
    } catch {
      // No body
    }
  }

  if (!id) {
    return NextResponse.json({ error: "API key ID is required" }, { status: 400 })
  }

  // First, unlink any agents using this key
  await db.agent.updateMany({
    where: { apiKeyId: id },
    data: { apiKeyId: null },
  })

  // Delete usage logs for this key first (foreign key constraint)
  await db.apiUsageLog.deleteMany({
    where: { apiKeyId: id },
  })

  await db.apiKey.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
