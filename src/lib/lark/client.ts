// ━━ Lark API Client — Task & User Operations ━━

import { getLarkToken, getLarkConfig } from "./auth"
import type { LarkTask, LarkTaskList, LarkUser, LarkConfig } from "./types"
import { STATUS_TO_LARK, PRIORITY_TO_LARK } from "./types"

const LARK_BASE = "https://open.larksuite.com/open-apis"

// ━━ CORE FETCH ━━

/** Make an authenticated Lark API request.
 *  Lark returns HTTP 200 for ALL responses — errors are indicated by
 *  `code !== 0` in the JSON body with `{code, msg}`.
 */
async function larkFetch<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<{ code: number; msg: string; data: T }> {
  const token = await getLarkToken()
  if (!token) {
    throw new Error("Lark token unavailable — check Lark config in Access Hub")
  }

  const res = await fetch(`${LARK_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...options.headers,
    },
  })

  const json = await res.json()

  if (json.code !== 0) {
    const errMsg = `[lark/client] API error ${json.code}: ${json.msg} (path: ${path})`
    console.error(errMsg)
    throw new Error(errMsg)
  }

  return json
}

// ━━ TASK NORMALIZATION ━━

/**
 * Lark API v2 returns `summary` for the task name, but our internal code
 * uses `.title`. This helper normalizes every task response so that
 * `.title` always contains the actual summary value.
 * Also normalizes `tasklist_id` (Lark may return it at top level or nested).
 */
function normalizeTask(raw: Record<string, unknown>): LarkTask {
  return {
    task_id: (raw.task_id as string) || "",
    tasklist_id: (raw.tasklist_id as string) || "",
    title: (raw.summary as string) || (raw.title as string) || "",
    summary: raw.summary as string | undefined,
    description: raw.description as string | undefined,
    status: (raw.status as LarkTask["status"]) || "todo",
    priority: (raw.priority as LarkTask["priority"]) || "normal",
    creator: raw.creator as LarkTask["creator"],
    assignee: raw.assignee as LarkTask["assignee"],
    due: raw.due as LarkTask["due"],
    completed_at: raw.completed_at as LarkTask["completed_at"],
    created_at: raw.created_at as LarkTask["created_at"],
    updated_at: raw.updated_at as LarkTask["updated_at"],
    origin: raw.origin as string | undefined,
    parent_id: raw.parent_id as string | undefined,
  }
}

// ━━ TASK LIST NORMALIZATION ━━

/**
 * Lark API v2 returns `guid` as the tasklist identifier, but our internal
 * code references `.tasklist_id`. This helper normalizes every response
 * so that `tasklist_id` always contains the actual guid value.
 */
function normalizeTaskList(raw: Record<string, unknown>): LarkTaskList {
  const guid = raw.guid as string || ""
  return {
    tasklist_id: guid,
    guid,
    name: (raw.name as string) || "",
    description: (raw.description as string) || undefined,
    owner: raw.owner as LarkTaskList["owner"],
    created_at: raw.created_at as LarkTaskList["created_at"],
    updated_at: raw.updated_at as LarkTaskList["updated_at"],
  }
}

// ━━ TASK LIST OPERATIONS ━━

/** Create a task list in Lark */
export async function createTaskList(name: string, description?: string): Promise<LarkTaskList | null> {
  const body: Record<string, unknown> = { name }
  if (description) body.description = description

  const res = await larkFetch<{ tasklist: Record<string, unknown> }>("/task/v2/tasklists", {
    method: "POST",
    body: JSON.stringify(body),
  })

  return res.data?.tasklist ? normalizeTaskList(res.data.tasklist) : null
}

/** Get all task lists */
export async function getTaskLists(): Promise<LarkTaskList[]> {
  const res = await larkFetch<{ items: Record<string, unknown>[] }>("/task/v2/tasklists")
  const items = res.data?.items || []
  return items.map(normalizeTaskList)
}

/** Get a task list by ID (accepts guid) */
export async function getTaskList(tasklistId: string): Promise<LarkTaskList | null> {
  const res = await larkFetch<{ tasklist: Record<string, unknown> }>(`/task/v2/tasklists/${tasklistId}`)
  return res.data?.tasklist ? normalizeTaskList(res.data.tasklist) : null
}

/** Delete a task list */
export async function deleteTaskList(tasklistId: string): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasklists/${tasklistId}`, { method: "DELETE" })
    return true
  } catch {
    return false
  }
}

