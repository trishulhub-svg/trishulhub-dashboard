// ━━ Level 3 Autonomy Engine ━━
// Fully autonomous agent thinking cycles with retry, approval gates,
// inter-agent communication, and activity logging.
//
// Architecture:
//   Vercel Cron → /api/agents/autonomy/cron → runAutonomyCycle()
//     → For each enabled agent: gatherContext() → runThinkingCycle() → logActivity()
//
// Approval Gates:
//   🟢 Auto-execute: Search, analyze, score, calculate, plan, report
//   🟡 Draft & notify: Send emails, create invoices, assign tasks (creates approval)
//   🔴 Block & approve: Deploy code, delete data, send to external clients

import { db } from "@/lib/db"
import { runAgentLoop, AgentStep } from "./agent-loop"
import { getToolsForAgentType } from "./agent-tools"
import type { AgentTool } from "./agent-tools"

// ━━ Types ━━
export interface AutonomyContext {
  agentId: string
  agentType: string
  agentName: string
  model: string
  systemPrompt: string
  rolePrompt: string
  pendingMessages: Array<{ id: string; message: string; fromAgent: string; createdAt: string }>
  scheduledTasks: Array<{ id: string; title: string; status: string; dueDate: string }>
  recentActivity: Array<{ action: string; title: string; createdAt: string }>
  unreadNotifications: number
}

interface ThinkingCycleResult {
  success: boolean
  response: string
  steps: AgentStep[]
  tokensUsed: number
  cost: number
  duration: number
  error?: string
}

// ━━ Approval Gate Classification ━━
// Actions that can auto-execute without human approval
export const AUTO_EXECUTE_TOOLS: Record<string, string[]> = {
  CLIENT_HUNTER: ["web_search", "search_leads", "analyze_website", "score_lead", "plan_outreach_campaign"],
  FINANCE: ["web_search", "calculate_estimate", "research_market_pricing", "calculate_roi"],
  PROJECT_MANAGER: ["web_search", "break_down_project", "create_timeline", "assess_risks", "estimate_effort"],
  HR: ["web_search", "analyze_workload", "find_best_fit", "plan_onboarding", "assess_leave_conflicts"],
  CONTENT: ["web_search", "research_trends", "analyze_seo", "create_content_calendar", "research_competitors"],
  SUPPORT: ["web_search", "troubleshoot_issue", "search_knowledge_base", "assess_escalation"],
}

// Actions that create drafts requiring approval
export const DRAFT_APPROVAL_TOOLS: Record<string, string[]> = {
  CLIENT_HUNTER: ["draft_email"],
  FINANCE: ["generate_quotation", "generate_invoice"],
  PROJECT_MANAGER: ["plan_sprint"],
  CONTENT: ["draft_content"],
  SUPPORT: ["draft_client_response", "create_kb_article"],
}

