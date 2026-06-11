// ━━ Lark Sync — Bidirectional Task Sync Engine ━━

import { db, getAppSetting, setAppSetting } from "@/lib/db"
import { createTask, updateTask, deleteTask as larkDeleteTask, getOrCreateProjectTaskList, getAllUsers, lookupUserByEmail } from "./client"
import { getLarkConfig } from "./auth"
import type { SyncDirection, SyncAction, SyncStatus } from "./types"
import { STATUS_TO_LARK, STATUS_FROM_LARK, PRIORITY_TO_LARK, PRIORITY_FROM_LARK } from "./types"

/**
 * Log a sync operation to the LarkSyncLog table.
 */
async function logSync(params: {
  direction: SyncDirection
  action: SyncAction
  status: SyncStatus
  taskId?: string
  larkTaskId?: string
  larkTaskListId?: string
  projectId?: string
  userId?: string
  error?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "LarkSyncLog" ("id", "direction", "action", "status", "taskId", "larkTaskId", "larkTaskListId", "projectId", "userId", "error", "metadata", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      params.direction,
      params.action,
      params.status,
      params.taskId || null,
      params.larkTaskId || null,
      params.larkTaskListId || null,
      params.projectId || null,
      params.userId || null,
      params.error || null,
      params.metadata ? JSON.stringify(params.metadata) : null
    )
  } catch (err) {
    console.error("[lark/sync] Failed to log sync:", err)
  }
}

/**
 * Get the Lark open_id for a TrishulHub user.
 * Checks LarkUserMapping table first, then tries email lookup.
 */
export async function getUserLarkOpenId(userId: string): Promise<string | null> {
  try {
    // Check mapping table
    const rows = await db.$queryRawUnsafe<Array<{ larkOpenId: string }>>(
      'SELECT "larkOpenId" FROM "LarkUserMapping" WHERE "userId" = ?',
      userId
    )
    if (rows.length > 0 && rows[0].larkOpenId) {
      return rows[0].larkOpenId
    }

    // Try email lookup
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (user?.email) {
      const larkUser = await lookupUserByEmail(user.email)
      if (larkUser?.open_id) {
        // Auto-save the mapping
        await db.$executeRawUnsafe(
          'INSERT OR IGNORE INTO "LarkUserMapping" ("id", "userId", "larkOpenId", "larkName", "larkEmail", "matchedBy", "createdAt") VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          `map_${userId}_${Date.now()}`,
          userId,
          larkUser.open_id,
          larkUser.name || "",
          larkUser.email || "",
          "email_auto"
        )
        return larkUser.open_id
      }
    }

    return null
  } catch (err) {
    console.error("[lark/sync] Failed to get user Lark ID:", err)
    return null
  }
}

/**
 * Get the TrishulHub userId for a Lark open_id.
 */
export async function getUserIdByLarkOpenId(larkOpenId: string): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ userId: string }>>(
      'SELECT "userId" FROM "LarkUserMapping" WHERE "larkOpenId" = ?',
      larkOpenId
    )
    return rows.length > 0 ? rows[0].userId : null
  } catch {
    return null
  }
}

/**
 * Get Lark task ID mapping for a TrishulHub task.
 */
async function getLarkTaskMapping(taskId: string): Promise<{ larkTaskId: string; larkTaskListId: string } | null> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ larkTaskId: string; larkTaskListId: string }>>(
      'SELECT "larkTaskId", "larkTaskListId" FROM "LarkTaskMapping" WHERE "taskId" = ?',
      taskId
    )
    return rows.length > 0 ? rows[0] : null
  } catch {
    return null
  }
}

/**
 * Get TrishulHub task ID for a Lark task.
 */
export async function getTaskIdByLarkId(larkTaskId: string): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ taskId: string }>>(
      'SELECT "taskId" FROM "LarkTaskMapping" WHERE "larkTaskId" = ?',
      larkTaskId
    )
    return rows.length > 0 ? rows[0].taskId : null
  } catch {
    return null
  }
}

/**
 * Save a task mapping.
 */
async function saveLarkTaskMapping(taskId: string, larkTaskId: string, larkTaskListId: string): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "LarkTaskMapping" ("id", "taskId", "larkTaskId", "larkTaskListId", "createdAt") VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      `tmapping_${taskId}`,
      taskId,
      larkTaskId,
      larkTaskListId
    )
  } catch (err) {
    console.error("[lark/sync] Failed to save task mapping:", err)
  }
}

/**
 * Remove a task mapping.
 */
async function removeLarkTaskMapping(taskId: string): Promise<void> {
  try {
    await db.$executeRawUnsafe('DELETE FROM "LarkTaskMapping" WHERE "taskId" = ?', taskId)
  } catch (err) {
    console.error("[lark/sync] Failed to remove task mapping:", err)
  }
}

