import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { isAdminOrProjectManager, getAssignedProjectIds } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
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
    // Skip ensureAllTables entirely — it's too slow and tables are created on server start
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
    const isMinimal = searchParams.get("fields") === "minimal"

    // W6: Reject negative/zero limit, cap at 200, default 100
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit")) || 100, 200))

    // W5: Add offset pagination parameter
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0)

    const isDemoParam = searchParams.get("isDemo")
    const isDemoFilter: boolean | undefined =
      isDemoParam === "true" ? true
      : isDemoParam === "false" ? false
      : undefined  // no filter by default

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

    // FAST PATH: minimal fields for dropdowns (time tracking, etc.)
    if (isMinimal && !projectId) {
      const projects = await db.project.findMany({
        where,
        select: { id: true, name: true, status: true, progress: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      return NextResponse.json(projects)
    }

    // DETAIL VIEW: When projectId is specified, return scalar fields + websites only
    // (detail page fetches members, client, infra from their own endpoints)
    if (projectId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        include: { websites: true },
      })
      if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

      // Fetch methods for this project
      let methods: Array<{ id: string; name: string }> = []
      try {
        const assignments = await db.$queryRawUnsafe(
          `SELECT pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = ?`,
          projectId
        ) as unknown as Array<{ id: string; name: string }>
        methods = assignments
      } catch { /* non-fatal */ }

      const result = { ...serializeProjectDates(project), methods }
      // Hide budget from non-managers
      if (!isAdminOrProjectManager(userRole)) {
        (result as any).budget = undefined
      }
      return NextResponse.json(result)
    }

    // LIST VIEW: scalars + client + websites (for Live buttons) — no member joins
    const projects = await db.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        progress: true,
        startDate: true,
        deadline: true,
        budget: true,
        createdAt: true,
        updatedAt: true,
        clientId: true,
        isDemo: true,
        client: { select: { id: true, name: true, company: true } },
        websites: {
          select: { id: true, url: true, label: true, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })

    // Batch-load methods for listed projects (join table)
    const projectIds = projects.map((p) => p.id)
    const methodsByProject = new Map<string, Array<{ id: string; name: string }>>()
    if (projectIds.length > 0) {
      try {
        const placeholders = projectIds.map(() => "?").join(",")
        const rows = await db.$queryRawUnsafe(
          `SELECT j."B" as "projectId", pm."id", pm."name"
           FROM "_ProjectMethodToProject" j
           JOIN "ProjectMethod" pm ON j."A" = pm."id"
           WHERE j."B" IN (${placeholders})`,
          ...projectIds
        ) as Array<{ projectId: string; id: string; name: string }>
        for (const row of rows) {
          const list = methodsByProject.get(row.projectId) || []
          list.push({ id: row.id, name: row.name })
          methodsByProject.set(row.projectId, list)
        }
      } catch {
        // non-fatal — methods optional on cards
      }
    }

    // Yellow blink: projects where current user has open (not done) assigned milestones
    const openAssignedProjectIds = new Set<string>()
    if (projectIds.length > 0 && userId) {
      try {
        const placeholders = projectIds.map(() => "?").join(",")
        const rows = await db.$queryRawUnsafe(
          `SELECT DISTINCT m."projectId" as "projectId"
           FROM "ProjectMilestone" m
           INNER JOIN "ProjectMilestoneAssignee" a ON a."milestoneId" = m."id"
           WHERE m."projectId" IN (${placeholders})
             AND m."done" = 0
             AND a."userId" = ?`,
          ...projectIds,
          userId
        ) as Array<{ projectId: string }>
        for (const row of rows) openAssignedProjectIds.add(row.projectId)
      } catch {
        // non-fatal — blink indicator optional
      }
    }

    const serialized = serializeProjects(
      projects.map((p) => ({
        ...p,
        methods: methodsByProject.get(p.id) || [],
        hasOpenAssignedMilestones: openAssignedProjectIds.has(p.id),
      })) as any[]
    )

    // Hide budget from non-managers (DEVELOPER/VIEWER/CLIENT). Admin + PM see budget.
    if (!isAdminOrProjectManager(userRole)) {
      const filtered = serialized.map(({ budget, ...rest }: any) => ({
        ...rest,
        budget: undefined,
      }))
      return NextResponse.json(filtered)
    }

    return NextResponse.json(serialized)
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
      console.error("[projects] POST validation failed:", errors, "| raw data:", JSON.stringify(data).slice(0, 300))
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 })
    }

    const validated = parseResult.data

    // SECURITY: Sanitize project creation data using validated (and schema-constrained) values
    const name = sanitizeInput(validated.name, 200)
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

    // ── Lenient createData: only include optional fields when they have a real value ──
    // Build the data object incrementally to avoid Prisma type issues with null values
    const createData: Record<string, unknown> = {
      name,
      status: projectStatus,
    }

    // clientId: explicitly set to null when no client is selected
    // Prisma accepts null for optional relations — this is correct
    createData.clientId = clientId

    // Description: only send if non-empty string
    if (typeof validated.description === "string" && validated.description.trim().length > 0) {
      createData.description = sanitizeInput(validated.description, 2000)
    }
    // Budget: only send if a real, finite, non-negative number
    if (typeof validated.budget === "number" && Number.isFinite(validated.budget) && validated.budget >= 0) {
      createData.budget = validated.budget
    }
    // Deadline: only send if non-empty string
    if (typeof validated.deadline === "string" && validated.deadline.trim().length > 0) {
      try {
        createData.deadline = new Date(validated.deadline)
      } catch {
        // ignore invalid date
      }
    }
    // StartDate: only send if non-empty string
    if (typeof validated.startDate === "string" && validated.startDate.trim().length > 0) {
      try {
        createData.startDate = new Date(validated.startDate)
      } catch {
        // ignore invalid date
      }
    }

    // Only add isDemo if the column exists in the DB
    // We'll try with it first, and if it fails, retry without it
    let project
    try {
      project = await db.project.create({
        data: { ...createData, isDemo: validated.isDemo === true } as any,
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
        project = await db.project.create({ data: createData as any })
      } else if (errMsg.includes("NOT NULL") && errMsg.includes("clientId")) {
        // The clientId column is NOT NULL in the DB — this happens on older DBs
        // where the nullable migration hasn't been applied yet.
        // Attempt a raw SQL fix: recreate the table with nullable clientId.
        console.error("[projects] POST: clientId column is NOT NULL — attempting migration fix...")
        try {
          // Quick fix: try to make the column nullable via table recreation
          await db.$executeRawUnsafe(`BEGIN`)
          await db.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Project_new" (
              "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT,
              "clientId" TEXT, "status" TEXT NOT NULL DEFAULT 'PLANNING', "progress" INTEGER NOT NULL DEFAULT 0,
              "isDemo" BOOLEAN NOT NULL DEFAULT 0, "startDate" DATETIME, "deadline" DATETIME, "budget" REAL,
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL
            )
          `)
          await db.$executeRawUnsafe(`
            INSERT INTO "Project_new" SELECT "id", "name", "description", NULLIF("clientId", ''),
              "status", "progress", COALESCE("isDemo", 0), "startDate", "deadline", "budget", "createdAt", "updatedAt" FROM "Project"
          `)
          await db.$executeRawUnsafe(`DROP TABLE "Project"`)
          await db.$executeRawUnsafe(`ALTER TABLE "Project_new" RENAME TO "Project"`)
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_clientId_index" ON "Project"("clientId")`)
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_status_index" ON "Project"("status")`)
          await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Project_deadline_index" ON "Project"("deadline")`)
          await db.$executeRawUnsafe(`COMMIT`)
          console.log("[projects] POST: clientId column is now nullable — retrying create...")
          // Retry the create
          project = await db.project.create({
            data: { ...createData, isDemo: validated.isDemo === true } as any,
          })
        } catch (fixErr) {
          await db.$executeRawUnsafe(`ROLLBACK`).catch(() => {})
          console.error("[projects] POST: migration fix failed:", fixErr instanceof Error ? fixErr.message : String(fixErr))
          throw new Error("Cannot create project with no client — database schema needs migration. Please contact admin to run migrations.")
        }
      } else {
        // Comprehensive error logging
        console.error("[projects] POST: db.project.create failed:", errMsg)
        console.error("[projects] POST: createData was:", JSON.stringify(createData, (key, value) =>
          value instanceof Date ? value.toISOString() : value
        ).slice(0, 500))
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
    const errCode = (error as { code?: string }).code
    const errStack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined
    // Comprehensive error logging: message + Prisma error code + stack trace head
    console.error("[projects] POST error:", errMsg, "| code:", errCode, "| stack:", errStack)
    // Return the actual error message (truncated) to the client so the UI can
    // surface what went wrong instead of a generic "Failed to create project".
    return NextResponse.json(
      { error: `Failed to create project: ${errMsg.slice(0, 200)}`, code: errCode },
      { status: 500 }
    )
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
      // description is nullable — null means "clear the description"
      sanitizedData.description = validated.description === null
        ? null
        : sanitizeInput(validated.description, 2000)
    }
    if (validated.status !== undefined) {
      sanitizedData.status = validated.status
    }
    // Progress is derived from milestone completion — ignore manual edits
    if (validated.progress !== undefined) {
      /* no-op: project.progress syncs from ProjectMilestone done ratio */
    }
    if (validated.deadline !== undefined) {
      // deadline is nullable — null/"" means "clear the deadline"
      sanitizedData.deadline = (validated.deadline === null || validated.deadline === "")
        ? null
        : new Date(validated.deadline)
    }
    if (validated.startDate !== undefined) {
      sanitizedData.startDate = (validated.startDate === null || validated.startDate === "")
        ? null
        : new Date(validated.startDate)
    }
    if (validated.clientId !== undefined) {
      // "" / null → no client; otherwise keep the id
      sanitizedData.clientId =
        validated.clientId === null || validated.clientId === ""
          ? null
          : validated.clientId
    }
    if (validated.budget !== undefined) {
      // budget is nullable — null means "clear the budget"
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

    // Protect accounting history — never wipe invoices with the project.
    const invoiceCount = await db.invoice.count({ where: { projectId: id } })
    if (invoiceCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete project while ${invoiceCount} invoice(s) are linked. Mark the project Completed or reassign invoices first.`,
          invoiceCount,
        },
        { status: 409 }
      )
    }

    // Detach financial/ops children instead of cascading deletes.
    const childCleanup = [
      () => db.projectCredential.deleteMany({ where: { projectId: id } }),
      () => db.projectMember.deleteMany({ where: { projectId: id } }),
      () => db.projectWebsite.deleteMany({ where: { projectId: id } }),
      () => db.projectInfrastructure.deleteMany({ where: { projectId: id } }),
      () => db.projectMilestone.deleteMany({ where: { projectId: id } }),
      () => db.timeEntry.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      () => db.expense.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      () => db.subscription.updateMany({ where: { projectId: id }, data: { projectId: null } }),
    ]

    for (const cleanup of childCleanup) {
      try {
        await cleanup()
      } catch (err) {
        console.warn(`[projects] DELETE: Prisma cleanup failed (non-fatal):`, err instanceof Error ? err.message : String(err))
      }
    }

    // Detach project↔method join (if present), then delete project.
    try {
      await db.$executeRawUnsafe(`DELETE FROM "_ProjectMethodToProject" WHERE "B" = ?`, id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes("no such table") && !msg.includes("does not exist")) {
        console.warn(`[projects] DELETE: method join cleanup failed (non-fatal):`, msg)
      }
    }

    // Delete the project — try Prisma ORM first, then raw SQL fallback
    try {
      await db.project.delete({ where: { id } })
    } catch (deleteErr) {
      const delMsg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr)
      console.warn("[projects] DELETE: Prisma ORM delete failed, trying raw SQL:", delMsg)
      try {
        await db.$executeRawUnsafe(`DELETE FROM "Project" WHERE "id" = ?`, id)
      } catch (rawErr) {
        const rawMsg = rawErr instanceof Error ? rawErr.message : String(rawErr)
        console.error("[projects] DELETE: raw SQL also failed:", rawMsg)
        // Last resort: try to identify which table is blocking the delete
        let blockerInfo = ""
        try {
          const blockers = await db.$queryRawUnsafe(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND sql LIKE '%projectId%' AND name != 'Project'
          `) as Array<{ name: string }>
          blockerInfo = ` Potential blocking tables: ${blockers.map(b => b.name).join(", ")}`
        } catch { /* ignore */ }
        throw new Error(`Cannot delete project (FK constraint).${blockerInfo} Original: ${delMsg.slice(0, 100)}`)
      }
    }

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
