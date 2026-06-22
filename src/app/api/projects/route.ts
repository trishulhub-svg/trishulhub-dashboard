import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdmin, isAdminOrProjectManager, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { createProjectSchema, updateProjectSchema } from "@/lib/validations"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"

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
    // Skip ensureAllTables for minimal fetches (speeds up dropdowns)
    const isMinimal = req.nextUrl.searchParams.get("fields") === "minimal"
    if (!isMinimal) {
      await ensureAllTables()
    }

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
    // "all" → return all projects (demo + non-demo). When omitted, defaults
    // to excluding demos so /dashboard/projects (and any caller that doesn't
    // explicitly opt in) only sees regular projects; /dashboard/demo uses
    // ?isDemo=true. Single-project fetches (projectId specified) never apply
    // the default so demo project detail/edit loads keep working.
    //
    // Task 7 (Phase 4): demo projects now live ONLY on /dashboard/demo;
    // regular projects live ONLY on /dashboard/projects.
    //
    // ISSUE 5 FIX: For non-admin (DEVELOPER/CLIENT/VIEWER) list fetches, the
    // isDemo=false default must NOT be applied. Non-admins are already
    // constrained to their assigned project IDs via getAssignedProjectIds
    // (DEVELOPER/VIEWER) or their client record (CLIENT), and that set may
    // include demo projects they're working on. Applying isDemo=false here
    // would silently hide those demo projects — e.g. the time-tracking page
    // dropdown would only show "No Project". Admins (and PROJECT_MANAGER,
    // who has admin-like project visibility) keep the isDemo=false default
    // so /dashboard/projects stays demo-free.
    const userIsAdmin = isAdmin(userRole)
    // PROJECT_MANAGER gets admin-like project visibility (no project ID filter),
    // but budget visibility is still gated by isAdmin (PM does NOT see budget).
    const canManageProjects = isAdminOrProjectManager(userRole)
    const isDemoParam = searchParams.get("isDemo")
    // isMinimal already declared at top of function
    const isDemoFilter: boolean | undefined =
      isDemoParam === "true" ? true
      : isDemoParam === "false" ? false
      : isDemoParam === "all" ? undefined
      : projectId ? undefined  // single-project fetch — never filter by isDemo
      : canManageProjects ? false    // admin/PM list fetch with no param — exclude demos
      : undefined              // non-admin list fetch — show ALL assigned projects (regular + demo)

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
    // PROJECT_MANAGER also doesn't see budget — only SUPER_ADMIN/ADMIN do
    const includeBudget = userIsAdmin

    // FAST PATH: minimal fields for dropdowns (time tracking, etc.)
    // Returns only id, name, status, progress — no includes, no methods
    if (isMinimal && !projectId) {
      const projects = await db.project.findMany({
        where,
        select: { id: true, name: true, status: true, progress: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      return NextResponse.json(projects)
    }

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

    // Fetch project-method assignments — only for detail view (not list view)
    // This skips a slow raw SQL query when just listing projects
    let methodsMap: Record<string, Array<{ id: string; name: string }>> = {}
    if (projectId) {
      try {
        const assignments = await db.$queryRawUnsafe(
          `SELECT j."B" as "projectId", pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = ?`,
          projectId
        ) as unknown as Array<{ projectId: string; id: string; name: string }>
        for (const a of assignments) {
          if (!methodsMap[a.projectId]) methodsMap[a.projectId] = []
          methodsMap[a.projectId].push({ id: a.id, name: a.name })
        }
      } catch {
        // Join table may not exist — non-fatal
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

    // Only admins can create projects (PROJECT_MANAGER can also create/manage projects
    // per requirements — they have full project-management capabilities)
    const userRole = session.user.role
    if (!isAdminOrProjectManager(userRole)) {
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
    // Normalize clientId: empty string ("") and undefined both mean "No Client"
    // and must be persisted as null (Prisma expects null for optional relations).
    const rawClientId = typeof validated.clientId === "string" ? validated.clientId.trim() : ""
    const clientId = rawClientId.length > 0 ? rawClientId : null

    // If clientId is provided, verify client exists
    if (clientId) {
      const clientExists = await db.client.findUnique({ where: { id: clientId } })
      if (!clientExists) {
        return NextResponse.json({ error: "Client not found" }, { status: 400 })
      }
    }

    // Build the create data — only include fields that exist in the schema
    const createData = {
      name,
      description: description,
      status: projectStatus,
      clientId,
      budget: validated.budget ?? null,
      deadline: validated.deadline ? new Date(validated.deadline) : null,
      startDate: validated.startDate ? new Date(validated.startDate) : null,
    }

    // Only add isDemo if the column exists in the DB
    // We'll try with it first, and if it fails, retry without it
    let project
    try {
      project = await db.project.create({
        data: { ...createData, isDemo: validated.isDemo === true },
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      // If the error is about isDemo column, try without it
      if (errMsg.includes("isDemo") || errMsg.includes("Unknown column") || errMsg.includes("no such column")) {
        console.warn("[projects] POST: isDemo column may not exist, trying without it...")
        // Try to add the column for next time
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "Project" ADD COLUMN isDemo BOOLEAN NOT NULL DEFAULT 0`)
        } catch { /* column already exists or other error */ }
        // Retry without isDemo (DB default will handle it)
        project = await db.project.create({ data: createData })
      } else {
        throw err
      }
    }
    // I1: Targeted Date serialization
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "TEAM_WORK", page: "projects", action: "CREATE",
      entityType: "Project", entityId: project.id,
      description: `Created project: ${project.name}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
    return NextResponse.json(serializeProjectDates(project), { status: 201 })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[projects] POST error:", errMsg)
    return NextResponse.json({ error: `Failed to create project: ${errMsg.slice(0, 150)}` }, { status: 500 })
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

    // Only admins/PM can update projects
    const userRole = session.user.role
    if (!isAdminOrProjectManager(userRole)) {
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

    // Audit: log UPDATE (or STATUS_CHANGE if the only meaningful change was the status field)
    const statusOnlyChange =
      sanitizedData.status !== undefined &&
      Object.keys(sanitizedData).every((k) => k === "status")
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "TEAM_WORK", page: "projects",
      action: statusOnlyChange ? "STATUS_CHANGE" : "UPDATE",
      entityType: "Project", entityId: projectId,
      description: statusOnlyChange
        ? `Changed project status: ${existing.name} (${existing.status} → ${sanitizedData.status})`
        : `Updated project: ${project.name}`,
      oldValue: sanitizedData.status !== undefined ? existing.status : undefined,
      newValue: sanitizedData.status !== undefined ? String(sanitizedData.status) : undefined,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })
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
    if (!isAdminOrProjectManager(userRole)) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "Project ID is required" }, { status: 400 })

    // Verify project exists
    const existing = await db.project.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 })

    // Capture project name before deletion for the audit log
    const projectName = existing.name

    // Delete project and all related records using raw SQL for maximum reliability
    // (relationMode = "prisma" causes issues with cascading deletes)
    await db.$transaction([
      db.$executeRawUnsafe(`DELETE FROM "ProjectAttachment" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "ProjectCredential" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "ProjectMember" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "ProjectWebsite" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "ProjectInfrastructure" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "TimeEntry" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "Expense" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "Subscription" WHERE "projectId" = ?`, id),
      db.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE "projectId" = ?`, id),
    ]).catch(() => {
      // Some tables might not exist — non-fatal, we'll try to delete the project anyway
    })

    // Delete join table entries
    try {
      await db.$executeRawUnsafe(`DELETE FROM "_ProjectMethodToProject" WHERE "B" = ?`, id)
    } catch { /* non-fatal */ }

    // Delete the project itself using raw SQL (bypasses Prisma referential integrity checks)
    await db.$executeRawUnsafe(`DELETE FROM "Project" WHERE "id" = ?`, id)

    // Audit: log project deletion (fire-and-forget)
    void logAudit({
      userId: session.user.id, userName: session.user.name || "unknown", userRole,
      department: "TEAM_WORK", page: "projects", action: "DELETE",
      entityType: "Project", entityId: id,
      description: `Deleted project: ${projectName}`,
      ipAddress: getIpAddress(req), userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error("[projects] DELETE error:", errMsg)
    // Return a helpful error message
    return NextResponse.json({ error: `Failed to delete project: ${errMsg.slice(0, 150)}` }, { status: 500 })
  }
}
