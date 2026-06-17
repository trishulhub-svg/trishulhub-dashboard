// ━━ Lark Sync — Bidirectional Task Sync Engine ━━

import { db, getAppSetting, setAppSetting, delAppSetting } from "@/lib/db"
import {
  createTask,
  updateTask,
  deleteTask as larkDeleteTask,
  getOrCreateProjectTaskList,
  getOrCreateUserProjectTaskList,
  getAllUsers,
  lookupUserByEmail,
  addTaskMember,
  removeTaskMember,
  addTaskListMember,
  removeTaskListMember,
  getTask,
} from "./client"
import { getLarkConfig } from "./auth"
import type { SyncDirection, SyncAction, SyncStatus } from "./types"
import { STATUS_TO_LARK, STATUS_FROM_LARK, PRIORITY_TO_LARK, PRIORITY_FROM_LARK } from "./types"

// ━━ CIRCULAR SYNC GUARD ━━

/** In-memory map: "taskId:direction" → timestamp. Prevents TH→Lark→TH→Lark loops.
 *  Cooldown: 10 seconds.
 */
const _syncGuard = new Map<string, number>()
const SYNC_GUARD_COOLDOWN_MS = 10_000

function markSyncGuard(taskId: string, direction: string): void {
  _syncGuard.set(`${taskId}:${direction}`, Date.now())
}

function isSyncGuarded(taskId: string, direction: string): boolean {
  const ts = _syncGuard.get(`${taskId}:${direction}`)
  if (!ts) return false
  if (Date.now() - ts > SYNC_GUARD_COOLDOWN_MS) {
    _syncGuard.delete(`${taskId}:${direction}`)
    return false
  }
  return true
}

// ━━ WEBHOOK EVENT DEDUPLICATION ━━

/** In-memory set of processed event_ids. Prevents duplicate processing from Lark retries.
 *  Window: 30 seconds.
 */
const _processedEvents = new Map<string, number>()
const DEDUP_WINDOW_MS = 30_000

function isEventDuplicate(eventId: string): boolean {
  const ts = _processedEvents.get(eventId)
  if (!ts) return false
  if (Date.now() - ts > DEDUP_WINDOW_MS) {
    _processedEvents.delete(eventId)
    return false
  }
  return true
}

function markEventProcessed(eventId: string): void {
  _processedEvents.set(eventId, Date.now())
}

