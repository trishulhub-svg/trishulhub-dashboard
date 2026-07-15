"use client"

import { PageHeader } from "@/components/page-header"
import { BookOpen } from "lucide-react"

export default function LearningPage() {
  return (
    <div className="th-page-enter space-y-6">
      <PageHeader
        title="Learning"
        description="Training and learning programs will live here."
        showBack={false}
      />
      <div className="rounded-xl border border-border bg-card p-10 sm:p-16 flex flex-col items-center justify-center text-center gap-3 min-h-[320px]">
        <div className="th-stat-icon">
          <BookOpen className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          This space is reserved for TrishulHub learning. We&apos;ll build it next.
        </p>
      </div>
    </div>
  )
}
