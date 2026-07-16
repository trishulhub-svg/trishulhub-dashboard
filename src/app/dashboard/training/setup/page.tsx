"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

/** Legacy /dashboard/training/setup → My Training */
export default function TrainingSetupRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/dashboard/training/my")
  }, [router])
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
