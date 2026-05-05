// AI Integration Module - Supports OpenRouter, Z.ai Direct API, Google AI, and Custom APIs
// Features: Multi-provider, automatic key failover, budget tracking, health monitoring
// Cross-Provider Model Map - Ensures correct model names for each AI provider
// This fixes the bug where Z.ai models were sent to Google AI API (which doesn't recognize them)

import { OPENROUTER_API_URL, ZAI_API_URL, GOOGLE_AI_API_URL, NVIDIA_API_URL } from "./endpoints"
import { generateZaiToken } from "./jwt-utils"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

interface ContentPart {
  type: "text" | "image_url"
  text?: string
  image_url?: { url: string }
}

interface AIResponse {
  content: string
  inputTokens: number
  outputTokens: number
  model: string
  provider: string
  apiKeyId?: string
  cost: number
}

interface OpenRouterResponse {
  id: string
  choices: {
    message: { content: string; role: string }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface KeyInfo {
  id: string
  keyName: string
  keyValue: string
  provider: string
  status: string
  priority: number
  monthlyBudget: number
  currentSpend: number
  assignedAgents: string
}

// ━━ Valid Model Sets ━━
// Updated 2025-04: Only models that actually exist on Z.ai API
const VALID_ZAI_MODELS = new Set([
  // Coder plan models (tested and confirmed working)
  "glm-4.7-flash", "glm-4.5-flash", "glm-4-plus", "glm-4.5-air", "glm-5.1",
  // Legacy names (redirected by getModelForProvider to actual model names)
  "glm-4-flash", "glm-4-air", "glm-4-long",
  "glm-4-flash-250414", "glm-4-air-250414", "glm-4-long-250414",
  "glm-4-plus-0111", "glm-4.5-air-250414",
])

const VALID_GOOGLE_AI_MODELS = new Set([
  "gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-pro", "gemini-1.5-flash",
  "gemini-pro", "gemini-2.0-flash-lite",
])

const VALID_NVIDIA_MODELS = new Set([
  "z-ai/glm-5.1",
])

const VALID_OPENROUTER_PREFIXES = ["/", "gpt-", "claude-", "llama", "deepseek", "mistral", "qwen"]

// ━━ Cross-Provider Model Map ━━
// Maps every model name to its equivalent in every provider
// Updated 2025-04: Z.ai "zai" entries now point to actual working API model names
const CROSS_PROVIDER_MAP: Record<string, Record<string, string>> = {
  // Z.ai models → other providers
  // glm-4-flash and glm-4-air are DEPRECATED on Z.ai API — redirect to glm-4.7-flash (free) or glm-4.5-air (paid)
  "glm-4-flash-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-4-air-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-4-long-250414": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus" },
  "glm-4-plus-0111": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus" },
  "glm-4.5-air-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air" },
  "glm-4.7-flash": { openrouter: "meta-llama/llama-3.3-70b-instruct:free", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-5.1": { openrouter: "anthropic/claude-sonnet-4", google_ai: "gemini-2.5-pro", zai: "glm-5.1" },
  // glm-4.5-flash: Reasoning model included in Coder plan (BEST for agent tasks)
  "glm-4.5-flash": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.5-flash" },
  // glm-z1-flash removed: model does not exist on Z.ai API
  // Legacy short names → redirect to working models
  "glm-4-flash": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-4-air": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-4-long": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus" },
  "glm-4-plus": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus" },
  "glm-4.5-air": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air" },

  // Google AI models → other providers
  "gemini-2.0-flash": { openrouter: "google/gemini-2.0-flash-exp:free", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air-250414" },
  "gemini-2.5-pro": { openrouter: "google/gemini-2.5-pro-preview-05-06", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "gemini-1.5-pro": { openrouter: "google/gemini-pro-1.5", google_ai: "gemini-1.5-pro", zai: "glm-4-plus-0111" },
  "gemini-1.5-flash": { openrouter: "google/gemini-flash-1.5", google_ai: "gemini-1.5-flash", zai: "glm-4-flash-250414" },
  "gemini-pro": { openrouter: "google/gemini-pro", google_ai: "gemini-pro", zai: "glm-4-flash-250414" },
  "gemini-2.0-flash-lite": { openrouter: "google/gemini-2.0-flash-lite-001", google_ai: "gemini-2.0-flash-lite", zai: "glm-4-flash-250414" },

  // NVIDIA models → other providers
  "z-ai/glm-5.1": { openrouter: "anthropic/claude-sonnet-4", google_ai: "gemini-2.5-pro", zai: "glm-5.1", nvidia: "z-ai/glm-5.1" },

  // OpenRouter models → other providers
  "openai/gpt-4o": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "openai/gpt-4o-mini": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "anthropic/claude-sonnet-4": { openrouter: "anthropic/claude-sonnet-4", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "meta-llama/llama-3.3-70b-instruct:free": { openrouter: "meta-llama/llama-3.3-70b-instruct:free", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "deepseek/deepseek-r1:free": { openrouter: "deepseek/deepseek-r1:free", google_ai: "gemini-2.0-flash", zai: "glm-4-air-250414" },
  "google/gemini-2.0-flash-exp:free": { openrouter: "google/gemini-2.0-flash-exp:free", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air-250414" },
}

// ━━ Get Model for Provider ━━
// Uses CROSS_PROVIDER_MAP for accurate cross-provider mapping, with validation and fallback defaults
export function getModelForProvider(model: string, provider: string): string {
  const providerKey = provider.toLowerCase()

  // Direct mapping from cross-provider map
  if (CROSS_PROVIDER_MAP[model]?.[providerKey]) {
    return CROSS_PROVIDER_MAP[model][providerKey]
  }

  // Try without date suffix (e.g., "glm-4-flash-250414" strip → "glm-4-flash")
  const baseModel = model.replace(/-\d{6}$/, "")
  if (baseModel !== model && CROSS_PROVIDER_MAP[baseModel]?.[providerKey]) {
    return CROSS_PROVIDER_MAP[baseModel][providerKey]
  }

  // Validate model is already appropriate for provider (no mapping needed)
  const providerUpper = provider.toUpperCase()
  let isValid = false
  if (providerUpper === "ZAI") isValid = VALID_ZAI_MODELS.has(model)
  else if (providerUpper === "GOOGLE_AI") isValid = VALID_GOOGLE_AI_MODELS.has(model)
  else if (providerUpper === "NVIDIA") isValid = VALID_NVIDIA_MODELS.has(model)
  else if (providerUpper === "OPENROUTER") isValid = VALID_OPENROUTER_PREFIXES.some(p => model.includes(p))

  if (isValid) return model

  // Fallback to provider defaults (updated 2025-04: glm-4-flash is deprecated, use glm-4.7-flash)
  console.warn(`[model-mapping] Model "${model}" not valid for provider "${provider}". Using default.`)
  const defaults: Record<string, string> = {
    zai: "glm-4.7-flash",    google_ai: "gemini-2.0-flash",
    openrouter: "openai/gpt-4o-mini",
    nvidia: "z-ai/glm-5.1",
  }
  return defaults[providerKey] || model
}

// ━━ Error Types ━━
export class APIKeyExhaustedError extends Error {
  provider: string
  statusCode: number
  detail: string

  constructor(provider: string, statusCode: number, detail: string) {
    super(`API key exhausted: ${provider} returned ${statusCode} - ${detail}`)
    this.name = "APIKeyExhaustedError"
    this.provider = provider
    this.statusCode = statusCode
    this.detail = detail
  }
}

export class APIKeyInvalidError extends Error {
  provider: string
  statusCode: number

  constructor(provider: string, statusCode: number, detail: string) {
    super(`API key invalid: ${provider} returned ${statusCode} - ${detail}`)
    this.name = "APIKeyInvalidError"
    this.provider = provider
    this.statusCode = statusCode
  }
}

export class AllKeysExhaustedError extends Error {
  triedKeys: number
  errors: string[]

  constructor(triedKeys: number, errors: string[]) {
    super(`All ${triedKeys} API keys exhausted. Errors: ${errors.join("; ")}`)
    this.name = "AllKeysExhaustedError"
    this.triedKeys = triedKeys
    this.errors = errors
  }
}

// ━━ Translate Z.ai Chinese Error Messages to English ━━
export function translateZaiError(errorMsg: string): string {
  const translations: [string, string][] = [
    ["模型不存在", "Model does not exist"],
    ["余额不足或无可用资源包", "Insufficient balance or no available resource package"],
    ["余额不足", "Insufficient balance"],
    ["令牌已过期或验证不正确", "Token expired or invalid authentication"],
    ["令牌已过期", "Token expired"],
    ["验证不正确", "Invalid authentication"],
    ["请求频率过快", "Request rate too high"],
    ["参数错误", "Parameter error"],
    ["内部错误", "Internal server error"],
    ["请充值", "Please recharge"],
    ["您的账户已达到速率限制", "Your account has reached the rate limit"],
    ["请您控制请求频率", "Please control request frequency"],
  ]
  let result = errorMsg
  for (const [cn, en] of translations) {
    result = result.replace(new RegExp(cn, "g"), en)
  }
  return result
}

// ━━ Provider Detection ━━
export function detectProvider(apiKey: string): "openrouter" | "zai" | "google_ai" | "nvidia" | "other" {
  if (apiKey.startsWith("sk-or-")) return "openrouter"
  if (apiKey.startsWith("nvapi-")) return "nvidia"
  if (apiKey.startsWith("AIza")) return "google_ai"
  return "openrouter" // default
}

// ━━ Model Name Normalization (legacy, kept for backward compat) ━━
export function normalizeModelForProvider(model: string, provider: string): string {
  // Delegate to the new cross-provider mapping
  return getModelForProvider(model, provider)
}

// ━━ OpenRouter API ━━
async function callOpenRouterAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const mappedModel = getModelForProvider(model, "OPENROUTER")

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://trishulhub.com",
      "X-Title": "TrishulHub AI Dashboard",
    },
    body: JSON.stringify({
      model: mappedModel,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
    }),
    signal: AbortSignal.timeout(120000), // FIX: Add 2-minute timeout
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    console.error(`[openrouter] API error: ${statusCode} - ${errorText.substring(0, 500)}`)

    if (statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("openrouter", statusCode, errorText)
    }
    if (statusCode === 402 || statusCode === 429) {
      throw new APIKeyExhaustedError("openrouter", statusCode, errorText)
    }
    throw new Error(`OpenRouter API error: ${statusCode} - ${errorText}`)
  }

  const data: OpenRouterResponse = await response.json()

  const cost = estimateCost(mappedModel, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)

  return {
    content: data.choices[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: mappedModel,
    provider: "openrouter",
    cost,
  }
}

// ━━ Z.ai JWT Token Generation ━━
// Z.ai API keys come in format: {id}.{secret}
// The API requires a JWT token signed with the secret, not the raw key
// NOTE: generateZaiToken is now in shared jwt-utils.ts — this local alias
// re-exports it for backward compatibility with any internal references.
const _generateZaiToken = generateZaiToken

// ━━ Z.ai Direct API ━━
// Includes automatic retry with exponential backoff for temporary rate limits
async function callZaiAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const mappedModel = getModelForProvider(model, "ZAI")
  const token = await generateZaiToken(apiKey)

  const MAX_RETRIES = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    const response = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: mappedModel,
        messages,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature || 0.7,
      }),
      signal: AbortSignal.timeout(120000), // FIX: Add 2-minute timeout
    })

