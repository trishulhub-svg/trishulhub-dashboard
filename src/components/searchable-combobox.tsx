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
  /** Default 3 — only show a few recent until the user searches */
  recentLimit?: number
  leadingOption?: ComboboxOption
  className?: string
  inputClassName?: string
}

/**
 * Searchable select that portals its list (Radix Popover) so scrolling
 * the options does not scroll a parent dialog/form.
 *
 * Browse mode: empty search OR search equals the selected label → recent N.
 * Typing anything else → smart filter across all options.
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
  recentLimit = 3,
  leadingOption,
  className,
  inputClassName,
}: SearchableComboboxProps) {
  const anchorRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => options.find((o) => o.id === valueId) || null,
    [options, valueId]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const selectedLabel = selected?.label.trim().toLowerCase() || ""
    // Re-opening after a selection: search still holds the label — treat as browse
    const browsing = !q || (selectedLabel && q === selectedLabel)
    if (browsing) {
      const recent = options.slice(0, recentLimit)
      if (selected && !recent.some((r) => r.id === selected.id)) {
        return [selected, ...recent].slice(0, recentLimit)
      }
      return recent
    }
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search, recentLimit, selected])

  const showRecentHint =
    (!search.trim() ||
      (!!selected && search.trim().toLowerCase() === selected.label.trim().toLowerCase())) &&
    options.length > 0

  const openBrowse = () => {
    // Clear filter so recent list shows when changing selection
    if (selected && search.trim().toLowerCase() === selected.label.trim().toLowerCase()) {
      onSearchChange("")
    }
    onOpenChange(true)
  }

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative w-full", className)}>
          <input
            type="text"
            className={cn(
              "w-full rounded border px-3 py-2 pr-8 text-sm",
              inputClassName
            )}
            placeholder={selected ? selected.label : placeholder}
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value)
              onOpenChange(true)
            }}
            onFocus={openBrowse}
            autoComplete="off"
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => {
              if (open) onOpenChange(false)
              else openBrowse()
            }}
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
        className="z-[40000] max-h-48 overflow-y-auto overscroll-contain p-0 pointer-events-auto"
        style={{
          width: anchorRef.current?.offsetWidth
            ? `${anchorRef.current.offsetWidth}px`
            : "var(--radix-popover-trigger-width)",
        }}
        onWheel={(e) => e.stopPropagation()}
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