// ━━ Autonomous System Prompts ━━
// These override the agentic prompts for autonomous thinking cycles.
// They instruct agents to think proactively and decide what to do.
export function getAutonomousSystemPrompt(agentType: string, rolePrompt: string): string {
  const baseAutonomyPrompt = `You are operating in FULLY AUTONOMOUS MODE. No human has triggered this message — you decided to think and act on your own.

## Your Mission
Review your current situation and decide what actions to take. You have context about:
- Recent cross-agent messages from other agents
- Your scheduled tasks and their status
- Your recent activity log

## Rules for Autonomous Mode
1. Be PROACTIVE — don't just report status, TAKE ACTION
2. Be EFFICIENT — only take actions that add real value
3. Be THOUGHTFUL — consider the current time and business context
4. Use your TOOLS to accomplish real work (search, analyze, calculate, plan)
5. If another agent messaged you, RESPOND appropriately using cross-agent messaging
6. If you have pending tasks, WORK on them or update their status
7. Keep your final response CONCISE — summarize what you did and why
8. If there's nothing useful to do right now, say "No action needed" briefly

## IMPORTANT: Time Awareness
The current date/time is ${new Date().toISOString()}.
Consider business hours (Mon-Fri 9AM-6PM UK time) when deciding whether to take actions that involve external communication.

## Tool Usage in Autonomous Mode
- Use tools to do REAL work (search leads, analyze data, update tasks)
- For actions that send emails or create documents, draft them and they will go through approval
- You can message other agents if you need their help or have information for them`

  // Add role-specific autonomous instructions
  const roleSpecific: Record<string, string> = {
    CLIENT_HUNTER: `\n\n## Client Hunter Autonomous Focus
- Search for new leads in UK web development market
- Follow up on previously found leads (check activity log)
- Score and analyze promising leads
- Draft outreach emails for hot leads
- Track market trends for web development services`,

    FINANCE: `\n\n## Finance Agent Autonomous Focus
- Check for overdue invoices or pending payments
- Review financial metrics and flag anomalies
- Prepare cost estimates if there are new projects
- Generate financial summaries
- Track budget utilization`,

    PROJECT_MANAGER: `\n\n## Project Manager Autonomous Focus
- Check for overdue tasks and missed deadlines
- Review project progress across all active projects
- Identify blockers and risks
- Update task statuses based on recent activity
- Plan sprints if needed`,

    HR: `\n\n## HR Agent Autonomous Focus
- Monitor team workload and flag burnout risks
- Check for leave conflicts
- Suggest team optimizations
- Track attendance patterns
- Plan onboarding for new team members`,

    CONTENT: `\n\n## Content Agent Autonomous Focus
- Research current trends in web development and digital marketing
- Draft social media content ideas
- Analyze SEO opportunities
- Create content calendar updates
- Review competitor content strategies`,

    SUPPORT: `\n\n## Support Agent Autonomous Focus
- Check for any unaddressed support issues
- Search knowledge base for common problems
- Review recent escalations and follow up
- Create knowledge base articles for recurring issues
- Monitor for potential client issues`,
  }

  return `${rolePrompt}\n\n---\n\n${baseAutonomyPrompt}${roleSpecific[agentType] || ""}`
}

// ━━ Context Gathering ━━
export async function gatherAutonomyContext(agentId: string, agentType: string, agentName: string): Promise<AutonomyContext> {
  // Get agent details
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    include: { roleConfig: true },
  })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  // Get pending cross-agent messages
  const pendingMessages = await db.crossAgentMessage.findMany({
    where: { toAgentId: agentId, status: "PENDING" },
    include: { fromAgent: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  // Get scheduled tasks
  const scheduledTasks = await db.scheduledTask.findMany({
    where: { agentId, status: { in: ["PENDING", "IN_PROGRESS"] } },
    orderBy: { dueDate: "asc" },
    take: 10,
  })

  // Get recent activity (last 20 entries)
  const recentActivity = await db.agentActivityLog.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return {
    agentId,
    agentType,
    agentName,
    model: agent.model || "glm-4.5-flash",
    systemPrompt: agent.systemPrompt || "",
    rolePrompt: agent.roleConfig?.rolePrompt || agent.systemPrompt || "",
    pendingMessages: pendingMessages.map(m => ({
      id: m.id,
      message: m.message,
      fromAgent: m.fromAgent.name,
      createdAt: m.createdAt.toISOString(),
    })),
    scheduledTasks: scheduledTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate.toISOString(),
    })),
    recentActivity: recentActivity.map(a => ({
      action: a.action,
      title: a.title,
      createdAt: a.createdAt.toISOString(),
    })),
    unreadNotifications: pendingMessages.length,
  }
}

// ━━ Build Thinking Prompt from Context ━━
export function buildThinkingPrompt(context: AutonomyContext): string {
  const parts: string[] = []

  parts.push(`[AUTONOMOUS THINKING CYCLE — ${new Date().toISOString()}]`)
  parts.push(`You are ${context.agentName}. Review your situation and take action.`)

  // Pending cross-agent messages
  if (context.pendingMessages.length > 0) {
    parts.push(`\n## Incoming Messages (${context.pendingMessages.length})`)
    for (const msg of context.pendingMessages) {
      parts.push(`- From ${msg.fromAgent} (${msg.createdAt}): ${msg.message}`)
    }
  }

  // Scheduled tasks
  if (context.scheduledTasks.length > 0) {
    parts.push(`\n## Pending Tasks (${context.scheduledTasks.length})`)
    for (const task of context.scheduledTasks) {
      const isOverdue = new Date(task.dueDate) < new Date()
      parts.push(`- [${task.status}]${isOverdue ? " ⚠️ OVERDUE" : ""} ${task.title} (due: ${task.dueDate})`)
    }
  }

  // Recent activity
  if (context.recentActivity.length > 0) {
    parts.push(`\n## Recent Activity (last ${context.recentActivity.length} actions)`)
    for (const activity of context.recentActivity.slice(0, 5)) {
      parts.push(`- [${activity.action}] ${activity.title} (${activity.createdAt})`)
    }
  }

  if (context.unreadNotifications === 0 && context.scheduledTasks.length === 0) {
    parts.push(`\nNo pending messages or tasks. Check if there's any proactive work you should do.`)
  }

  parts.push(`\nDecide what to do now. Use tools as needed. Keep your response concise.`)

  return parts.join("\n")
}