// ━━ TRISHULHUB → LARK SYNC ━━

/**
 * Sync a task creation from TrishulHub to Lark.
 * Call this AFTER the task is saved in the DB.
 */
export async function syncTaskToLark(
  taskId: string,
  data: {
    title: string
    description?: string
    status: string
    priority: string
    assignedTo?: string
    projectId?: string
    deadline?: string | Date
  },
  userId: string
): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) return

  try {
    // Get or create the task list for the project
    let tasklistId: string | undefined

    if (data.projectId) {
      const project = await db.project.findUnique({ where: { id: data.projectId }, select: { name: true } })
      if (project) {
        const result = await getOrCreateProjectTaskList(data.projectId, project.name)
        if (result) tasklistId = result.tasklistId
      }
    }

    if (!tasklistId) {
      // No project — use a default "TrishulHub Tasks" list
      const defaultResult = await getOrCreateProjectTaskList("__default__", "TrishulHub Tasks")
      if (!defaultResult) {
        await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: "Failed to get/create task list" })
        return
      }
      tasklistId = defaultResult.tasklistId
    }

    // Resolve assignee's Lark open_id
    let assigneeOpenId: string | undefined
    if (data.assignedTo) {
      assigneeOpenId = await getUserLarkOpenId(data.assignedTo) || undefined
    }

    // Convert deadline to unix ms
    let dueTimestamp: number | undefined
    if (data.deadline) {
      dueTimestamp = new Date(data.deadline).getTime()
    }

    // Build extra fields to preserve TrishulHub-specific status info
    const extra: Record<string, unknown> = {
      trishulhub_status: data.status,
      trishulhub_task_id: taskId,
    }

    const larkTask = await createTask(tasklistId, {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assigneeOpenId,
      dueTimestamp,
      extra,
    })

    if (larkTask) {
      await saveLarkTaskMapping(taskId, larkTask.task_id, tasklistId)
      await logSync({ direction: "TO_LARK", action: "CREATE", status: "SUCCESS", taskId, larkTaskId: larkTask.task_id, larkTaskListId: tasklistId, projectId: data.projectId, userId })
    } else {
      await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: "Lark API returned null task" })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: msg })
  }
}

/**
 * Sync a task update from TrishulHub to Lark.
 */
export async function syncTaskUpdateToLark(
  taskId: string,
  data: {
    title?: string
    description?: string
    status?: string
    priority?: string
    assignedTo?: string
    deadline?: string | Date | null
  },
  userId: string
): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) return

  try {
    const mapping = await getLarkTaskMapping(taskId)
    if (!mapping) {
      // No mapping exists — try full sync (task may have been created before Lark was enabled)
      const task = await db.task.findUnique({ where: { id: taskId } })
      if (task) {
        await syncTaskToLark(taskId, {
          title: task.title,
          description: task.description || undefined,
          status: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo || undefined,
          projectId: task.projectId || undefined,
          deadline: task.deadline || undefined,
        }, userId)
      }
      return
    }

    // Resolve assignee's Lark open_id
    let assigneeOpenId: string | undefined
    if (data.assignedTo) {
      assigneeOpenId = await getUserLarkOpenId(data.assignedTo) || undefined
    }

    // Convert deadline to unix ms
    let dueTimestamp: number | undefined
    if (data.deadline) {
      dueTimestamp = new Date(data.deadline).getTime()
    }

    // Build extra fields
    const extra: Record<string, unknown> = {
      trishulhub_status: data.status,
      trishulhub_task_id: taskId,
    }

    const success = await updateTask(mapping.larkTaskListId, mapping.larkTaskId, {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assigneeOpenId,
      dueTimestamp,
      extra,
    })

    if (success) {
      await logSync({ direction: "TO_LARK", action: "UPDATE", status: "SUCCESS", taskId, larkTaskId: mapping.larkTaskId, larkTaskListId: mapping.larkTaskListId, userId })
    } else {
      await logSync({ direction: "TO_LARK", action: "UPDATE", status: "FAILED", taskId, larkTaskId: mapping.larkTaskId, larkTaskListId: mapping.larkTaskListId, userId, error: "Lark API returned null" })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync({ direction: "TO_LARK", action: "UPDATE", status: "FAILED", taskId, userId, error: msg })
  }
}

/**
 * Sync a task deletion from TrishulHub to Lark.
 */
