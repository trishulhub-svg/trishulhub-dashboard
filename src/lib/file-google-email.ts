/**
 * Resolve the personal Gmail used for Drive edit sharing.
 * Browse/upload in Trishulhub uses the service account (info@) — no Google login.
 * Only Open/Edit shares the specific file with this personal address.
 */

import { db } from "@/lib/db"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeGoogleEditEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const email = raw.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return null
  // Prefer real consumer / any Google identity — reject obvious non-email junk
  return email
}

/**
 * Prefer dedicated googleEditEmail; else fall back to login email
 * (many staff already use personal Gmail as Trishulhub login).
 */
export async function getGoogleEditEmailForUser(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, googleEditEmail: true },
  })
  if (!user) return null
  return (
    normalizeGoogleEditEmail(user.googleEditEmail) ||
    normalizeGoogleEditEmail(user.email)
  )
}
