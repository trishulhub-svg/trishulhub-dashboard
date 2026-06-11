import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { isAdmin } from "@/lib/rbac"
import { getAppSetting, setAppSetting } from "@/lib/db"
import { getCredentialKey } from "@/lib/encryption"

const SETTING_KEY = "credentialEncryptionKey"

// GET /api/settings/credential-key — Check if key is configured
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    const dbKey = await getAppSetting(SETTING_KEY)
    const hasEnvKey = !!(process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY)

    // Try to get a working key to verify it's actually valid
    let isWorking = false
    try {
      const key = getCredentialKey(dbKey || undefined)
      if (key) { isWorking = true; key.fill(0) }
    } catch { /* key not configured */ }

    return NextResponse.json({
      hasKey: !!(dbKey || hasEnvKey),
      isDbKey: !!dbKey,
      maskedKey: dbKey ? dbKey.substring(0, 8) + "••••••••••••••••••••" + dbKey.substring(56) : "",
      isWorking,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg.slice(0, 120) }, { status: 500 })
  }
}

// PATCH /api/settings/credential-key — Save a new credential encryption key
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

    let body: { key?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const newKey = body.key?.trim()
    if (!newKey || !/^[0-9a-fA-F]{64}$/.test(newKey)) {
      return NextResponse.json({ error: "Key must be a 64-character hex string (32 bytes)" }, { status: 400 })
    }

    // Validate the key actually works before saving
    try {
      const key = getCredentialKey(newKey)
      key.fill(0)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: `Key validation failed: ${msg.slice(0, 100)}` }, { status: 400 })
    }

    await setAppSetting(SETTING_KEY, newKey)

    return NextResponse.json({ success: true, message: "Credential encryption key saved" })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to save key: ${msg.slice(0, 120)}` }, { status: 500 })
  }
}