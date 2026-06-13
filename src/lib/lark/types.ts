// ━━ Lark Integration Types ━━

/** Lark API credential config (stored encrypted in AppSetting) */
export interface LarkConfig {
  appId: string
  appSecret: string
  enabled: boolean
  encryptKey: string // for webhook verification
}

/** Lark tenant_access_token response */
export interface LarkTokenResponse {
  code: number
  msg: string
  tenant_access_token: string
  expire: number
}

/** Lark user info (from contact API) */
export interface LarkUser {
  open_id: string
  user_id: string
  name: string
  en_name?: string
  email?: string
  avatar?: string
  mobile?: string
  department_ids?: string[]
  status?: {
    is_active: boolean
    is_frozen: boolean
    is_resigned: boolean
    is_deleted: boolean
  }
}

/** Lark task (from task API v2) */
export interface LarkTask {
  task_id: string
  tasklist_id: string
  title: string
  description?: string
  status: "todo" | "in_progress" | "done"
  priority: "normal" | "high" | "urgent"
  creator?: {
    open_id: string
    user_id: string
    name: string
  }
  assignee?: {
    open_id: string
    user_id: string
    name: string
  }
  due?: {
    timestamp: string
  }
  completed_at?: {
    timestamp: string
  }
  created_at?: {
    timestamp: string
  }
  updated_at?: {
    timestamp: string
  }
  extra?: string // JSON string for custom fields
  origin?: string
  parent_id?: string
}

/** Lark task list (a container for tasks) */
export interface LarkTaskList {
  tasklist_id: string // kept as alias for backward compat — code uses .tasklist_id
  guid: string // actual field name returned by Lark API v2
  name: string
  description?: string
  owner?: {
    open_id: string
    user_id: string
    name: string
  }
  created_at?: {
    timestamp: string
  }
  updated_at?: {
    timestamp: string
  }
}

/** TrishulHub ↔ Lark status mapping */
export const STATUS_TO_LARK: Record<string, "todo" | "in_progress" | "done"> = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  REVIEW: "in_progress",       // Lark only has 3 statuses
  AWAITING_APPROVAL: "in_progress",
  DONE: "done",
}

export const STATUS_FROM_LARK: Record<string, string> = {
  todo: "TODO",
  in_progress: "IN_PROGRESS",
  done: "DONE",
}

/** TrishulHub ↔ Lark priority mapping */
export const PRIORITY_TO_LARK: Record<string, "normal" | "high" | "urgent"> = {
  LOW: "normal",
  MEDIUM: "normal",
  HIGH: "high",
  URGENT: "urgent",
}

export const PRIORITY_FROM_LARK: Record<string, string> = {
  normal: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
}

/** Webhook event types (Lark free tier only provides updated_v1) */
export type LarkWebhookEvent =
  | "task.task.updated_v1"

/** Webhook event payload (outer wrapper) */
export interface LarkWebhookPayload {
  schema?: string
  header: {
    event_id: string
    event_type: LarkWebhookEvent
    token: string
    create_time: string
    tenant_key: string
    app_id: string
  }
  event?: {
    operator: {
      open_id: string
      user_id: string
      union_id: string
    }
    task_id: string
    tasklist_id: string
    [key: string]: unknown
  }
  // URL verification challenge
  challenge?: string
  token?: string
  type?: string
}

/** Sync log entry types */
export type SyncDirection = "TO_LARK" | "FROM_LARK"
export type SyncAction = "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE"
export type SyncStatus = "SUCCESS" | "FAILED" | "SKIPPED"

/** Sync log for audit trail */
export interface LarkSyncLog {
  id: string
  direction: SyncDirection
  action: SyncAction
  status: SyncStatus
  taskId?: string
  larkTaskId?: string
  larkTaskListId?: string
  projectId?: string
  userId?: string
  error?: string
  metadata?: string // JSON
  createdAt: Date
}