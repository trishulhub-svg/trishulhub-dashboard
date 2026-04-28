// AI Integration Module - Supports OpenRouter, Z.ai Direct API, and Google AI

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

// ━━ Provider Detection ━━
export function detectProvider(apiKey: string): "openrouter" | "zai" | "google_ai" | "other" {
  if (apiKey.startsWith("sk-or-") || apiKey.startsWith("sk-")) return "openrouter"
  if (apiKey.startsWith("AIza")) return "google_ai"
  // Z.ai keys are typically hex strings without specific prefixes
  // If the key is associated with a ZAI provider in the database, it will be handled by the route
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

  return normalized;
}

// ━━ OpenRouter API ━━
async function callOpenRouterAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://trishulhub.in",
      "X-Title": "TrishulHub AI Dashboard",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature || 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  const data: OpenRouterResponse = await response.json()

  return {
    content: data.choices[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model,
  }
}

// ━━ Z.ai Direct API ━━
async function callZaiAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const normalizedModel = normalizeModelForProvider(model, "zai")

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
    const error = await response.text()
    throw new Error(`Z.ai API error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    content: data.choices?.[0]?.message?.content || "",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model: normalizedModel,
  }
}

// ━━ Google AI Studio API ━━
async function callGoogleAIAPI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const normalizedModel = model.includes("/") ? model.split("/").pop()! : model
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
    const error = await response.text()
    throw new Error(`Google AI API error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    model: normalizedModel,
  }
}

// ━━ Unified AI Call ━━
export async function callAI(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  provider: string = "OPENROUTER",
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  switch (provider) {
    case "ZAI":
      return callZaiAPI(messages, model, apiKey, options)
    case "GOOGLE_AI":
      return callGoogleAIAPI(messages, model, apiKey, options)
    case "OPENROUTER":
    default:
      return callOpenRouterAPI(messages, model, apiKey, options)
  }
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
