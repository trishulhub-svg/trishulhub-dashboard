import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// GET /api/projects/[projectId]/members - List project members
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(`project-members-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { projectId } = await params
    const userRole = session.user.role
    const userId = session.user.id

    // SECURITY: Non-admin users must be a member of this project to view its members
    if (!isAdmin(userRole)) {
      const membership = await db.projectMember.findFirst({
        where: { userId, projectId },
      })
      if (!membership) {
        return NextResponse.json({ error: "Forbidden: You can only view members of your assigned projects" }, { status: 403 })
      }
    }

    const members = await db.projectMember.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, department: true, avatar: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    // ZAI FIX #310: JSON round-trip to strip Date objects → ISO strings
    return NextResponse.json(JSON.parse(JSON.stringify(members)))
  } catch (error: unknown) {
    console.error("[project-members] GET error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// POST /api/projects/[projectId]/members - Add member to project (admin-only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`project-members-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { projectId } = await params
    let parsedBody: { userId?: string; role?: string }
    try {
      parsedBody = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }
    const { userId, role: memberRole } = parsedBody

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Create or update membership
    const membership = await db.projectMember.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, role: memberRole || "MEMBER" },
      update: { role: memberRole || "MEMBER" },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, department: true } },
      },
    })

    // Notify the user about project assignment
    try {
      await db.notification.create({
        data: {
          userId,
          title: "Project Assignment",
          message: `You have been assigned to project "${project.name}" as ${memberRole || "MEMBER"}`,
          type: "INFO",
          link: `/dashboard/projects/${projectId}`,
          metadata: JSON.stringify({ projectId, memberRole: memberRole || "MEMBER" }),
        },
      })
    } catch (notifyErr: unknown) {
      console.error("[project-members] notification error (non-blocking)")
    }

    return NextResponse.json(JSON.parse(JSON.stringify(membership)), { status: 201 })
  } catch (error: unknown) {
    console.error("[project-members] POST error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}

// DELETE /api/projects/[projectId]/members - Remove member from project (admin-only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const rl = rateLimit(`project-members-del-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { projectId } = await params
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    await db.projectMember.deleteMany({
      where: { userId, projectId },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[project-members] DELETE error")
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
