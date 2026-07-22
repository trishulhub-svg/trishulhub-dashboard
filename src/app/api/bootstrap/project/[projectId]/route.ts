/**
 * GET /api/bootstrap/project/[projectId]
 * Project detail: project + members + infra + milestones (+ websites for admin/PM).
 * One session check; same canAccessProject / field stripping as child routes.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireBootstrapSession } from "@/lib/api-bootstrap"
import { db } from "@/lib/db"
import { isAdminOrProjectManager, getAssignedProjectIds } from "@/lib/rbac"
import { canAccessProject, isValidProjectId } from "@/lib/project-access"
import { deepSanitize } from "@/lib/utils"

function serializeProjectDates(p: Record<string, unknown>) {
  const createdAt = p.createdAt as Date | undefined
  const updatedAt = p.updatedAt as Date | undefined
  const deadline = p.deadline as Date | null | undefined
  const startDate = p.startDate as Date | null | undefined
  return {
    ...p,
    createdAt: createdAt?.toISOString?.() ?? createdAt,
    updatedAt: updatedAt?.toISOString?.() ?? updatedAt,
    deadline: deadline?.toISOString?.() ?? deadline ?? null,
    startDate: startDate?.toISOString?.() ?? startDate ?? null,
  }
}

function serializeInfra(infra: {
  id: string
  projectId: string
  githubRepoUrl: string | null
  githubBranch: string | null
  tursoUrl: string | null
  vercelProjectId: string | null
  deployUrl: string | null
  githubTokenEnc: string | null
  tursoTokenEnc: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: infra.id,
    projectId: infra.projectId,
    githubRepoUrl: infra.githubRepoUrl || "",
    githubBranch: infra.githubBranch || "",
    tursoUrl: infra.tursoUrl || "",
    vercelProjectId: infra.vercelProjectId || "",
    deployUrl: infra.deployUrl || "",
    hasGithubToken: !!infra.githubTokenEnc,
    hasTursoToken: !!infra.tursoTokenEnc,
    updatedBy: infra.updatedBy || null,
    createdAt: infra.createdAt?.toISOString() ?? null,
    updatedAt: infra.updatedAt?.toISOString() ?? null,
  }
}

const emptyInfra = (projectId: string) => ({
  id: null,
  projectId,
  githubRepoUrl: "",
  githubBranch: "",
  tursoUrl: "",
  vercelProjectId: "",
  deployUrl: "",
  hasGithubToken: false,
  hasTursoToken: false,
  updatedBy: null,
  createdAt: null,
  updatedAt: null,
})

const milestoneInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} as const

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = await requireBootstrapSession(req, "bootstrap-project")
    if ("error" in auth) return auth.error

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const userId = auth.session.user.id
    const userRole = auth.session.user.role

    if (!(await canAccessProject(userId, userRole, projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // CLIENT / assigned visibility already checked via canAccessProject;
    // still intersect with assigned list for non-managers when loading project row.
    const assignedProjectIds = await getAssignedProjectIds(userId, userRole)
    if (assignedProjectIds && !assignedProjectIds.includes(projectId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const canSeeWebsites = isAdminOrProjectManager(userRole)

    const [project, members, infra, milestones, websites] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
        include: { websites: true },
      }),
      db.projectMember.findMany({
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
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.projectInfrastructure.findUnique({ where: { projectId } }),
      db.projectMilestone.findMany({
        where: { projectId },
        include: milestoneInclude,
        orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      }),
      canSeeWebsites
        ? db.projectWebsite.findMany({
            where: { projectId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          })
        : Promise.resolve([]),
    ])

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    let methods: Array<{ id: string; name: string }> = []
    try {
      methods = (await db.$queryRawUnsafe(
        `SELECT pm."id", pm."name" FROM "_ProjectMethodToProject" j JOIN "ProjectMethod" pm ON j."A" = pm."id" WHERE j."B" = ?`,
        projectId
      )) as Array<{ id: string; name: string }>
    } catch {
      /* non-fatal */
    }

    const projectPayload = {
      ...serializeProjectDates(project as unknown as Record<string, unknown>),
      methods,
    }
    if (!isAdminOrProjectManager(userRole)) {
      ;(projectPayload as { budget?: unknown }).budget = undefined
    }

    return NextResponse.json({
      project: projectPayload,
      members: JSON.parse(JSON.stringify(members)),
      infrastructure: infra ? serializeInfra(infra) : emptyInfra(projectId),
      milestones: deepSanitize(milestones),
      websites: canSeeWebsites ? JSON.parse(JSON.stringify(websites)) : [],
    })
  } catch (error: unknown) {
    console.error(
      "[bootstrap/project] GET error:",
      error instanceof Error ? error.message : String(error)
    )
    return NextResponse.json({ error: "An error occurred" }, { status: 500 })
  }
}