    if (!response.ok) {
      let errorText = await response.text()
      const statusCode = response.status

      // Translate Chinese error messages from Z.ai API to English
      errorText = translateZaiError(errorText)

      console.error(`[zai] API error: ${statusCode} - ${errorText.substring(0, 500)}`)

      if (statusCode === 401 || statusCode === 403) {
        throw new APIKeyInvalidError("zai", statusCode, errorText)
      }
      if (statusCode === 402) {
        throw new APIKeyExhaustedError("zai", statusCode, errorText)
      }
      if (statusCode === 429) {
        // 429 can be temporary rate limit OR insufficient balance
        // "访问量过大" = rate limit (temporary) → retry with backoff
        // "余额不足" = insufficient balance (permanent until recharge) → mark as exhausted
        const isInsufficientBalance = errorText.includes("Insufficient balance") || errorText.includes("insufficient balance") || errorText.includes("no available resource") || errorText.includes("请充值")
        if (isInsufficientBalance) {
          throw new APIKeyExhaustedError("zai", statusCode, errorText)
        }
        // Temporary rate limit - retry if attempts remain
        lastError = new Error(`Z.ai rate limit (temporary): ${errorText}. Model is busy, please try again in a moment.`)
        if (attempt < MAX_RETRIES) continue // retry
        throw lastError // no more retries
      }
      // Model not found (code 1211) - try to provide helpful message
      if (errorText.includes("Model does not exist") || errorText.includes("model not found")) {
        throw new Error(`Z.ai API error: Model "${mappedModel}" does not exist. Please update the agent to use a valid model like "glm-4.7-flash" (free) or "glm-4-plus" (paid).`)
      }
      throw new Error(`Z.ai API error: ${statusCode} - ${errorText}`)
    }

