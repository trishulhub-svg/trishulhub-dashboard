"use client"

import { useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/** Docx Sign entry — admin → manage, staff → my. */
export default function DocxSignGatePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "loading") return
    if (status === "unauthenticated") {
      router.replace("/login")
      return
    }
    const role = session?.user?.role
    const admin = role === "SUPER_ADMIN" || role === "ADMIN"
    router.replace(admin ? "/dashboard/docx-sign/manage" : "/dashboard/docx-sign/my")
  }, [status, session?.user?.role, router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