export async function syncTaskDeleteToLark(taskId: string, userId: string): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) return

  try {
    const mapping = await getLarkTaskMapping(taskId)
    if (!mapping) {
      await logSync({ direction: "TO_LARK", action: "DELETE", status: "SKIPPED", taskId, userId, error: "No Lark mapping found" })
      return
    }

    const success = await larkDeleteTask(mapping.larkTaskListId, mapping.larkTaskId)
    await removeLarkTaskMapping(taskId)

    if (success) {
      await logSync({ direction: "TO_LARK", action: "DELETE", status: "SUCCESS", taskId, larkTaskId: mapping.larkTaskId, larkTaskListId: mapping.larkTaskListId, userId })
    } else {
      await logSync({ direction: "TO_LARK", action: "DELETE", status: "FAILED", taskId, larkTaskId: mapping.larkTaskId, larkTaskListId: mapping.larkTaskListId, userId, error: "Lark delete API failed" })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logSync({ direction: "TO_LARK", action: "DELETE", status: "FAILED", taskId, userId, error: msg })
  }
}

// ━━ LARK → TRISHULHUB SYNC (Webhook-driven) ━━

/**
 * Handle incoming Lark webhook events.
 */
export async function handleLarkWebhookEvent(
  eventType: string,
  eventData: {
    task_id: string
    tasklist_id: string
    operator?: { open_id: string }
    [key: string]: unknown
  }
): Promise<{ success: boolean; message: string }> {
  const config = await getLarkConfig()
  if (!config?.enabled) {
    return { success: false, message: "Lark sync is disabled" }
  }

  const { task_id, tasklist_id } = eventData

  try {
    // Find existing mapping
    const thTaskId = await getTaskIdByLarkId(task_id)

    if (eventType === "task.task.deleted") {
      if (!thTaskId) {
        return { success: true, message: "Task not mapped, ignoring delete" }
      }
      // Delete the TrishulHub task
      await db.task.delete({ where: { id: thTaskId } })
      await removeLarkTaskMapping(thTaskId)
      return { success: true, message: "Task deleted from TrishulHub" }
    }

    // For create/update/complete, we need the full task data from Lark
    const { getTask } = await import("./client")
    const larkTask = await getTask(tasklist_id, task_id)
    if (!larkTask) {
      return { success: false, message: "Failed to fetch task from Lark" }
    }

    // Map Lark task data to TrishulHub format
    const title = larkTask.title
    const description = larkTask.description
    const status = STATUS_FROM_LARK[larkTask.status] || "TODO"
    const priority = PRIORITY_FROM_LARK[larkTask.priority] || "MEDIUM"

    // Resolve assignee
    let assignedTo: string | undefined
    if (larkTask.assignee?.open_id) {
      assignedTo = await getUserIdByLarkOpenId(larkTask.assignee.open_id) || undefined
    }

    // Resolve due date
    const deadline = larkTask.due?.timestamp ? new Date(parseInt(larkTask.due.timestamp)) : null

    if (thTaskId) {
      // UPDATE existing task
      const updateData: Record<string, unknown> = {}
      if (title) updateData.title = title
      if (description !== undefined) updateData.description = description
      updateData.status = status
      updateData.priority = priority
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo
      if (deadline !== null) updateData.deadline = deadline

      // Set completedAt if status changed to DONE
      if (status === "DONE") {
        updateData.completedAt = new Date()
      }

      await db.task.update({ where: { id: thTaskId }, data: updateData })

      return { success: true, message: `Task ${thTaskId} updated from Lark` }
    } else {
      // CREATE new task (originated in Lark)
      const newTask = await db.task.create({
        data: {
          title,
          description: description || null,
          status,
          priority,
          assignedTo: assignedTo || null,
          deadline,
          assigneeType: assignedTo ? "HUMAN" : "HUMAN",
          category: "GENERAL",
          // Try to find the project by tasklist name
          projectId: await findProjectByTaskList(tasklist_id),
        },
      })

      // Save mapping
      await saveLarkTaskMapping(newTask.id, task_id, tasklist_id)

      return { success: true, message: `New task ${newTask.id} created from Lark` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[lark/sync] Webhook handling error:", msg)
    return { success: false, message: msg }
  }
}

/**
 * Find a project ID by looking up the tasklist mapping.
 */
async function findProjectByTaskList(tasklistId: string): Promise<string | null> {
  // Check all lark_tasklist_* settings for a match
  try {
    const rows = await db.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      'SELECT "key", "value" FROM "AppSetting" WHERE "key" LIKE ?',
      'lark_tasklist_%'
    )

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value)
        if (parsed.tasklistId === tasklistId) {
          // Extract project ID from key (format: lark_tasklist_{projectId})
          const projectId = row.key.replace("lark_tasklist_", "")
          if (projectId && projectId !== "__default__") {
            // Verify project exists
            const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
            return project?.id || null
          }
        }
      } catch {
        continue
      }
    }
  } catch {
    // Ignore
  }

  return null
}