/** Add a member to a task list (Lark uses `guid` in URL) */
export async function addTaskListMember(
  tasklistId: string,
  members: Array<{ id: string; role?: "owner" | "editor" | "viewer" }>
): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasklists/${tasklistId}/add_members`, {
      method: "POST",
      body: JSON.stringify({
        members: members.map((m) => ({
          type: "user" as const,
          id: m.id,
          role: m.role || "editor",
        })),
      }),
    })
    return true
  } catch (err) {
    console.error("[lark/client] addTaskListMember failed:", err instanceof Error ? err.message : err)
    return false
  }
}

/** Remove a member from a task list */
export async function removeTaskListMember(
  tasklistId: string,
  members: Array<{ id: string }>
): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasklists/${tasklistId}/remove_members`, {
      method: "POST",
      body: JSON.stringify({
        members: members.map((m) => ({
          type: "user" as const,
          id: m.id,
        })),
      }),
    })
    return true
  } catch (err) {
    console.error("[lark/client] removeTaskListMember failed:", err instanceof Error ? err.message : err)
    return false
  }
}

/** Find or create a task list for a project.
 * Uses project name directly (no " Tasks" suffix).
 * Checks backward-compatible "${name} Tasks" format for existing lists.
 * Stores the mapping in AppSetting.
 */
export async function getOrCreateProjectTaskList(
  projectId: string,
  projectName: string
): Promise<{ tasklistId: string; created: boolean } | null> {
  const config = await getLarkConfig()
  if (!config?.enabled) return null

  const { getAppSetting, setAppSetting } = await import("@/lib/db")
  const existingMapping = await getAppSetting(`lark_tasklist_${projectId}`)

  if (existingMapping) {
    try {
      const parsed = JSON.parse(existingMapping)
      if (parsed.tasklistId) {
        return { tasklistId: parsed.tasklistId, created: false }
      }
    } catch {
      // Invalid mapping, continue to find/create
    }
  }

  // Search existing task lists for a match
  const taskLists = await getTaskLists()

  // Check new format (project name directly) first, then backward compat
  const existing = taskLists.find((tl) => tl.name === projectName)
    || taskLists.find((tl) => tl.name === `${projectName} Tasks`)

  if (existing) {
    await setAppSetting(`lark_tasklist_${projectId}`, JSON.stringify({ tasklistId: existing.tasklist_id }))
    return { tasklistId: existing.tasklist_id, created: false }
  }

  // Create new task list with the project name
  const newTaskList = await createTaskList(projectName, `Tasks synced from TrishulHub project: ${projectName}`)
  if (newTaskList) {
    await setAppSetting(`lark_tasklist_${projectId}`, JSON.stringify({ tasklistId: newTaskList.tasklist_id }))
    return { tasklistId: newTaskList.tasklist_id, created: true }
  }

  return null
}

/** Find or create a per-user task list for a project.
 * Each user gets their own Lark task list per project so that
 * tasks are grouped by user in Lark Task Center.
 * Format: "${projectName} — ${userName}"
 * Stores the mapping in AppSetting with key: lark_tasklist_${projectId}_${userId}
 */
export async function getOrCreateUserProjectTaskList(
  projectId: string,
  projectName: string,
  userId: string,
  userName: string
): Promise<{ tasklistId: string; created: boolean } | null> {
  const config = await getLarkConfig()
  if (!config?.enabled) return null

  const { getAppSetting, setAppSetting } = await import("@/lib/db")
  const settingKey = `lark_tasklist_${projectId}_${userId}`
  const existingMapping = await getAppSetting(settingKey)

  if (existingMapping) {
    try {
      const parsed = JSON.parse(existingMapping)
      if (parsed.tasklistId) {
        return { tasklistId: parsed.tasklistId, created: false }
      }
    } catch {
      // Invalid mapping, continue to find/create
    }
  }

  // Build the task list name: "ProjectName — UserName"
  const listName = `${projectName} — ${userName}`

  // Search existing task lists for a match
  const taskLists = await getTaskLists()
  const existing = taskLists.find((tl) => tl.name === listName)

  if (existing) {
    await setAppSetting(settingKey, JSON.stringify({ tasklistId: existing.tasklist_id }))
    return { tasklistId: existing.tasklist_id, created: false }
  }

  // Create new task list
  const newTaskList = await createTaskList(listName, `Tasks for ${userName} on project: ${projectName}`)
  if (newTaskList) {
    await setAppSetting(settingKey, JSON.stringify({ tasklistId: newTaskList.tasklist_id }))
    return { tasklistId: newTaskList.tasklist_id, created: true }
  }

  return null
}

