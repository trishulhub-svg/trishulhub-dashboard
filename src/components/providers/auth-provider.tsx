"use client"

import { SessionProvider } from "next-auth/react"
import { useSessionManager } from "@/hooks/use-session-manager"

function SessionManagerWrapper({ children }: { children: React.ReactNode }) {
  useSessionManager()
  return <>{children}</>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionManagerWrapper>{children}</SessionManagerWrapper>
    </SessionProvider>
  )
}
