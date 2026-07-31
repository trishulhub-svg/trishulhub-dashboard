"use client";

import type { RefObject } from "react";
import { Clock, Pencil, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeNumber, safeText } from "@/lib/utils";
import type { Project, TimeActivityItem, TimeEntry, TrainingAssignment } from "./types";
import { entryActivityLabel } from "./types";
import { DAY_NAMES } from "./types";
import { formatHours, formatTime } from "./utils";
import { TimerHero } from "./timer-hero";
import { StatusStrip } from "./status-strip";
import { RunningSessions } from "./running-sessions";

interface WeeklyCell {
  day: Date;
  total: number;
  isToday: boolean;
}

interface TodayViewProps {
  timerRef: RefObject<HTMLDivElement | null>;
  activeEntry: TimeEntry | null;
  elapsed: number;
  projects: Project[];
  activities: TimeActivityItem[];
  activityLabels: Partial<Record<string, string>>;
  selectedProject: string;
  timerDescription: string;
  trainingAssignments: TrainingAssignment[];
  selectedTrainingAssignmentId: string;
  trainingAssignmentsLoading: boolean;
  starting: boolean;
  stopping: boolean;
  fromWorkspace: boolean;
  todayTotal: number;
  weekTotal: number;
  weeklyGrid: WeeklyCell[];
  todayEntries: TimeEntry[];
  isAdmin: boolean;
  activeEntries: TimeEntry[];
  activeElapsedMap: Record<string, number>;
  endingEntryId: string | null;
  onProjectChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onTrainingAssignmentChange: (v: string) => void;
  onStart: () => void;
  onSwitchClick: () => void;
  onClockOutClick: () => void;
  onViewDescription: (entry: TimeEntry) => void;
  onEditEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (id: string) => void;
  onEndSessionConfirm: (id: string) => void;
}

function sessionDetailLine(entry: TimeEntry): string {
  const notes = (entry.workNotes || "").trim();
  const desc = (entry.description || "").trim();
  const attended =
    notes
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^attended:/i.test(l)) ||
    desc
      .split("\n")
      .map((l) => l.trim())
      .find((l) => /^attended:/i.test(l));
  if (attended) return attended;
  if (notes) return notes;
  return desc || "—";
}

export function TodayView({
  timerRef,
  activeEntry,
  elapsed,
  projects,
  activities,
  activityLabels,
  selectedProject,
  timerDescription,
  trainingAssignments,
  selectedTrainingAssignmentId,
  trainingAssignmentsLoading,
  starting,
  stopping,
  fromWorkspace,
  todayTotal,
  weekTotal,
  weeklyGrid,
  todayEntries,
  isAdmin,
  activeEntries,
  activeElapsedMap,
  endingEntryId,
  onProjectChange,
  onDescriptionChange,
  onTrainingAssignmentChange,
  onStart,
  onSwitchClick,
  onClockOutClick,
  onViewDescription,
  onEditEntry,
  onDeleteEntry,
  onEndSessionConfirm,
}: TodayViewProps) {
  const weekSummary = weeklyGrid
    .map((c, i) => `${DAY_NAMES[i]} ${c.total > 0 ? formatHours(c.total) : "—"}`)
    .join(" · ");

  return (
    <div className="space-y-5 sm:space-y-6">
      <StatusStrip
        todayHours={todayTotal}
        weekHours={weekTotal}
        elapsedMs={elapsed}
        isRunning={!!activeEntry}
      />

      <TimerHero
        ref={timerRef}
        activeEntry={activeEntry}
        elapsed={elapsed}
        projects={projects}
        activities={activities}
        activityLabels={activityLabels}
        selectedProject={selectedProject}
        timerDescription={timerDescription}
        trainingAssignments={trainingAssignments}
        selectedTrainingAssignmentId={selectedTrainingAssignmentId}
        trainingAssignmentsLoading={trainingAssignmentsLoading}
        starting={starting}
        stopping={stopping}
        fromWorkspace={fromWorkspace}
        onProjectChange={onProjectChange}
        onDescriptionChange={onDescriptionChange}
        onTrainingAssignmentChange={onTrainingAssignmentChange}
        onStart={onStart}
        onSwitchClick={onSwitchClick}
        onClockOutClick={onClockOutClick}
      />

      {isAdmin && (
        <RunningSessions
          entries={activeEntries}
          elapsedMap={activeElapsedMap}
          endingEntryId={endingEntryId}
          onEndSession={onEndSessionConfirm}
        />
      )}

      <p className="text-xs sm:text-sm text-muted-foreground px-0.5 leading-relaxed">
        <span className="font-medium text-foreground/80">This week</span>
        <span className="mx-1.5 text-border">·</span>
        <span className="tabular-nums">{weekSummary}</span>
        <span className="mx-1.5 text-border">·</span>
        <span className="font-medium text-foreground tabular-nums">{formatHours(weekTotal)}</span>
      </p>

      <section className="rounded-xl border border-border overflow-hidden">
        <div className="px-3.5 py-3 border-b border-border flex items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Today&apos;s entries</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {todayEntries.length === 0
                ? "No completed entries yet"
                : isAdmin
                  ? `${todayEntries.length} completed · team view`
                  : `${todayEntries.length} completed`}
            </p>
          </div>
        </div>
        <div className="p-1 sm:p-2">
          {todayEntries.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Start a timer to begin tracking</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table aria-label="Today's time entries">
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead>Person</TableHead>}
                    <TableHead>Activity</TableHead>
                    <TableHead>Session details</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Duration</TableHead>
                    {isAdmin && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayEntries.map((entry) => {
                    const detail = sessionDetailLine(entry);
                    return (
                      <TableRow key={entry.id}>
                        {isAdmin && (
                          <TableCell className="min-w-[120px]">
                            <div className="flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {safeText(entry.user?.name, "Unknown")}
                                </p>
                                {entry.user?.role && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {entry.user.role.replace(/_/g, " ")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="space-y-1">
                            <Badge variant="outline" className="text-xs">
                              {safeText(entryActivityLabel(entry, activityLabels), "No Project")}
                            </Badge>
                            {entry.activityType && entry.activityType !== "PROJECT" && (
                              <p className="text-[10px] text-muted-foreground">
                                {entry.activityType.replace(/_/g, " ")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className="text-sm text-muted-foreground max-w-[220px] cursor-pointer hover:underline hover:text-foreground"
                          onClick={() => onViewDescription(entry)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") onViewDescription(entry);
                          }}
                          role="button"
                          title="View full session notes"
                        >
                          <span className="line-clamp-2">{safeText(detail, "—")}</span>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">
                          {formatTime(entry.clockIn)}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums whitespace-nowrap">
                          {entry.clockOut ? formatTime(entry.clockOut) : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium tabular-nums">
                          {formatHours(safeNumber(entry.totalHours))}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => onEditEntry(entry)}
                                aria-label="Edit time entry"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => onDeleteEntry(entry.id)}
                                aria-label="Delete time entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
