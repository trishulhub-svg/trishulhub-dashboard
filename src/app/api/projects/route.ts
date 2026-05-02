import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const userRole = (session.user as any).role
  
  // Fix #11: CLIENT users can only see their own projects
  if (userRole === "CLIENT") {
    const userId = (session.user as any).id
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) return NextResponse.json([])
    const projects = await db.project.findMany({ 
      where: { clientId: client.id },
      include: { client: true, tasks: true }, 
      orderBy: { createdAt: "desc" } 
    })
    return NextResponse.json(projects)
  }
  
  const projects = await db.project.findMany({ include: { client: true, tasks: true }, orderBy: { createdAt: "desc" } })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const data = await req.json()
  const project = await db.project.create({ data })
  return NextResponse.json(project)
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, ...data } = await req.json()
  const project = await db.project.update({ where: { id }, data })
  return NextResponse.json(project)
}
