import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"

const VALID_PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]

// M-PRJ-3, M-PRJ-4: Server-side input sanitization — strip HTML tags and enforce length
function sanitizeInput(str: string, maxLength: number): string {
  const stripped = str.replace(/<[^>]*>/g, "").trim()
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped
}

export async function GET(req: NextRequest) {
  try {
    // Auto-migrate: ensure all tables/columns exist before querying (Turso)
    await ensureAllTables()

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

    // M-PRJ-2: Pagination limit (cap at 200, default 100)
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 200)

    // CLIENT users can only see their own projects
    if (userRole === "CLIENT") {
      const client = await db.client.findFirst({ where: { userId } })
      if (!client) return NextResponse.json([])
      // ZAI FIX #310: When projectId specified (detail page), return scalar-only data.
      // Detail page fetches tasks and members separately — no includes needed.
      const projects = await db.project.findMany({
        where: {
          clientId: client.id,
          ...(projectId ? { id: projectId } : {}),
        },
        include: { ...(projectId ? {} : { client: true, tasks: true }) },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      // Layer 0: JSON round-trip to ensure Date objects are ISO strings
      return NextResponse.json(JSON.parse(JSON.stringify(projects)))
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

    // ZAI FIX #310: When projectId is specified (detail page), return ONLY
    // scalar fields — no includes at all. The detail page fetches tasks,
    // members, and client data from their own dedicated endpoints.
    // This eliminates the possibility of circular refs or nested objects.
    const projects = await db.project.findMany({
      where,
      include: {
        ...(projectId ? {} : { client: true }),
        ...(projectId ? {} : { tasks: true }),
        ...(projectId ? {} : { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    // For developers: hide budget and client financial details
    if (!includeBudget) {
      const filtered = projects.map(({ budget, client, tasks: _t, members: _m, ...rest }) => ({
        ...rest,
        budget: undefined,
        client: client ? { id: client.id, name: client.name, company: client.company } : undefined,
      }))
      // Layer 0: JSON round-trip to strip Date objects → ISO strings
      return NextResponse.json(JSON.parse(JSON.stringify(filtered)))
    }

    // Layer 0: JSON round-trip to strip Date objects → ISO strings
    return NextResponse.json(JSON.parse(JSON.stringify(projects)))
  } catch (error: any) {
    console.error("[projects] GET error:", error?.message)
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 })
  }
}

// C-PRJ-1 FIX: Entire handler wrapped in try/catch to prevent stack trace leaks
export async function POST(req: NextRequest) {
  try {
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
    // M-PRJ-3, M-PRJ-4: Sanitize inputs (strip HTML tags, enforce length)
    const name = typeof data.name === 'string' ? sanitizeInput(data.name, 500) : undefined
    const description = typeof data.description === 'string' ? sanitizeInput(data.description, 5000) : undefined
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

    // H4: Validate budget is non-negative
    if (budget !== undefined && budget < 0) {
      return NextResponse.json({ error: "Budget cannot be negative" }, { status: 400 })
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
        // M-PRJ-1 FIX: Use ?? instead of || so budget: 0 is preserved
        budget: budget ?? null,
        deadline: deadline ? new Date(deadline) : null,
      },
    })
    return NextResponse.json(JSON.parse(JSON.stringify(project)), { status: 201 })
  } catch (error: any) {
    console.error("[projects] POST error:", error?.message)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}

// C-PRJ-1 FIX: Entire handler wrapped in try/catch to prevent stack trace leaks
export async function PUT(req: NextRequest) {
  try {
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
        } else if (key === "budget") {
          if (typeof data[key] === 'number' && (data[key] as number) < 0) {
            return NextResponse.json({ error: "Budget cannot be negative" }, { status: 400 })
          }
          sanitizedData[key] = data[key]
        } else if (key === "name") {
          // M-PRJ-3, M-PRJ-4: Sanitize name
          sanitizedData[key] = typeof data[key] === 'string' ? sanitizeInput(data[key] as string, 500) : data[key]
        } else if (key === "description") {
          // M-PRJ-3, M-PRJ-4: Sanitize description
          sanitizedData[key] = typeof data[key] === 'string' ? sanitizeInput(data[key] as string, 5000) : data[key]
        } else {
          sanitizedData[key] = data[key]
        }
      }
    }

    const project = await db.project.update({ where: { id: projectId }, data: sanitizedData })
    return NextResponse.json(JSON.parse(JSON.stringify(project)))
  } catch (error: any) {
    console.error("[projects] PUT error:", error?.message)
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 })
  }
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

    // C4: Use $transaction for atomic deletion of all related records
    await db.$transaction(async (tx) => {
      // M-PRJ-9 FIX: Explicitly delete attachments and credentials before project
      await tx.projectAttachment.deleteMany({ where: { projectId: id } })
      await tx.projectCredential.deleteMany({ where: { projectId: id } })
      // Delete project members
      await tx.projectMember.deleteMany({ where: { projectId: id } })
      // Delete tasks
      await tx.task.deleteMany({ where: { projectId: id } })
      // Delete time entries
      await tx.timeEntry.deleteMany({ where: { projectId: id } })
      // Delete meetings + attendees
      const meetings = await tx.meeting.findMany({ where: { projectId: id }, select: { id: true } })
      for (const meeting of meetings) {
        await tx.meetingAttendee.deleteMany({ where: { meetingId: meeting.id } })
      }
      await tx.meeting.deleteMany({ where: { projectId: id } })
      // Delete expenses and subscriptions
      await tx.expense.deleteMany({ where: { projectId: id } })
      await tx.subscription.deleteMany({ where: { projectId: id } })
      // Delete invoices
      await tx.invoice.deleteMany({ where: { projectId: id } })
      // Delete the project itself
      await tx.project.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[projects] DELETE error:", error?.message)
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
