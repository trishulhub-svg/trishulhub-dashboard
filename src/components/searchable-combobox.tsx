"use client"

import { useMemo, useRef } from "react"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type ComboboxOption = {
  id: string
  label: string
}

type SearchableComboboxProps = {
  valueId: string
  search: string
  onSearchChange: (value: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ComboboxOption[]
  onSelect: (option: ComboboxOption) => void
  placeholder?: string
  emptyLabel?: string
  recentHint?: string
  recentLimit?: number
  leadingOption?: ComboboxOption
  className?: string
  inputClassName?: string
}

/**
 * Searchable select that portals its list (Radix Popover) so scrolling
 * the options does not scroll a parent dialog/form.
 */
export function SearchableCombobox({
  valueId,
  search,
  onSearchChange,
  open,
  onOpenChange,
  options,
  onSelect,
  placeholder = "Search...",
  emptyLabel = "No results found",
  recentHint = "Recent",
  recentLimit = 10,
  leadingOption,
  className,
  inputClassName,
}: SearchableComboboxProps) {
  const anchorRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options.slice(0, recentLimit)
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search, recentLimit])

  const showRecentHint = !search.trim() && options.length > 0

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative w-full", className)}>
          <input
            type="text"
            className={cn(
              "w-full rounded border bg-background px-3 py-2 pr-8 text-sm",
              inputClassName
            )}
            placeholder={placeholder}
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value)
              onOpenChange(true)
            }}
            onFocus={() => onOpenChange(true)}
            autoComplete="off"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => onOpenChange(!open)}
            aria-label="Toggle options"
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[100] max-h-48 w-[var(--radix-popover-trigger-width)] overflow-y-auto overscroll-contain p-0"
        style={{
          width: anchorRef.current?.offsetWidth
            ? `${anchorRef.current.offsetWidth}px`
            : undefined,
        }}
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {filtered.length === 0 && !leadingOption ? (
          <p className="p-2 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            {showRecentHint && (
              <p className="p-2 text-xs font-medium text-muted-foreground">{recentHint}</p>
            )}
            {leadingOption && (
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                  valueId === leadingOption.id && "bg-muted"
                )}
                onClick={() => {
                  onSelect(leadingOption)
                  onOpenChange(false)
                }}
              >
                {leadingOption.label}
              </button>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                  valueId === opt.id && "bg-muted"
                )}
                onClick={() => {
                  onSelect(opt)
                  onOpenChange(false)
                }}
              >
                {opt.label}
              </button>
            ))}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
