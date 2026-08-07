"use client";

import { SelectItem } from "@/components/ui/select";
import { safeText, cn } from "@/lib/utils";
import {
  WorkPriorityBadge,
  compareProjectsByWorkPriority,
} from "@/components/dashboard/projects/work-priority-badge";
import type { Project, TimeActivityItem } from "./types";

/** Amber ping — assigned work that needs attention. */
export function WorkDot({ title }: { title?: string }) {
  return (
    <span
      className="relative inline-flex h-2 w-2 shrink-0"
      title={title || "Assigned work needs attention"}
      aria-label={title || "Assigned work needs attention"}
    >
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
    </span>
  );
}

function ProjectOptionLabel({ project }: { project: Project }) {
  return (
    <span className="inline-flex items-center gap-2">
      {project.hasOpenAssignedMilestones && (
        <WorkDot title="Open milestones assigned to you" />
      )}
      <WorkPriorityBadge priority={project.workPriority} />
      <span>
        {safeText(project.name)}
        {project.status === "COMPLETED" ? " (completed)" : ""}
        {project.isDemo ? " · demo" : ""}
      </span>
    </span>
  );
}

/** Project options only (assigned projects / milestones unchanged). */
export function ProjectSelectItems({ projects }: { projects: Project[] }) {
  const sorted = [...projects].sort(compareProjectsByWorkPriority);
  return (
    <>
      {sorted.length === 0 ? (
        <SelectItem value="__no_projects__" disabled>
          No assigned projects
        </SelectItem>
      ) : (
        sorted.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <ProjectOptionLabel project={p} />
          </SelectItem>
        ))
      )}
    </>
  );
}

/** Non-project activity options. Pass `badgeKeys` for yellow dots (e.g. TRAINING). */
export function NonProjectActivityItems({
  activities,
  badgeKeys,
}: {
  activities: TimeActivityItem[];
  badgeKeys?: Set<string> | string[];
}) {
  const badges =
    badgeKeys instanceof Set
      ? badgeKeys
      : new Set(Array.isArray(badgeKeys) ? badgeKeys : []);

  return (
    <>
      {activities.length === 0 ? (
        <SelectItem value="__no_activities__" disabled>
          No activities available for your role
        </SelectItem>
      ) : (
        activities.map((a) => (
          <SelectItem key={a.key} value={a.selectValue}>
            <span className="inline-flex items-center gap-2">
              {badges.has(a.key) && (
                <WorkDot
                  title={
                    a.key === "TRAINING"
                      ? "You have assigned training"
                      : "Assigned work on this activity"
                  }
                />
              )}
              <span>{safeText(a.label)}</span>
            </span>
          </SelectItem>
        ))
      )}
    </>
  );
}

/**
 * Flat list used by admin add/edit dialogs.
 * Projects keep milestone yellow dots; activities use badgeKeys.
 */
export function ActivitySelectItems({
  projects,
  activities,
  badgeKeys,
}: {
  projects: Project[];
  activities: TimeActivityItem[];
  badgeKeys?: Set<string> | string[];
}) {
  const sortedProjects = [...projects].sort(compareProjectsByWorkPriority);
  return (
    <>
      <SelectItem value="none">No activity</SelectItem>
      <NonProjectActivityItems activities={activities} badgeKeys={badgeKeys} />
      {sortedProjects.map((p) => (
        <SelectItem key={p.id} value={p.id}>
          <ProjectOptionLabel project={p} />
        </SelectItem>
      ))}
    </>
  );
}

export type ClockInKind = "project" | "activity";

/** Segmented Project | Activity control with optional yellow dots on each side. */
export function ClockInKindToggle({
  value,
  onChange,
  projectHasWork,
  activityHasWork,
}: {
  value: ClockInKind;
  onChange: (next: ClockInKind) => void;
  projectHasWork?: boolean;
  activityHasWork?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/70 bg-muted/30 p-1"
      role="tablist"
      aria-label="Select work type"
    >
      {(
        [
          { id: "project" as const, label: "Project", hasWork: !!projectHasWork },
          { id: "activity" as const, label: "Activity", hasWork: !!activityHasWork },
        ] as const
      ).map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
              active
                ? "bg-background text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.hasWork && <WorkDot title={`Assigned ${opt.label.toLowerCase()} work`} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
