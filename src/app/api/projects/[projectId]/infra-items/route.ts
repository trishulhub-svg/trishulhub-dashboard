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
import { isInfraGrantActive, serializeInfraGrant } from "@/lib/infra-member-access"
import {
  BUILTIN_INFRA_GROUPS,
  builtinLabelForKey,
  isBuiltinInfraGroupKey,
  isCustomInfraGroupKey,
  isValidInfraGroupKey,
  sanitizeInfraGroupLabel,
  toCustomInfraGroupKey,
} from "@/lib/infra-groups"

type InfraItem = {
  id: string
  projectId: string
  groupKey: string
  groupLabel?: string | null
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

function serializeItem(item: InfraItem) {
  const hasValue = item.isSecret ? !!item.valueEnc : !!item.valuePlain
  return {
    id: item.id,
    projectId: item.projectId,
    groupKey: item.groupKey,
    groupLabel:
      item.groupLabel ||
      builtinLabelForKey(item.groupKey) ||
      (isCustomInfraGroupKey(item.groupKey)
        ? item.groupKey.replace(/^CUSTOM_/, "").replace(/_/g, " ")
        : item.groupKey),
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

function buildGroupedResponse(items: InfraItem[]) {
  const groups: Record<string, Array<ReturnType<typeof serializeItem>>> = {}
  for (const g of BUILTIN_INFRA_GROUPS) groups[g.key] = []

  const customMeta = new Map<string, string>()
  for (const item of items) {
    if (!isValidInfraGroupKey(item.groupKey)) continue
    if (!groups[item.groupKey]) groups[item.groupKey] = []
    const serialized = serializeItem(item)
    groups[item.groupKey].push(serialized)
    if (isCustomInfraGroupKey(item.groupKey)) {
      customMeta.set(item.groupKey, serialized.groupLabel)
    }
  }

  const groupDefs = [
    ...BUILTIN_INFRA_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      description: g.description,
      builtin: true as const,
    })),
    ...[...customMeta.entries()].map(([key, label]) => ({
      key,
      label,
      description: "Custom infrastructure group",
      builtin: false as const,
    })),
  ]

  return { groups, groupDefs }
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
    const now = new Date()

    let memberCanView = false
    let grants: ReturnType<typeof serializeInfraGrant>[] = []
    let ownVisibleUntil: string | null = null

    if (canManage) {
      const rows = await db.projectInfraMemberAccess.findMany({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
      })
      const userIds = [...new Set(rows.map((r) => r.userId))]
      const users = userIds.length
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true },
          })
        : []
      const nameById = new Map(users.map((u) => [u.id, u.name]))
      grants = rows.map((r) =>
        serializeInfraGrant({ ...r, userName: nameById.get(r.userId) || null }, now)
      )
      memberCanView = grants.some((g) => g.isActive)
    } else {
      const own = await db.projectInfraMemberAccess.findUnique({
        where: { projectId_userId: { projectId, userId } },
      })
      memberCanView = isInfraGrantActive(own, now)
      ownVisibleUntil = own?.visibleUntil?.toISOString() ?? null
    }

    const canView = canManage || memberCanView

    const visibleItems = canView
      ? ((await db.projectInfraItem.findMany({
          where: { projectId },
          orderBy: [{ groupKey: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        })) as InfraItem[])
      : []

    const { groups, groupDefs } = buildGroupedResponse(visibleItems)

    return NextResponse.json({
      success: true,
      groups,
      groupDefs,
      groupKeys: groupDefs.map((g) => g.key),
      memberAccess: canManage
        ? {
            isActive: memberCanView,
            visibleUntil: null,
            grants,
          }
        : {
            isActive: memberCanView,
            visibleUntil: ownVisibleUntil,
            grants: [],
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

    await ensureCriticalSchema()

    let body: {
      groupKey?: unknown
      groupLabel?: unknown
      customGroupName?: unknown
      label?: unknown
      isSecret?: unknown
      value?: unknown
      sortOrder?: unknown
    }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    let groupKey =
      typeof body.groupKey === "string" ? body.groupKey.trim().toUpperCase() : ""
    let groupLabel: string | null = null

    // Allow creating a custom group in one shot via customGroupName
    if (!groupKey && typeof body.customGroupName === "string") {
      const name = sanitizeInfraGroupLabel(body.customGroupName)
      const customKey = toCustomInfraGroupKey(name)
      if (!name || !customKey) {
        return NextResponse.json({ error: "Invalid custom group name" }, { status: 400 })
      }
      groupKey = customKey
      groupLabel = name
    }

    if (!isValidInfraGroupKey(groupKey)) {
      return NextResponse.json(
        { error: "Invalid groupKey. Use GITHUB/TURSO/CLOUDFLARE/SMTP or CUSTOM_*" },
        { status: 400 }
      )
    }

    if (isCustomInfraGroupKey(groupKey)) {
      groupLabel =
        sanitizeInfraGroupLabel(body.groupLabel) ||
        sanitizeInfraGroupLabel(body.customGroupName) ||
        groupKey.replace(/^CUSTOM_/, "").replace(/_/g, " ")
      if (!groupLabel) {
        return NextResponse.json({ error: "groupLabel is required for custom groups" }, { status: 400 })
      }
    } else if (isBuiltinInfraGroupKey(groupKey)) {
      groupLabel = null
    }

    const label = sanitizeText(body.label, 160)
    if (!label) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 })
    }

    const isSecret = body.isSecret !== false
    const value = typeof body.value === "string" ? body.value.trim().slice(0, 4000) : ""
    const dbKey = isSecret && value ? await loadCredDbKey() : ""
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.trunc(body.sortOrder)
        : 0

    const item = await db.projectInfraItem.create({
      data: {
        projectId,
        groupKey,
        groupLabel,
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
      description: `Created ${groupKey} infrastructure item "${label}" for project ${projectId}`,
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

    await ensureCriticalSchema()

    let body: { visibleUntil?: unknown; userIds?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return NextResponse.json({ error: "Select at least one member" }, { status: 400 })
    }
    const userIds = [
      ...new Set(
        body.userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim())
      ),
    ]
    if (userIds.length === 0) {
      return NextResponse.json({ error: "Select at least one member" }, { status: 400 })
    }
    if (userIds.length > 50) {
      return NextResponse.json({ error: "Too many members selected" }, { status: 400 })
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
      if (visibleUntil.getTime() <= Date.now()) {
        return NextResponse.json({ error: "visibleUntil must be in the future" }, { status: 400 })
      }
    }

    const members = await db.projectMember.findMany({
      where: { projectId, userId: { in: userIds } },
      include: {
        user: { select: { id: true, name: true, role: true, isActive: true } },
      },
    })
    if (members.length !== userIds.length) {
      return NextResponse.json({ error: "One or more selected users are not project members" }, { status: 400 })
    }
    for (const m of members) {
      if (!m.user.isActive) {
        return NextResponse.json({ error: `Cannot grant access to deactivated user (${m.user.name})` }, { status: 400 })
      }
      if (isAdminOrProjectManager(m.user.role)) {
        return NextResponse.json(
          { error: `${m.user.name} already has full infrastructure access as ${m.user.role}` },
          { status: 400 }
        )
      }
    }

    const now = new Date()
    for (const uid of userIds) {
      if (visibleUntil) {
        await db.projectInfraMemberAccess.upsert({
          where: { projectId_userId: { projectId, userId: uid } },
          create: {
            projectId,
            userId: uid,
            visibleUntil,
            enabledBy: session.user.id,
          },
          update: {
            visibleUntil,
            enabledBy: session.user.id,
          },
        })
      } else {
        await db.projectInfraMemberAccess.deleteMany({
          where: { projectId, userId: uid },
        })
      }
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "ACCESS",
      entityType: "ProjectInfraMemberAccess",
      entityId: projectId,
      description: visibleUntil
        ? `Granted infrastructure visibility to ${userIds.length} member(s) until ${visibleUntil.toISOString()} for project ${projectId}`
        : `Revoked infrastructure visibility for ${userIds.length} member(s) on project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    const allRows = await db.projectInfraMemberAccess.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    })
    const allUserIds = [...new Set(allRows.map((r) => r.userId))]
    const allUsers = allUserIds.length
      ? await db.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, name: true } })
      : []
    const nameById = new Map(allUsers.map((u) => [u.id, u.name]))
    const allGrants = allRows.map((r) =>
      serializeInfraGrant({ ...r, userName: nameById.get(r.userId) || null }, now)
    )

    return NextResponse.json({
      success: true,
      memberAccess: {
        isActive: allGrants.some((g) => g.isActive),
        visibleUntil: null,
        grants: allGrants,
      },
    })
  } catch (error) {
    console.error("[infra-items] PUT error:", error)
    return NextResponse.json({ error: "Failed to update member access" }, { status: 500 })
  }
}
