/**
 * GET/PUT /api/user-favorites — up to 2 role-allowed favorite dashboard pages.
 * Stored on the user account so the same favorites appear on every device / login.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { ensureCriticalSchema } from "@/lib/auto-migrate"
import {
  FAVORITES_NO_STORE_HEADERS,
  loadUserFavoritesPayload,
  saveUserFavorites,
} from "@/lib/user-favorites"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await ensureCriticalSchema()
    const result = await loadUserFavoritesPayload(session.user.id)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: FAVORITES_NO_STORE_HEADERS }
      )
    }
    return NextResponse.json(result.payload, { headers: FAVORITES_NO_STORE_HEADERS })
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

    await ensureCriticalSchema()
    const body = await req.json().catch(() => ({}))
    const incoming = Array.isArray(body?.favorites) ? body.favorites : []
    const result = await saveUserFavorites(session.user.id, incoming)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: FAVORITES_NO_STORE_HEADERS }
      )
    }
    return NextResponse.json(
      { favorites: result.favorites },
      { headers: FAVORITES_NO_STORE_HEADERS }
    )
  } catch (e) {
    console.error("[user-favorites] PUT", e)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
