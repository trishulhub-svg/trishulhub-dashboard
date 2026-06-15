import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"

// ── In-memory presence store ──
// Keyed by userId — a user can only be present on one board at a time.
// The active/idle status is computed dynamically based on lastSeen, not stored.
type PresenceEntry = {
  userId: string
  userName: string
  projectId: string
  lastSeen: number
}

const presenceMap = new Map<string, PresenceEntry>()

const IDLE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes → "idle"
const CLEANUP_THRESHOLD_MS = 20 * 60 * 1000 // 20 minutes → removed entirely
const CLEANUP_INTERVAL_MS = 60 * 1000 // cleanup runs every 60s

// ── Periodic cleanup ──
// Removes entries where lastSeen > 20 minutes ago.
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [userId, entry] of presenceMap) {
      if (now - entry.lastSeen > CLEANUP_THRESHOLD_MS) {
        presenceMap.delete(userId)
      }
    }
    // Stop the timer if the map is empty to avoid wasting cycles
    if (presenceMap.size === 0) {
      if (cleanupTimer) clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, CLEANUP_INTERVAL_MS)

  // Allow the process to exit without waiting for the timer
  if (cleanupTimer.unref) cleanupTimer.unref()
}

// ── Auth guard ──
async function getSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session?.user?.name) {
    return null
  }
  return {
    userId: session.user.id,
    userName: session.user.name,
  }
}

// ── POST /api/board-presence ──
// Upserts presence. Body: { projectId: string }
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { projectId } = body

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      )
    }

    ensureCleanup()

    presenceMap.set(session.userId, {
      userId: session.userId,
      userName: session.userName,
      projectId,
      lastSeen: Date.now(),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }
}

// ── GET /api/board-presence?projectId=xxx ──
// Returns all users viewing the specified board (excluding the requester).
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get("projectId")
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required" },
      { status: 400 }
    )
  }

  const now = Date.now()
  const users: Array<{
    userId: string
    userName: string
    status: "active" | "idle"
    lastSeen: number
  }> = []

  for (const entry of presenceMap.values()) {
    // Only return users on the same board, excluding the requester
    if (entry.projectId !== projectId || entry.userId === session.userId) continue

    const elapsed = now - entry.lastSeen
    users.push({
      userId: entry.userId,
      userName: entry.userName,
      status: elapsed > IDLE_THRESHOLD_MS ? "idle" : "active",
      lastSeen: entry.lastSeen,
    })
  }

  return NextResponse.json({ users })
}

// ── DELETE /api/board-presence ──
// Removes presence for the current user.
export async function DELETE() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  presenceMap.delete(session.userId)

  return NextResponse.json({ ok: true })
}
