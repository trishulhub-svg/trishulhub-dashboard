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
// In-memory cache for Lark config (avoids DB query on every API call)
let _cachedConfig: LarkConfig | null | undefined = undefined
let _cachedConfigTime = 0
const CONFIG_CACHE_MS = 30_000 // Refresh every 30 seconds

export async function getLarkConfig(): Promise<LarkConfig | null> {
  // Return cached config if fresh
  if (_cachedConfig !== undefined && Date.now() - _cachedConfigTime < CONFIG_CACHE_MS) {
    return _cachedConfig
  }
  try {
    const raw = await getAppSetting("lark_config")
    if (!raw) {
      _cachedConfig = null
      _cachedConfigTime = Date.now()
      return null
    }
    _cachedConfig = JSON.parse(raw) as LarkConfig
    _cachedConfigTime = Date.now()
    return _cachedConfig
  } catch {
    _cachedConfig = null
    _cachedConfigTime = Date.now()
    return null
  }
}

/**
 * Save Lark config to AppSetting table.
 */
export async function saveLarkConfig(config: LarkConfig): Promise<void> {
  await setAppSetting("lark_config", JSON.stringify(config))
  // Clear cached token and config when config changes
  cachedToken = null
  cachedExpiry = 0
  _cachedConfig = undefined
  _cachedConfigTime = 0
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