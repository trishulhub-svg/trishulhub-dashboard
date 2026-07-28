"use client";

import { Loader2, StopCircle, Radio } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { safeText } from "@/lib/utils";
import type { TimeEntry } from "./types";
import { formatDuration, formatTime } from "./utils";

interface RunningSessionsProps {
  entries: TimeEntry[];
  elapsedMap: Record<string, number>;
  endingEntryId: string | null;
  onEndSession: (entryId: string) => void;
}

function sourceMeta(entry: TimeEntry): { label: string; className: string } {
  const isOtp = entry.source === "AGENT_OTP" || entry.clockInMethod === "OTP";
  if (entry.source === "ADMIN_OVERRIDE") {
    return {
      label: "Admin",
      className:
        "bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800",
    };
  }
  if (isOtp) {
    return {
      label: "OTP",
      className:
        "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800",
    };
  }
  return {
    label: "Manual",
    className:
      "bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  };
}

function activityLabel(entry: TimeEntry): string {
  if (entry.project?.name) return entry.project.name;
  if (entry.activityType === "TRAINING") return "Training";
  if (entry.activityType === "SUPERVISION") return "Supervision";
  if (entry.activityType === "HR_ADMIN") return "HR & Administration";
  if (entry.activityType === "RD_SA") return "R&D / SA";
  return "No project";
}

export function RunningSessions({
  entries,
  elapsedMap,
  endingEntryId,
  onEndSession,
}: RunningSessionsProps) {
  if (!entries.length) return null;

  return (
    <section className="rounded-xl border border-emerald-200/70 dark:border-emerald-800/40 bg-gradient-to-b from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-emerald-200/60 dark:border-emerald-800/40">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <Radio className="h-3.5 w-3.5 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Live sessions</h3>
          <p className="text-[11px] text-muted-foreground">
            Admins can end a session if someone forgot to clock out
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shrink-0"
        >
          {entries.length} live
        </Badge>
      </div>
      <div className="divide-y divide-border/80">
        {entries.map((entry) => {
          const isEnding = endingEntryId === entry.id;
          const meta = sourceMeta(entry);
          return (
            <div
              key={entry.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3.5 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="h-9 w-9 shrink-0 ring-2 ring-emerald-500/20">
                  <AvatarImage src={entry.user?.avatar || ""} alt={safeText(entry.user?.name)} />
                  <AvatarFallback className="text-xs">
                    {safeText(entry.user?.name, "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{safeText(entry.user?.name, "Unknown")}</p>
                    <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {safeText(activityLabel(entry), "No project")} · Since {formatTime(entry.clockIn)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end shrink-0 pl-12 sm:pl-0">
                <Badge
                  variant="outline"
                  className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-[11px] tabular-nums font-mono px-2.5"
                >
                  {formatDuration(elapsedMap[entry.id] || 0)}
                </Badge>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs gap-1.5 min-w-[88px]"
                  disabled={isEnding}
                  onClick={() => onEndSession(entry.id)}
                  aria-label={`End session for ${safeText(entry.user?.name, "user")}`}
                >
                  {isEnding ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Ending…
                    </>
                  ) : (
                    <>
                      <StopCircle className="h-3.5 w-3.5" />
                      End
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
