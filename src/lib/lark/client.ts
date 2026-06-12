// ━━ Lark API Client — Task & User Operations ━━

import { getLarkToken, getLarkConfig } from "./auth"
import type { LarkTask, LarkTaskList, LarkUser, LarkConfig } from "./types"
import { STATUS_TO_LARK, PRIORITY_TO_LARK } from "./types"

const LARK_BASE = "https://open.feishu.cn/open-apis"

/** Make an authenticated Lark API request */
async function larkFetch(path: string, options: RequestInit = {}): Promise<{ code: number; msg: string; data: Record<string, unknown> }> {
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

  if (!res.ok) {
    throw new Error(`Lark API HTTP ${res.status}: ${res.statusText}`)
  }

  return res.json()
}

// ━━ TASK LIST OPERATIONS ━━

/** Create a task list in Lark */
export async function createTaskList(name: string, description?: string): Promise<LarkTaskList | null> {
  const body: Record<string, unknown> = { name }
  if (description) body.description = description

  const res = await larkFetch("/task/v2/tasklists", {
    method: "POST",
    body: JSON.stringify(body),
  })

  if (res.code !== 0) {
    console.error("[lark/client] Create tasklist failed:", res.msg)
    return null
  }

  const tasklist = res.data?.tasklist as LarkTaskList | undefined
  return tasklist || null
}

/** Get all task lists */
export async function getTaskLists(): Promise<LarkTaskList[]> {
  const res = await larkFetch("/task/v2/tasklists")

  if (res.code !== 0) {
    console.error("[lark/client] Get tasklists failed:", res.msg)
    return []
  }

  const items = res.data?.items as LarkTaskList[] | undefined
  return items || []
}

/** Get a task list by ID */
export async function getTaskList(tasklistId: string): Promise<LarkTaskList | null> {
  const res = await larkFetch(`/task/v2/tasklists/${tasklistId}`)

  if (res.code !== 0) {
    console.error("[lark/client] Get tasklist failed:", res.msg)
    return null
  }

  return (res.data?.tasklist as LarkTaskList) || null
}

/** Find or create a task list for a project.
 * Uses project name + " Tasks" as the task list name.
 * Stores the mapping in AppSetting.
 */
export async function getOrCreateProjectTaskList(
  projectId: string,
  projectName: string
): Promise<{ tasklistId: string; created: boolean } | null> {
  const config = await getLarkConfig()
  if (!config?.enabled) return null

  // Check if mapping already exists
  const { getAppSetting, setAppSetting } = await import("@/lib/db")
  const existingMapping = await getAppSetting(`lark_tasklist_${projectId}`)

  if (existingMapping) {
    try {
      const parsed = JSON.parse(existingMapping)
      return { tasklistId: parsed.tasklistId, created: false }
    } catch {
      // Invalid mapping, continue to find/create
    }
  }

  // Search existing task lists for a match
  const taskLists = await getTaskLists()
  const listName = `${projectName} Tasks`
  const existing = taskLists.find((tl) => tl.name === listName)

  if (existing) {
    await setAppSetting(`lark_tasklist_${projectId}`, JSON.stringify({ tasklistId: existing.tasklist_id }))
    return { tasklistId: existing.tasklist_id, created: false }
  }

  // Create new task list
  const newTaskList = await createTaskList(listName, `Tasks synced from TrishulHub project: ${projectName}`)
  if (newTaskList) {
    await setAppSetting(`lark_tasklist_${projectId}`, JSON.stringify({ tasklistId: newTaskList.tasklist_id }))
    return { tasklistId: newTaskList.tasklist_id, created: true }
  }

  return null
}

// ━━ TASK OPERATIONS ━━

/** Create a task in Lark */
export async function createTask(
  tasklistId: string,
  params: {
    title: string
    description?: string
    status?: string // TrishulHub status
    priority?: string // TrishulHub priority
    assigneeOpenId?: string
    dueTimestamp?: number // unix ms
    extra?: Record<string, unknown> // custom fields for REVIEW/AWAITING_APPROVAL
  }
): Promise<LarkTask | null> {
  const body: Record<string, unknown> = {
    tasklist_id: tasklistId,
    name: params.title,
  }

  if (params.description) body.description = params.description
  if (params.assigneeOpenId) body.assignee = params.assigneeOpenId
  if (params.dueTimestamp) body.due = { timestamp: String(params.dueTimestamp) }

  // Map status and priority to Lark
  const larkStatus = params.status ? STATUS_TO_LARK[params.status] : "todo"
  const larkPriority = params.priority ? PRIORITY_TO_LARK[params.priority] : "normal"

  // Use the v2 task create API
  const res = await larkFetch("/task/v2/tasks", {
    method: "POST",
    body: JSON.stringify({
      ...body,
      status: larkStatus,
      priority: larkPriority,
      // Store extra TrishulHub metadata in custom fields
      extra: params.extra ? JSON.stringify(params.extra) : undefined,
    }),
  })

  if (res.code !== 0) {
    console.error("[lark/client] Create task failed:", res.msg)
    return null
  }

  const task = res.data?.task as LarkTask | undefined
  return task || null
}

