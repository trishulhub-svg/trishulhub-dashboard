// OpenRouter AI Integration Module

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string | ContentPart[]
}

interface ContentPart {
  type: "text" | "image_url"
  text?: string
  image_url?: { url: string }
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

export async function callOpenRouter(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<{
  content: string
  inputTokens: number
  outputTokens: number
  model: string
}> {
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

export async function callOpenRouterStream(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  onChunk: (chunk: string) => void,
  options?: { maxTokens?: number; temperature?: number }
): Promise<{
  inputTokens: number
  outputTokens: number
  model: string
}> {
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
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let totalInput = 0
  let totalOutput = 0
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith("data: ")) continue
      const data = trimmed.slice(6)
      if (data === "[DONE]") continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          onChunk(content)
          totalOutput += 1
        }
        if (parsed.usage) {
          totalInput = parsed.usage.prompt_tokens || 0
          totalOutput = parsed.usage.completion_tokens || totalOutput
        }
      } catch {}
    }
  }

  return { inputTokens: totalInput, outputTokens: totalOutput, model }
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Cost per million tokens (approximate)
  const costs: Record<string, { input: number; output: number }> = {
    "openai/gpt-4o": { input: 2.5, output: 10 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "anthropic/claude-sonnet-4": { input: 3, output: 15 },
    "meta-llama/llama-3.3-70b-instruct:free": { input: 0, output: 0 },
    "deepseek/deepseek-r1:free": { input: 0, output: 0 },
    "google/gemini-2.0-flash-exp:free": { input: 0, output: 0 },
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
]
