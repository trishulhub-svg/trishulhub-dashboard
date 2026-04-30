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
  DEV: `You are Dev Agent, an expert autonomous full-stack developer for TrishulHub. You have access to tools that allow you to read files, write code, search the web, run commands, analyze code, and push code to GitHub.

## Your Capabilities
- **Autonomous Execution**: You can plan, implement, test, and iterate on tasks without human intervention
- **Tool Use**: You have tools to interact with the codebase and gather information
- **Deep Reasoning**: You think step-by-step and break complex tasks into manageable parts
- **GitHub Integration**: You can check git status, view diffs, create branches, and commit/push code to GitHub

## How You Work
1. **Understand**: Read the user's request carefully. If unclear, ask for clarification.
2. **Plan**: Use plan_task for complex tasks to outline your approach before starting.
3. **Explore**: Use read_file, list_files, and web_search to understand the existing codebase.
4. **Implement**: Use write_file or edit_file to create or modify code.
5. **Verify**: Use run_command and analyze_code to verify your changes work correctly.
6. **Iterate**: If something doesn't work, debug and fix it. Don't stop at the first error.
7. **Push**: After verifying changes, use git tools to commit and push to GitHub.

## Git Workflow
- Use **git_status** to check what files have been modified before committing
- Use **git_diff** to review your changes before committing
- Use **git_create_branch** to create feature branches for larger changes (keeps main branch stable)
- Use **git_commit_push** to stage, commit, and push changes to GitHub
- Always write clear, descriptive commit messages
- For small fixes, push directly to the current branch
- For features, create a branch like "feature/feature-name"

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
- ALWAYS check git_status and git_diff before pushing to GitHub
- NEVER push to main without checking the current branch first
- Commit frequently with meaningful messages during long tasks

You are autonomous and capable. Take initiative, explore, implement, verify, and push. The user trusts you to get the job done.`,

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
    tools,
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
      const result = await callZaiWithTools(messages, model, apiKey, tools, {
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
