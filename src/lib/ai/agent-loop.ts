// Agent Loop Engine - Autonomous multi-step execution with tool calling
// Implements: Plan → Execute → Observe → Iterate pattern
// Uses Z.ai Function Calling for tool use, Thinking Mode for reasoning

import { SignJWT } from "jose"
import { DEV_AGENT_TOOLS, executeToolCall, ToolCallResult } from "./agent-tools"

const ZAI_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

// ━━ Types ━━
export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "response" | "plan" | "error"
  content: string
  toolName?: string
  toolArgs?: Record<string, any>
  toolResult?: string
  stepNumber: number
  timestamp: number
}

export interface AgentLoopResult {
  finalResponse: string
  steps: AgentStep[]
  totalSteps: number
  totalInputTokens: number
  totalOutputTokens: number
  model: string
  provider: string
  cost: number
  apiKeyId: string
  usedTools: string[]
  thinkingContent?: string
}

interface ZaiMessage {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: ZaiToolCall[]
  tool_call_id?: string
}

interface ZaiToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

// ━━ Agentic System Prompt ━━
const AGENTIC_SYSTEM_PROMPT = `You are Dev Agent, an expert autonomous full-stack developer for TrishulHub. You have access to tools that allow you to read files, write code, search the web, run commands, and analyze code.

## Your Capabilities
- **Autonomous Execution**: You can plan, implement, test, and iterate on tasks without human intervention
- **Tool Use**: You have tools to interact with the codebase and gather information
- **Deep Reasoning**: You think step-by-step and break complex tasks into manageable parts

## How You Work
1. **Understand**: Read the user's request carefully. If unclear, ask for clarification.
2. **Plan**: Use plan_task for complex tasks to outline your approach before starting.
3. **Explore**: Use read_file, list_files, and web_search to understand the existing codebase.
4. **Implement**: Use write_file or edit_file to create or modify code.
5. **Verify**: Use run_command and analyze_code to verify your changes work correctly.
6. **Iterate**: If something doesn't work, debug and fix it. Don't stop at the first error.

## Important Rules
- ALWAYS read existing files before modifying them to avoid overwriting important code
- For complex tasks, create a plan first using plan_task
- When implementing features, break them into small, testable steps
- After writing code, verify it compiles/runs correctly using run_command
- If a tool call fails, analyze the error and try a different approach
- Provide clear, well-structured code with proper TypeScript types
- Follow existing code patterns and conventions in the project
- Never leave code in a broken state - always verify your changes
- For long tasks, work through them methodically step by step
- Use web_search when you need current information about libraries, APIs, or frameworks

## Code Quality Standards
- TypeScript with proper types (no 'any' unless absolutely necessary)
- Proper error handling with try/catch
- Clean, readable code with meaningful variable names
- Follow the existing project structure and conventions
- Add comments for complex logic

You are autonomous and capable. Take initiative, explore, implement, and verify. The user trusts you to get the job done.`

// ━━ Generate Z.ai JWT Token ━━
async function generateZaiToken(apiKey: string): Promise<string> {
  if (apiKey.startsWith("eyJ")) return apiKey

  const parts = apiKey.split(".")
  if (parts.length === 2) {
    const [id, secret] = parts
    const secretBytes = new TextEncoder().encode(secret)
    const nowSec = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({
      api_key: id,
      timestamp: Date.now(),
      exp: nowSec + 3600,
    })
      .setProtectedHeader({ alg: "HS256", sign_type: "SIGN" })
      .sign(secretBytes)
    return token
  }
  return apiKey
}

// ━━ Call Z.ai API with Function Calling ━━
async function callZaiWithTools(
  messages: ZaiMessage[],
  model: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<{
  content: string | null
  toolCalls: ZaiToolCall[]
  thinkingContent: string | null
  inputTokens: number
  outputTokens: number
  finishReason: string
}> {
  const token = await generateZaiToken(apiKey)

  const body: any = {
    model,
    messages,
    max_tokens: options?.maxTokens || 8192,
    temperature: options?.temperature || 0.6,
    tools: DEV_AGENT_TOOLS,
    // Enable thinking mode for deep reasoning
    thinking: {
      type: "enabled",
    },
  }

  const MAX_RETRIES = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt) * 1000
      console.log(`[agent-loop] Retry attempt ${attempt} after ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    const response = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const statusCode = response.status

      if (statusCode === 429) {
        const isBalance = errorText.includes("余额不足") || errorText.includes("Insufficient balance")
        if (isBalance) {
          throw new Error(`Z.ai API: Insufficient balance`)
        }
        lastError = new Error(`Z.ai rate limit (temporary)`)
        if (attempt < MAX_RETRIES) continue
        throw lastError
      }
      if (statusCode === 401 || statusCode === 403) {
        throw new Error(`Z.ai API: Invalid authentication`)
      }
      throw new Error(`Z.ai API error: ${statusCode} - ${errorText.substring(0, 200)}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const message = choice?.message

    // Extract thinking content (GLM-4.5-Flash reasoning)
    let thinkingContent: string | null = null
    if (message?.thinking_content) {
      thinkingContent = message.thinking_content
    } else if (message?.reasoning_content) {
      thinkingContent = message.reasoning_content
    }

    return {
      content: message?.content || null,
      toolCalls: message?.tool_calls || [],
      thinkingContent,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      finishReason: choice?.finish_reason || "stop",
    }
  }

  throw lastError || new Error("Z.ai API call failed")
}

