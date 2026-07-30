"use client";

import { SelectItem } from "@/components/ui/select";
import { safeText } from "@/lib/utils";
import type { Project, TimeActivityItem } from "./types";

/** Project + non-project activity options. Project names are read-only from Projects. */
export function ActivitySelectItems({
  projects,
  activities,
}: {
  projects: Project[];
  activities: TimeActivityItem[];
}) {
  return (
    <>
      <SelectItem value="none">No activity</SelectItem>
      {activities.map((a) => (
        <SelectItem key={a.key} value={a.selectValue}>
          {safeText(a.label)}
        </SelectItem>
      ))}
      {projects.map((p) => (
        <SelectItem key={p.id} value={p.id}>
          <span className="inline-flex items-center gap-2">
            {p.hasOpenAssignedMilestones && (
              <span
                className="relative inline-flex h-2 w-2 shrink-0"
                title="Open milestones assigned to you"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
            )}
            <span>{safeText(p.name)}</span>
          </span>
        </SelectItem>
      ))}
    </>
  );
}