    const data = await response.json()
    const cost = estimateCost(mappedModel, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)

    return {
      content: data.choices?.[0]?.message?.content || "",
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      model: mappedModel,
      provider: "zai",
      cost,
    }
  } // end retry loop

  // Should not reach here, but just in case
  throw lastError || new Error("Z.ai API call failed unexpectedly")
}

// ━━ Google AI Studio API ━━
async function callGoogleAIAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const mappedModel = getModelForProvider(model, "GOOGLE_AI")
  // SECURITY FIX: Use x-goog-api-key header instead of URL parameter to prevent
  // API key from being logged by proxies, CDNs, or server access logs
  const url = `${GOOGLE_AI_API_URL}/${mappedModel}:generateContent`

  // Convert messages to Google AI format
  const contents: any[] = []
  let systemInstruction = ""

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = typeof msg.content === "string" ? msg.content : ""
    } else {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content.filter(p => p.type === "text").map(p => p.text || "").join("\n")

      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text }],
      })
    }
  }

  const body: any = {
    contents,
    generationConfig: {
      maxOutputTokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
    },
  }

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000), // FIX: Add 2-minute timeout
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    console.error(`[google-ai] API error: ${statusCode} - ${errorText.substring(0, 500)}`)

    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("google_ai", statusCode, errorText)
    }
    if (statusCode === 429) {
      throw new APIKeyExhaustedError("google_ai", statusCode, errorText)
    }
    throw new Error(`Google AI API error: ${statusCode} - ${errorText}`)
  }

  const data = await response.json()
  const cost = estimateCost(mappedModel, data.usageMetadata?.promptTokenCount || 0, data.usageMetadata?.candidatesTokenCount || 0)

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    model: mappedModel,
    provider: "google_ai",
    cost,
  }
}

