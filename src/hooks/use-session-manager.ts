"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useRef } from "react"

// ━━ Session Manager Hook ━━
// Handles:
// 1. Server-side session errors (SessionKicked → auto-signout)
// 2. Multi-device login enforcement (detects when kicked by 3rd device login)
//
// NOTE: Inactivity auto-logout has been removed.
// Users can stay logged in across devices (max 2 simultaneous).
// A 3rd login kicks the oldest device (FIFO).

export function useSessionManager() {
  const { data: session } = useSession()
  const hasSignedOutRef = useRef(false)

  // ── Server-Side Session Error Detection ──
  useEffect(() => {
    if (!session) return
    if (hasSignedOutRef.current) return

    const error = session.error
    if (error) {
      hasSignedOutRef.current = true

      if (error === "SessionKicked") {
        signOut({ callbackUrl: "/login?reason=kicked" }).catch((err) => {
          console.warn("[session-manager] signOut failed:", err)
          window.location.href = "/login?reason=kicked"
        })
      } else {
        signOut({ callbackUrl: "/login?reason=error" }).catch((err) => {
          console.warn("[session-manager] signOut failed:", err)
          window.location.href = "/login?reason=error"
        })
      }
    }
  }, [session])
}