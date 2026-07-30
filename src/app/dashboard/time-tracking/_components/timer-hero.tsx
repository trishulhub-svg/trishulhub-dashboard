"use client";

import { forwardRef } from "react";
import { Loader2, Play, Repeat2, StopCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, safeText } from "@/lib/utils";
import type { Project, TimeActivityItem, TimeEntry, TrainingAssignment } from "./types";
import { entryActivityLabel } from "./types";
import { formatDuration, formatDurationShort, formatTime } from "./utils";
import { ActivitySelectItems } from "./activity-select";

interface TimerHeroProps {
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
  onProjectChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTrainingAssignmentChange: (value: string) => void;
  onStart: () => void;
  onSwitchClick: () => void;
  onClockOutClick: () => void;
}

export const TimerHero = forwardRef<HTMLDivElement, TimerHeroProps>(function TimerHero(
  {
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
    onProjectChange,
    onDescriptionChange,
    onTrainingAssignmentChange,
    onStart,
    onSwitchClick,
    onClockOutClick,
  },
  ref
) {
  const isRunning = !!activeEntry;
  const trainingSelect =
    activities.find((a) => a.key === "TRAINING")?.selectValue || "__training__";
  const isTrainingSelected = selectedProject === trainingSelect;
  const startDisabled = starting || (isTrainingSelected && !selectedTrainingAssignmentId);

  const activeLabel = activeEntry
    ? entryActivityLabel(activeEntry, activityLabels)
    : "No activity";

  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border transition-shadow",
        "bg-card",
        isRunning && "border-emerald-500/35 shadow-[0_0_0_1px_rgba(16,185,129,0.06)]"
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 55% at 100% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 55%)",
        }}
      />

      <div className="relative p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              {isRunning ? "Session in progress" : "Ready to track"}
            </p>
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight mt-0.5">
              {isRunning ? "Timer running" : "Start your day"}
            </h2>
          </div>
          {fromWorkspace && !isRunning && (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 shrink-0"
            >
              Clock in to continue
            </Badge>
          )}
        </div>

        {isRunning && activeEntry ? (
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs"
                >
                  {safeText(activeLabel, "No activity")}
                </Badge>
              </div>
              <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                {formatDuration(elapsed)}
              </p>
              {activeEntry.description && (
                <p className="text-sm text-muted-foreground truncate max-w-xl">
                  {safeText(activeEntry.description)}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Started at {formatTime(activeEntry.clockIn)} · {formatDurationShort(elapsed)} elapsed
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base font-semibold w-full sm:w-auto"
                onClick={onSwitchClick}
                disabled={stopping}
              >
                <Repeat2 className="h-5 w-5 mr-2" />
                Switch
              </Button>
              <Button
                size="lg"
                variant="destructive"
                className="h-12 px-8 text-base font-semibold w-full sm:w-auto"
                onClick={onClockOutClick}
                disabled={stopping}
              >
                {stopping ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <StopCircle className="h-5 w-5 mr-2" />
                )}
                {stopping ? "Stopping..." : "Clock Out"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">Activity</Label>
                <Select value={selectedProject} onValueChange={onProjectChange}>
                  <SelectTrigger className="h-10 bg-background/80">
                    <SelectValue placeholder="Optional activity..." />
                  </SelectTrigger>
                  <SelectContent>
                    <ActivitySelectItems projects={projects} activities={activities} />
                  </SelectContent>
                </Select>
              </div>
              {isTrainingSelected && (
                <div>
                  <Label className="text-xs mb-1.5 block text-muted-foreground">
                    Assigned training
                  </Label>
                  <Select
                    value={selectedTrainingAssignmentId}
                    onValueChange={onTrainingAssignmentChange}
                    disabled={trainingAssignmentsLoading}
                  >
                    <SelectTrigger className="h-10 bg-background/80">
                      <SelectValue
                        placeholder={
                          trainingAssignmentsLoading
                            ? "Loading trainings..."
                            : "Select assigned training..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {trainingAssignments.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No assigned trainings available
                        </SelectItem>
                      ) : (
                        trainingAssignments.map((assignment) => (
                          <SelectItem key={assignment.id} value={assignment.id}>
                            {safeText(assignment.title)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs mb-1.5 block text-muted-foreground">Description</Label>
                <Input
                  placeholder="What are you working on?"
                  value={timerDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className="h-10 bg-background/80"
                />
              </div>
            </div>
            <Button
              size="lg"
              className="h-12 px-8 text-base font-semibold w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onStart}
              disabled={startDisabled}
            >
              {starting ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Play className="h-5 w-5 mr-2" />
              )}
              {starting ? "Starting..." : "Start"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});
