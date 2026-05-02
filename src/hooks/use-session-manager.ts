"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useRef, useCallback } from "react"

// ━━ Session Manager Hook ━━
// Handles:
// 1. Client-side inactivity timeout (15 min no activity → auto-signout)
// 2. Server-side session errors (SessionKicked → auto-signout)
// 3. Single-device login enforcement (detects when another device logs in)

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds
const ACTIVITY_THROTTLE = 5000 // Throttle activity updates (5s)

// Activity events to track
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const

export function useSessionManager() {
  const { data: session, status } = useSession()
  const lastActivityRef = useRef(Date.now())
  const lastUpdateRef = useRef(Date.now())
  const hasSignedOutRef = useRef(false)

  // Track user activity with throttling
  const handleActivity = useCallback(() => {
    const now = Date.now()
    // Throttle: only update if 5s have passed since last update
    if (now - lastUpdateRef.current > ACTIVITY_THROTTLE) {
      lastActivityRef.current = now
      lastUpdateRef.current = now
    }
  }, [])

  // ── 1. Activity Tracking ──
  useEffect(() => {
    if (status !== "authenticated") return

    // Reset activity on mount
    lastActivityRef.current = Date.now()
    lastUpdateRef.current = Date.now()
    hasSignedOutRef.current = false

    const events = ACTIVITY_EVENTS
    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [status, handleActivity])

  // ── 2. Inactivity Check ──
  useEffect(() => {
    if (status !== "authenticated") return

    const interval = setInterval(() => {
      // Don't sign out multiple times
      if (hasSignedOutRef.current) return

      const inactiveTime = Date.now() - lastActivityRef.current
      if (inactiveTime > INACTIVITY_TIMEOUT) {
        hasSignedOutRef.current = true
        console.log("[session] Inactivity timeout — signing out")
        signOut({ callbackUrl: "/login?reason=timeout" })
      }
    }, CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [status])

  // ── 3. Server-Side Session Error Detection ──
  useEffect(() => {
    if (!session) return
    if (hasSignedOutRef.current) return

    const error = (session as any).error
    if (error) {
      hasSignedOutRef.current = true
      console.log("[session] Server session error:", error)

      if (error === "SessionKicked") {
        signOut({ callbackUrl: "/login?reason=kicked" })
      } else {
        signOut({ callbackUrl: "/login?reason=error" })
      }
    }
  }, [session])
}
