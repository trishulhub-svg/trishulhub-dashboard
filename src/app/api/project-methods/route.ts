import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/project-methods — List all project methods (admin only)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`project-methods-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const methods = await db.projectMethod.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(methods)
}

// POST /api/project-methods — Create a new project method (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`project-methods-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  let body: { name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = (body.name || "").trim()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  try {
    const method = await db.projectMethod.create({ data: { name } })
    return NextResponse.json(method, { status: 201 })
  } catch (error: unknown) {
    // Unique constraint violation
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create method" }, { status: 500 })
  }
}

// PATCH /api/project-methods — Update a project method (admin only)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`project-methods-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  let body: { id?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: "ID is required" }, { status: 400 })
  const name = (body.name || "").trim()
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  try {
    const method = await db.projectMethod.update({
      where: { id: body.id },
      data: { name },
    })
    return NextResponse.json(method)
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "A method with this name already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to update method" }, { status: 500 })
  }
}

// DELETE /api/project-methods — Remove a project method (admin only)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`project-methods-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 })

  try {
    // Nullify projectMethodId on any clients that reference this method
    await db.client.updateMany({ where: { projectMethodId: id }, data: { projectMethodId: null } })
    await db.projectMethod.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete method" }, { status: 500 })
  }
}
