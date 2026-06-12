// ━━ Lark Auth — Tenant Access Token Management ━━

import { getAppSetting, setAppSetting } from "@/lib/db"
import type { LarkConfig, LarkTokenResponse } from "./types"

const LARK_TOKEN_KEY = "lark_token"
const LARK_TOKEN_EXPIRY_KEY = "lark_token_expiry"

let cachedToken: string | null = null
let cachedExpiry = 0

/**
 * Get Lark config from AppSetting table (stored as JSON).
 * Returns null if not configured.
 */
export async function getLarkConfig(): Promise<LarkConfig | null> {
  try {
    const raw = await getAppSetting("lark_config")
    if (!raw) return null
    return JSON.parse(raw) as LarkConfig
  } catch {
    return null
  }
}

/**
 * Save Lark config to AppSetting table.
 */
export async function saveLarkConfig(config: LarkConfig): Promise<void> {
  await setAppSetting("lark_config", JSON.stringify(config))
  // Clear cached token when config changes
  cachedToken = null
  cachedExpiry = 0
}

/**
 * Get a valid tenant_access_token.
 * Caches in-memory and in DB. Auto-refreshes before expiry.
 */
export async function getLarkToken(): Promise<string | null> {
  // Check in-memory cache first
  if (cachedToken && Date.now() < cachedExpiry) {
    return cachedToken
  }

  // Check DB cache
  try {
    const dbToken = await getAppSetting(LARK_TOKEN_KEY)
    const dbExpiry = await getAppSetting(LARK_TOKEN_EXPIRY_KEY)
    const expiryMs = parseInt(dbExpiry, 10) || 0

    if (dbToken && Date.now() < expiryMs) {
      cachedToken = dbToken
      cachedExpiry = expiryMs
      return dbToken
    }
  } catch {
    // Fall through to fetch new token
  }

  // Fetch new token from Lark API
  const config = await getLarkConfig()
  if (!config || !config.appId || !config.appSecret) {
    return null
  }

  try {
    const res = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    })

    const data: LarkTokenResponse = await res.json()

    if (data.code !== 0) {
      console.error("[lark/auth] Token request failed:", data.msg)
      return null
    }

    // Cache for slightly less than actual expiry (7200s typically, use 7000s)
    const expiresInMs = (data.expire - 200) * 1000
    const newExpiry = Date.now() + expiresInMs

    cachedToken = data.tenant_access_token
    cachedExpiry = newExpiry

    // Persist to DB for cross-request caching
    await setAppSetting(LARK_TOKEN_KEY, data.tenant_access_token)
    await setAppSetting(LARK_TOKEN_EXPIRY_KEY, String(newExpiry))

    return data.tenant_access_token
  } catch (err) {
    console.error("[lark/auth] Token fetch error:", err)
    return null
  }
}

/**
 * Validate Lark config by attempting to get a token.
 */
export async function validateLarkConfig(config: LarkConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
    })

    const data: LarkTokenResponse = await res.json()

    if (data.code !== 0) {
      return { valid: false, error: data.msg || "Authentication failed" }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Connection failed" }
  }
}