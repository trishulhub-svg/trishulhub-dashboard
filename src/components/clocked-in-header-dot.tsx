"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn, safeText } from "@/lib/utils"
import { useClockedInStatus } from "@/hooks/use-clocked-in-status"

function formatElapsed(clockIn?: string): string {
  if (!clockIn) return ""
  const ms = Date.now() - new Date(clockIn).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m}m`
  return `${h}h ${m}m`
}

/**
 * Global header indicator — blinking red pulse when the signed-in user
 * has an ACTIVE time entry. Click opens confirm → Time Tracking.
 */
export function ClockedInHeaderDot({ enabled = true }: { enabled?: boolean }) {
  const router = useRouter()
  const { status } = useClockedInStatus(enabled)
  const [open, setOpen] = useState(false)

  if (!enabled || !status.active) return null

  const elapsed = formatElapsed(status.clockIn)
  const activity = safeText(status.label, "Clocked in")

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 rounded-full",
          "h-9 px-2.5 sm:px-3",
          "border border-rose-500/35 bg-rose-500/10",
          "hover:bg-rose-500/15 hover:border-rose-500/50",
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40",
          "animate-[clock-in-glow_2.4s_ease-in-out_infinite]"
        )}
        aria-label="You are clocked in. Open Time Tracking?"
        title={`Clocked in${activity ? `: ${activity}` : ""}${elapsed ? ` · ${elapsed}` : ""}`}
      >
        <span className="relative flex h-3 w-3 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600 shadow-[0_0_8px_rgba(225,29,72,0.65)]" />
        </span>
        <span className="hidden sm:inline text-[11px] font-semibold tracking-wide text-rose-700 dark:text-rose-300">
          Clocked in
          {elapsed ? <span className="font-normal opacity-80"> · {elapsed}</span> : null}
        </span>
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-600" />
              </span>
              You are clocked in
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm">
              <span className="block">
                Open Time Tracking to clock out, switch activity, or review your session?
              </span>
              {(activity || elapsed) && (
                <span className="block rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {activity}
                  </span>
                  {elapsed ? (
                    <span className="mt-0.5 block text-muted-foreground">Running {elapsed}</span>
                  ) : null}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => {
                setOpen(false)
                router.push("/dashboard/time-tracking?tab=today")
              }}
            >
              Yes, open Time Tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
