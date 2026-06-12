import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ensureAllTables } from "@/lib/auto-migrate"
import { isAdmin } from "@/lib/rbac"
import { getLarkConfig, saveLarkConfig, validateLarkConfig, getLarkToken } from "@/lib/lark/auth"
import { getTaskLists } from "@/lib/lark/client"
import type { LarkConfig } from "@/lib/lark/types"

// GET — Fetch current Lark config (masked secrets) + connection status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()
    const config = await getLarkConfig()

    if (!config) {
      return NextResponse.json({
        configured: false,
        enabled: false,
        taskLists: [],
      })
    }

    // Get connection status by checking if we can get a token
    let connected = false
    let errorMsg: string | undefined
    if (config.appId && config.appSecret) {
      const token = await getLarkToken()
      connected = !!token
      if (!connected) errorMsg = "Failed to authenticate — check App ID and Secret"
    }

    // Fetch task lists if connected
    let taskLists: Array<{ id: string; name: string }> = []
    if (connected) {
      try {
        const lists = await getTaskLists()
        taskLists = lists.map((l) => ({ id: l.tasklist_id, name: l.name }))
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      configured: true,
      enabled: config.enabled,
      connected,
      error: errorMsg,
      appId: config.appId ? `${config.appId.slice(0, 8)}...` : "",
      encryptKey: config.encryptKey ? "••••••••" : "",
      taskLists,
    })
  } catch (err) {
    console.error("[lark/settings] GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — Save Lark config (and optionally test connection)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    await ensureAllTables()

    const body = await req.json()
    const { appId, appSecret, encryptKey, enabled, testConnection } = body as {
      appId?: string
      appSecret?: string
      encryptKey?: string
      enabled?: boolean
      testConnection?: boolean
    }

    // Build config — preserve existing values for fields not provided
    const existing = await getLarkConfig()
    const config: LarkConfig = {
      appId: appId || existing?.appId || "",
      appSecret: appSecret || existing?.appSecret || "",
      encryptKey: encryptKey || existing?.encryptKey || "",
      enabled: enabled !== undefined ? enabled : (existing?.enabled ?? false),
    }

    // Validate non-empty credentials if enabling
    if (config.enabled && (!config.appId || !config.appSecret)) {
      return NextResponse.json({ error: "App ID and App Secret are required when enabling Lark sync" }, { status: 400 })
    }

    // Test connection if requested
    if (testConnection) {
      const validation = await validateLarkConfig(config)
      if (!validation.valid) {
        return NextResponse.json({ error: `Connection failed: ${validation.error}` }, { status: 400 })
      }
    }

    // Save config
    await saveLarkConfig(config)

    return NextResponse.json({
      success: true,
      message: testConnection ? "Lark connection verified and settings saved" : "Lark settings saved",
    })
  } catch (err) {
    console.error("[lark/settings] POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH — Toggle Lark sync on/off
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !isAdmin(session.user.role as string)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const { enabled } = body as { enabled: boolean }

    const existing = await getLarkConfig()
    if (!existing) {
      return NextResponse.json({ error: "Lark not configured. Please set up credentials first." }, { status: 400 })
    }

    if (enabled && (!existing.appId || !existing.appSecret)) {
      return NextResponse.json({ error: "Cannot enable — App ID and Secret are required" }, { status: 400 })
    }

    await saveLarkConfig({ ...existing, enabled })

    return NextResponse.json({
      success: true,
      message: enabled ? "Lark sync enabled" : "Lark sync disabled",
    })
  } catch (err) {
    console.error("[lark/settings] PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}