// ━━ TASK OPERATIONS ━━

/** Create a task in Lark.
 *  Lark v2 create API: POST /task/v2/tasks
 *  IMPORTANT: Only `tasklist_id` and `summary` are safe on create.
 *  - `description` requires rich text format (NOT plain string) — causes 99992402
 *  - `due` may cause validation errors on some Lark plans
 *  - `status`, `priority`, `members`, `extra` are NOT supported on create.
 *  All additional fields are set via updateTask() AFTER creation.
 */
export async function createTask(
  tasklistId: string,
  params: {
    title: string
    description?: string
    dueTimestamp?: number // unix ms — set via updateTask after create
  }
): Promise<LarkTask | null> {
  // Bare minimum body — description & due cause 99992402 on create
  const body: Record<string, unknown> = {
    tasklist_id: tasklistId,
    summary: params.title,
  }

  const res = await larkFetch<{ task: Record<string, unknown> }>("/task/v2/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  })

  const raw = res.data?.task
  return raw ? normalizeTask(raw) : null
}

/** Update a task in Lark.
 *  Lark v2 update API: PATCH /task/v2/tasks/{task_id}
 *  Supported body fields: summary?, description?, due?, status?, priority?
 *  NOTE: `assignee` changes go through addTaskMember/removeTaskMember, NOT here.
 *  NOTE: `extra` is NOT a valid field — causes 400.
 *  NOTE: `due` expects timestamp in SECONDS, not milliseconds.
 *  NOTE: `description` must be rich text format (array of content blocks).
 *        If description is empty/whitespace-only, skip it to avoid 99992402.
 *  Strategy: Send all safe fields in ONE PATCH. If it fails, retry without
 *  description (the most likely problem field).
 */
export async function updateTask(
  taskId: string,
  params: {
    title?: string
    description?: string
    status?: string // TrishulHub status
    priority?: string // TrishulHub priority
    dueTimestamp?: number
  }
): Promise<LarkTask | null> {
  // Build the update body — skip empty/unset fields
  const body: Record<string, unknown> = {}

  if (params.title !== undefined && params.title.trim()) {
    body.summary = params.title
  }

  // Only include description if it has actual content
  // Empty/whitespace-only description causes 99992402 field validation error
  if (params.description !== undefined && params.description.trim()) {
    body.description = [{ tag: "text", text: params.description }]
  }

  // Lark expects timestamp in SECONDS, not milliseconds
  if (params.dueTimestamp !== undefined) {
    body.due = { timestamp: String(Math.floor(params.dueTimestamp / 1000)) }
  }

  if (params.status !== undefined) {
    body.status = STATUS_TO_LARK[params.status] || "todo"
  }

  if (params.priority !== undefined) {
    body.priority = PRIORITY_TO_LARK[params.priority] || "normal"
  }

  if (Object.keys(body).length === 0) {
    return null
  }

  // First attempt: send all fields
  try {
    const res = await larkFetch<{ task: Record<string, unknown> }>(`/task/v2/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })
    const raw = res.data?.task
    return raw ? normalizeTask(raw) : null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // If the error is 99992402 (field validation) and we sent a description,
    // retry WITHOUT description — it's the most common failure cause
    if (msg.includes("99992402") && body.description) {
      console.warn(`[lark/client] updateTask: 99992402 error, retrying without description for task ${taskId}`)
      const { description: _desc, ...bodyWithoutDesc } = body
      try {
        const res = await larkFetch<{ task: Record<string, unknown> }>(`/task/v2/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify(bodyWithoutDesc),
        })
        const raw = res.data?.task
        return raw ? normalizeTask(raw) : null
      } catch (retryErr) {
        // If retry also fails with 99992402, try without due date too
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        if (retryMsg.includes("99992402") && bodyWithoutDesc.due) {
          console.warn(`[lark/client] updateTask: 99992402 still failing, retrying without due for task ${taskId}`)
          const { due: _due, ...bodyMinimal } = bodyWithoutDesc as Record<string, unknown>
          delete bodyMinimal.description
          try {
            const res = await larkFetch<{ task: Record<string, unknown> }>(`/task/v2/tasks/${taskId}`, {
              method: "PATCH",
              body: JSON.stringify(bodyMinimal),
            })
            const raw = res.data?.task
            return raw ? normalizeTask(raw) : null
          } catch (finalErr) {
            console.error(`[lark/client] updateTask: all retry attempts failed for task ${taskId}:`, finalErr instanceof Error ? finalErr.message : finalErr)
            throw finalErr
          }
        }
        throw retryErr
      }
    }

    throw err
  }
}

