"use client";

import { Clock, Timer, TrendingUp } from "lucide-react";
import { cn, safeText } from "@/lib/utils";
import { formatDuration, formatHours } from "./utils";

interface StatusStripProps {
  todayHours: number;
  weekHours: number;
  elapsedMs: number;
  isRunning: boolean;
  className?: string;
}

export function StatusStrip({
  todayHours,
  weekHours,
  elapsedMs,
  isRunning,
  className,
}: StatusStripProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card/60 px-3.5 py-2.5 sm:px-4",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="th-stat-icon shrink-0 !h-8 !w-8">
          <Timer className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
          <p className="text-sm font-semibold tabular-nums leading-tight">
            {safeText(formatHours(todayHours))}
          </p>
        </div>
      </div>

      <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />

      <div className="flex items-center gap-2 min-w-0">
        <div className="th-stat-icon shrink-0 !h-8 !w-8">
          <TrendingUp className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">This week</p>
          <p className="text-sm font-semibold tabular-nums leading-tight">
            {safeText(formatHours(weekHours))}
          </p>
        </div>
      </div>

      {isRunning && (
        <>
          <div className="hidden h-6 w-px bg-border sm:block" aria-hidden />
          <div className="flex items-center gap-2 min-w-0">
            <div className="th-stat-icon shrink-0 !h-8 !w-8 !bg-emerald-500/15 !text-emerald-600 dark:!text-emerald-400">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Live
              </p>
              <p className="text-sm font-semibold tabular-nums leading-tight text-emerald-700 dark:text-emerald-400">
                {formatDuration(elapsedMs)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
