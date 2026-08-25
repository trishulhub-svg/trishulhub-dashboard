"use client"

import React from "react"
import { Info, Zap, MoonStar, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DeepSeekPricingState } from "@/lib/deepseek-pricing"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type Props = {
  state: DeepSeekPricingState
  variant?: "standard" | "compact"
  className?: string
}

/**
 * DeepSeek Peak/Off-Peak status — clickable pill that opens a detail popover.
 * Same state object drives both variants (single source of truth).
 */
export const DeepSeekPricingBadge = React.memo(function DeepSeekPricingBadge({
  state,
  variant = "standard",
  className,
}: Props) {
  const peak = state.status === "peak"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${state.display.statusLabel}. ${state.display.recommendation}`}
          className={cn(
            "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            peak
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15",
            className
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              peak ? "bg-amber-500" : "bg-emerald-500",
              state.isWeekend ? "opacity-70" : "animate-pulse"
            )}
          />
          {variant === "compact" ? (
            <>
              <span className="whitespace-nowrap">
                {peak ? "DeepSeek Peak" : "DeepSeek Off-Peak"}
              </span>
              <span className="whitespace-nowrap opacity-75 tabular-nums">
                {state.isWeekend
                  ? "weekend"
                  : peak
                    ? `off-peak in ${state.display.countdown}`
                    : `ends in ${state.display.countdown}`}
              </span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">{state.display.statusLabel}</span>
              <span className="hidden whitespace-nowrap opacity-75 tabular-nums sm:inline">
                {state.isWeekend
                  ? "· weekend off-peak"
                  : peak
                    ? `· off-peak in ${state.display.countdown}`
                    : `· ${state.display.countdown} left`}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {peak ? (
                <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <MoonStar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              )}
              <div>
                <p className="text-sm font-semibold">{state.display.statusLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {peak ? "Higher-cost API period (2× peak rate)" : "Lower-cost API period (standard rate)"}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                peak
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              )}
            >
              {peak ? "2× rate" : "Standard"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {state.display.transitionLabel}
              </p>
              <p className="mt-0.5 font-semibold tabular-nums">
                {state.isWeekend
                  ? state.display.countdown
                  : state.display.countdown}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {state.isWeekend ? "Next peak" : "Next transition"}
              </p>
              <p className="mt-0.5 font-semibold">
                {state.display.transitionWeekday} · {state.display.transitionLocalTime}
              </p>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Your timezone</span>
              <span className="font-medium">{state.display.userTimezoneLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">DeepSeek billing timezone</span>
              <span className="font-medium">{state.display.billingTimezoneLabel}</span>
            </div>
          </div>

          <p className="rounded-lg border bg-muted/30 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            {state.isWeekend
              ? "DeepSeek applies off-peak pricing throughout Saturday and Sunday."
              : state.display.recommendation}
          </p>

          <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              DeepSeek uses Beijing Time for API peak pricing. TrishulHub converts these periods to your
              local timezone automatically. Weekends are off-peak all day.
            </span>
          </div>

          {state.isWeekend && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                Next peak begins {state.display.transitionWeekday} at{" "}
                {state.display.transitionLocalTime} ({state.display.userTimezoneLabel})
              </span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
