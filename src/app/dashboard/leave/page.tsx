"use client"

import Link from "next/link"
import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

export default function LegacyLeavePage() {
  useEffect(() => {
    // Auto-redirect to the enhanced leaves page after a brief delay
    const timer = setTimeout(() => {
      window.location.href = "/dashboard/leaves"
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex items-center justify-center min-h-[50vh] p-8">
      <div className="max-w-md w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          <h2 className="text-lg font-semibold text-yellow-500">Page Deprecated</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          This page is deprecated and will be removed in a future update. You will be redirected automatically.
        </p>
        <Link
          href="/dashboard/leaves"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Leaves Page
        </Link>
      </div>
    </div>
  )
}
