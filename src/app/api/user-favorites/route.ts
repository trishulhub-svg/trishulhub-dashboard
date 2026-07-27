/**
 * GET/PUT /api/user-favorites — up to 2 role-allowed favorite dashboard pages.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import {
  CONTROLLABLE_PAGES,
  isPageAccessAllowed,
  isRoleAllowedDashboardHref,
  normalizePageAccessMode,
  parsePageAccessPages,
} from "@/lib/nav-pages"

function parseFavorites(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === "string" && x.startsWith("/dashboard")).slice(0, 2)
  } catch {
    return []
  }
}

function allowedFavoriteHrefs(
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

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        favoritePages: true,
        pageAccessMode: true,
        pageAccessPages: true,
        role: true,
        isActive: true,
      },
    })
    if (!user?.isActive) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
    }
    const mode = normalizePageAccessMode(user.pageAccessMode)
    const acl = parsePageAccessPages(user.pageAccessPages)
    const allowed = allowedFavoriteHrefs(user.role, mode, acl)
    const favorites = parseFavorites(user.favoritePages).filter((h) => allowed.includes(h))
    return NextResponse.json({
      favorites,
      allowedPages: CONTROLLABLE_PAGES.filter((p) => allowed.includes(p.href)).map((p) => ({
        title: p.title,
        href: p.href,
      })),
    })
  } catch (e) {
    console.error("[user-favorites] GET", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const rl = rateLimit(
      `fav-${session.user.id}`,
      RATE_LIMITS.general.limit,
      RATE_LIMITS.general.windowMs
    )
    if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await req.json().catch(() => ({}))
    const incoming = Array.isArray(body?.favorites) ? body.favorites : []
    if (incoming.length > 2) {
      return NextResponse.json({ error: "Maximum 2 favorite pages" }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        pageAccessMode: true,
        pageAccessPages: true,
        role: true,
        isActive: true,
      },
    })
    if (!user?.isActive) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 })
    }
    const mode = normalizePageAccessMode(user.pageAccessMode)
    const acl = parsePageAccessPages(user.pageAccessPages)
    const allowed = new Set(allowedFavoriteHrefs(user.role, mode, acl))
    const favorites = incoming
      .filter((x: unknown): x is string => typeof x === "string" && allowed.has(x))
      .slice(0, 2)

    await db.user.update({
      where: { id: session.user.id },
      data: { favoritePages: JSON.stringify(favorites) },
    })
    return NextResponse.json({ favorites })
  } catch (e) {
    console.error("[user-favorites] PUT", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