// ━━ NVIDIA API (Trishul AI — OpenAI-compatible) ━━
// Uses OpenAI-compatible chat completions format with NVIDIA API base URL
// Supports reasoning_content (thinking mode) via extra_body
async function callNvidiaAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const mappedModel = getModelForProvider(model, "NVIDIA")

  const response = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: mappedModel,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.3, // Match z.ai default (was 0.6)
      top_p: 0.7, // Match z.ai default (was 0.95 — too wide for precise responses)
      // Extra body for reasoning/thinking support (NVIDIA GLM models)
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false,
      },
    }),
    signal: AbortSignal.timeout(120000), // FIX: Add 2-minute timeout
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    console.error(`[nvidia] API error: ${statusCode} - ${errorText.substring(0, 500)}`)

    if (statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("nvidia", statusCode, errorText)
    }
    if (statusCode === 402 || statusCode === 429) {
      throw new APIKeyExhaustedError("nvidia", statusCode, errorText)
    }
    throw new Error(`NVIDIA API error: ${statusCode} - ${errorText}`)
  }

  const data = await response.json()

  // NVIDIA API returns OpenAI-compatible response format
  // May include reasoning_content in the message for thinking models
  // SECURITY: reasoning_content is internal chain-of-thought — NEVER expose to users
  const choice = data.choices?.[0]
  const content = choice?.message?.content || ""

  // Do NOT include reasoning_content in the response — it contains raw planning
  // that should not be shown to users
  const fullContent = content || ''

  const cost = estimateCost(mappedModel, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)

  return {
    content: fullContent,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: mappedModel,
    provider: "nvidia",
    cost,
  }
}

