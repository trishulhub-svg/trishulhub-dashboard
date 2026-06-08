import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

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
          select: { usageLogs: true },
        },
      },
    })

    // SECURITY: Always mask key values (show only last 4 chars) — even for SUPER_ADMIN
    // Full key values are NEVER returned in GET to prevent leakage
    const maskedKeys = keys.map((key) => ({
      ...key,
      keyValue: key.keyValue ? `****${key.keyValue.slice(-4)}` : "",
    }))

    return NextResponse.json(JSON.parse(JSON.stringify(maskedKeys)))
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
    const data: Prisma.ApiKeyUncheckedUpdateInput = {}
    if (body.keyName !== undefined) data.keyName = body.keyName
    if (body.keyValue !== undefined) data.keyValue = body.keyValue
    if (body.provider !== undefined) data.provider = body.provider
    if (body.monthlyBudget !== undefined) data.monthlyBudget = body.monthlyBudget
    if (body.status !== undefined) data.status = body.status
    if (body.priority !== undefined) data.priority = body.priority
    if (body.currentSpend !== undefined && session.user.role === "SUPER_ADMIN") data.currentSpend = body.currentSpend

    const key = await db.apiKey.update({ where: { id }, data })
    // SECURITY: Always mask key values in PUT response (consistent with GET)
    const masked = { ...key, keyValue: key.keyValue ? `****${key.keyValue.slice(-4)}` : "" }
    return NextResponse.json(JSON.parse(JSON.stringify(masked)))
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

    // C20: Wrap all delete operations in a transaction for atomicity
    await db.$transaction(async (tx) => {
      // Delete usage logs for this key first (foreign key constraint)
      await tx.apiUsageLog.deleteMany({
        where: { apiKeyId: id },
      })

      await tx.apiKey.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[api-keys] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
