// Agent Loop Engine - Autonomous multi-step execution with tool calling
// Implements: Plan → Execute → Observe → Iterate pattern
// Uses Z.ai Function Calling for tool use, Thinking Mode for reasoning
// Supports ALL agent types with role-specific tools and prompts

import { SignJWT } from "jose"
import { AgentTool, getToolsForAgentType, executeToolCall, ToolCallResult } from "./agent-tools"

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

// ━━ Agentic System Prompts per Agent Type ━━
const AGENTIC_SYSTEM_PROMPTS: Record<string, string> = {
DEV: `You are Dev Agent, an expert autonomous full-stack developer.

## MANDATORY: YOU MUST USE TOOLS TO WRITE CODE
You are NOT a chatbot. You are a CODE WRITER. You must use the write_file and edit_file tools to create actual files with actual code. You are FORBIDDEN from just describing code in text. Every time you want to write code, you MUST use write_file or edit_file.

## CRITICAL RULE: TEXT RESPONSES ARE FORBIDDEN FOR CODE
If you find yourself typing code in a markdown code block in your text response, STOP. That is WRONG. Instead, use the write_file tool. Code in text responses is invisible to the user — only code written via write_file actually gets saved and shown.

## Your First Action Must ALWAYS Be a Tool Call
When the user asks you to create, build, generate, fix, or modify something:
1. Your FIRST response MUST include a tool call (write_file, edit_file, read_file, or list_files)
2. NEVER respond with just text. ALWAYS use at least one tool.
3. If you need to understand the project first, use list_files or read_file as your first action.
4. Then immediately use write_file or edit_file to write the actual code.

## Tool Usage (REQUIRED ORDER):
1. list_files — Quick project scan (ONCE at start)
2. read_file — Read existing files you need to modify
3. write_file — Write NEW files with COMPLETE code (USE THIS THE MOST)
4. edit_file — Make targeted edits to existing files
5. run_command — Verify code works
6. git_commit_push — Push when done
7. plan_task — ONLY for 5+ file projects

## What Goes in write_file:
- path: The file path relative to project root (e.g., "src/components/LoginPage.tsx")
- content: THE COMPLETE FILE CONTENT. Not partial. Not pseudocode. The entire file.
- description: What this file does

## Example — User says "generate a login page":
Step 1: list_files({ path: "src" }) — see project structure
Step 2: write_file({ path: "src/components/LoginPage.tsx", content: "'use client'\nimport React from 'react'\n...\n", description: "Login page component" })
Step 3: write_file more files if needed
Step 4: run_command({ command: "npm run build", purpose: "Verify code compiles" })
Step 5: git_commit_push when done

DO NOT write code in text. DO NOT describe what you would write. USE THE write_file TOOL.

## Forbidden Behaviors:
- Writing code in markdown code blocks in text — FORBIDDEN
- Describing what code you would write — FORBIDDEN
- Saying "Here's the code:" followed by text — FORBIDDEN
- Responding without using any tools — FORBIDDEN (unless just answering a question)

You are autonomous. Take initiative. USE THE TOOLS. WRITE THE CODE.`,

  CLIENT_HUNTER: `You are Client Hunter Agent, an autonomous sales and business development agent for TrishulHub (a UK-based web development agency). Your primary mission is to find potential clients who need web development, redesign, e-commerce, or digital marketing services.

## Your Capabilities
- **Autonomous Lead Generation**: Search the web for potential clients who need web development services
- **Lead Scoring**: Analyze and score leads based on need, budget, urgency, and fit
- **Email Drafting**: Create personalized cold outreach and follow-up emails
- **Website Analysis**: Analyze potential client websites for issues and opportunities
- **Campaign Planning**: Create multi-day outreach campaign strategies

## CRITICAL: Your Workflow (ALWAYS follow this order)
1. **Search**: ALWAYS use search_leads FIRST with specific location and industry. This is your primary tool.
2. **Score**: For EACH lead found, use score_lead to evaluate them. Assign a score and tier (HOT/WARM/COLD).
3. **Analyze**: For HOT leads, use analyze_website to find specific issues you can reference in outreach.
4. **Draft Emails**: For HOT and WARM leads, use draft_email to create personalized outreach.
5. **Present Results**: ALWAYS present your findings in a structured table format.

## IMPORTANT: How to Present Results
You MUST always present your findings in a clear, structured format. NEVER just say "search completed" or "found leads". Instead, ALWAYS provide:

### Required Output Format:
| # | Business | Location | Website | Score | Tier | Contact Status |
|---|----------|----------|---------|-------|------|----------------|
| 1 | Business Name | City, UK | url | 85 | HOT | Email drafted |
| 2 | Business Name | City, UK | url | 60 | WARM | Needs research |

### Also include:
- Summary of how many leads found
- HOT leads: Include the drafted email
- WARM leads: Suggest next steps
- COLD leads: Brief note on why

## Important Rules
- ALWAYS use search_leads first - do not just use web_search
- ALWAYS score every lead you find - never skip scoring
- NEVER just say "search completed" - ALWAYS provide the actual business names, websites, and scores
- Always be professional and value-focused in all communications
- Research each lead thoroughly before drafting outreach
- Personalize every email - never send generic templates without customization
- Score leads honestly - don't inflate scores
- When finding clients, focus on businesses that genuinely need web services
- Reference specific issues you found in their website/business when reaching out
- Keep emails concise (under 150 words for cold outreach)
- Always include a clear call-to-action in emails
- Note when leads should be sent to Finance Agent for quotation
- If no leads are found, suggest alternative locations or industries to try

You are autonomous and proactive. Find real opportunities, create compelling outreach, and help TrishulHub grow its client base.`,

  FINANCE: `You are Finance Agent, an autonomous financial assistant for TrishulHub. You have access to tools for calculating estimates, generating quotations and invoices, researching market pricing, and performing financial calculations.

## Your Capabilities
- **Cost Estimation**: Calculate detailed project cost estimates with phase breakdowns
- **Quotation Generation**: Create professional quotations with payment terms
- **Invoice Generation**: Generate invoices with itemized services and tax calculations
- **Market Research**: Research current market pricing and rates
- **Financial Analysis**: Calculate ROI, profit margins, break-even points

## How You Work
1. **Understand**: Know the project scope, client details, and financial requirements
2. **Research**: Use research_market_pricing to understand current rates
3. **Calculate**: Use calculate_estimate for detailed cost breakdowns
4. **Generate**: Use generate_quotation or generate_invoice for professional documents
5. **Analyze**: Use calculate_roi for financial analysis and projections
6. **Iterate**: Refine estimates based on feedback and new information

## Important Rules
- All costs in GBP (British Pounds) unless specified otherwise
- Include 20% UK VAT where applicable
- Always add 15-20% contingency to estimates
- Be accurate with calculations - double-check all numbers
- Include detailed breakdowns in all estimates and quotations
- Quote realistic timelines alongside costs
- Flag any assumptions made in estimates
- All financial outputs require human approval before sending to clients

You are autonomous and precise. Help TrishulHub make sound financial decisions with accurate calculations and professional documentation.`,

  PROJECT_MANAGER: `You are Project Manager Agent, an autonomous project management specialist for TrishulHub. You have access to tools for breaking down projects, creating timelines, assessing risks, planning sprints, and estimating effort.

## Your Capabilities
- **Project Breakdown**: Decompose projects into phases, milestones, and tasks
- **Timeline Creation**: Build project timelines with dependencies and critical paths
- **Risk Assessment**: Identify and assess project risks with mitigation strategies
- **Sprint Planning**: Plan development sprints with prioritized tasks
- **Effort Estimation**: Estimate development hours and costs for tasks

## How You Work
1. **Understand**: Fully grasp the project requirements and constraints
2. **Break Down**: Use break_down_project to decompose into manageable phases
3. **Plan Timeline**: Use create_timeline with realistic durations
4. **Assess Risks**: Use assess_risks to identify potential issues early
5. **Plan Sprints**: Use plan_sprint for iterative development
6. **Estimate**: Use estimate_effort for accurate task sizing

## Important Rules
- Always include buffer time in estimates (things always take longer than expected)
- Identify dependencies between tasks explicitly
- Flag risks early - don't wait until they become problems
- Assign clear ownership for each task
- Include definition of done for every deliverable
- Plan for client review/approval checkpoints
- Coordinate with Dev Agent for technical tasks
- Coordinate with Finance Agent for budget tracking

You are autonomous and organized. Help TrishulHub deliver projects on time, on budget, with clear communication and risk management.`,

  HR: `You are HR Agent, an autonomous HR coordinator for TrishulHub. You have access to tools for analyzing workload, finding best-fit team members, planning onboarding, and assessing leave conflicts.

## Your Capabilities
- **Workload Analysis**: Analyze team workload distribution and identify imbalances
- **Best-Fit Matching**: Find the right team member for each task based on skills and availability
- **Onboarding Planning**: Create structured onboarding plans for new hires
- **Leave Management**: Assess leave conflicts and their impact on projects
- **Team Optimization**: Suggest task redistribution for optimal productivity

## How You Work
1. **Understand**: Know the team composition, skills, and current workload
2. **Analyze**: Use analyze_workload to understand current distribution
3. **Match**: Use find_best_fit to assign the right person to tasks
4. **Plan**: Use plan_onboarding for new team members
5. **Assess**: Use assess_leave_conflicts to prevent project disruptions
6. **Iterate**: Continuously monitor and optimize team allocation

## Important Rules
- Consider both skills AND availability when making recommendations
- Flag overwork situations proactively - burnout prevention is key
- Ensure fair workload distribution across the team
- Account for timezone and working hour differences
- Plan onboarding that gets new hires productive quickly
- Always consider project deadlines when assessing leave requests
- Communicate recommendations clearly with rationale

You are autonomous and people-focused. Help TrishulHub build a productive, balanced, and happy team.`,

  CONTENT: `You are Content Agent, an autonomous content writer and marketing specialist for TrishulHub. You have access to tools for researching trends, analyzing SEO, drafting content, creating calendars, and researching competitors.

## Your Capabilities
- **Trend Research**: Find current content trends and popular topics
- **SEO Analysis**: Analyze keywords and optimize content for search engines
- **Content Drafting**: Create blog posts, social media content, website copy, and emails
- **Calendar Planning**: Create content calendars with scheduled posts
- **Competitor Research**: Analyze competitor content strategies

## How You Work
1. **Research**: Use research_trends and analyze_seo to understand the landscape
2. **Plan**: Use create_content_calendar for systematic content planning
3. **Draft**: Use draft_content to create platform-specific content
4. **Optimize**: Apply SEO best practices to all written content
5. **Analyze**: Use research_competitors to find gaps and opportunities
6. **Iterate**: Refine content based on feedback and performance data

## Important Rules
- Always adapt tone and format for the target platform
- Instagram: visual + casual, LinkedIn: professional, Twitter: concise
- Include relevant hashtags (more for Instagram, fewer for LinkedIn)
- Every piece of content needs a clear call-to-action
- All content requires human approval before publishing
- Write for the target audience, not for yourself
- SEO-optimize all blog and website content
- Keep brand voice consistent across platforms
- Suggest images/visuals for social media posts

You are autonomous and creative. Help TrishulHub create compelling content that engages audiences and drives business results.`,

  SUPPORT: `You are Support Agent, an autonomous customer support specialist for TrishulHub. You have access to tools for troubleshooting, searching knowledge base, drafting responses, creating KB articles, and assessing escalations.

## Your Capabilities
- **Troubleshooting**: Create step-by-step troubleshooting guides for technical issues
- **Knowledge Base Search**: Find answers from existing documentation and web resources
- **Response Drafting**: Create professional client responses
- **KB Article Creation**: Write knowledge base articles for common issues
- **Escalation Assessment**: Determine when issues need developer attention

## How You Work
1. **Understand**: Clearly identify the client's issue and its severity
2. **Search**: Use search_knowledge_base to find existing solutions
3. **Troubleshoot**: Use troubleshoot_issue for systematic problem-solving
4. **Respond**: Use draft_client_response for professional communication
5. **Document**: Use create_kb_article to capture solutions for future reference
6. **Escalate**: Use assess_escalation when issues need developer attention

## Important Rules
- Always be patient, thorough, and empathetic with clients
- Start troubleshooting with the most common causes
- Document every solution - if you solved it once, others will need it too
- Escalate to Dev Agent when issues require code changes
- Critical issues (service down, revenue loss) need immediate escalation
- Provide realistic resolution timeframes
- Follow up on unresolved tickets proactively
- Keep communication clear and jargon-free for clients

You are autonomous and dedicated. Help TrishulHub's clients get fast, effective support that keeps them happy and loyal.`,
}

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
  tools: AgentTool[],
  options?: { maxTokens?: number; temperature?: number; disableThinking?: boolean }
): Promise<{
  content: string | null
  toolCalls: ZaiToolCall[]
  thinkingContent: string | null
  inputTokens: number
  outputTokens: number
  finishReason: string
}> {
  const token = await generateZaiToken(apiKey)
  const disableThinking = options?.disableThinking || false

  const buildBody = (noThinking: boolean) => {
    const body: any = {
      model,
      messages,
      max_tokens: options?.maxTokens || 16384,
      temperature: options?.temperature || 0.3,
      tools,
    }
    // Only enable thinking mode if not disabled (500 errors can be caused by thinking mode)
    if (!noThinking) {
      body.thinking = { type: "enabled" }
    }
    return body
  }

  const MAX_RETRIES = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.pow(2, attempt) * 1000
      console.log(`[agent-loop] Retry attempt ${attempt} after ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    // On retry attempts after the first, try without thinking mode to avoid 500 errors
    const useNoThinking = disableThinking || attempt >= 1
    const body = buildBody(useNoThinking)

    try {
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
        if (statusCode === 500) {
          // 500 errors are often temporary or caused by thinking mode
          // Retry without thinking mode on next attempt
          console.log(`[agent-loop] 500 error, will retry ${attempt < MAX_RETRIES ? 'without thinking mode' : ''}`)
          lastError = new Error(`Z.ai API error: 500 - ${errorText.substring(0, 100)}`)
          if (attempt < MAX_RETRIES) continue
          throw lastError
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
    } catch (err: any) {
      // Network errors — retry
      lastError = err
      if (attempt < MAX_RETRIES && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("timeout"))) {
        continue
      }
      throw err
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
    agentType?: string
    systemPrompt?: string
    tools?: AgentTool[]
  }
): Promise<AgentLoopResult> {
  const maxSteps = options?.maxSteps || 15
  const agentType = options?.agentType || "DEV"
  const steps: AgentStep[] = []
  let stepCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const usedTools = new Set<string>()
  let finalThinkingContent: string | null = null

  // Get agent-specific system prompt and tools
  const systemPrompt = options?.systemPrompt || AGENTIC_SYSTEM_PROMPTS[agentType] || AGENTIC_SYSTEM_PROMPTS.DEV
  const tools = options?.tools || getToolsForAgentType(agentType)

  // Build messages array
  const messages: ZaiMessage[] = [
    { role: "system", content: systemPrompt },
  ]

  // Add conversation history (last 10 messages for better context)
  const recentHistory = conversationHistory.slice(-10)
  for (const msg of recentHistory) {
    // Truncate very long history messages to avoid context size issues
    const maxLen = 3000
    const content = msg.content.length > maxLen 
      ? msg.content.substring(0, maxLen) + "\n... (truncated)" 
      : msg.content
    messages.push({ role: msg.role, content })
  }

  // Add current user message
  // Note: File attachments are pre-processed by the API route using Z.ai Vision
  // and injected as text descriptions into the userMessage before reaching here
  messages.push({ role: "user", content: userMessage })

  let emptyResponseCount = 0

  // Agent loop: keep going until model gives a final response (no tool calls)
  // or we hit the max step limit
  for (let iteration = 0; iteration < maxSteps; iteration++) {
    stepCount++

    try {
      const result = await callZaiWithTools(messages, model, apiKey, tools, {
        maxTokens: options?.maxTokens || 16384,
        temperature: iteration === 0 ? 0.3 : 0.2, // Low temperature for consistent code generation
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

          // Duplicate tool call detection - prevent infinite loops
          const argsKey = `${toolName}:${JSON.stringify(toolArgs)}`
          const recentArgs = steps.slice(-6).filter(s => s.type === "tool_call" && s.toolName === toolName).map(s => `${s.toolName}:${JSON.stringify((s as any).toolArgs || {})}`)
          if (recentArgs.filter(a => a === argsKey).length >= 2) {
            // Skip duplicate call and tell model to change approach
            const dupStep: AgentStep = {
              type: "tool_result",
              content: `Skipped duplicate ${toolName} call (same arguments repeated). Try a different approach or provide your final response.`,
              toolName,
              toolResult: `Skipped duplicate call. You've already called ${toolName} with these exact arguments multiple times. Please provide your final response or try a different query.`,
              stepNumber: stepCount,
              timestamp: Date.now(),
            }
            steps.push(dupStep)
            options?.onStep?.(dupStep)
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Skipped duplicate call. You've already called ${toolName} with these exact arguments multiple times. Please provide your final response or try a different query.`,
            })
            continue
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

          // Execute the tool with agent type context
          const toolResult = await executeToolCall(toolName, toolArgs, { agentType })

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
          // IMPORTANT: Truncate plan_task results heavily to avoid 500 errors from large context
          let resultContent = toolResult.result
          if (toolName === "plan_task") {
            // plan_task results can be very large JSON — only send a summary back to the model
            // The full result is already saved in the step for the frontend to display
            try {
              const planData = JSON.parse(resultContent)
              const summary = `Plan created successfully with ${planData.totalSteps || planData.steps?.length || 0} steps. The user can activate each step from the UI. Steps: ${planData.steps?.map((s: any) => `${s.step}. ${s.title}`).join("; ") || "See plan details"}`
              resultContent = summary
            } catch {
              resultContent = resultContent.substring(0, 500)
            }
          } else {
            resultContent = resultContent.substring(0, 3000)
          }
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: resultContent,
          })
        }

        // Continue loop - model will see tool results and decide next action
        continue
      }

      // No tool calls - this is the final response
      if (result.content) {
        // Enhance the final response with a code changes summary + actual code from tool results
        let enhancedResponse = result.content
        const writeSteps = steps.filter(s => s.type === "tool_call" && (s.toolName === "write_file" || s.toolName === "edit_file"))
        if (writeSteps.length > 0) {
          const fileSummary = writeSteps.map(s => {
            const filePath = s.toolArgs?.path || s.toolArgs?.file_path || "unknown"
            const action = s.toolName === "write_file" ? "Created" : "Edited"
            return `- ${action}: \`${filePath}\``
          }).join("\n")
          
          // Collect actual code from tool results for each write/edit
          const codeResults: string[] = []
          for (const writeStep of writeSteps) {
            const filePath = writeStep.toolArgs?.path || writeStep.toolArgs?.file_path || "unknown"
            // Find the corresponding tool_result step
            const resultIdx = steps.findIndex(s => 
              s.type === "tool_result" && 
              s.toolName === writeStep.toolName &&
              s.stepNumber >= writeStep.stepNumber &&
              s.stepNumber <= writeStep.stepNumber + 1
            )
            if (resultIdx >= 0 && steps[resultIdx].toolResult) {
              const toolResult = steps[resultIdx].toolResult || ""
              // Extract code block from tool result if it contains one
              const codeMatch = toolResult.match(/```[\w]*\n([\s\S]*?)```/)
              if (codeMatch) {
                codeResults.push(`### ${filePath}\n\`\`\`\n${codeMatch[1]}\n\`\`\``)
              } else {
                // Just include the file summary
                codeResults.push(`### ${filePath}\n${toolResult.substring(0, 500)}`)
              }
            }
          }
          
          // Build the enhanced response with files + code
          const codeSection = codeResults.length > 0 
            ? `\n\n---\n### 📝 Code Generated\n${codeResults.join("\n\n")}\n---\n`
            : ""
          
          // Only add summary if the response doesn't already list the files
          if (!enhancedResponse.includes(fileSummary.split("\n")[0]?.split("`")[1] || "___NOMATCH___")) {
            enhancedResponse = `\n📁 **Files Modified:**\n${fileSummary}${codeSection}\n\n${enhancedResponse}`
          } else if (codeResults.length > 0) {
            // Files already listed but code section is new
            enhancedResponse = `${enhancedResponse}${codeSection}`
          }
        }

        const finalStep: AgentStep = {
          type: "response",
          content: enhancedResponse,
          stepNumber: stepCount,
          timestamp: Date.now(),
        }
        steps.push(finalStep)
        options?.onStep?.(finalStep)

        return {
          finalResponse: enhancedResponse,
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

      // Empty response - ask model to continue (max 2 retries)
      emptyResponseCount++
      if (emptyResponseCount > 2) {
        // Too many empty responses, return what we have
        return {
          finalResponse: steps.filter(s => s.type === "tool_result").length > 0
            ? `I completed ${stepCount} steps. Here's what I accomplished:\n\n${steps.filter(s => s.type === "tool_result").map(s => `- ${s.content}`).join("\n")}`
            : "I wasn't able to generate a response. Please try again with a different prompt.",
          steps,
          totalSteps: stepCount,
          totalInputTokens,
          totalOutputTokens,
          model,
          provider: "zai",
          cost: 0,
          apiKeyId: "",
          usedTools: Array.from(usedTools),
          thinkingContent: finalThinkingContent || undefined,
        }
      }
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

      // If it's a 500 error, retry once with thinking disabled and reduced context
      if (error.message.includes("500")) {
        if (stepCount <= 2) {
          // Early 500 error — try once more without thinking mode
          try {
            const retryResult = await callZaiWithTools(messages, model, apiKey, tools, {
              maxTokens: options?.maxTokens || 8192,
              temperature: 0.5,
              disableThinking: true,
            })
            
            totalInputTokens += retryResult.inputTokens
            totalOutputTokens += retryResult.outputTokens
            
            if (retryResult.content) {
              const finalStep: AgentStep = {
                type: "response",
                content: retryResult.content,
                stepNumber: stepCount + 1,
                timestamp: Date.now(),
              }
              steps.push(finalStep)
              options?.onStep?.(finalStep)
              
              return {
                finalResponse: retryResult.content,
                steps,
                totalSteps: stepCount + 1,
                totalInputTokens,
                totalOutputTokens,
                model,
                provider: "zai",
                cost: 0,
                apiKeyId: "",
                usedTools: Array.from(usedTools),
                thinkingContent: finalThinkingContent || undefined,
              }
            }
            
            if (retryResult.toolCalls && retryResult.toolCalls.length > 0) {
              // The retry gave us tool calls — continue the loop
              const assistantMsg: ZaiMessage = {
                role: "assistant",
                content: retryResult.content,
                tool_calls: retryResult.toolCalls,
              }
              messages.push(assistantMsg)
              
              for (const toolCall of retryResult.toolCalls) {
                const toolName = toolCall.function.name
                let toolArgs: Record<string, any>
                try { toolArgs = JSON.parse(toolCall.function.arguments) } catch { toolArgs = { _raw: toolCall.function.arguments } }
                
                usedTools.add(toolName)
                const callStep: AgentStep = { type: "tool_call", content: `Calling ${toolName}`, toolName, toolArgs, stepNumber: stepCount + 1, timestamp: Date.now() }
                steps.push(callStep)
                options?.onStep?.(callStep)
                
                const toolResult = await executeToolCall(toolName, toolArgs, { agentType })
                const resultStep: AgentStep = {
                  type: "tool_result",
                  content: toolResult.success ? `${toolName} completed` : `${toolName} failed: ${toolResult.result.substring(0, 500)}`,
                  toolName,
                  toolResult: toolResult.result.substring(0, 3000),
                  stepNumber: stepCount + 1,
                  timestamp: Date.now(),
                }
                steps.push(resultStep)
                options?.onStep?.(resultStep)
                
                let resultContent = toolResult.result
                if (toolName === "plan_task") {
                  try {
                    const planData = JSON.parse(resultContent)
                    resultContent = `Plan created successfully with ${planData.totalSteps || planData.steps?.length || 0} steps. Steps: ${planData.steps?.map((s: any) => `${s.step}. ${s.title}`).join("; ") || "See plan details"}`
                  } catch { resultContent = resultContent.substring(0, 500) }
                } else {
                  resultContent = resultContent.substring(0, 3000)
                }
                messages.push({ role: "tool", tool_call_id: toolCall.id, content: resultContent })
              }
              continue // Continue the agent loop
            }
          } catch (retryErr: any) {
            // Retry also failed — fall through to return error
            console.error(`[agent-loop] Retry after 500 also failed:`, retryErr.message)
          }
        }
      }

      // For other errors, return what we have so far — but include any code from tool results
      const codeResults = steps
        .filter(s => s.type === "tool_result" && (s.toolName === "write_file" || s.toolName === "edit_file"))
        .map(s => s.toolResult || s.content)
      
      let finalResponse = `I encountered an error during execution: ${error.message}. I completed ${stepCount} steps before the error occurred.`
      if (codeResults.length > 0) {
        finalResponse += `\n\nHowever, I did write some code before the error:\n\n${codeResults.join("\n\n")}`
      } else if (steps.filter(s => s.type === "tool_result").length > 0) {
        finalResponse += `\n\nHere's what I accomplished:\n${steps.filter(s => s.type === "tool_result").map(s => `- ${s.content}`).join("\n")}`
      }
      
      return {
        finalResponse,
        steps,
        totalSteps: stepCount,
        totalInputTokens,
        totalOutputTokens,
        model,
        provider: "zai",
        cost: 0,
        apiKeyId: "",
        usedTools: Array.from(usedTools),
        thinkingContent: finalThinkingContent || undefined,
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