/** Update a task in Lark */
export async function updateTask(
  tasklistId: string,
  taskId: string,
  params: {
    title?: string
    description?: string
    status?: string // TrishulHub status
    priority?: string // TrishulHub priority
    assigneeOpenId?: string
    dueTimestamp?: number
    extra?: Record<string, unknown>
  }
): Promise<LarkTask | null> {
  const body: Record<string, unknown> = {}

  if (params.title !== undefined) body.name = params.title
  if (params.description !== undefined) body.description = params.description
  if (params.assigneeOpenId !== undefined) body.assignee = params.assigneeOpenId
  if (params.dueTimestamp !== undefined) body.due = { timestamp: String(params.dueTimestamp) }

  if (params.status !== undefined) {
    body.status = STATUS_TO_LARK[params.status] || "todo"
  }
  if (params.priority !== undefined) {
    body.priority = PRIORITY_TO_LARK[params.priority] || "normal"
  }
  if (params.extra) {
    body.extra = JSON.stringify(params.extra)
  }

  const res = await larkFetch(`/task/v2/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })

  if (res.code !== 0) {
    console.error("[lark/client] Update task failed:", res.msg)
    return null
  }

  const task = res.data?.task as LarkTask | undefined
  return task || null
}

/** Delete a task in Lark */
export async function deleteTask(tasklistId: string, taskId: string): Promise<boolean> {
  const res = await larkFetch(`/task/v2/tasks/${taskId}?tasklist_id=${tasklistId}`, {
    method: "DELETE",
  })

  if (res.code !== 0) {
    console.error("[lark/client] Delete task failed:", res.msg)
    return false
  }

  return true
}

/** Get tasks from a task list */
export async function getTasks(tasklistId: string): Promise<LarkTask[]> {
  const res = await larkFetch(`/task/v2/tasks?tasklist_id=${tasklistId}`)

  if (res.code !== 0) {
    console.error("[lark/client] Get tasks failed:", res.msg)
    return []
  }

  const items = res.data?.items as LarkTask[] | undefined
  return items || []
}

/** Get a single task */
export async function getTask(tasklistId: string, taskId: string): Promise<LarkTask | null> {
  const res = await larkFetch(`/task/v2/tasks/${taskId}?tasklist_id=${tasklistId}`)

  if (res.code !== 0) {
    console.error("[lark/client] Get task failed:", res.msg)
    return null
  }

  return (res.data?.task as LarkTask) || null
}

// ━━ USER OPERATIONS ━━

/** Look up a Lark user by email. Returns open_id if found. */
export async function lookupUserByEmail(email: string): Promise<LarkUser | null> {
  // Use userIdByUserEmail endpoint
  const res = await larkFetch(`/contact/v3/users/batch_get_id?emails=${encodeURIComponent(email)}`)

  if (res.code !== 0) {
    // User not found or API error
    return null
  }

  const userList = (res.data?.user_list as Array<{ user_id: string; email: string }>) || []
  if (userList.length === 0) return null

  // Get full user info
  const userId = userList[0].user_id
  const userRes = await larkFetch(`/contact/v3/users/${userId}?user_id_type=user_id`)

  if (userRes.code !== 0) return null

  const user = userRes.data?.user as LarkUser | undefined
  return user || null
}

/** Get all users in the Lark tenant (for batch matching) */
export async function getAllUsers(): Promise<LarkUser[]> {
  const users: LarkUser[] = []
  let pageToken = ""

  do {
    const params = new URLSearchParams({ page_size: "50", user_id_type: "open_id" })
    if (pageToken) params.set("page_token", pageToken)

    const res = await larkFetch(`/contact/v3/users?${params.toString()}`)

    if (res.code !== 0) {
      console.error("[lark/client] getAllUsers failed:", res.code, res.msg)
      break
    }

    const items = (res.data?.items as LarkUser[]) || []
    users.push(...items)

    pageToken = (res.data?.page_token as string) || ""
  } while (pageToken)

  return users
}