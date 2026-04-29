// AI Integration Module - Supports OpenRouter, Z.ai Direct API, Google AI, and Custom APIs
// Features: Multi-provider, automatic key failover, budget tracking, health monitoring

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
const ZAI_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
const GOOGLE_AI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"

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

// ━━ Provider Detection ━━
export function detectProvider(apiKey: string): "openrouter" | "zai" | "google_ai" | "other" {
  if (apiKey.startsWith("sk-or-") || apiKey.startsWith("sk-")) return "openrouter"
  if (apiKey.startsWith("AIza")) return "google_ai"
  return "openrouter" // default
}

// ━━ Model Name Normalization ━━
export function normalizeModelForProvider(model: string, provider: string): string {
  let normalized = model;

  // Strip provider prefix (e.g., "z-ai/glm-4-flash" → "glm-4-flash")
  if (normalized.includes("/")) {
    normalized = normalized.split("/").pop()!;
  }

  // Strip .free suffix (OpenRouter convention, not valid for direct API)
  if (normalized.endsWith(".free")) {
    normalized = normalized.replace(".free", "");
  }

  // Z.ai model name mapping (old → new)
  const zaiMap: Record<string, string> = {
    "glm-4-flash": "glm-4-flash-250414",
    "glm-4-air": "glm-4-air-250414",
    "glm-4-long": "glm-4-long-250414",
    "glm-4-plus": "glm-4-plus-0111",
    "glm-4.5-air": "glm-4.5-air-250414",
    "glm-4.7-flash": "glm-4.7-flash",
    "glm-5.1": "glm-5.1",
    "glm-5": "glm-5.1",
  };

  if (provider === "zai" && zaiMap[normalized]) {
    return zaiMap[normalized];
  }

  // OpenRouter model mapping
  if (provider === "openrouter" && !normalized.includes("/")) {
    // If model doesn't have a provider prefix, add one
    const openrouterMap: Record<string, string> = {
      "gpt-4o": "openai/gpt-4o",
      "gpt-4o-mini": "openai/gpt-4o-mini",
      "claude-sonnet-4": "anthropic/claude-sonnet-4",
    };
    if (openrouterMap[normalized]) return openrouterMap[normalized];
  }

  return normalized;
}

// ━━ Get appropriate model for provider ━━
export function getModelForProvider(model: string, provider: string): string {
  const normalized = normalizeModelForProvider(model, provider)

  // For ZAI provider, use Z.ai compatible models
  if (provider === "ZAI" || provider === "zai") {
    // Map OpenRouter model names to Z.ai equivalents
    const zaiModelMap: Record<string, string> = {
      "openai/gpt-4o": "glm-4-plus-0111",
      "openai/gpt-4o-mini": "glm-4-flash-250414",
      "anthropic/claude-sonnet-4": "glm-4-plus-0111",
      "meta-llama/llama-3.3-70b-instruct:free": "glm-4-flash-250414",
      "deepseek/deepseek-r1:free": "glm-4-air-250414",
      "google/gemini-2.0-flash-exp:free": "glm-4.5-air-250414",
    }
    return zaiModelMap[model] || normalized || "glm-4-flash-250414"
  }

  // For GOOGLE_AI provider
  if (provider === "GOOGLE_AI" || provider === "google_ai") {
    const googleModelMap: Record<string, string> = {
      "openai/gpt-4o": "gemini-2.0-flash",
      "openai/gpt-4o-mini": "gemini-2.0-flash",
    }
    return googleModelMap[model] || normalized || "gemini-2.0-flash"
  }

  return normalized || model
}

