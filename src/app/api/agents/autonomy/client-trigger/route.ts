// ━━ Client-Triggered Autonomous Thinking Cycle (SSE Streaming) ━━
// This replaces the Vercel Cron approach for free-plan compatibility.
// The agents page calls this when poll says an agent is due.
// Uses SSE streaming to bypass Vercel's 10s serverless function timeout.
//
// Flow: Client polls /poll → gets due agents → calls /client-trigger → SSE stream → updates UI

import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { ensureAutonomyTables } from "@/lib/ensure-autonomy-tables"
import { isAdmin } from "@/lib/rbac"
import { initAutonomyConfigs } from "@/lib/ai/autonomy-engine"

// Import the building blocks we need
import { gatherAutonomyContext, buildThinkingPrompt, getAutonomousSystemPrompt, getAutonomousBaseRules, getAutonomousRoleFocus, AUTO_EXECUTE_TOOLS, DRAFT_APPROVAL_TOOLS } from "@/lib/ai/autonomy-engine"
import type { AutonomyContext } from "@/lib/ai/autonomy-engine"
import { runAgentLoop } from "@/lib/ai/agent-loop"
import type { AgentStep } from "@/lib/ai/agent-loop"
import { getToolsForAgentType } from "@/lib/ai/agent-tools"

