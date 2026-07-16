"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { resolveLearningPath } from "@/lib/learning-prefs"

/**
 * Smart Learning entry:
 * - Admin / Super Admin → QR management
 * - Staff → My Training (tour + assignments), unless they chose “Back to QR setup”
 */
export default function LearningGatePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated") {
      router.replace("/login")
      return
    }
    const target = resolveLearningPath(session?.user?.role)
    router.replace(target)
  }, [status, session?.user?.role, router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