// ━━ OpenRouter API ━━
async function callOpenRouterAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const normalizedModel = normalizeModelForProvider(model, "openrouter")

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://trishulhub.com",
      "X-Title": "TrishulHub AI Dashboard",
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    if (statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("openrouter", statusCode, errorText)
    }
    if (statusCode === 402 || statusCode === 429) {
      throw new APIKeyExhaustedError("openrouter", statusCode, errorText)
    }
    throw new Error(`OpenRouter API error: ${statusCode} - ${errorText}`)
  }

  const data: OpenRouterResponse = await response.json()

  const cost = estimateCost(normalizedModel, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)

  return {
    content: data.choices[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: normalizedModel,
    provider: "openrouter",
    cost,
  }
}

// ━━ Z.ai Direct API ━━
async function callZaiAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const normalizedModel = getModelForProvider(model, "ZAI")

  console.log(`[zai] Calling Z.ai API with model: ${normalizedModel}`)

  const response = await fetch(ZAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    console.error(`[zai] API error: ${statusCode} - ${errorText}`)

    if (statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("zai", statusCode, errorText)
    }
    if (statusCode === 402 || statusCode === 429) {
      throw new APIKeyExhaustedError("zai", statusCode, errorText)
    }
    throw new Error(`Z.ai API error: ${statusCode} - ${errorText}`)
  }

  const data = await response.json()
  const cost = estimateCost(normalizedModel, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0)

  return {
    content: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: normalizedModel,
    provider: "zai",
    cost,
  }
}

// ━━ Google AI Studio API ━━
async function callGoogleAIAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const normalizedModel = getModelForProvider(model, "GOOGLE_AI")
  const url = `${GOOGLE_AI_API_URL}/${normalizedModel}:generateContent?key=${apiKey}`

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    const statusCode = response.status

    if (statusCode === 400 || statusCode === 401 || statusCode === 403) {
      throw new APIKeyInvalidError("google_ai", statusCode, errorText)
    }
    if (statusCode === 429) {
      throw new APIKeyExhaustedError("google_ai", statusCode, errorText)
    }
    throw new Error(`Google AI API error: ${statusCode} - ${errorText}`)
  }

  const data = await response.json()
  const cost = estimateCost(normalizedModel, data.usageMetadata?.promptTokenCount || 0, data.usageMetadata?.candidatesTokenCount || 0)

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    model: normalizedModel,
    provider: "google_ai",
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
      console.log(`[ai-failover] Trying key: "${key.keyName}" (${key.provider}), priority: ${key.priority}`)
      const result = await callAI(messages, model, key.keyValue, key.provider, options)
      console.log(`[ai-failover] Success with key: "${key.keyName}" (${key.provider})`)
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
    "glm-4-plus-0111": { input: 1.5, output: 6.0 },
    "glm-4.5-air-250414": { input: 0.5, output: 2.0 },
    "glm-4-air-250414": { input: 0.1, output: 0.5 },
    "glm-4-flash-250414": { input: 0.1, output: 0.5 },
    "glm-4.7-flash": { input: 0, output: 0 },
    "glm-4-long-250414": { input: 0.5, output: 2.0 },
    "gemini-2.0-flash": { input: 0, output: 0 },
    "gemini-2.5-pro": { input: 1.25, output: 10.0 },
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
]

// ━━ Get provider-specific model list ━━
export function getModelsForProvider(provider: string): { id: string; name: string; free: boolean }[] {
  switch (provider.toUpperCase()) {
    case "ZAI":
      return [
        { id: "glm-4-flash-250414", name: "GLM-4 Flash", free: false },
        { id: "glm-4-air-250414", name: "GLM-4 Air", free: false },
        { id: "glm-4-long-250414", name: "GLM-4 Long", free: false },
        { id: "glm-4-plus-0111", name: "GLM-4 Plus", free: false },
        { id: "glm-4.5-air-250414", name: "GLM-4.5 Air", free: false },
        { id: "glm-4.7-flash", name: "GLM-4.7 Flash (Free)", free: true },
        { id: "glm-5.1", name: "GLM-5.1", free: false },
      ]
    case "GOOGLE_AI":
      return [
        { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", free: true },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", free: false },
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
