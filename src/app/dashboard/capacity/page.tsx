"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, safeText } from "@/lib/utils";
import { toast } from "sonner";

interface TeamUser {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

interface AvailabilityRow {
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

interface DateRangeRow {
  userId: string;
  startDate: string;
  endDate: string;
  isAvailable: boolean;
  reason?: string | null;
}

interface ProjectRow {
  id: string;
  status: string;
}

interface MemberRow {
  userId: string;
  projectId: string;
}

type CapacityStatus = "Available" | "Busy" | "Off";

const ACTIVE_PROJECT_STATUSES = new Set(["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL"]);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusChip: Record<CapacityStatus, string> = {
  Available: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Busy: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Off: "bg-muted text-muted-foreground",
};

function getWeekBounds(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const label = `${start.toLocaleDateString([], { month: "short", day: "numeric" })} – ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  return { start, end, label };
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function summarizeAvailability(userId: string, slots: AvailabilityRow[]): string {
  const userSlots = slots.filter((s) => s.userId === userId && s.isAvailable);
  if (userSlots.length === 0) return "No schedule";
  const byDay = new Map<number, string[]>();
  for (const s of userSlots) {
    const list = byDay.get(s.dayOfWeek) || [];
    list.push(`${s.startTime}–${s.endTime}`);
    byDay.set(s.dayOfWeek, list);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (days.length >= 5 && days.every((d) => d >= 1 && d <= 5)) {
    const times = byDay.get(days[0])?.[0];
    if (times && days.every((d) => byDay.get(d)?.[0] === times)) {
      return `Mon–Fri ${times}`;
    }
  }
  return days.map((d) => `${DAY_LABELS[d]} ${(byDay.get(d) || []).join(", ")}`).join(" · ");
}

function isOffThisWeek(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
  slots: AvailabilityRow[],
  dateRanges: DateRangeRow[]
): boolean {
  const unavailableRange = dateRanges.find(
    (r) =>
      r.userId === userId &&
      !r.isAvailable &&
      rangesOverlap(new Date(r.startDate), new Date(r.endDate), weekStart, weekEnd)
  );
  if (unavailableRange) return true;

  const availableDays = new Set(
    slots.filter((s) => s.userId === userId && s.isAvailable).map((s) => s.dayOfWeek)
  );
  // Weekdays Mon–Fri with zero scheduled availability
  const weekdays = [1, 2, 3, 4, 5];
  const hasWeekdaySlots = weekdays.some((d) => availableDays.has(d));
  const hasAnySlots = slots.some((s) => s.userId === userId);
  return hasAnySlots && !hasWeekdaySlots;
}

function deriveStatus(off: boolean, projectCount: number): CapacityStatus {
  if (off) return "Off";
  if (projectCount >= 1) return "Busy";
  return "Available";
}

export default function CapacityPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    Array<{
      user: TeamUser;
      projectCount: number;
      availability: string;
      status: CapacityStatus;
    }>
  >([]);

  const week = useMemo(() => getWeekBounds(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, availRes, rangesRes, projectsRes] = await Promise.all([
        fetch("/api/team?type=users", { credentials: "include" }),
        fetch("/api/availability", { credentials: "include" }),
        fetch("/api/availability/date-ranges", { credentials: "include" }),
        fetch("/api/projects?limit=200", { credentials: "include" }),
      ]);

      if (!usersRes.ok) throw new Error("Failed to load team");
      const users = (await usersRes.json()) as TeamUser[];
      const activeUsers = users.filter((u) => u.isActive);

      const availPayload = availRes.ok ? await availRes.json() : { data: [] };
      const slots = (availPayload.data || []) as AvailabilityRow[];

      const rangesPayload = rangesRes.ok ? await rangesRes.json() : { dateRanges: [] };
      const dateRanges = (rangesPayload.dateRanges || []) as DateRangeRow[];

      const projects = projectsRes.ok ? ((await projectsRes.json()) as ProjectRow[]) : [];
      const activeProjects = projects.filter((p) => ACTIVE_PROJECT_STATUSES.has(p.status));

      const memberLists = await Promise.all(
        activeProjects.map(async (p) => {
          const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}/members`, {
            credentials: "include",
          });
          if (!res.ok) return [] as MemberRow[];
          return (await res.json()) as MemberRow[];
        })
      );

      const projectCountByUser = new Map<string, number>();
      for (const members of memberLists) {
        for (const m of members) {
          projectCountByUser.set(m.userId, (projectCountByUser.get(m.userId) || 0) + 1);
        }
      }

      const built = activeUsers.map((user) => {
        const projectCount = projectCountByUser.get(user.id) || 0;
        const off = isOffThisWeek(user.id, week.start, week.end, slots, dateRanges);
        return {
          user,
          projectCount,
          availability: summarizeAvailability(user.id, slots),
          status: deriveStatus(off, projectCount),
        };
      });

      built.sort((a, b) => a.user.name.localeCompare(b.user.name));
      setRows(built);
    } catch {
      toast.error("Failed to load capacity data");
    } finally {
      setLoading(false);
    }
  }, [week.start, week.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const available = rows.filter((r) => r.status === "Available").length;
    const busy = rows.filter((r) => r.status === "Busy").length;
    const off = rows.filter((r) => r.status === "Off").length;
    return { available, busy, off };
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 th-page-enter">
      <PageHeader
        title="Resource Capacity"
        description={`Team availability vs active projects · ${week.label}`}
      >
        <Button size="sm" variant="outline" onClick={() => void fetchData()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </PageHeader>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Available <strong className="font-semibold">{summary.available}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Busy <strong className="font-semibold">{summary.busy}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          Off <strong className="font-semibold">{summary.off}</strong>
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Person</TableHead>
              <TableHead className="hidden sm:table-cell">Role</TableHead>
              <TableHead className="text-center">Projects</TableHead>
              <TableHead className="hidden md:table-cell">Availability</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No team members found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.user.id}>
                  <TableCell className="font-medium">{safeText(row.user.name)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                    {row.user.role.replace("_", " ")}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{row.projectCount}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[240px] truncate">
                    {row.availability}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("text-[10px]", statusChip[row.status])}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
