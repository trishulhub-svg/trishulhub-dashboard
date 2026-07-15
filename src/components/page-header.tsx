"use client"

import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { safeText } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
  showBack?: boolean
}

export function PageHeader({ title, description, children, showBack = true }: PageHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isHome = pathname === "/dashboard" || pathname === "/dashboard/"

  return (
    <div className="th-page-enter flex items-center justify-between flex-wrap gap-3 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {showBack && !isHome && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-2 shrink-0"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 border-l-[2.5px] border-primary pl-3">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {safeText(title, "")}
          </h1>
          {description && (
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 leading-relaxed">
              {safeText(description, "")}
            </p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}