/** Delete a task in Lark */
export async function deleteTask(tasklistId: string, taskId: string): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasks/${taskId}?tasklist_id=${tasklistId}`, {
      method: "DELETE",
    })
    return true
  } catch {
    return false
  }
}

/** Get tasks from a task list */
export async function getTasks(tasklistId: string): Promise<LarkTask[]> {
  const res = await larkFetch<{ items: Record<string, unknown>[] }>(`/task/v2/tasks?tasklist_id=${tasklistId}`)
  const items = res.data?.items || []
  return items.map(normalizeTask)
}

/** Get a single task */
export async function getTask(tasklistId: string, taskId: string): Promise<LarkTask | null> {
  try {
    const res = await larkFetch<{ task: Record<string, unknown> }>(`/task/v2/tasks/${taskId}?tasklist_id=${tasklistId}`)
    const raw = res.data?.task
    return raw ? normalizeTask(raw) : null
  } catch (err) {
    // Lark returns 99404 for completed tasks on free tier — treat as null
    console.warn(`[lark/client] getTask failed for ${taskId}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Add members to a task (e.g. assignee, follower).
 *  POST /task/v2/tasks/{task_id}/add_members
 */
export async function addTaskMember(
  taskId: string,
  members: Array<{ id: string; role?: "assignee" | "follower" }>
): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasks/${taskId}/add_members`, {
      method: "POST",
      body: JSON.stringify({
        members: members.map((m) => ({
          type: "user" as const,
          id: m.id,
          role: m.role || "assignee",
        })),
      }),
    })
    return true
  } catch (err) {
    console.error("[lark/client] addTaskMember failed:", err instanceof Error ? err.message : err)
    return false
  }
}

/** Remove members from a task.
 *  POST /task/v2/tasks/{task_id}/remove_members
 */
export async function removeTaskMember(
  taskId: string,
  members: Array<{ id: string }>
): Promise<boolean> {
  try {
    await larkFetch(`/task/v2/tasks/${taskId}/remove_members`, {
      method: "POST",
      body: JSON.stringify({
        members: members.map((m) => ({
          type: "user" as const,
          id: m.id,
        })),
      }),
    })
    return true
  } catch (err) {
    console.error("[lark/client] removeTaskMember failed:", err instanceof Error ? err.message : err)
    return false
  }
}

// ━━ USER OPERATIONS ━━

/** Look up a Lark user by email. Returns open_id if found. */
export async function lookupUserByEmail(email: string): Promise<LarkUser | null> {
  const res = await larkFetch<{ user_list: Array<{ user_id: string; email: string }> }>(
    `/contact/v3/users/batch_get_id?emails=${encodeURIComponent(email)}`
  )

  const userList = res.data?.user_list || []
  if (userList.length === 0) return null

  const userId = userList[0].user_id
  // CRITICAL: Use user_id_type=open_id so the returned user has open_id
  // (addTaskMember requires open_id, not user_id)
  const userRes = await larkFetch<{ user: LarkUser }>(`/contact/v3/users/${userId}?user_id_type=open_id`)

  return userRes.data?.user || null
}

/** Get all users in the Lark tenant (for batch matching) */
export async function getAllUsers(): Promise<LarkUser[]> {
  const users: LarkUser[] = []
  let pageToken = ""

  do {
    const params = new URLSearchParams({ page_size: "50", user_id_type: "open_id", department_id: "0" })
    if (pageToken) params.set("page_token", pageToken)

    const res = await larkFetch<{ items: LarkUser[]; page_token?: string; total?: number }>(
      `/contact/v3/users?${params.toString()}`
    )

    const items = res.data?.items || []
    users.push(...items)

    // Log first call details for debugging
    if (!pageToken) {
      console.log(
        `[lark/client] getAllUsers: first page returned ${items.length} users, has_more: ${!!res.data?.page_token}, total: ${res.data?.total}`
      )
      if (items.length > 0) {
        console.log(
          `[lark/client] getAllUsers: first user sample: ${JSON.stringify({ name: items[0].name, email: items[0].email, open_id: items[0].open_id })}`
        )
      }
    }

    pageToken = res.data?.page_token || ""
  } while (pageToken)

  return users
}