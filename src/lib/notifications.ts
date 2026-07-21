import { db } from "@/lib/db"

export type NotifyType =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "SUCCESS"
  | "TASK"
  | "APPROVAL"
  | "AGENT"

/**
 * Fire-and-forget notification create — matches existing inline patterns.
 * Never throws to callers; logs on failure.
 */
export async function notifyUser(options: {
  userId: string
  title: string
  message: string
  type?: NotifyType
  link?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId: options.userId,
        title: options.title,
        message: options.message,
        type: options.type || "INFO",
        link: options.link || null,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null,
      },
    })
  } catch (err) {
    console.error(
      "[notify] failed:",
      err instanceof Error ? err.message : String(err)
    )
  }
}

export async function notifyUsers(
  userIds: string[],
  payload: Omit<Parameters<typeof notifyUser>[0], "userId">
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))]
  await Promise.all(unique.map((userId) => notifyUser({ ...payload, userId })))
}

/** Notify all active SUPER_ADMIN and ADMIN users. */
export async function notifyAdmins(
  payload: Omit<Parameters<typeof notifyUser>[0], "userId">
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ["SUPER_ADMIN", "ADMIN"] },
      },
      select: { id: true },
    })
    await notifyUsers(
      admins.map((a) => a.id),
      payload
    )
  } catch (err) {
    console.error(
      "[notifyAdmins] failed:",
      err instanceof Error ? err.message : String(err)
    )
  }
}
