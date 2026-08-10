import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canManageFileSettings } from "@/lib/rbac"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { logAudit, getIpAddress, getUserAgent } from "@/lib/audit-log"
import {
  getFileDriveConfigPublic,
  saveFileDriveConfig,
  testDriveConnection,
  repairAllNodeDriveFolders,
  type FileDriveAuthMode,
} from "@/lib/file-drive"
import { getFileRoleAccessMap, saveFileRoleAccessMap, FILE_STAFF_ROLES } from "@/lib/file-access"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageFileSettings(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const [drive, roleAccess] = await Promise.all([
      getFileDriveConfigPublic(),
      getFileRoleAccessMap(),
    ])
    return NextResponse.json({ drive, roleAccess, roles: FILE_STAFF_ROLES })
  } catch (err) {
    console.error("[files/settings] GET", err)
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!canManageFileSettings(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const rl = rateLimit(`files-settings-${session.user.id}`, RATE_LIMITS.crmWrite.limit, RATE_LIMITS.crmWrite.windowMs)
    if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || "save")

    if (action === "test") {
      const result = await testDriveConnection()
      const drive = await getFileDriveConfigPublic()
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "ACCESS",
        entityType: "FileDriveConfig",
        description: result.ok
          ? `Drive connection test OK (${result.email || "unknown"})`
          : `Drive connection test failed: ${result.error || "unknown"}`,
        status: result.ok ? "SUCCESS" : "FAILURE",
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({
        ...result,
        rootFolderId: drive.rootFolderId,
        rootFolderUrl: drive.rootFolderUrl,
        hint: result.ok
          ? `All Trishulhub folders/files live under Drive → “Trishulhub Files” for ${result.email || "the connected account"}.`
          : undefined,
      })
    }

    if (action === "repair") {
      const result = await repairAllNodeDriveFolders()
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "CONFIG_CHANGE",
        entityType: "FileDriveConfig",
        description: `Repaired Drive folder tree (checked ${result.checked}, repaired ${result.repaired}, failed ${result.failed})`,
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ ok: result.failed === 0, ...result })
    }

    if (action === "roles") {
      const roleAccess = await saveFileRoleAccessMap(body.roleAccess || {})
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "CONFIG_CHANGE",
        entityType: "FileAccessRole",
        description: "Updated file management role access toggles",
        newValue: JSON.stringify(roleAccess),
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ roleAccess })
    }

    if (action === "delete") {
      const drive = await saveFileDriveConfig({
        mode: "SERVICE_ACCOUNT",
        impersonateEmail: "info@trishulhub.in",
        clear: true,
      })
      void logAudit({
        userId: session.user.id,
        userName: session.user.name || "unknown",
        userRole: session.user.role,
        department: "FILES",
        page: "files-settings",
        action: "DELETE",
        entityType: "FileDriveConfig",
        description: "Deleted Google Drive connection credentials",
        ipAddress: getIpAddress(req),
        userAgent: getUserAgent(req),
      })
      return NextResponse.json({ drive })
    }

    const mode = (body.mode === "OAUTH" ? "OAUTH" : "SERVICE_ACCOUNT") as FileDriveAuthMode
    const drive = await saveFileDriveConfig({
      mode,
      impersonateEmail: String(body.impersonateEmail || "info@trishulhub.in"),
      rootFolderId: body.rootFolderId ?? undefined,
      serviceAccountJson: body.serviceAccountJson ?? null,
      oauthClientId: body.oauthClientId ?? null,
      oauthClientSecret: body.oauthClientSecret ?? null,
      refreshToken: body.refreshToken ?? null,
    })

    void logAudit({
      userId: session.user.id,
      userName: session.user.name || "unknown",
      userRole: session.user.role,
      department: "FILES",
      page: "files-settings",
      action: "CONFIG_CHANGE",
      entityType: "FileDriveConfig",
      description: `Saved Google Drive connection (${mode})`,
      ipAddress: getIpAddress(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ drive })
  } catch (err) {
    console.error("[files/settings] PUT", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 200) : "Failed to save" },
      { status: 500 }
    )
  }
}
