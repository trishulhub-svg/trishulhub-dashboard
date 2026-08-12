/**
 * Resolve Google emails used for Drive ACL sharing.
 * Trishulhub browse/upload uses info@ — personal Gmail is only for open/edit in Drive.
 */

import { db } from "@/lib/db"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeGoogleEditEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const email = raw.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return null
  return email
}

/**
 * Prefer dedicated googleEditEmail; else fall back to login email.
 * (Kept for callers that need a single primary address.)
 */
export async function getGoogleEditEmailForUser(userId: string): Promise<string | null> {
  const emails = await getGoogleShareEmailsForUser(userId)
  return emails[0] || null
}

/**
 * All Google identities we should share Drive items with for this user.
 * Includes login email AND personal googleEditEmail when both exist and differ —
 * otherwise "Request access" appears if the browser is signed into the other account.
 */
export async function getGoogleShareEmailsForUser(userId: string): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, googleEditEmail: true },
  })
  if (!user) return []
  const out: string[] = []
  const login = normalizeGoogleEditEmail(user.email)
  const personal = normalizeGoogleEditEmail(user.googleEditEmail)
  // Prefer personal first (explicit edit mailbox), then login
  if (personal) out.push(personal)
  if (login && login !== personal) out.push(login)
  return out
}