// Periodic cleanup of stale entries (every 60s)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, ts] of _syncGuard) {
      if (now - ts > SYNC_GUARD_COOLDOWN_MS) _syncGuard.delete(key)
    }
    for (const [key, ts] of _processedEvents) {
      if (now - ts > DEDUP_WINDOW_MS) _processedEvents.delete(key)
    }
  }, 60_000)
}

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
  userId: string,
  userName?: string
): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) {
    console.warn(`[lark/sync] syncTaskToLark SKIPPED for ${taskId} — Lark sync is disabled`)
    await logSync({ direction: "TO_LARK", action: "CREATE", status: "SKIPPED", taskId, userId, error: "Lark sync is disabled in Access Hub settings" })
    return
  }

  try {
    // Get or create the per-user task list for the project
    let tasklistId: string | undefined

    if (data.projectId) {
      const project = await db.project.findUnique({ where: { id: data.projectId }, select: { name: true } })
      if (project) {
        // Use per-user task list: "ProjectName — UserName"
        const creatorName = userName || (await db.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || userId
        let result = await getOrCreateUserProjectTaskList(data.projectId, project.name, userId, creatorName)
        if (!result) {
          // Retry once — transient API errors can cause first attempt to fail
          console.warn(`[lark/sync] Retrying per-user task list creation for project ${data.projectId} (${project.name}) user ${creatorName}`)
          result = await getOrCreateUserProjectTaskList(data.projectId, project.name, userId, creatorName)
        }
        if (result) {
          tasklistId = result.tasklistId
          if (result.created) {
            console.log(`[lark/sync] Created new per-user Lark task list: ${project.name} — ${creatorName}`)
          }
        } else {
          console.error(`[lark/sync] FAILED to get/create per-user task list for project ${data.projectId} user ${userId} — aborting sync`)
          await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: `Failed to create per-user task list for "${project.name}"` })
          return
        }
      } else {
        console.error(`[lark/sync] Project ${data.projectId} not found in DB — aborting sync`)
        await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: `Project ${data.projectId} not found in database` })
        return
      }
    }

    if (!tasklistId) {
      // No project — use a default "TrishulHub Tasks" list
      const creatorName = userName || (await db.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || userId
      const defaultResult = await getOrCreateUserProjectTaskList("__default__", "TrishulHub Tasks", userId, creatorName)
      if (!defaultResult) {
        await logSync({ direction: "TO_LARK", action: "CREATE", status: "FAILED", taskId, userId, error: "Failed to get/create default task list" })
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

    // Create task — bare creation only (no members, no status, no priority on create API)
    const larkTask = await createTask(tasklistId, {
      title: data.title,
      description: data.description,
      dueTimestamp,
    })

    if (larkTask) {
      await saveLarkTaskMapping(taskId, larkTask.task_id, tasklistId)

      // Set description, due, status & priority via separate update
      // (create API only accepts tasklist_id + summary)
      await updateTask(larkTask.task_id, {
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueTimestamp,
      })

      // Assign member via add_members endpoint (create API doesn't support members)
      if (assigneeOpenId) {
        await addTaskMember(larkTask.task_id, [
          { id: assigneeOpenId, role: "assignee" },
        ])
      }

      // Add assignee as tasklist member (editor role) so the tasklist
      // appears in the user's Lark Task Center
      if (assigneeOpenId) {
        await addTaskListMember(tasklistId, [
          { id: assigneeOpenId, role: "editor" },
        ])
      }

      // Mark circular guard to prevent webhook from echoing back
      markSyncGuard(taskId, "TO_LARK")

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

  // Circular sync guard: skip if we just synced FROM Lark for this task
  if (isSyncGuarded(taskId, "FROM_LARK")) {
    console.log(`[lark/sync] Skipping TO_LARK update for ${taskId} — circular guard active`)
    return
  }

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

    // Update task — NO extra, NO assignee in body (use member APIs instead)
    const larkTask = await updateTask(mapping.larkTaskId, {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      dueTimestamp,
    })

    // Handle assignee change via member API
    if (data.assignedTo !== undefined && assigneeOpenId) {
      await addTaskMember(mapping.larkTaskId, [
        { id: assigneeOpenId, role: "assignee" },
      ])
    }

    if (larkTask) {
      // Mark circular guard
      markSyncGuard(taskId, "TO_LARK")

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
 * @param eventId — Lark event_id for deduplication
 * @param eventType — Lark event type
 * @param eventData — Parsed event payload
 */
export async function handleLarkWebhookEvent(
  eventId: string,
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

  // ── Dedup check ──
  if (isEventDuplicate(eventId)) {
    console.log(`[lark/sync] Dedup: skipping duplicate event ${eventId}`)
    return { success: true, message: "Duplicate event, skipped" }
  }
  markEventProcessed(eventId)

  const { task_id, tasklist_id } = eventData
  console.log(`[lark/sync] Processing event: ${eventType} (id: ${eventId}) for task: ${task_id}`)
  console.log(`[lark/sync] Event details: tasklist_id=${tasklist_id}, operator=${eventData.operator?.open_id || 'none'}`)

  try {
    // Find existing mapping
    const thTaskId = await getTaskIdByLarkId(task_id)
    console.log(`[lark/sync] Mapping lookup: larkTaskId=${task_id} → thTaskId=${thTaskId || 'NOT FOUND'}`)

    if (eventType === "task.task.deleted") {
      if (!thTaskId) {
        return { success: true, message: "Task not mapped, ignoring delete" }
      }
      // Delete the TrishulHub task
      await db.task.delete({ where: { id: thTaskId } })
      await removeLarkTaskMapping(thTaskId)

      try {
        const { logAudit } = await import("@/lib/audit-log")
        await logAudit({
          userId: eventData.operator?.open_id || "lark-webhook",
          userName: "Lark Webhook",
          userRole: "SYSTEM",
          department: "TEAM_WORK",
          page: "tasks",
          action: "DELETE",
          entityType: "Task",
          entityId: thTaskId,
          description: `Task deleted via Lark sync`,
          status: "SUCCESS",
          metadata: JSON.stringify({ source: "lark_webhook", eventType, larkTaskId: task_id }),
        })
      } catch { /* audit log is best-effort */ }

      return { success: true, message: "Task deleted from TrishulHub" }
    }

    // For create/update/complete, we need the full task data from Lark
    // Add 1s delay to give Lark eventual-consistency time to propagate
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const larkTask = await getTask(tasklist_id, task_id)
    if (larkTask) {
      console.log(`[lark/sync] Fetched from Lark: title="${larkTask.title}", status="${larkTask.status}", priority="${larkTask.priority}", assignee="${larkTask.assignee?.open_id || 'none'}"`)
    } else {
      console.warn(`[lark/sync] getTask returned null for task ${task_id} in list ${tasklist_id}`)
    }

    // Fallback: if getTask returns null (e.g. completed tasks return 99404 on free tier),
    // retry once after a short delay, then inspect event body for status clues.
    if (!larkTask) {
      if (thTaskId) {
        // Retry getTask once after 2s — Lark eventual consistency may need more time
        console.warn(`[lark/sync] getTask returned null for mapped task ${thTaskId}, retrying...`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        const retryTask = await getTask(tasklist_id, task_id)

        if (retryTask) {
          // Retry succeeded — process normally via the update path below
          // Rewrite larkTask so the code below handles it
          Object.assign(eventData, { _retryTask: retryTask })
          // Fall through to the main update logic — we'll read from retryTask
          const title = retryTask.title
          const description = retryTask.description
          const status = STATUS_FROM_LARK[retryTask.status] || "TODO"
          const priority = PRIORITY_FROM_LARK[retryTask.priority] || "MEDIUM"

          let assignedTo: string | undefined
          if (retryTask.assignee?.open_id) {
            assignedTo = await getUserIdByLarkOpenId(retryTask.assignee.open_id) || undefined
          }

          const deadline = retryTask.due?.timestamp ? new Date(parseInt(retryTask.due.timestamp)) : null

          const updateData: Record<string, unknown> = {}
          if (title) updateData.title = title
          if (description !== undefined) updateData.description = description
          updateData.status = status
          updateData.priority = priority
          if (assignedTo !== undefined) updateData.assignedTo = assignedTo
          if (deadline !== null) updateData.deadline = deadline
          if (status === "DONE") updateData.completedAt = new Date()

          await db.task.update({ where: { id: thTaskId }, data: updateData })
          markSyncGuard(thTaskId, "FROM_LARK")

          const { logAudit } = await import("@/lib/audit-log")
          await logAudit({
            userId: eventData.operator?.open_id || "lark-webhook",
            userName: "Lark Webhook",
            userRole: "SYSTEM",
            department: "TEAM_WORK",
            page: "tasks",
            action: "STATUS_CHANGE",
            entityType: "Task",
            entityId: thTaskId,
            description: `Task status changed to "${status}" via Lark sync (retried)`,
            newValue: status,
            status: "SUCCESS",
            metadata: JSON.stringify({ source: "lark_webhook", eventType, larkTaskId: task_id, larkStatus: retryTask.status }),
          })

          await logSync({
            direction: "FROM_LARK",
            action: "STATUS_CHANGE",
            status: "SUCCESS",
            taskId: thTaskId,
            larkTaskId: task_id,
            larkTaskListId: tasklist_id,
            metadata: { inferredStatus: status, eventType, retried: true },
          })
          return { success: true, message: `Task ${thTaskId} updated to ${status} (retried getTask)` }
        }

        // Both getTask calls failed — inspect event body for status change clues.
        const eventBody = (eventData as Record<string, unknown>)
        const changedFields = eventBody.changed_fields as string[] | undefined

        // Determine if this is likely a completion:
        // 1. Event type contains done/complete/finish keywords
        // 2. OR changed_fields includes "status" (something changed, likely to done since getTask fails)
        const likelyCompleted =
          eventType.includes("done") || eventType.includes("complete") || eventType.includes("finish") ||
          (Array.isArray(changedFields) && changedFields.includes("status"))

        const newStatus = likelyCompleted ? "DONE" : "IN_PROGRESS";
        const fallbackData: Record<string, unknown> = { status: newStatus };
        if (newStatus === "DONE") fallbackData.completedAt = new Date();

        const existingTask = await db.task.findUnique({ where: { id: thTaskId }, select: { status: true } });
        console.warn(`[lark/sync] getTask returned null twice for mapped task ${thTaskId}. Event: ${eventType}. Assuming status="${newStatus}" (was "${existingTask?.status || 'unknown'}")`);

        await db.task.update({ where: { id: thTaskId }, data: fallbackData })
        markSyncGuard(thTaskId, "FROM_LARK")

        const { logAudit } = await import("@/lib/audit-log")
        await logAudit({
          userId: eventData.operator?.open_id || "lark-webhook",
          userName: "Lark Webhook",
          userRole: "SYSTEM",
          department: "TEAM_WORK",
          page: "tasks",
          action: "STATUS_CHANGE",
          entityType: "Task",
          entityId: thTaskId,
          description: `Task status changed to "${newStatus}" via Lark sync (inferred — getTask failed)`,
          newValue: newStatus,
          status: "SUCCESS",
          metadata: JSON.stringify({ source: "lark_webhook", eventType, larkTaskId: task_id, inferred: true, previousStatus: existingTask?.status }),
        })

        await logSync({
          direction: "FROM_LARK",
          action: "STATUS_CHANGE",
          status: "SUCCESS",
          taskId: thTaskId,
          larkTaskId: task_id,
          larkTaskListId: tasklist_id,
          metadata: { inferredStatus: newStatus, eventType, retried: true },
        })
        return { success: true, message: `Task ${thTaskId} updated to ${newStatus} (getTask null, inferred from event + changed_fields)` }
      }
      return { success: false, message: "Failed to fetch task from Lark and no existing mapping" }
    }

    // Circular sync guard: skip if we just synced TO_LARK for this task
    if (thTaskId && isSyncGuarded(thTaskId, "TO_LARK")) {
      console.log(`[lark/sync] Skipping FROM_LARK for ${thTaskId} — circular guard active`)
      return { success: true, message: "Circular guard: skipped" }
    }

    // Map Lark task data to TrishulHub format
    const title = larkTask.title
    const description = larkTask.description
    const status = STATUS_FROM_LARK[larkTask.status] || "TODO"
    console.log(`[lark/sync] Status mapping: lark="${larkTask.status}" → th="${status}"`)
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
      console.log(`[lark/sync] Updated TH task ${thTaskId}: status=${updateData.status}, priority=${updateData.priority}, assignedTo=${updateData.assignedTo || 'unchanged'}`)

      // Mark circular guard so our update handler doesn't echo back
      markSyncGuard(thTaskId, "FROM_LARK")

      // Log to both LarkSyncLog and AuditLog
      await logSync({
        direction: "FROM_LARK",
        action: status === "DONE" ? "STATUS_CHANGE" : "UPDATE",
        status: "SUCCESS",
        taskId: thTaskId,
        larkTaskId: task_id,
        larkTaskListId: tasklist_id,
      })

      try {
        const { logAudit } = await import("@/lib/audit-log")
        await logAudit({
          userId: eventData.operator?.open_id || "lark-webhook",
          userName: "Lark Webhook",
          userRole: "SYSTEM",
          department: "TEAM_WORK",
          page: "tasks",
          action: status === "DONE" ? "STATUS_CHANGE" : "UPDATE",
          entityType: "Task",
          entityId: thTaskId,
          description: `Task ${status === "DONE" ? "marked as DONE" : "updated"} via Lark sync`,
          newValue: status,
          status: "SUCCESS",
          metadata: JSON.stringify({ source: "lark_webhook", eventType, larkTaskId: task_id, larkStatus: larkTask.status }),
        })
      } catch { /* audit log is best-effort */ }

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
          assigneeType: "HUMAN",
          category: "GENERAL",
          projectId: await findProjectByTaskList(tasklist_id),
        },
      })

      // Save mapping
      await saveLarkTaskMapping(newTask.id, task_id, tasklist_id)

      // Mark guard for the newly created task
      markSyncGuard(newTask.id, "FROM_LARK")

      try {
        const { logAudit } = await import("@/lib/audit-log")
        await logAudit({
          userId: eventData.operator?.open_id || "lark-webhook",
          userName: "Lark Webhook",
          userRole: "SYSTEM",
          department: "TEAM_WORK",
          page: "tasks",
          action: "CREATE",
          entityType: "Task",
          entityId: newTask.id,
          description: `Task created from Lark: "${title}"`,
          newValue: status,
          status: "SUCCESS",
          metadata: JSON.stringify({ source: "lark_webhook", eventType, larkTaskId: task_id }),
        })
      } catch { /* audit log is best-effort */ }

      return { success: true, message: `New task ${newTask.id} created from Lark` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[lark/sync] Webhook handling error:", msg)
    return { success: false, message: msg }
  }
}

// ━━ PROJECT MEMBER ↔ LARK TASKLIST MEMBER SYNC ━━

/**
 * Add a TrishulHub project member to the corresponding Lark task list.
 * Called fire-and-forget from the project members POST route.
 */
export async function addProjectMemberToLarkTaskList(
  projectId: string,
  userId: string
): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) return

  try {
    // Find the tasklist mapping for this project
    const { getAppSetting } = await import("@/lib/db")
    const raw = await getAppSetting(`lark_tasklist_${projectId}`)
    if (!raw) return

    const parsed = JSON.parse(raw)
    const tasklistId = parsed.tasklistId
    if (!tasklistId) return

    // Get user's Lark open_id
    const openId = await getUserLarkOpenId(userId)
    if (!openId) return

    // Add as editor to the task list
    await addTaskListMember(tasklistId, [{ id: openId, role: "editor" }])
    console.log(`[lark/sync] Added user ${userId} (${openId}) to tasklist ${tasklistId}`)
  } catch (err) {
    console.error("[lark/sync] addProjectMemberToLarkTaskList failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * Remove a TrishulHub project member from the corresponding Lark task list.
 * Called fire-and-forget from the project members DELETE route.
 */
export async function removeProjectMemberFromLarkTaskList(
  projectId: string,
  userId: string
): Promise<void> {
  const config = await getLarkConfig()
  if (!config?.enabled) return

  try {
    const { getAppSetting, delAppSetting } = await import("@/lib/db")
    const raw = await getAppSetting(`lark_tasklist_${projectId}`)
    if (!raw) return

    const parsed = JSON.parse(raw)
    const tasklistId = parsed.tasklistId
    if (!tasklistId) return

    // Get user's Lark open_id
    const openId = await getUserLarkOpenId(userId)
    if (!openId) return

    // Remove from task list
    await removeTaskListMember(tasklistId, [{ id: openId }])
    console.log(`[lark/sync] Removed user ${userId} (${openId}) from tasklist ${tasklistId}`)

    // Cleanup: check if project has no members left — if so, delete the tasklist
    const memberCount = await db.projectMember.count({ where: { projectId } })
    if (memberCount === 0) {
      const { deleteTaskList } = await import("./client")
      await deleteTaskList(tasklistId)
      await delAppSetting(`lark_tasklist_${projectId}`)
      console.log(`[lark/sync] Deleted empty tasklist ${tasklistId} for project ${projectId}`)
    }
  } catch (err) {
    console.error("[lark/sync] removeProjectMemberFromLarkTaskList failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * Find a project ID by looking up the tasklist mapping.
 */
async function findProjectByTaskList(tasklistId: string): Promise<string | null> {
  try {
    const rows = await db.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      'SELECT "key", "value" FROM "AppSetting" WHERE "key" LIKE ?',
      'lark_tasklist_%'
    )

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value)
        if (parsed.tasklistId === tasklistId) {
          const projectId = row.key.replace("lark_tasklist_", "")
          if (projectId && projectId !== "__default__") {
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