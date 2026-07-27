/**
 * Per-user favorite dashboard pages — stored on User.favoritePages (JSON).
 * Same account → same favorites on every device / login.
 */
import { db } from "@/lib/db"
import {
  CONTROLLABLE_PAGES,
  isPageAccessAllowed,
  isRoleAllowedDashboardHref,
  normalizePageAccessMode,
  parsePageAccessPages,
} from "@/lib/nav-pages"

export const MAX_FAVORITE_PAGES = 2

export function parseFavorites(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is string => typeof x === "string" && x.startsWith("/dashboard"))
      .slice(0, MAX_FAVORITE_PAGES)
  } catch {
    return []
  }
}

export function allowedFavoriteHrefs(
  role: string,
  mode: ReturnType<typeof normalizePageAccessMode>,
  pages: string[]
): string[] {
  return CONTROLLABLE_PAGES.filter(
    (p) =>
      !p.locked &&
      isRoleAllowedDashboardHref(p.href, role) &&
      isPageAccessAllowed(p.href, role, mode, pages)
  ).map((p) => p.href)
}

export type UserFavoritesPayload = {
  favorites: string[]
  allowedPages: { title: string; href: string }[]
}

/** Load favorites for a user id — source of truth for all devices. */
export async function loadUserFavoritesPayload(
  userId: string
): Promise<
  | { ok: true; payload: UserFavoritesPayload }
  | { ok: false; status: 403 | 404; error: string }
> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      favoritePages: true,
      pageAccessMode: true,
      pageAccessPages: true,
      role: true,
      isActive: true,
    },
  })
  if (!user) return { ok: false, status: 404, error: "User not found" }
  if (!user.isActive) return { ok: false, status: 403, error: "Account deactivated" }

  const mode = normalizePageAccessMode(user.pageAccessMode)
  const acl = parsePageAccessPages(user.pageAccessPages)
  const allowed = allowedFavoriteHrefs(user.role, mode, acl)
  const favorites = parseFavorites(user.favoritePages).filter((h) => allowed.includes(h))

  return {
    ok: true,
    payload: {
      favorites,
      allowedPages: CONTROLLABLE_PAGES.filter((p) => allowed.includes(p.href)).map((p) => ({
        title: p.title,
        href: p.href,
      })),
    },
  }
}

/** Persist favorites for a user (role + page ACL filtered). */
export async function saveUserFavorites(
  userId: string,
  incoming: unknown[]
): Promise<
  | { ok: true; favorites: string[] }
  | { ok: false; status: 400 | 403 | 404; error: string }
> {
  if (incoming.length > MAX_FAVORITE_PAGES) {
    return { ok: false, status: 400, error: "Maximum 2 favorite pages" }
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      pageAccessMode: true,
      pageAccessPages: true,
      role: true,
      isActive: true,
    },
  })
  if (!user) return { ok: false, status: 404, error: "User not found" }
  if (!user.isActive) return { ok: false, status: 403, error: "Account deactivated" }

  const mode = normalizePageAccessMode(user.pageAccessMode)
  const acl = parsePageAccessPages(user.pageAccessPages)
  const allowed = new Set(allowedFavoriteHrefs(user.role, mode, acl))
  const favorites = incoming
    .filter((x): x is string => typeof x === "string" && allowed.has(x))
    .slice(0, MAX_FAVORITE_PAGES)

  await db.user.update({
    where: { id: userId },
    data: { favoritePages: JSON.stringify(favorites) },
  })

  return { ok: true, favorites }
}

export const FAVORITES_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const
