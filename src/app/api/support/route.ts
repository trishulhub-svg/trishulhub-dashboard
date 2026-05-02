import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tickets = await db.supportTicket.findMany({ include: { client: true, messages: true }, orderBy: { createdAt: "desc" } })
  return NextResponse.json(tickets)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  
  // Fix #10: Derive clientId from authenticated user if not provided
  if (!data.clientId || data.clientId === "portal") {
    const userId = (session.user as any).id
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) {
      return NextResponse.json({ error: "No client profile found for this user. Contact admin." }, { status: 400 })
    }
    data.clientId = client.id
  }
  
  const ticket = await db.supportTicket.create({ data })
  return NextResponse.json(ticket)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, ...data } = await req.json()
  const ticket = await db.supportTicket.update({ where: { id }, data })
  return NextResponse.json(ticket)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, ...data } = await req.json()
  const ticket = await db.supportTicket.update({ where: { id }, data })
  return NextResponse.json(ticket)
}
