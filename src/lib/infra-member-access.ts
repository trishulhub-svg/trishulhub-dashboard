/** Timed per-user infrastructure visibility helpers. */

export type InfraMemberGrantRow = {
  userId: string
  visibleUntil: Date | null
  enabledBy?: string | null
}

export function isInfraGrantActive(
  access: { visibleUntil: Date | null } | null | undefined,
  now = new Date()
): boolean {
  return !!access?.visibleUntil && access.visibleUntil.getTime() > now.getTime()
}

export function serializeInfraGrant(
  grant: InfraMemberGrantRow & { userName?: string | null },
  now = new Date()
) {
  return {
    userId: grant.userId,
    userName: grant.userName || null,
    visibleUntil: grant.visibleUntil?.toISOString() ?? null,
    isActive: isInfraGrantActive(grant, now),
  }
}
