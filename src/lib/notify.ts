import { db } from "@/lib/db"

export type NotifyType =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "SUCCESS"
  | "TASK"
  | "APPROVAL"
  | "AGENT"

export type NotifyInput = {
  userIds: string | string[]
  title: string
  message: string
  type?: NotifyType | string
  link?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Create in-app notifications for one or many users.
 * Dedupes ids, never throws to callers (logs and returns 0 on failure).
 */
export async function notifyUsers(input: NotifyInput): Promise<number> {
  try {
    const ids = [
      ...new Set(
        (Array.isArray(input.userIds) ? input.userIds : [input.userIds])
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ]
    if (ids.length === 0) return 0

    const title = (input.title || "").trim().slice(0, 255)
    const message = (input.message || "").trim().slice(0, 1000)
    if (!title || !message) return 0

    let link: string | null = null
    if (typeof input.link === "string" && input.link.trim()) {
      const trimmed = input.link.trim()
      // Allow app-relative paths (with optional hash/query) or absolute http(s)
      if (
        trimmed.startsWith("/") ||
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://")
      ) {
        link = trimmed.slice(0, 500)
      }
    }

    const type = (input.type || "INFO").toString().slice(0, 32)
    const metadata =
      input.metadata && typeof input.metadata === "object"
        ? JSON.stringify(input.metadata)
        : null

    await db.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        title,
        message,
        type,
        link,
        metadata,
      })),
    })

    return ids.length
  } catch (err) {
    console.error(
      "[notify] Failed to create notifications:",
      err instanceof Error ? err.message : String(err)
    )
    return 0
  }
}

/** Notify all active users with the given roles. */
export async function notifyRoles(
  roles: string[],
  input: Omit<NotifyInput, "userIds">
): Promise<number> {
  try {
    const users = await db.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    })
    return notifyUsers({ ...input, userIds: users.map((u) => u.id) })
  } catch (err) {
    console.error(
      "[notify] Failed to resolve roles:",
      err instanceof Error ? err.message : String(err)
    )
    return 0
  }
}
