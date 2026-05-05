import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role

    // Only SUPER_ADMIN and ADMIN can view API keys
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const keys = await db.apiKey.findMany({
      orderBy: { priority: "asc" },
      include: {
        _count: {
          select: { usageLogs: true, agents: true },
        },
      },
    })

    // SECURITY: Always mask key values (show only last 4 chars) — even for SUPER_ADMIN
    // Full key values are NEVER returned in GET to prevent leakage
    const maskedKeys = keys.map((key) => ({
      ...key,
      keyValue: key.keyValue ? `****${key.keyValue.slice(-4)}` : "",
    }))

    return NextResponse.json(maskedKeys)
  } catch (error: any) {
    console.error("[api-keys] GET error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    // Only SUPER_ADMIN and ADMIN can create API keys
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()

    // Validate required fields
    if (!body.keyName || !body.keyValue) {
      return NextResponse.json({ error: "Key Name and API Key Value are required" }, { status: 400 })
    }

    const config = await db.apiKey.create({
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
    // Return full key value ONCE with a warning — it won't be shown again in GET
    return NextResponse.json({ ...config, keyValue: config.keyValue, _warning: "Copy this key now. It won't be shown again." }, { status: 201 })
  } catch (error: any) {
    console.error("[api-keys] POST error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id, ...body } = await req.json()
    if (!id) return NextResponse.json({ error: "API key ID is required" }, { status: 400 })

    // SECURITY: Whitelist allowed fields only (prevent mass assignment)
    const data: Parameters<typeof db.apiKey.update>[0]["data"] = {}
    if (body.keyName !== undefined) data.keyName = body.keyName
    if (body.keyValue !== undefined) data.keyValue = body.keyValue
    if (body.provider !== undefined) data.provider = body.provider
    if (body.monthlyBudget !== undefined) data.monthlyBudget = body.monthlyBudget
    if (body.status !== undefined) data.status = body.status
    if (body.priority !== undefined) data.priority = body.priority
    if (body.assignedAgents !== undefined) data.assignedAgents = body.assignedAgents
    if (body.currentSpend !== undefined) data.currentSpend = body.currentSpend

    const key = await db.apiKey.update({ where: { id }, data })
    return NextResponse.json(key)
  } catch (error: any) {
    console.error("[api-keys] PUT error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== "SUPER_ADMIN") {
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
  } catch (error: any) {
    console.error("[api-keys] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