// Get API key for agent (same logic as autonomy-engine)
async function getApiKeyForAgent(agentId: string, model: string): Promise<{ apiKey: string; apiKeyId: string; provider: string }> {
  const isNvidia = model.startsWith("z-ai/") || model.startsWith("nvidia/")
  const providerFilter = isNvidia ? "NVIDIA" : "ZAI"

  const envKey = isNvidia ? process.env.NVIDIA_API_KEY : process.env.ZAI_API_KEY
  if (envKey && envKey.trim() !== "") {
    return { apiKey: envKey.trim(), apiKeyId: "env-key", provider: providerFilter }
  }

  const availableKey = await db.apiKey.findFirst({
    where: { provider: providerFilter, status: "ACTIVE", NOT: { keyValue: "" } },
    orderBy: { priority: "asc" },
  })

  if (!availableKey) {
    const fallbackKey = await db.apiKey.findFirst({
      where: { status: "ACTIVE", NOT: { keyValue: "" } },
      orderBy: { priority: "asc" },
    })
    if (!fallbackKey) throw new Error("No API keys available. Add a Z.ai or NVIDIA API key.")
    return { apiKey: fallbackKey.keyValue, apiKeyId: fallbackKey.id, provider: fallbackKey.provider || "ZAI" }
  }

  return { apiKey: availableKey.keyValue, apiKeyId: availableKey.id, provider: availableKey.provider || "ZAI" }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    if (!isAdmin(session.user.role)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })

    const { agentId } = await req.json()
    if (!agentId) return new Response(JSON.stringify({ error: "agentId required" }), { status: 400 })

    // CRITICAL: Ensure tables exist + configs before any DB operations
    await ensureAutonomyTables()
    await initAutonomyConfigs()

    // Get agent
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { roleConfig: true },
    })
    if (!agent) return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404 })
    if (agent.type === "DEV") return new Response(JSON.stringify({ error: "DEV agent cannot be autonomous" }), { status: 400 })

    // Check autonomy config
    const config = await db.agentAutonomyConfig.findUnique({ where: { agentId } })
    if (!config?.enabled || config.status !== "RUNNING") {
      return new Response(JSON.stringify({ error: "Agent autonomy is not enabled" }), { status: 400 })
    }

    // Mark agent as running to prevent concurrent cycles
    await db.agent.update({ where: { id: agentId }, data: { status: "RUNNING" } })

    // Create SSE stream
    const encoder = new TextEncoder()
    const startTime = Date.now()

    const readableStream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: object) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
        }

        try {
          sendEvent({ type: "started", agentId, agentName: agent.name, agentType: agent.type })
          sendEvent({ type: "step", step: { type: "thinking", content: "Gathering context...", stepNumber: 0 } })

          // 1. Gather context
          const context = await gatherAutonomyContext(agentId, agent.type, agent.name)
          sendEvent({
            type: "context",
            pendingMessages: context.pendingMessages.length,
            scheduledTasks: context.scheduledTasks.length,
            recentActivity: context.recentActivity.length,
          })

          // 2. Build thinking prompt
          const thinkingPrompt = buildThinkingPrompt(context)
          sendEvent({ type: "step", step: { type: "thinking", content: "Building thinking prompt...", stepNumber: 1 } })

          // 3. Get API key
          const { apiKey, apiKeyId, provider } = await getApiKeyForAgent(agentId, context.model)
          sendEvent({ type: "step", step: { type: "thinking", content: `Using ${provider} API...`, stepNumber: 2 } })

          // 4. Build system prompt (use active autonomous prompt if available)
          let activePrompt: { id: string; content: string } | null = null
          try {
            activePrompt = await db.agentAutonomousPrompt.findFirst({
              where: { agentId, isActive: true },
            })
          } catch {
            // AgentAutonomousPrompt table may not exist yet — skip custom prompt
          }
          let autonomousPrompt = getAutonomousSystemPrompt(agent.type, context.rolePrompt)
          if (activePrompt) {
            autonomousPrompt = `${context.rolePrompt}\n\n---\n\n## YOUR AUTONOMOUS MISSION (set by admin)\n\n${activePrompt.content}\n\n---\n\n${getAutonomousBaseRules()}${getAutonomousRoleFocus(agent.type)}`
          }
          const tools = getToolsForAgentType(agent.type)
          const useNvidia = provider === "NVIDIA" || context.model.startsWith("z-ai/")

          // 5. Run agent loop with SSE step callbacks
          sendEvent({ type: "step", step: { type: "thinking", content: "Starting autonomous thinking cycle...", stepNumber: 3 } })

          const result = await runAgentLoop(thinkingPrompt, [], apiKey, context.model, {
            maxSteps: 8,
            agentType: agent.type,
            systemPrompt: autonomousPrompt,
            tools,
            provider: useNvidia ? "NVIDIA" : "ZAI",
            onStep: (step: AgentStep) => {
              if (step.type === "tool_call") {
                sendEvent({
                  type: "step",
                  step: {
                    type: "tool_call",
                    content: `${step.toolName}(${Object.entries(step.toolArgs || {}).map(([k, v]) => `${k}: ${String(v).substring(0, 60)}`).join(", ")})`,
                    toolName: step.toolName,
                    stepNumber: step.stepNumber,
                  },
                })
              } else if (step.type === "tool_result") {
                sendEvent({
                  type: "step",
                  step: {
                    type: "tool_result",
                    content: (step.toolResult || step.content || "").substring(0, 300),
                    toolName: step.toolName,
                    stepNumber: step.stepNumber,
                  },
                })
              } else if (step.type === "thinking") {
                sendEvent({
                  type: "step",
                  step: {
                    type: "thinking",
                    content: step.content.substring(0, 200),
                    stepNumber: step.stepNumber,
                  },
                })
              }
            },
          })

          const duration = Date.now() - startTime

          // 6. Mark pending cross-agent messages as processed
          if (context.pendingMessages.length > 0) {
            const msgIds = context.pendingMessages.map(m => m.id)
            await db.crossAgentMessage.updateMany({
              where: { id: { in: msgIds } },
              data: { status: "PROCESSED" },
            })
          }

          // 7. Handle approval gates
          const autoTools = AUTO_EXECUTE_TOOLS[agent.type] || []
          const draftTools = DRAFT_APPROVAL_TOOLS[agent.type] || []
          const draftToolsUsed = result.usedTools.filter(t => draftTools.includes(t))

          let approvalCreated = false
          if (draftToolsUsed.length > 0) {
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
            approvalCreated = true
          }

          // 8. Log activity
          await db.agentActivityLog.create({
            data: {
              agentId: agent.id,
              configId: config.id,
              action: "thinking_cycle",
              title: `Autonomous cycle #${config.totalRuns + 1}`,
              description: result.finalResponse.substring(0, 500),
              result: JSON.stringify({
                steps: result.steps.length,
                toolsUsed: result.steps.filter(s => s.type === "tool_call").map(s => s.toolName),
                responseLength: result.finalResponse.length,
              }),
              status: "SUCCESS",
              tokensUsed: result.totalInputTokens + result.totalOutputTokens,
              cost: result.cost,
              duration,
            },
          })

          // 9. Update config - schedule next run
          const nextRun = new Date()
          nextRun.setMinutes(nextRun.getMinutes() + config.interval)
          await db.agentAutonomyConfig.update({
            where: { id: config.id },
            data: {
              lastRunAt: new Date(),
              nextRunAt: nextRun,
              totalRuns: config.totalRuns + 1,
              lastError: null,
              status: "RUNNING",
            },
          })

          // Send complete event
          sendEvent({
            type: "complete",
            success: true,
            agentId,
            agentName: agent.name,
            agentType: agent.type,
            response: result.finalResponse.substring(0, 1000),
            totalSteps: result.totalSteps,
            usedTools: result.usedTools,
            tokensUsed: result.totalInputTokens + result.totalOutputTokens,
            cost: result.cost,
            duration,
            approvalCreated,
            nextRunAt: nextRun.toISOString(),
          })

        } catch (err: any) {
          const duration = Date.now() - startTime
          console.error(`[autonomy/client-trigger] Error for ${agent.name}:`, err.message)

          // Log error
          try {
            await db.agentActivityLog.create({
              data: {
                agentId: agent.id,
                configId: config.id,
                action: "error",
                title: "Autonomous cycle failed",
                description: err.message,
                status: "FAILED",
                duration,
              },
            })

            await db.agentAutonomyConfig.update({
              where: { id: config.id },
              data: {
                totalErrors: config.totalErrors + 1,
                lastError: err.message.substring(0, 200),
                status: "ERROR",
              },
            })
          } catch {}

          sendEvent({
            type: "complete",
            success: false,
            agentId,
            agentName: agent.name,
            agentType: agent.type,
            error: err.message,
            duration,
          })
        } finally {
          // Always reset agent status back to IDLE
          try {
            await db.agent.update({ where: { id: agentId }, data: { status: "IDLE" } })
          } catch {}
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
