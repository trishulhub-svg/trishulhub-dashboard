/**
 * Audit Trail Logging Library
 *
 * Provides a fire-and-forget logAudit() function that never blocks API responses.
 * Designed for department-wise audit logging across all system modules.
 */

import { db } from "@/lib/db"

// ── Department Mapping ──
export const AUDIT_DEPARTMENTS = {
  BUSINESS: { label: "Business", pages: ["invoices", "clients", "leads", "contacts", "deals", "contracts", "subscriptions", "expenses", "finance"] },
  TEAM_WORK: { label: "Team & Work", pages: ["projects", "tasks", "time-tracking", "approvals", "milestones"] },
  HR_PEOPLE: { label: "HR & People", pages: ["team", "leaves", "availability"] },
  LEARNING: { label: "Learning", pages: ["training", "my-training"] },
  SYSTEM: { label: "System", pages: ["settings", "api-keys", "workspace", "access-hub", "credentials", "notifications"] },
} as const

export type AuditDepartment = keyof typeof AUDIT_DEPARTMENTS

// ── Valid Actions ──
export const AUDIT_ACTIONS = [
  "CREATE", "READ", "UPDATE", "DELETE", "LOGIN", "LOGOUT",
  "EXPORT", "APPROVE", "REJECT", "SEND", "ASSIGN", "UPLOAD",
  "DOWNLOAD", "STATUS_CHANGE", "CONFIG_CHANGE", "ACCESS",
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

// ── Action Badge Colors ──
export const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  LOGIN: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  LOGOUT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  EXPORT: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  APPROVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJECT: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  SEND: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  ASSIGN: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  UPLOAD: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  DOWNLOAD: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  STATUS_CHANGE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  CONFIG_CHANGE: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  ACCESS: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
  READ: "bg-gray-50 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
}

// ── Status Colors ──
export const STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  FAILURE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
}

// ── Department Icons (Lucide icon names) ──
export const DEPARTMENT_ICONS: Record<string, string> = {
  BUSINESS: "Briefcase",
  TEAM_WORK: "FolderKanban",
  HR_PEOPLE: "Users",
  LEARNING: "GraduationCap",
  SYSTEM: "Settings",
}

// ── Department Colors ──
export const DEPARTMENT_COLORS: Record<string, string> = {
  BUSINESS: "text-amber-600 dark:text-amber-400",
  TEAM_WORK: "text-blue-600 dark:text-blue-400",
  HR_PEOPLE: "text-pink-600 dark:text-pink-400",
  LEARNING: "text-emerald-600 dark:text-emerald-400",
  SYSTEM: "text-slate-600 dark:text-slate-400",
}

export interface LogAuditParams {
  userId: string
  userName: string
  userRole: string
  userDepartment?: string
  department: AuditDepartment
  page: string
  action: string
  entityType?: string
  entityId?: string
  description: string
  oldValue?: string
  newValue?: string
  ipAddress?: string
  userAgent?: string
  status?: "SUCCESS" | "FAILURE"
  metadata?: string
}

/**
 * Log an audit entry — fire-and-forget, non-blocking.
 * Wrapped in try/catch so it never slows down the caller.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId,
        userName: params.userName,
        userRole: params.userRole,
        userDepartment: params.userDepartment || null,
        department: params.department,
        page: params.page,
        action: params.action,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
        description: params.description,
        oldValue: params.oldValue || null,
        newValue: params.newValue || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        status: params.status || "SUCCESS",
        metadata: params.metadata || null,
      },
    })
  } catch (err) {
    // Never throw — audit logging failure must not break the caller
    console.error("[audit-log] Failed to write audit entry:", err instanceof Error ? err.message : String(err))
  }
}

/**
 * Helper to extract IP address from NextRequest headers.
 */
export function getIpAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, first is the real client
    return forwarded.split(",")[0].trim()
  }
  const realIp = req.headers.get("x-real-ip")
  if (realIp) return realIp.trim()
  return "unknown"
}

/**
 * Helper to extract user agent from NextRequest headers.
 */
export function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") || "unknown"
}

/**
 * Helper to build description string for common audit actions.
 */
export function buildDescription(action: string, entityType: string, identifier?: string): string {
  const label = identifier || "item"
  switch (action) {
    case "CREATE":
      return `Created ${entityType} ${label}`
    case "UPDATE":
      return `Updated ${entityType} ${label}`
    case "DELETE":
      return `Deleted ${entityType} ${label}`
    case "APPROVE":
      return `Approved ${entityType} ${label}`
    case "REJECT":
      return `Rejected ${entityType} ${label}`
    case "LOGIN":
      return `User logged in`
    case "LOGOUT":
      return `User logged out`
    case "EXPORT":
      return `Exported ${entityType} data`
    case "SEND":
      return `Sent ${entityType} ${label}`
    case "ASSIGN":
      return `Assigned ${entityType} ${label}`
    case "STATUS_CHANGE":
      return `Changed status of ${entityType} ${label}`
    case "CONFIG_CHANGE":
      return `Changed configuration setting`
    case "ACCESS":
      return `Accessed ${entityType} ${label}`
    case "UPLOAD":
      return `Uploaded file for ${entityType} ${label}`
    case "DOWNLOAD":
      return `Downloaded ${entityType} ${label}`
    default:
      return `${action} on ${entityType} ${label}`
  }
}
