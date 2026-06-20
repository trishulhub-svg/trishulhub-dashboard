import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { syncTasksToGit } from "@/lib/git-sync"
import { createProjectSchema, updateProjectSchema } from "@/lib/validations"
import { logAudit, getIpAddress, getUserAgent, buildDescription } from "@/lib/audit-log"

const VALID_PROJECT_STATUSES = ["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]

// M-PRJ-3, M-PRJ-4: Server-side input sanitization — strip HTML tags and enforce length
// TODO: Extract to @/lib/sanitize.ts
// NOTE (M-3): This regex-based sanitization is a basic defense. For production, consider
// using a proper library like DOMPurify or sanitize-html to handle edge cases (e.g., unclosed tags,
// attribute-based XSS, HTML entity encoding).
function sanitizeInput(str: string, maxLength: number): string {
  const stripped = str.replace(/<[^>]*>/g, "").trim()
  return stripped.length > maxLength ? stripped.slice(0, maxLength) : stripped
}

// I1: Targeted Date serialization helper (avoids JSON.parse(JSON.stringify(...)))
function serializeProjectDates(p: any): any {
  return {
    ...p,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
    deadline: p.deadline?.toISOString() ?? null,
    startDate: p.startDate?.toISOString() ?? null,
  }
}

function serializeProjects(projects: any[]): any[] {
  return projects.map((p) => serializeProjectDates(p))
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

    // W6: Reject negative/zero limit, cap at 200, default 100
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 100, 200))

    // W5: Add offset pagination parameter
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0)

    // isDemo filter: "true" → only demo projects, "false" → only non-demo,
    // omitted → return all projects (demo + non-demo). The main projects list
    // shows everything with a DEMO badge; /dashboard/demo filters to isDemo=true.
    const isDemoParam = searchParams.get("isDemo")
    const isDemoFilter: boolean | undefined =
      isDemoParam === "true" ? true : isDemoParam === "false" ? false : undefined

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
          ...(isDemoFilter !== undefined ? { isDemo: isDemoFilter } : {}),
        },
        include: { ...(projectId ? {} : { client: true }) },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      })
      // I1: Targeted Date serialization
      return NextResponse.json(serializeProjects(projects))
    }

    // DEVELOPER users only see projects they're assigned to
    const assignedProjectIds = await getAssignedProjectIds(userId, userRole)

    // Build where clause — P-H2: Properly typed Prisma where input
    const where: Prisma.ProjectWhereInput = {}
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
    // isDemo filter (optional) — supports /dashboard/demo?isDemo=true view
    if (isDemoFilter !== undefined) {
      where.isDemo = isDemoFilter
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
        ...(projectId ? {} : { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } }),
        // Only include websites for detail view — avoids breaking listing if table doesn't exist
        ...(projectId ? { websites: true } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })

    // Fetch project-method assignments — filter by projectId when specified
    let methodsMap: Record<string, Array<{ id: string; name: string }>> = {}
    try {
      const methodsSql = projectId
        ? `SELECT j."B" as "projectId", pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = '${projectId.replace(/'/g, "''")}'`
        : `SELECT j."B" as "projectId", pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id"`
      const assignments = await db.$queryRawUnsafe(methodsSql) as unknown as Array<{ projectId: string; id: string; name: string }>
      for (const a of assignments) {
        if (!methodsMap[a.projectId]) methodsMap[a.projectId] = []
        methodsMap[a.projectId].push({ id: a.id, name: a.name })
      }
    } catch (err: unknown) {
      // Join table may not exist yet — non-fatal
      const errMsg = err instanceof Error ? err.message : String(err)
      if (!errMsg.includes('no such table')) {
        console.warn('[projects] Failed to fetch project methods:', errMsg)
      }
    }

    // Attach methods to each project
    const projectsWithMethods = projects.map((p: any) => ({
      ...p,
      methods: methodsMap[p.id] || [],
    }))

    // For developers: hide budget and client financial details
    if (!includeBudget) {
      const filtered = projectsWithMethods.map(({ budget, client, members: _m, ...rest }) => ({
        ...rest,
        budget: undefined,
        client: client ? { id: client.id, name: client.name, company: client.company } : undefined,
      }))
      // I1: Targeted Date serialization
      return NextResponse.json(serializeProjects(filtered))
    }

    // I1: Targeted Date serialization
    return NextResponse.json(serializeProjects(projectsWithMethods))
  } catch (error: unknown) {
    console.error("[projects] GET error:", error instanceof Error ? error.message : String(error))
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

    // C22: Validate with Zod schema (source of truth for field limits)
    const parseResult = createProjectSchema.safeParse(data)
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 })
    }

    const validated = parseResult.data

    // SECURITY: Sanitize project creation data using validated (and schema-constrained) values
    const name = sanitizeInput(validated.name, 200)
    const description = validated.description ? sanitizeInput(validated.description, 2000) : null
    const projectStatus = validated.status || "PLANNING"
    const clientId = validated.clientId || null

    // If clientId is provided, verify client exists
    if (clientId && clientId.trim()) {
      const clientExists = await db.client.findUnique({ where: { id: clientId } })
      if (!clientExists) {
        return NextResponse.json({ error: "Client not found" }, { status: 400 })
      }
    }

    const project = await db.project.create({
      data: {
        name,
        description: description,
        status: projectStatus,
        clientId: clientId && clientId.trim() ? clientId : null,
        // M-PRJ-1 FIX: Use ?? instead of || so budget: 0 is preserved
        budget: validated.budget ?? null,
        deadline: validated.deadline ? new Date(validated.deadline) : null,
        // Demo flag — defaults to false; set to true when creating from /dashboard/demo
        isDemo: validated.isDemo === true,
      },
    })
    // Background: sync project data to Git (fire-and-forget)
    syncTasksToGit().catch((err) => console.error("[git-sync] Failed:", err))
    // I1: Targeted Date serialization
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "BUSINESS", page: "projects", action: "CREATE",
      entityType: "project", entityId: project.id,
      description: buildDescription("CREATE", "project", project.name),
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(serializeProjectDates(project), { status: 201 })
  } catch (error: unknown) {
    console.error("[projects] POST error:", error instanceof Error ? error.message : String(error))
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

    // C22: Validate with Zod schema (source of truth for field limits)
    // Spread id into the data for the update schema which expects it
    const parseResult = updateProjectSchema.safeParse({ id: projectId, ...data })
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 })
    }

    const validated = parseResult.data

    // Verify project exists
    const existing = await db.project.findUnique({ where: { id: projectId } })
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // SECURITY: Build sanitized update data from validated fields
    const sanitizedData: Record<string, any> = {}
    if (validated.name !== undefined) {
      sanitizedData.name = sanitizeInput(validated.name, 200)
    }
    if (validated.description !== undefined) {
      sanitizedData.description = sanitizeInput(validated.description, 2000)
    }
    if (validated.status !== undefined) {
      sanitizedData.status = validated.status
    }
    if (validated.progress !== undefined) {
      sanitizedData.progress = validated.progress
    }
    if (validated.deadline !== undefined) {
      sanitizedData.deadline = validated.deadline ? new Date(validated.deadline) : null
    }
    if (validated.budget !== undefined) {
      sanitizedData.budget = validated.budget
    }
    if (validated.isDemo !== undefined) {
      sanitizedData.isDemo = validated.isDemo
    }

    const project = await db.project.update({ where: { id: projectId }, data: sanitizedData })
    // I1: Targeted Date serialization
    return NextResponse.json(serializeProjectDates(project))
  } catch (error: unknown) {
    console.error("[projects] PUT error:", error instanceof Error ? error.message : String(error))
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
  } catch (error: unknown) {
    console.error("[projects] DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
