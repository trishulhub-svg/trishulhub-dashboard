import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { notifyUsers } from "@/lib/notify"
import { canAccessProject, canManageProjects, isValidProjectId } from "@/lib/project-access"

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
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }
    const userRole = session.user.role
    const userId = session.user.id

    if (!(await canAccessProject(userId, userRole, projectId))) {
      return NextResponse.json({ error: "Forbidden: You can only view members of your assigned projects" }, { status: 403 })
    }

    const members = await db.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            avatar: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // ZAI FIX #310: JSON round-trip to strip Date objects → ISO strings
    return NextResponse.json(JSON.parse(JSON.stringify(members)))
  } catch (error: unknown) {
    // W8: Log the error object
    console.error("[project-members] GET error:", error)
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

    if (!canManageProjects(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const rl = rateLimit(`project-members-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }
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

    // H-PRJ-4 FIX: Validate member role — only MEMBER and LEAD are allowed
    const VALID_MEMBER_ROLES = ["MEMBER", "LEAD"]
    if (memberRole && !VALID_MEMBER_ROLES.includes(memberRole)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${VALID_MEMBER_ROLES.join(", ")}` }, { status: 400 })
    }

    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Verify user exists and is active (deactivated users cannot be assigned)
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Cannot assign a deactivated user. Reactivate them in Team first." },
        { status: 400 }
      )
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
      // Developers cannot open /dashboard/projects — send them to Dashboard
      const canOpenProjects =
        user.role === "SUPER_ADMIN" ||
        user.role === "ADMIN" ||
        user.role === "PROJECT_MANAGER"

      await notifyUsers({
        userIds: userId,
        title: "Project Assignment",
        message: `You have been assigned to project "${project.name}" as ${memberRole || "MEMBER"}`,
        type: "INFO",
        link: canOpenProjects ? `/dashboard/projects/${projectId}` : "/dashboard",
        metadata: { projectId, memberRole: memberRole || "MEMBER" },
      })
    } catch (notifyErr: unknown) {
      // W8: Log the error object
      console.error("[project-members] notification error (non-blocking):", notifyErr)
    }

    return NextResponse.json(JSON.parse(JSON.stringify(membership)), { status: 201 })
  } catch (error: unknown) {
    // W8: Log the error object
    console.error("[project-members] POST error:", error)
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

    if (!canManageProjects(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // I3: Check result count — return 404 if user wasn't a member
    const result = await db.projectMember.deleteMany({
      where: { userId, projectId },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: "User is not a member of this project" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    // W8: Log the error object
    console.error("[project-members] DELETE error:", error)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