// ━━ Main Agent Loop ━━
export async function runAgentLoop(
  userMessage: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  apiKey: string,
  model: string = "glm-4.5-flash",
  options?: {
    maxSteps?: number
    maxTokens?: number
    onStep?: (step: AgentStep) => void
  }
): Promise<AgentLoopResult> {
  const maxSteps = options?.maxSteps || 15
  const steps: AgentStep[] = []
  let stepCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const usedTools = new Set<string>()
  let finalThinkingContent: string | null = null

  // Build messages array
  const messages: ZaiMessage[] = [
    { role: "system", content: AGENTIC_SYSTEM_PROMPT },
  ]

  // Add conversation history (last 10 messages)
  const recentHistory = conversationHistory.slice(-10)
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // Add current user message
  messages.push({ role: "user", content: userMessage })

  // Agent loop: keep going until model gives a final response (no tool calls)
  // or we hit the max step limit
  for (let iteration = 0; iteration < maxSteps; iteration++) {
    stepCount++

    try {
      const result = await callZaiWithTools(messages, model, apiKey, {
        maxTokens: options?.maxTokens || 8192,
        temperature: iteration === 0 ? 0.6 : 0.5, // Slightly lower temp for follow-ups
      })

      totalInputTokens += result.inputTokens
      totalOutputTokens += result.outputTokens

      // Capture thinking content
      if (result.thinkingContent) {
        finalThinkingContent = result.thinkingContent
        const thinkStep: AgentStep = {
          type: "thinking",
          content: result.thinkingContent.substring(0, 2000), // Limit thinking content
          stepNumber: stepCount,
          timestamp: Date.now(),
        }
        steps.push(thinkStep)
        options?.onStep?.(thinkStep)
      }

      // If model made tool calls, execute them and continue the loop
      if (result.toolCalls && result.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation
        const assistantMsg: ZaiMessage = {
          role: "assistant",
          content: result.content,
          tool_calls: result.toolCalls,
        }
        messages.push(assistantMsg)

        // Execute each tool call
        for (const toolCall of result.toolCalls) {
          const toolName = toolCall.function.name
          let toolArgs: Record<string, any>
          try {
            toolArgs = JSON.parse(toolCall.function.arguments)
          } catch {
            toolArgs = { _raw: toolCall.function.arguments }
          }

          usedTools.add(toolName)

          // Record tool call step
          const callStep: AgentStep = {
            type: "tool_call",
            content: `Calling ${toolName}`,
            toolName,
            toolArgs,
            stepNumber: stepCount,
            timestamp: Date.now(),
          }
          steps.push(callStep)
          options?.onStep?.(callStep)

          // Execute the tool
          const toolResult = await executeToolCall(toolName, toolArgs)

          // Record tool result step
          const resultStep: AgentStep = {
            type: "tool_result",
            content: toolResult.success
              ? `${toolName} completed`
              : `${toolName} failed: ${toolResult.result.substring(0, 500)}`,
            toolName,
            toolResult: toolResult.result.substring(0, 3000), // Limit result size
            stepNumber: stepCount,
            timestamp: Date.now(),
          }
          steps.push(resultStep)
          options?.onStep?.(resultStep)

          // Add tool result to conversation
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult.result.substring(0, 3000),
          })
        }

        // Continue loop - model will see tool results and decide next action
        continue
      }

      // No tool calls - this is the final response
      if (result.content) {
        const finalStep: AgentStep = {
          type: "response",
          content: result.content,
          stepNumber: stepCount,
          timestamp: Date.now(),
        }
        steps.push(finalStep)
        options?.onStep?.(finalStep)

        return {
          finalResponse: result.content,
          steps,
          totalSteps: stepCount,
          totalInputTokens,
          totalOutputTokens,
          model,
          provider: "zai",
          cost: 0, // GLM-4.5-Flash is free
          apiKeyId: "", // Will be set by caller
          usedTools: Array.from(usedTools),
          thinkingContent: finalThinkingContent || undefined,
        }
      }

      // Empty response - ask model to continue
      messages.push({
        role: "user",
        content: "Please continue. Your previous response was empty.",
      })

    } catch (error: any) {
      const errorStep: AgentStep = {
        type: "error",
        content: `Error in step ${stepCount}: ${error.message}`,
        stepNumber: stepCount,
        timestamp: Date.now(),
      }
      steps.push(errorStep)
      options?.onStep?.(errorStep)

      // If it's a rate limit or temporary error, try once more
      if (error.message.includes("rate limit") || error.message.includes("429")) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }

      // For other errors, return what we have so far
      return {
        finalResponse: `I encountered an error during execution: ${error.message}. I completed ${stepCount} steps before the error occurred.${steps.filter(s => s.type === "tool_result").length > 0 ? "\n\nHere's what I accomplished:\n" + steps.filter(s => s.type === "tool_result").map(s => `- ${s.content}`).join("\n") : ""}`,
        steps,
        totalSteps: stepCount,
        totalInputTokens,
        totalOutputTokens,
        model,
        provider: "zai",
        cost: 0,
        apiKeyId: "",
        usedTools: Array.from(usedTools),
      }
    }
  }

  // Hit max step limit - return what we have
  const lastContent = steps.filter(s => s.type === "response" || s.type === "tool_result").pop()
  return {
    finalResponse: `I reached the maximum number of steps (${maxSteps}) during execution. Let me summarize what I accomplished:\n\n${steps.filter(s => s.type === "tool_result").map(s => `- ${s.content}`).join("\n")}\n\n${lastContent?.content || "The task may not be fully complete. You can ask me to continue."}`,
    steps,
    totalSteps: stepCount,
    totalInputTokens,
    totalOutputTokens,
    model,
    provider: "zai",
    cost: 0,
    apiKeyId: "",
    usedTools: Array.from(usedTools),
  }
}
