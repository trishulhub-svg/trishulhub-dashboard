"use client"

import { useCallback, useEffect, useState } from "react"
import { haptic } from "@/lib/haptics"

const MODE_KEY = "th-nav-mode"
const POS_KEY = "th-nav-capsule-pos"
const CAPSULE_SIZE = 56
const EDGE = 8

export type CapsulePos = { x: number; y: number }

function storageKey(base: string, userId?: string) {
  return userId ? `${base}:${userId}` : base
}

function defaultPos(): CapsulePos {
  if (typeof window === "undefined") return { x: 12, y: 180 }
  const y = Math.max(
    EDGE + 64,
    Math.min(window.innerHeight - CAPSULE_SIZE - EDGE - 80, window.innerHeight * 0.42)
  )
  return { x: EDGE + 4, y }
}

function clampPos(pos: CapsulePos): CapsulePos {
  if (typeof window === "undefined") return pos
  const maxX = Math.max(EDGE, window.innerWidth - CAPSULE_SIZE - EDGE)
  const maxY = Math.max(EDGE, window.innerHeight - CAPSULE_SIZE - EDGE)
  return {
    x: Math.min(maxX, Math.max(EDGE, pos.x)),
    y: Math.min(maxY, Math.max(EDGE, pos.y)),
  }
}

function readMode(userId?: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey(MODE_KEY, userId))
    if (raw === "capsule") return false
    if (raw === "open") return true
  } catch {
    /* ignore */
  }
  return true
}

function readPos(userId?: string): CapsulePos {
  try {
    const raw = localStorage.getItem(storageKey(POS_KEY, userId))
    if (raw) {
      const parsed = JSON.parse(raw) as CapsulePos
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
        return clampPos(parsed)
      }
    }
  } catch {
    /* ignore */
  }
  return clampPos(defaultPos())
}

export function useNavShell(userId?: string) {
  const [navOpen, setNavOpen] = useState(() =>
    typeof window === "undefined" ? true : readMode(userId)
  )
  const [capsulePos, setCapsulePos] = useState<CapsulePos>(() =>
    typeof window === "undefined" ? defaultPos() : readPos(userId)
  )
  const [prevUserId, setPrevUserId] = useState<string | undefined>(userId)

  // Sync nav mode/position from storage when the signed-in user becomes known.
  if (typeof window !== "undefined" && userId && userId !== prevUserId) {
    setPrevUserId(userId)
    try {
      const scoped = localStorage.getItem(storageKey(MODE_KEY, userId))
      const legacy = localStorage.getItem(MODE_KEY)
      const mode =
        scoped === "open" || scoped === "capsule"
          ? scoped
          : legacy === "open" || legacy === "capsule"
            ? legacy
            : null
      if (mode) setNavOpen(mode === "open")
      setCapsulePos(readPos(userId))
    } catch {
      /* ignore */
    }
  }

  // Migrate legacy storage to the per-user key (side effect only).
  useEffect(() => {
    if (!userId) return
    try {
      const legacy = localStorage.getItem(MODE_KEY)
      if (
        (legacy === "capsule" || legacy === "open") &&
        !localStorage.getItem(storageKey(MODE_KEY, userId))
      ) {
        localStorage.setItem(storageKey(MODE_KEY, userId), legacy)
      }
    } catch {
      /* ignore */
    }
  }, [userId])

  useEffect(() => {
    const onResize = () => setCapsulePos((p) => clampPos(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const persistMode = useCallback(
    (open: boolean) => {
      try {
        localStorage.setItem(storageKey(MODE_KEY, userId), open ? "open" : "capsule")
      } catch {
        /* ignore */
      }
    },
    [userId]
  )

  const persistPos = useCallback(
    (pos: CapsulePos) => {
      const next = clampPos(pos)
      try {
        localStorage.setItem(storageKey(POS_KEY, userId), JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    },
    [userId]
  )

  const openDock = useCallback(() => {
    setNavOpen(true)
    persistMode(true)
    haptic("select")
  }, [persistMode])

  const stowCapsule = useCallback(() => {
    setNavOpen(false)
    persistMode(false)
    haptic("tap")
  }, [persistMode])

  const moveCapsule = useCallback(
    (pos: CapsulePos) => {
      const next = persistPos(pos)
      setCapsulePos(next)
      haptic("drop")
    },
    [persistPos]
  )

  return {
    navOpen,
    capsulePos,
    openDock,
    stowCapsule,
    moveCapsule,
    capsuleSize: CAPSULE_SIZE,
  }
}