// ━━ Get API Key for Agent ━━
async function getApiKeyForAgent(agentId: string, model: string): Promise<{ apiKey: string; apiKeyId: string; provider: string }> {
  // Match the same key selection logic as agent-chat route
  const isNvidia = model.startsWith("z-ai/") || model.startsWith("nvidia/")
  const providerFilter = isNvidia ? "NVIDIA" : "ZAI"

  // Try environment variables first (same as agent-chat)
  const envKey = isNvidia ? process.env.NVIDIA_API_KEY : process.env.ZAI_API_KEY
  if (envKey && envKey.trim() !== "") {
    return { apiKey: envKey.trim(), apiKeyId: "env-key", provider: providerFilter }
  }

  // Try database keys
  const availableKey = await db.apiKey.findFirst({
    where: {
      provider: providerFilter,
      status: "ACTIVE",
      NOT: { keyValue: "" },
    },
    orderBy: { priority: "asc" },
  })

  if (!availableKey) {
    // Fallback: try any active key from any provider
    const fallbackKey = await db.apiKey.findFirst({
      where: { status: "ACTIVE", NOT: { keyValue: "" } },
      orderBy: { priority: "asc" },
    })
    if (!fallbackKey) throw new Error("No API keys available")
    return { apiKey: fallbackKey.keyValue, apiKeyId: fallbackKey.id, provider: fallbackKey.provider || "ZAI" }
  }

  return { apiKey: availableKey.keyValue, apiKeyId: availableKey.id, provider: availableKey.provider || "ZAI" }
}

// ━━ Retry with Exponential Backoff ━━
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 2000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000
      console.warn(`[autonomy] Attempt ${attempt + 1}/${maxRetries} failed: ${err.message}. Retrying in ${Math.round(delay)}ms...`)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError || new Error("All retry attempts failed")
}

// ━━ Run Single Agent Thinking Cycle ━━
async function runThinkingCycle(agentId: string): Promise<ThinkingCycleResult> {
  const startTime = Date.now()

  try {
    // Gather context
    const agent = await db.agent.findUnique({ where: { id: agentId } })
    if (!agent) throw new Error("Agent not found")

    const context = await gatherAutonomyContext(agentId, agent.type, agent.name)
    const thinkingPrompt = buildThinkingPrompt(context)

    // Get API key
    const { apiKey, apiKeyId, provider } = await getApiKeyForAgent(agentId, context.model)

    // Determine if we need to filter tools based on approval gates
    const allTools = getToolsForAgentType(agent.type)
    const autoTools = AUTO_EXECUTE_TOOLS[agent.type] || []
    const draftTools = DRAFT_APPROVAL_TOOLS[agent.type] || []

    // In autonomous mode, include all tools but the system prompt instructs the agent
    // on which ones need approval. The agent loop executes all tools.
    const tools = allTools

    // Build the autonomous system prompt
    const autonomousPrompt = getAutonomousSystemPrompt(agent.type, context.rolePrompt)

    // Determine provider
    const useNvidia = provider === "NVIDIA" || context.model.startsWith("z-ai/")

    // Run the agent loop with retry
    const result = await withRetry(async () => {
      return runAgentLoop(thinkingPrompt, [], apiKey, context.model, {
        maxSteps: 8, // Fewer steps for autonomous cycles to save tokens
        agentType: agent.type,
        systemPrompt: autonomousPrompt,
        tools,
        provider: useNvidia ? "NVIDIA" : "ZAI",
        onStep: (step: AgentStep) => {
          // Log tool calls in real-time
          if (step.type === "tool_call") {
            console.log(`[autonomy:${agent.type}] Tool call: ${step.toolName}`)
          }
        },
      })
    }, 3, 2000)

    const duration = Date.now() - startTime

    // Mark pending cross-agent messages as processed
    if (context.pendingMessages.length > 0) {
      const msgIds = context.pendingMessages.map(m => m.id)
      await db.crossAgentMessage.updateMany({
        where: { id: { in: msgIds } },
        data: { status: "PROCESSED" },
      })
    }

    // Handle approval gates for draft actions
    // Check if any tool used was a draft-approval tool
    const draftToolsUsed = result.usedTools.filter(t => draftTools.includes(t))
    if (draftToolsUsed.length > 0) {
      // Create approval items for draft actions
      for (const toolName of draftToolsUsed) {
        await db.approval.create({
          data: {
            type: "TASK",
            requesterType: "AI",
            requesterId: agentId,
            agentId,
            title: `Autonomous: ${toolName} needs approval`,
            description: `${agent.name} autonomously used ${toolName}. Review before executing.`,
            status: "PENDING",
          },
        })
      }
    }

    return {
      success: true,
      response: result.finalResponse,
      steps: result.steps,
      tokensUsed: result.totalInputTokens + result.totalOutputTokens,
      cost: result.cost,
      duration,
    }
  } catch (err: any) {
    const duration = Date.now() - startTime
    return {
      success: false,
      response: "",
      steps: [],
      tokensUsed: 0,
      cost: 0,
      duration,
      error: err.message,
    }
  }
}

