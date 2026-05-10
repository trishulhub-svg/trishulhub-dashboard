import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const VALID_PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`projects-get-${session.user.id}`, RATE_LIMITS.general.limit, RATE_LIMITS.general.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const userRole = session.user.role
  const userId = session.user.id

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")

  // CLIENT users can only see their own projects
  if (userRole === "CLIENT") {
    const client = await db.client.findFirst({ where: { userId } })
    if (!client) return NextResponse.json([])
    // ZAI FIX #310: Only include tasks for list view (no projectId filter).
    // Detail page fetches tasks separately from /api/tasks.
    const projects = await db.project.findMany({
      where: {
        clientId: client.id,
        ...(projectId ? { id: projectId } : {}),
      },
      include: { client: true, ...(projectId ? {} : { tasks: true }) },
      orderBy: { createdAt: "desc" }
    })
    return NextResponse.json(projects)
  }

  // DEVELOPER users only see projects they're assigned to
  const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

  // Build where clause
  const where: Record<string, unknown> = {}
  if (assignedProjectIds) {
    where.id = { in: assignedProjectIds }
  }
  if (projectId) {
    // SECURITY: For non-admin users, intersect projectId with assigned IDs
    if (assignedProjectIds && !assignedProjectIds.includes(projectId)) {
      return NextResponse.json([])
    }
    where.id = projectId
  }

  // For developers: don't expose budget info
  const includeBudget = isAdmin(userRole)

  // ZAI FIX #310: Only include tasks+members for list view.
    // When projectId is specified (detail page), skip nested includes —
    // the detail page fetches tasks and members separately.
    const projects = await db.project.findMany({
    where,
    include: {
      client: true,
      ...(projectId ? {} : { tasks: true }),
      ...(projectId ? {} : { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }),
    },
    orderBy: { createdAt: "desc" }
  })

  // For developers: hide budget and client financial details
  if (!includeBudget) {
    const filtered = projects.map(({ budget, client, tasks: _t, members: _m, ...rest }) => ({
      ...rest,
      budget: undefined,
      client: { id: client.id, name: client.name, company: client.company },
    }))
    return NextResponse.json(filtered)
  }

  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`projects-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  // Only admins can create projects
  const userRole = session.user.role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }

  let data: Record<string, unknown>
  try {
    data = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // SECURITY: Sanitize project creation data (whitelist allowed fields)
  const name = typeof data.name === 'string' ? data.name : undefined
  const description = typeof data.description === 'string' ? data.description : undefined
  const status = typeof data.status === 'string' ? data.status : undefined
  const clientId = typeof data.clientId === 'string' ? data.clientId : undefined
  const budget = typeof data.budget === 'number' ? data.budget : undefined
  const deadline = typeof data.deadline === 'string' ? data.deadline : undefined
  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required" }, { status: 400 })
  }

  // Validate status
  const projectStatus = status || "PLANNING"
  if (!VALID_PROJECT_STATUSES.includes(projectStatus)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_PROJECT_STATUSES.join(", ")}` }, { status: 400 })
  }

  // Verify client exists
  const clientExists = await db.client.findUnique({ where: { id: clientId } })
  if (!clientExists) {
    return NextResponse.json({ error: "Client not found" }, { status: 400 })
  }

  const project = await db.project.create({
    data: {
      name,
      description: description || null,
      status: projectStatus,
      clientId,
      budget: budget || null,
      deadline: deadline ? new Date(deadline) : null,
    },
  })
  return NextResponse.json(project, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Rate limit
  const rl = rateLimit(`projects-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  // Only admins can update projects
  const userRole = session.user.role
  if (!isAdmin(userRole)) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { id, ...data } = body as { id?: string; [key: string]: unknown }
  const projectId = typeof id === 'string' ? id : ''

  if (!projectId) {
    return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
  }

  // Verify project exists
  const existing = await db.project.findUnique({ where: { id: projectId } })
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // SECURITY: Sanitize project update data (whitelist allowed fields)
  const allowedFields = ["name", "description", "status", "clientId", "budget", "deadline", "progress"]
  const sanitizedData: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      if (key === "deadline") {
        sanitizedData[key] = typeof data[key] === 'string' ? new Date(data[key]) : null
      } else if (key === "status") {
        if (typeof data[key] !== 'string' || !VALID_PROJECT_STATUSES.includes(data[key])) {
          return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_PROJECT_STATUSES.join(", ")}` }, { status: 400 })
        }
        sanitizedData[key] = data[key]
      } else if (key === "progress") {
        const progressVal = Number(data[key])
        if (isNaN(progressVal) || progressVal < 0 || progressVal > 100) {
          return NextResponse.json({ error: "Progress must be between 0 and 100" }, { status: 400 })
        }
        sanitizedData[key] = progressVal
      } else {
        sanitizedData[key] = data[key]
      }
    }
  }

  const project = await db.project.update({ where: { id: projectId }, data: sanitizedData })
  return NextResponse.json(project)
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Rate limit
    const rl = rateLimit(`projects-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const userRole = session.user.role
    if (!isAdmin(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "Project ID is required" }, { status: 400 })

    // Verify project exists
    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    // Delete related records in correct order (respect FK constraints)
    // 1. Delete task-dependent records first
    const tasks = await db.task.findMany({ where: { projectId: id }, select: { id: true } })

    // 2. Delete project members
    await db.projectMember.deleteMany({ where: { projectId: id } })

    // 3. Delete tasks
    await db.task.deleteMany({ where: { projectId: id } })

    // 4. Delete time entries
    await db.timeEntry.deleteMany({ where: { projectId: id } })

    // 5. Delete meetings linked to project
    const meetings = await db.meeting.findMany({ where: { projectId: id }, select: { id: true } })
    for (const meeting of meetings) {
      await db.meetingAttendee.deleteMany({ where: { meetingId: meeting.id } })
    }
    await db.meeting.deleteMany({ where: { projectId: id } })

    // 6. Delete expenses and subscriptions
    await db.expense.deleteMany({ where: { projectId: id } })
    await db.subscription.deleteMany({ where: { projectId: id } })

    // 7. Delete invoices linked to project
    await db.invoice.deleteMany({ where: { projectId: id } })

    // 8. Delete the project itself
    await db.project.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[projects] DELETE error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