// ━━ Single Provider Call ━━
export async function callAI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  provider: string = "OPENROUTER",
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const providerUpper = provider.toUpperCase()

  switch (providerUpper) {
    case "ZAI":
      return callZaiAPI(messages, model, apiKey, options)
    case "GOOGLE_AI":
      return callGoogleAIAPI(messages, model, apiKey, options)
    case "NVIDIA":
      return callNvidiaAPI(messages, model, apiKey, options)
    case "OPENROUTER":
    default:
      return callOpenRouterAPI(messages, model, apiKey, options)
  }
}

// ━━ Multi-Key Failover AI Call ━━
// Tries keys in priority order. If a key returns 429/exhausted, marks it and tries next.
// This is the recommended way to call AI from the chat route.
export async function callAIWithFailover(
  messages: ChatMessage[],
  model: string,
  keys: KeyInfo[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse & { apiKeyId: string; usedProvider: string }> {
  if (!keys || keys.length === 0) {
    throw new AllKeysExhaustedError(0, ["No API keys available"])
  }

  // Sort keys by priority (ascending = highest priority first)
  const sortedKeys = [...keys].sort((a, b) => a.priority - b.priority)

  const errors: string[] = []
  let lastFailedKeyId: string | null = null

  for (const key of sortedKeys) {
    // Skip exhausted or error keys (but try once if all are exhausted)
    if (key.status === "EXHAUSTED") {
      errors.push(`Key "${key.keyName}" (${key.provider}): EXHAUSTED - skipped`)
      continue
    }
    if (key.status === "ERROR") {
      errors.push(`Key "${key.keyName}" (${key.provider}): ERROR status - skipped`)
      continue
    }

    // Check budget
    if (key.monthlyBudget > 0 && key.currentSpend >= key.monthlyBudget) {
      errors.push(`Key "${key.keyName}" (${key.provider}): Budget exhausted ($${key.currentSpend.toFixed(2)}/$${key.monthlyBudget.toFixed(2)})`)
      continue
    }

    try {
      const result = await callAI(messages, model, key.keyValue, key.provider, options)

      return {
        ...result,
        apiKeyId: key.id,
        usedProvider: key.provider,
      }
    } catch (err: any) {
      lastFailedKeyId = key.id
      const errMsg = err.message || String(err)
      errors.push(`Key "${key.keyName}" (${key.provider}): ${errMsg}`)
      console.error(`[ai-failover] Key "${key.keyName}" failed:`, errMsg)

      if (err instanceof APIKeyExhaustedError) {
        // Mark key as exhausted (caller should update DB)
        console.warn(`[ai-failover] Key "${key.keyName}" is EXHAUSTED (429/402). Will try next key.`)
        // Don't break - try next key
      } else if (err instanceof APIKeyInvalidError) {
        // Mark key as error (caller should update DB)
        console.warn(`[ai-failover] Key "${key.keyName}" is INVALID (401/403). Will try next key.`)
        // Don't break - try next key
      }
      // For other errors, also try next key
    }
  }

  // All keys failed
  throw new AllKeysExhaustedError(sortedKeys.length, errors)
}

// ━━ Backward compatibility ━━
export async function callOpenRouter(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  return callOpenRouterAPI(messages, model, apiKey, options)
}

// ━━ Cost Estimation ━━
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs: Record<string, { input: number; output: number }> = {
    "openai/gpt-4o": { input: 2.5, output: 10 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "anthropic/claude-sonnet-4": { input: 3, output: 15 },
    "meta-llama/llama-3.3-70b-instruct:free": { input: 0, output: 0 },
    "deepseek/deepseek-r1:free": { input: 0, output: 0 },
    "google/gemini-2.0-flash-exp:free": { input: 0, output: 0 },
    "glm-5.1": { input: 2.0, output: 8.0 },
    "z-ai/glm-5.1": { input: 2.0, output: 8.0 },
    "glm-4-plus-0111": { input: 1.5, output: 6.0 },
    "glm-4.5-air-250414": { input: 0.5, output: 2.0 },
    "glm-4-air-250414": { input: 0.1, output: 0.5 },
    "glm-4-flash-250414": { input: 0.1, output: 0.5 },
    "glm-4.7-flash": { input: 0, output: 0 },
    "glm-4.5-flash": { input: 0, output: 0 },
    "glm-4-long-250414": { input: 0.5, output: 2.0 },
    "gemini-2.0-flash": { input: 0, output: 0 },
    "gemini-2.5-pro": { input: 1.25, output: 10.0 },
    "gemini-1.5-pro": { input: 1.25, output: 5.0 },
    "gemini-1.5-flash": { input: 0, output: 0 },
  }

  const modelCost = costs[model] || { input: 0.5, output: 1.5 }
  const inputCost = (inputTokens / 1_000_000) * modelCost.input
  const outputCost = (outputTokens / 1_000_000) * modelCost.output
  return Math.round((inputCost + outputCost) * 10000) / 10000
}

export function getVisionModel(currentModel: string): string {
  if (currentModel.includes("vision") || currentModel.includes("gpt-4o")) return currentModel
  return "openai/gpt-4o-mini" // fallback vision model
}

export const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-r1:free",
  "google/gemini-2.0-flash-exp:free",
  "glm-4.7-flash",
  "glm-4.5-flash",
]

// ━━ Get provider-specific model list ━━
export function getModelsForProvider(provider: string): { id: string; name: string; free: boolean }[] {
  switch (provider.toUpperCase()) {
    case "ZAI":
      return [
        { id: "glm-4.7-flash", name: "GLM-4.7 Flash (Free - Recommended)", free: true },
        { id: "glm-4.5-flash", name: "GLM-4.5 Flash (Coder Plan - Reasoning)", free: true },
        { id: "glm-4.5-air", name: "GLM-4.5 Air", free: false },
        { id: "glm-4-plus", name: "GLM-4 Plus", free: false },
        { id: "glm-5.1", name: "GLM-5.1", free: false },
      ]
    case "GOOGLE_AI":
      return [
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", free: true },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", free: false },
      ]
    case "NVIDIA":
      return [
        { id: "z-ai/glm-5.1", name: "Trishul AI — GLM 5.1 (Reasoning)", free: false },
      ]
    case "OPENROUTER":
    default:
      return [
        { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", free: false },
        { id: "openai/gpt-4o", name: "GPT-4o", free: false },
        { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", free: false },
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (Free)", free: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Free)", free: true },
        { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash (Free)", free: true },
      ]
  }
}
