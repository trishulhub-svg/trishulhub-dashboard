"use client"

import { useRouter, usePathname } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

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
    <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
      <div className="flex items-center gap-3">
        {showBack && !isHome && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -ml-2"
            onClick={() => router.back()}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
