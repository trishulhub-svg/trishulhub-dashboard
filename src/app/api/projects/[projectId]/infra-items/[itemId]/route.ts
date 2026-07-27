import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db, getAppSetting } from "@/lib/db"
import { isAdminOrProjectManager } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { encryptCredentialToJson, decryptCredentialFromJson } from "@/lib/encryption"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import { canAccessProject, isValidProjectId } from "@/lib/project-access"

import {
  builtinLabelForKey,
  isCustomInfraGroupKey,
  isValidInfraGroupKey,
  sanitizeInfraGroupLabel,
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

function isMemberAccessActive(access: { visibleUntil: Date | null } | null, now = new Date()): boolean {
  return !!access?.visibleUntil && access.visibleUntil.getTime() > now.getTime()
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

async function getScopedItem(projectId: string, itemId: string): Promise<InfraItem | null> {
  return db.projectInfraItem.findFirst({
    where: { id: itemId, projectId },
  }) as Promise<InfraItem | null>
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: admin or project manager access required" }, { status: 403 })
    }

    const rl = rateLimit(`infra-items-patch-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { projectId, itemId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const existing = await getScopedItem(projectId, itemId)
    if (!existing) {
      return NextResponse.json({ error: "Infrastructure item not found" }, { status: 404 })
    }

    let body: {
      groupKey?: unknown
      groupLabel?: unknown
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

    const data: {
      groupKey?: string
      groupLabel?: string | null
      label?: string
      isSecret?: boolean
      valuePlain?: string | null
      valueEnc?: string | null
      sortOrder?: number
      updatedBy: string
    } = { updatedBy: session.user.id }

    if ("groupKey" in body) {
      const nextKey = typeof body.groupKey === "string" ? body.groupKey.trim().toUpperCase() : ""
      if (!isValidInfraGroupKey(nextKey)) {
        return NextResponse.json(
          { error: "Invalid groupKey. Use GITHUB/TURSO/CLOUDFLARE/SMTP or CUSTOM_*" },
          { status: 400 }
        )
      }
      data.groupKey = nextKey
      if (isCustomInfraGroupKey(nextKey)) {
        data.groupLabel =
          sanitizeInfraGroupLabel(body.groupLabel) ||
          existing.groupLabel ||
          nextKey.replace(/^CUSTOM_/, "").replace(/_/g, " ")
      } else {
        data.groupLabel = null
      }
    } else if ("groupLabel" in body && isCustomInfraGroupKey(existing.groupKey)) {
      const gl = sanitizeInfraGroupLabel(body.groupLabel)
      if (!gl) return NextResponse.json({ error: "groupLabel is required" }, { status: 400 })
      data.groupLabel = gl
    }

    if ("label" in body) {
      const label = sanitizeText(body.label, 160)
      if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 })
      data.label = label
    }

    if ("sortOrder" in body) {
      if (typeof body.sortOrder !== "number" || !Number.isFinite(body.sortOrder)) {
        return NextResponse.json({ error: "sortOrder must be a number" }, { status: 400 })
      }
      data.sortOrder = Math.trunc(body.sortOrder)
    }

    const nextIsSecret = "isSecret" in body ? body.isSecret !== false : existing.isSecret
    if ("isSecret" in body) {
      data.isSecret = nextIsSecret
    }

    if ("value" in body || "isSecret" in body) {
      const valueProvided = "value" in body
      const value = typeof body.value === "string" ? body.value.trim().slice(0, 4000) : ""

      if (nextIsSecret) {
        data.valuePlain = null
        if (valueProvided) {
          const dbKey = value ? await loadCredDbKey() : ""
          data.valueEnc = value ? encryptCredentialToJson(value, dbKey || undefined) : null
        } else if (!existing.isSecret) {
          data.valueEnc = null
        }
      } else {
        data.valueEnc = null
        data.valuePlain = valueProvided ? value : existing.isSecret ? "" : existing.valuePlain
      }
    }

    const item = await db.projectInfraItem.update({
      where: { id: existing.id },
      data,
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "UPDATE",
      entityType: "ProjectInfraItem",
      entityId: item.id,
      description: `Updated infrastructure item "${item.label}" for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, item: serializeItem(item as InfraItem) })
  } catch (error) {
    console.error("[infra-items/item] PATCH error:", error)
    return NextResponse.json({ error: "Failed to update infrastructure item" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!isAdminOrProjectManager(session.user.role)) {
      return NextResponse.json({ error: "Forbidden: admin or project manager access required" }, { status: 403 })
    }

    const rl = rateLimit(`infra-items-delete-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { projectId, itemId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const existing = await getScopedItem(projectId, itemId)
    if (!existing) {
      return NextResponse.json({ error: "Infrastructure item not found" }, { status: 404 })
    }

    await db.projectInfraItem.delete({ where: { id: existing.id } })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "DELETE",
      entityType: "ProjectInfraItem",
      entityId: existing.id,
      description: `Deleted infrastructure item "${existing.label}" for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[infra-items/item] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete infrastructure item" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { projectId, itemId } = await params
    if (!projectId || !isValidProjectId(projectId)) {
      return NextResponse.json({ error: "Invalid project ID format" }, { status: 400 })
    }

    const userRole = session.user.role
    const userId = session.user.id
    if (!(await canAccessProject(userId, userRole, projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rl = rateLimit(`infra-item-reveal-${session.user.id}`, 10, 60_000)
    if (!rl.success) {
      return NextResponse.json({ error: "Too many reveal requests. Try again in a minute." }, { status: 429 })
    }

    const item = await getScopedItem(projectId, itemId)
    if (!item) {
      return NextResponse.json({ error: "Infrastructure item not found" }, { status: 404 })
    }

    const canManage = isAdminOrProjectManager(userRole)
    if (!canManage) {
      const memberAccess = await db.projectInfraMemberAccess.findUnique({ where: { projectId } })
      if (!isMemberAccessActive(memberAccess)) {
        return NextResponse.json({ error: "Infrastructure visibility has expired" }, { status: 403 })
      }
    }

    if (!item.isSecret) {
      return NextResponse.json({
        success: true,
        id: item.id,
        value: item.valuePlain || "",
        revealSeconds: 30,
      })
    }

    if (!item.valueEnc) {
      return NextResponse.json({ error: "No secret value set for this item" }, { status: 404 })
    }

    const dbKey = await loadCredDbKey()
    const value = decryptCredentialFromJson(item.valueEnc, dbKey || undefined)
    if (!value) {
      return NextResponse.json({ error: "Failed to decrypt infrastructure item" }, { status: 500 })
    }

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role || "",
      department: "SYSTEM",
      page: "projects",
      action: "READ",
      entityType: "ProjectInfraItem",
      entityId: item.id,
      description: `Revealed infrastructure item "${item.label}" for project ${projectId}`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({
      success: true,
      id: item.id,
      value,
      revealSeconds: 30,
    })
  } catch (error) {
    console.error("[infra-items/item] reveal error:", error)
    return NextResponse.json({ error: "Failed to reveal infrastructure item" }, { status: 500 })
  }
}
