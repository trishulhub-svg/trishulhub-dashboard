import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureAllTables } from "@/lib/auto-migrate"
import { deepSanitize } from "@/lib/utils"
import { canAccessProject, canManageProjects, isValidProjectId } from "@/lib/project-access"
import { z } from "zod"

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().optional().nullable(),
})

const patchSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().optional().nullable(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    const allowed = await canAccessProject(session.user.id, session.user.role, projectId)
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await ensureAllTables()

    const milestones = await db.projectMilestone.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json(deepSanitize(milestones))
  } catch (error: unknown) {
    console.error("[milestones] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to load milestones" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjects(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`milestones-write-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const { projectId } = await params
    if (!isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID" }, { status: 400 })
    }

    await ensureAllTables()

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const maxOrder = await db.projectMilestone.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    })

    const milestone = await db.projectMilestone.create({
      data: {
        projectId,
        title: parsed.data.title,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    })

    return NextResponse.json(deepSanitize(milestone), { status: 201 })
  } catch (error: unknown) {
    console.error("[milestones] POST error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to create milestone" }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjects(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { projectId } = await params

    let body: Record<string, unknown> = {}
    const idFromQuery = new URL(req.url).searchParams.get("id")
    try {
      const json = await req.json().catch(() => ({}))
      if (json && typeof json === "object") body = json as Record<string, unknown>
    } catch {
      /* empty body ok when id in query */
    }

    const id = (body.id as string) || idFromQuery
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const parsed = patchSchema.safeParse({ ...body, id })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }

    const { id: milestoneId, title, done, sortOrder, dueDate } = parsed.data

    const existing = await db.projectMilestone.findFirst({ where: { id: milestoneId, projectId } })
    if (!existing) return NextResponse.json({ error: "Milestone not found" }, { status: 404 })

    const milestone = await db.projectMilestone.update({
      where: { id: milestoneId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(done !== undefined ? { done } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    })

    return NextResponse.json(deepSanitize(milestone))
  } catch (error: unknown) {
    console.error("[milestones] PATCH error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to update milestone" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageProjects(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { projectId } = await params
    const id = new URL(req.url).searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const existing = await db.projectMilestone.findFirst({ where: { id, projectId } })
    if (!existing) return NextResponse.json({ error: "Milestone not found" }, { status: 404 })

    await db.projectMilestone.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[milestones] DELETE error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to delete milestone" }, { status: 500 })
  }
}