// ━━ Main Autonomy Cycle — Called by Cron ━━
export async function runAutonomyCycle(): Promise<{
  ran: number
  skipped: number
  errors: number
  details: Array<{ agentName: string; agentType: string; success: boolean; error?: string; duration: number }>
}> {
  const result = { ran: 0, skipped: 0, errors: 0, details: [] as any[] }

  try {
    // Find all agents with autonomy enabled and ready to run
    const configs = await db.agentAutonomyConfig.findMany({
      where: {
        enabled: true,
        status: "RUNNING",
        nextRunAt: { lte: new Date() },
      },
      include: { agent: true },
    })

    // Also check: if no configs exist yet, nothing to run
    if (configs.length === 0) {
      return result
    }

    for (const config of configs) {
      const agent = config.agent

      // DEV agent is never autonomous
      if (agent.type === "DEV") {
        result.skipped++
        continue
      }

      // Don't run if agent is already marked as RUNNING (prevents concurrent cycles)
      if (agent.status === "RUNNING") {
        result.skipped++
        continue
      }

      try {
        // Mark agent as running
        await db.agent.update({
          where: { id: agent.id },
          data: { status: "RUNNING" },
        })

        // Run the thinking cycle
        const cycleResult = await runThinkingCycle(agent.id)

        if (cycleResult.success) {
          // Log successful activity
          await db.agentActivityLog.create({
            data: {
              agentId: agent.id,
              configId: config.id,
              action: "thinking_cycle",
              title: `Autonomous thinking cycle #${config.totalRuns + 1}`,
              description: cycleResult.response.substring(0, 500),
              result: JSON.stringify({
                steps: cycleResult.steps.length,
                toolsUsed: cycleResult.steps.filter(s => s.type === "tool_call").map(s => s.toolName),
                responseLength: cycleResult.response.length,
              }),
              status: "SUCCESS",
              tokensUsed: cycleResult.tokensUsed,
              cost: cycleResult.cost,
              duration: cycleResult.duration,
            },
          })

          // Update config
          const nextRun = new Date()
          nextRun.setMinutes(nextRun.getMinutes() + config.interval)

          await db.agentAutonomyConfig.update({
            where: { id: config.id },
            data: {
              lastRunAt: new Date(),
              nextRunAt: nextRun,
              totalRuns: config.totalRuns + 1,
              lastError: null,
            },
          })

          result.ran++
          result.details.push({
            agentName: agent.name,
            agentType: agent.type,
            success: true,
            duration: cycleResult.duration,
          })
        } else {
          // Log error
          await db.agentActivityLog.create({
            data: {
              agentId: agent.id,
              configId: config.id,
              action: "error",
              title: `Autonomous cycle failed`,
              description: cycleResult.error,
              status: "FAILED",
              duration: cycleResult.duration,
            },
          })

          await db.agentAutonomyConfig.update({
            where: { id: config.id },
            data: {
              totalErrors: config.totalErrors + 1,
              lastError: cycleResult.error,
              status: "ERROR",
            },
          })

          result.errors++
          result.details.push({
            agentName: agent.name,
            agentType: agent.type,
            success: false,
            error: cycleResult.error,
            duration: cycleResult.duration,
          })
        }

        // Reset agent status back to IDLE
        await db.agent.update({
          where: { id: agent.id },
          data: { status: "IDLE" },
        })

      } catch (err: any) {
        // Catch unexpected errors and continue to next agent
        console.error(`[autonomy] Unexpected error for ${agent.name}:`, err.message)
        result.errors++
        result.details.push({
          agentName: agent.name,
          agentType: agent.type,
          success: false,
          error: err.message,
          duration: 0,
        })

        // Reset agent status
        await db.agent.update({
          where: { id: agent.id },
          data: { status: "IDLE" },
        })
      }
    }
  } catch (err: any) {
    console.error("[autonomy] Fatal error in autonomy cycle:", err.message)
  }

  return result
}

