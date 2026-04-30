// Cron: Execute Scheduled Tasks Automatically (1AM-5AM)
// Finds PENDING tasks with past due dates and executes them via the agent's agentic loop
// Secured with CRON_SECRET env var
// Also supports executing a SINGLE task by ID (for "Execute Now" feature)

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { runAgentLoop } from "@/lib/ai/agent-loop"
import { getToolsForAgentType } from "@/lib/ai/agent-tools"

// ── Helper: Execute a single scheduled task ──
async function executeSingleTask(taskId: string): Promise<{ success: boolean; result?: string; error?: string }> {
  const task = await db.scheduledTask.findUnique({
    where: { id: taskId },
    include: { agent: { include: { roleConfig: true } } },
  })

  if (!task) return { success: false, error: "Task not found" }
  if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
    return { success: false, error: `Task is already ${task.status}` }
  }

  try {
    // Update task to IN_PROGRESS
    await db.scheduledTask.update({
      where: { id: task.id },
      data: { status: "IN_PROGRESS", progress: 10 },
    })

    // Get Z.ai API key for the agent
    const zaiKeys = await db.apiKey.findMany({
      where: {
        provider: "ZAI",
        status: { in: ["ACTIVE", "ERROR"] },
      },
      orderBy: { priority: "asc" },
    })

    // Filter keys assigned to this agent type
    const eligibleKeys = zaiKeys.filter((k) => {
      try {
        const assigned = JSON.parse(k.assignedAgents || "[]")
        return assigned.length === 0 || assigned.includes(task.agent.type)
      } catch { return true }
    })

    if (eligibleKeys.length === 0) {
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          result: "No Z.ai API key available for execution. Task could not be auto-executed.",
          completedAt: new Date(),
        },
      })
      return { success: false, error: "No API key" }
    }

    // Build the prompt for the agent
    const taskPrompt = `Execute the following scheduled task:\n\nTitle: ${task.title}\n${task.description ? `Description: ${task.description}\n` : ""}\nPlease complete this task and provide the results.`

    // Build system prompt
    const systemPrompt = task.agent.roleConfig?.rolePrompt || task.agent.systemPrompt || undefined

    // Get agent-specific tools
    const tools = getToolsForAgentType(task.agent.type)

    // Execute via agent loop
    const key = eligibleKeys[0]
    const agentResult = await runAgentLoop(taskPrompt, [], key.keyValue, task.agent.model, {
      maxSteps: 15,
      maxTokens: 4096,
      agentType: task.agent.type,
      systemPrompt,
      tools,
    })

    // Update task as completed with results
    await db.scheduledTask.update({
      where: { id: task.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        result: agentResult.finalResponse,
        completedAt: new Date(),
      },
    })

    // Notify the user who scheduled this task
    try {
      await db.notification.create({
        data: {
          userId: task.userId,
          title: "Scheduled Task Completed",
          message: `"${task.title}" has been completed by ${task.agent.name}. Check the results!`,
          type: "SUCCESS",
          link: `/dashboard/agents/${task.agentId}`,
          metadata: JSON.stringify({ taskId: task.id, agentId: task.agentId }),
        }
      })
    } catch (notifErr) {
      console.error(`[cron] Failed to send completion notification for task ${task.id}:`, notifErr)
    }

    // Log API usage
    await db.apiUsageLog.create({
      data: {
        apiKeyId: key.id,
        agentId: task.agent.id,
        model: agentResult.model,
        inputTokens: agentResult.totalInputTokens,
        outputTokens: agentResult.totalOutputTokens,
        cost: agentResult.cost,
      },
    })

    // Update key spend
    await db.apiKey.update({
      where: { id: key.id },
      data: { currentSpend: { increment: agentResult.cost } },
    })

    return { success: true, result: agentResult.finalResponse }
  } catch (error: any) {
    console.error(`[cron] Task ${task.id} failed:`, error.message)

    // Reset to PENDING so it can be retried next cron run
    await db.scheduledTask.update({
      where: { id: task.id },
      data: {
        status: "PENDING",
        progress: 0,
        result: `Auto-execution failed: ${error.message}. Will retry next run.`,
      },
    })

    return { success: false, error: error.message }
  }
}

// ── POST handler: supports both bulk cron and single-task "Execute Now" ──
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))

    // Execute a specific task by ID (for "Execute Now" feature)
    if (body?.taskId) {
      const result = await executeSingleTask(body.taskId)
      return NextResponse.json(result)
    }

    // Bulk cron execution - find all PENDING tasks with past due dates
    const pendingTasks = await db.scheduledTask.findMany({
      where: {
        status: "PENDING",
        dueDate: { lte: new Date() },
      },
      take: 10, // Process max 10 tasks per cron run to spread the load
    })

    if (pendingTasks.length === 0) {
      return NextResponse.json({ message: "No pending tasks to execute", executed: 0 })
    }

    const results: Array<{ taskId: string; title: string; success: boolean; error?: string }> = []

    for (const task of pendingTasks) {
      const result = await executeSingleTask(task.id)
      results.push({ taskId: task.id, title: task.title, success: result.success, error: result.error })
    }

    return NextResponse.json({
      message: `Executed ${results.length} tasks`,
      executed: results.length,
      results,
    })
  } catch (error: any) {
    console.error("[cron/execute-tasks] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET endpoint for manual triggering from the UI
export async function GET(req: NextRequest) {
  try {
    // For manual trigger, still check auth but allow without CRON_SECRET
    // The user must be authenticated via session
    const { getServerSession } = await import("next-auth")
    const { authOptions } = await import("@/lib/auth")
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userRole = (session.user as any).role
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can manually trigger task execution" }, { status: 403 })
    }

    // Support taskId query param for single-task execution
    const { searchParams } = new URL(req.url)
    const taskId = searchParams.get("taskId")

    // Re-use the POST logic by creating a fake request
    const fakeRequest = new NextRequest(req.url, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET || "manual"}` },
      body: JSON.stringify(taskId ? { taskId } : {}),
    })

    return POST(fakeRequest)
  } catch (error: any) {
    console.error("[cron/execute-tasks] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
