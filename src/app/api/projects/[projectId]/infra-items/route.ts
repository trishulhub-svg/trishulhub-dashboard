import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, getAppSetting } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { encryptCredentialToJson } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { canAccessProject, isValidProjectId } from "@/lib/project-access"
import { ensureCriticalSchema } from "@/lib/auto-migrate"

const GROUP_KEYS = ["GITHUB", "TURSO", "CLOUDFLARE", "SMTP"] as const
type InfraGroupKey = (typeof GROUP_KEYS)[number]

type InfraItem = {
  id: string
  projectId: string
  groupKey: string
  label: string
  isSecret: boolean
  valuePlain: string | null
  valueEnc: string | null
  sortOrder: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

function isGroupKey(value: unknown): value is InfraGroupKey {
  return typeof value === "string" && GROUP_KEYS.includes(value as InfraGroupKey)
}

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLen)
}

async function loadCredDbKey(): Promise<string> {
  try {
    return await getAppSetting("credentialEncryptionKey")
  } catch {
    return ""
  }
}

function isMemberAccessActive(access: { visibleUntil: Date | null } | null, now = new Date()): boolean {
  return !!access?.visibleUntil && access.visibleUntil.getTime() > now.getTime()
}

function emptyGroups() {
  return GROUP_KEYS.reduce<Record<InfraGroupKey, Array<ReturnType<typeof serializeItem>>>>((acc, key) => {
    acc[key] = []
    return acc
  }, {} as Record<InfraGroupKey, Array<ReturnType<typeof serializeItem>>>)
}

function serializeItem(item: InfraItem) {
  const hasValue = item.isSecret ? !!item.valueEnc : !!item.valuePlain
  return {
    id: item.id,
    projectId: item.projectId,
    groupKey: item.groupKey,
    label: item.label,
    isSecret: item.isSecret,
    value: item.isSecret ? null : item.valuePlain || "",
    hasValue,
    sortOrder: item.sortOrder,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

function groupItems(items: InfraItem[]) {
  const groups = emptyGroups()
  for (const item of items) {
    if (isGroupKey(item.groupKey)) {
      groups[item.groupKey].push(serializeItem(item))
    }
  }
  return groups
}

async function ensureProjectExists(projectId: string): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  return !!project
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const userRole = session.user.role
    const userId = session.user.id
    if (!(await canAccessProject(userId, userRole, projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await ensureCriticalSchema()

    const canManage = isAdminOrProjectManager(userRole)
    const [items, memberAccess] = await Promise.all([
      canManage
        ? db.projectInfraItem.findMany({
            where: { projectId },
            orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          })
        : Promise.resolve([]),
      db.projectInfraMemberAccess.findUnique({ where: { projectId } }),
    ])

    const memberCanView = isMemberAccessActive(memberAccess)
    const canView = canManage || memberCanView
    const visibleItems = canView
      ? canManage
        ? items
        : await db.projectInfraItem.findMany({
            where: { projectId },
            orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          })
      : []

    return NextResponse.json({
      success: true,
      groups: groupItems(visibleItems as InfraItem[]),
      groupKeys: GROUP_KEYS,
      memberAccess: {
        visibleUntil: memberAccess?.visibleUntil?.toISOString() ?? null,
        isActive: memberCanView,
      },
      canManage,
      canView,
    })
  } catch (error) {
    console.error("[infra-items] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch infrastructure items" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: admin or project manager access required" }, { status: 403 })
    }

    const rl = rateLimit(`infra-items-post-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }
    if (!(await ensureProjectExists(projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    let body: { groupKey?: unknown; label?: unknown; isSecret?: unknown; value?: unknown; sortOrder?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!isGroupKey(body.groupKey)) {
      return NextResponse.json({ error: `Invalid groupKey. Must be one of: ${GROUP_KEYS.join(", ")}` }, { status: 400 })
    }

    const label = sanitizeText(body.label, 160)
    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    const isSecret = body.isSecret !== false
    const value = typeof body.value === "string" ? body.value.trim().slice(0, 4000) : ""
    const dbKey = isSecret && value ? await loadCredDbKey() : ""
    const sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.trunc(body.sortOrder)
      : 0

    const item = await db.projectInfraItem.create({
      data: {
        projectId,
        groupKey: body.groupKey,
        label,
        isSecret,
        valuePlain: isSecret ? null : value,
        valueEnc: isSecret && value ? encryptCredentialToJson(value, dbKey || undefined) : null,
        sortOrder,
        createdBy: session.user.id,
        updatedBy: session.user.id,
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "CREATE",
      entityType: "ProjectInfraItem",
      entityId: item.id,
      description: `Created ${body.groupKey} infrastructure item "${label}" for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, item: serializeItem(item as InfraItem) }, { status: 201 })
  } catch (error) {
    console.error("[infra-items] POST error:", error)
    return NextResponse.json({ error: "Failed to create infrastructure item" }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: admin or project manager access required" }, { status: 403 })
    }

    const rl = rateLimit(`infra-items-access-put-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { projectId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }
    if (!(await ensureProjectExists(projectId))) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    let body: { visibleUntil?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    let visibleUntil: Date | null = null
    if (body.visibleUntil !== null && body.visibleUntil !== undefined) {
      if (typeof body.visibleUntil !== "string") {
        return NextResponse.json({ error: "visibleUntil must be an ISO string or null" }, { status: 400 })
      }
      visibleUntil = new Date(body.visibleUntil)
      if (Number.isNaN(visibleUntil.getTime())) {
        return NextResponse.json({ error: "visibleUntil must be a valid ISO date" }, { status: 400 })
      }
    }

    const access = await db.projectInfraMemberAccess.upsert({
      where: { projectId },
      create: {
        projectId,
        visibleUntil,
        enabledBy: visibleUntil ? session.user.id : null,
      },
      update: {
        visibleUntil,
        enabledBy: visibleUntil ? session.user.id : null,
      },
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "ACCESS",
      entityType: "ProjectInfraMemberAccess",
      entityId: access.id,
      description: visibleUntil
        ? `Enabled project infrastructure member visibility until ${visibleUntil.toISOString()} for project ${projectId}`
        : `Disabled project infrastructure member visibility for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      success: true,
      memberAccess: {
        visibleUntil: access.visibleUntil?.toISOString() ?? null,
        isActive: isMemberAccessActive(access),
      },
    })
  } catch (error) {
    console.error("[infra-items] PUT error:", error)
    return NextResponse.json({ error: "Failed to update member access" }, { status: 500 })
  }
}
