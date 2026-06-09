"use client"

import { useEffect, useState } from "react"

export function useSessionRole() {
  const [role, setRole] = useState<string>("DEVELOPER")
  const [userId, setUserId] = useState<string>("")
  const [userName, setUserName] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch("/api/auth/session", { credentials: "include" })
        if (res.ok) {
          const session = await res.json()
          if (session?.user) {
            setRole(session.user.role || "DEVELOPER")
            setUserId(session.user.id || "")
            setUserName(session.user.name || "")
          }
        }
      } catch {
        // silently fail — use defaults
      } finally {
        setLoading(false)
      }
    }
    fetchSession()
  }, [])

  return { role, userId, userName, loading, isAdmin: role === "SUPER_ADMIN" || role === "ADMIN" }
}
