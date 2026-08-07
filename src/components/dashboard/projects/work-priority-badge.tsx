import { cn } from "@/lib/utils"

/** Sort: workPriority 1 first, then 2…, then unset; stable by name. */
export function compareProjectsByWorkPriority(
  a: { workPriority?: number | null; name?: string | null },
  b: { workPriority?: number | null; name?: string | null }
): number {
  const pa = a.workPriority != null && a.workPriority >= 1 ? a.workPriority : null
  const pb = b.workPriority != null && b.workPriority >= 1 ? b.workPriority : null
  if (pa != null && pb != null && pa !== pb) return pa - pb
  if (pa != null && pb == null) return -1
  if (pa == null && pb != null) return 1
  return String(a.name || "").localeCompare(String(b.name || ""))
}

/** Compact priority chip shown next to yellow-dot assigned work. */
export function WorkPriorityBadge({
  priority,
  className,
}: {
  priority?: number | null
  className?: string
}) {
  if (priority == null || priority < 1) return null
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold tabular-nums",
        "bg-amber-500 text-white shadow-sm",
        className
      )}
      title={`Clock-in priority ${priority} (1 = highest)`}
      aria-label={`Work priority ${priority}`}
    >
      {priority}
    </span>
  )
}
