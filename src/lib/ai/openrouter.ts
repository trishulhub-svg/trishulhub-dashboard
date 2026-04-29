// Cross-Provider Model Map - Ensures correct model names for each AI provider
// This fixes the bug where Z.ai models were sent to Google AI API (which doesn't recognize them)

const VALID_ZAI_MODELS = new Set([
  "glm-4-flash-250414", "glm-4-air-250414", "glm-4-long-250414",
  "glm-4-plus-0111", "glm-4.5-air-250414", "glm-4.7-flash", "glm-5.1",
  "glm-4-flash", "glm-4-air", "glm-4-long", "glm-4-plus", "glm-4.5-air",
])

const VALID_GOOGLE_AI_MODELS = new Set([
  "gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-pro", "gemini-1.5-flash",
  "gemini-pro", "gemini-2.0-flash-lite",
])

const VALID_OPENROUTER_PREFIXES = ["/", "gpt-", "claude-", "llama", "deepseek", "mistral", "qwen"]

const CROSS_PROVIDER_MAP: Record<string, Record<string, string>> = {
  "glm-4-flash-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "glm-4-air-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-air-250414" },
  "glm-4-long-250414": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-long-250414" },
  "glm-4-plus-0111": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "glm-4.5-air-250414": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air-250414" },
  "glm-4.7-flash": { openrouter: "meta-llama/llama-3.3-70b-instruct:free", google_ai: "gemini-2.0-flash", zai: "glm-4.7-flash" },
  "glm-5.1": { openrouter: "anthropic/claude-sonnet-4", google_ai: "gemini-2.5-pro", zai: "glm-5.1" },
  "glm-4-flash": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "glm-4-air": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-air-250414" },
  "glm-4-plus": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "gemini-2.0-flash": { openrouter: "google/gemini-2.0-flash-exp:free", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air-250414" },
  "gemini-2.5-pro": { openrouter: "google/gemini-2.5-pro-preview-05-06", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "openai/gpt-4o": { openrouter: "openai/gpt-4o", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "openai/gpt-4o-mini": { openrouter: "openai/gpt-4o-mini", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "anthropic/claude-sonnet-4": { openrouter: "anthropic/claude-sonnet-4", google_ai: "gemini-2.5-pro", zai: "glm-4-plus-0111" },
  "meta-llama/llama-3.3-70b-instruct:free": { openrouter: "meta-llama/llama-3.3-70b-instruct:free", google_ai: "gemini-2.0-flash", zai: "glm-4-flash-250414" },
  "deepseek/deepseek-r1:free": { openrouter: "deepseek/deepseek-r1:free", google_ai: "gemini-2.0-flash", zai: "glm-4-air-250414" },
  "google/gemini-2.0-flash-exp:free": { openrouter: "google/gemini-2.0-flash-exp:free", google_ai: "gemini-2.0-flash", zai: "glm-4.5-air-250414" },
}

export function getModelForProvider(model: string, provider: string): string {
  const providerKey = provider.toLowerCase()

  // Direct mapping
  if (CROSS_PROVIDER_MAP[model]?.[providerKey]) return CROSS_PROVIDER_MAP[model][providerKey]

  // Try without date suffix
  const baseModel = model.replace(/-\d{6}$/, "")
  if (CROSS_PROVIDER_MAP[baseModel]?.[providerKey]) return CROSS_PROVIDER_MAP[baseModel][providerKey]

  // Validate model is appropriate for provider
  const providerUpper = provider.toUpperCase()
  let isValid = false
  if (providerUpper === "ZAI") isValid = VALID_ZAI_MODELS.has(model)
  else if (providerUpper === "GOOGLE_AI") isValid = VALID_GOOGLE_AI_MODELS.has(model)
  else if (providerUpper === "OPENROUTER") isValid = VALID_OPENROUTER_PREFIXES.some(p => model.includes(p))

  if (isValid) return model

  // Fallback to provider defaults
  console.warn(`[model-mapping] Model "${model}" not valid for provider "${provider}". Using default.`)
  const defaults: Record<string, string> = { zai: "glm-4-flash-250414", google_ai: "gemini-2.0-flash", openrouter: "openai/gpt-4o-mini" }
  return defaults[providerKey] || model
}
