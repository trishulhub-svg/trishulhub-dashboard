import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const keys = await db.apiKey.findMany({ orderBy: { priority: "asc" } })
  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role === "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const data = await req.json()
  const key = await db.apiKey.create({ data })
  return NextResponse.json(key)
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