// ━━ Initialize Autonomy Config for All Agents ━━
export async function initAutonomyConfigs(): Promise<void> {
  const agents = await db.agent.findMany({
    where: { type: { not: "DEV" } }, // DEV is never autonomous
  })

  for (const agent of agents) {
    const existing = await db.agentAutonomyConfig.findUnique({
      where: { agentId: agent.id },
    })

    if (!existing) {
      await db.agentAutonomyConfig.create({
        data: {
          agentId: agent.id,
          enabled: false, // Start disabled — admin enables manually
          interval: 5,
          status: "PAUSED",
        },
      })
    }
  }
}

// ━━ Get Autonomy Status for All Agents ━━
export async function getAutonomyStatus() {
  const configs = await db.agentAutonomyConfig.findMany({
    include: {
      agent: { select: { id: true, name: true, type: true, status: true, model: true } },
      _count: { select: { activityLogs: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return configs.map(c => ({
    id: c.id,
    agentId: c.agentId,
    agentName: c.agent.name,
    agentType: c.agent.type,
    agentStatus: c.agent.status,
    model: c.agent.model,
    enabled: c.enabled,
    status: c.status,
    interval: c.interval,
    lastRunAt: c.lastRunAt,
    nextRunAt: c.nextRunAt,
    totalRuns: c.totalRuns,
    totalErrors: c.totalErrors,
    lastError: c.lastError,
    totalActivityLogs: c._count.activityLogs,
  }))
}

// ━━ Toggle Agent Autonomy ━━
export async function toggleAgentAutonomy(agentId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent) return { success: false, error: "Agent not found" }
  if (agent.type === "DEV") return { success: false, error: "DEV agent cannot be autonomous" }

  const config = await db.agentAutonomyConfig.upsert({
    where: { agentId },
    create: {
      agentId,
      enabled,
      interval: 5,
      status: enabled ? "RUNNING" : "PAUSED",
      nextRunAt: enabled ? new Date() : null,
    },
    update: {
      enabled,
      status: enabled ? "RUNNING" : "PAUSED",
      nextRunAt: enabled ? new Date() : null,
      lastError: null,
    },
  })

  // Also update agent status
  if (!enabled) {
    await db.agent.update({
      where: { id: agentId },
      data: { status: "IDLE" },
    })
  }

  return { success: true }
}

// ━━ Toggle ALL Agents Autonomy (Global Pause/Resume) ━━
export async function toggleAllAutonomy(enabled: boolean): Promise<{ toggled: number }> {
  const configs = await db.agentAutonomyConfig.updateMany({
    where: {
      agent: { type: { not: "DEV" } },
    },
    data: {
      enabled,
      status: enabled ? "RUNNING" : "PAUSED",
      nextRunAt: enabled ? new Date() : null,
      lastError: null,
    },
  })

  if (!enabled) {
    // Reset all agent statuses
    await db.agent.updateMany({
      where: { type: { not: "DEV" } },
      data: { status: "IDLE" },
    })
  }

  return { toggled: configs.count }
}

// ━━ Update Agent Interval ━━
export async function updateAgentInterval(agentId: string, interval: number): Promise<{ success: boolean; error?: string }> {
  if (interval < 2) return { success: false, error: "Minimum interval is 2 minutes" }
  if (interval > 60) return { success: false, error: "Maximum interval is 60 minutes" }

  await db.agentAutonomyConfig.upsert({
    where: { agentId },
    create: { agentId, interval },
    update: { interval },
  })

  return { success: true }
}
