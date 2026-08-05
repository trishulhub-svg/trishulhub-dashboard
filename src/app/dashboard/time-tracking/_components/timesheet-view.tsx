"use client";

import { ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { safeNumber, safeText } from "@/lib/utils";
import { formatDisplayDateWithWeekday } from "@/lib/format";
import type { Project, TeamUser, TimeEntry } from "./types";
import { entryActivityLabel } from "./types";
import { dayBounds, formatDate, formatHours, formatTime, formatWeekLabel, getDateStr, isSameDay } from "./utils";

interface TimesheetViewProps {
  weekDays: Date[];
  entries: TimeEntry[];
  loading: boolean;
  isAdmin: boolean;
  teamUsers: TeamUser[];
  projects: Project[];
  filterUser: string;
  filterProject: string;
  onFilterUser: (v: string) => void;
  onFilterProject: (v: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onExportCSV: () => void;
  onAddEntry: () => void;
  onViewDescription: (entry: TimeEntry) => void;
  onEditEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (id: string) => void;
  canGoNext: boolean;
}

export function TimesheetView({
  weekDays,
  entries,
  loading,
  isAdmin,
  teamUsers,
  filterUser,
  filterProject,
  projects,
  onFilterUser,
  onFilterProject,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onExportCSV,
  onAddEntry,
  onViewDescription,
  onEditEntry,
  onDeleteEntry,
  canGoNext,
}: TimesheetViewProps) {
  const today = new Date();
  const totalHours = entries.reduce((s, e) => s + safeNumber(e.totalHours), 0);

  const grouped = weekDays.map((day) => {
    const { start, end } = dayBounds(day);
    const dayEntries = entries
      .filter((e) => {
        const d = new Date(e.date);
        return d >= start && d < end;
      })
      .sort((a, b) => new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime());
    const dayTotal = dayEntries.reduce((s, e) => s + safeNumber(e.totalHours), 0);
    return { day, dayEntries, dayTotal, isToday: isSameDay(day, today) };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Week navigator */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={onPrevWeek} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 sm:flex-none sm:min-w-[200px] text-center px-1 sm:px-2">
            <p className="text-sm font-semibold tabular-nums">{formatWeekLabel(weekDays)}</p>
            <p className="text-[10px] text-muted-foreground">
              {getDateStr(weekDays[0])} → {getDateStr(weekDays[6])}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onNextWeek}
            disabled={!canGoNext}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-9 text-xs ml-1" onClick={onThisWeek}>
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums mr-auto sm:mr-0">
            {formatHours(totalHours)} total
          </span>
          {isAdmin && (
            <>
              <Button size="sm" onClick={onAddEntry} className="bg-emerald-600 hover:bg-emerald-700 text-white h-9">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Entry
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={onExportCSV} disabled={entries.length === 0}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                CSV
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Admin filters */}
      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border p-3 bg-card/40">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Employee</Label>
            <Select value={filterUser || "all"} onValueChange={onFilterUser}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {safeText(u.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Project</Label>
            <Select value={filterProject || "all"} onValueChange={onFilterProject}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {safeText(p.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Day-grouped entries */}
      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading timesheet...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No entries for this week</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map(({ day, dayEntries, dayTotal, isToday }) => {
              if (dayEntries.length === 0) return null;
              return (
                <div key={day.toISOString()}>
                  <div
                    className={`flex items-center justify-between px-3.5 py-2 bg-muted/25 ${
                      isToday ? "bg-primary/[0.06]" : ""
                    }`}
                  >
                    <p className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {formatDisplayDateWithWeekday(day)}
                      {isToday && <span className="ml-2 text-[10px] uppercase tracking-wide">Today</span>}
                    </p>
                    <p className="text-xs font-semibold tabular-nums">{formatHours(dayTotal)}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isAdmin && <TableHead>Employee</TableHead>}
                          <TableHead>Project</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>In</TableHead>
                          <TableHead>Out</TableHead>
                          <TableHead>Duration</TableHead>
                          {isAdmin && <TableHead className="w-20">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            {isAdmin && (
                              <TableCell className="text-sm font-medium">
                                {safeText(entry.user?.name, "Unknown")}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {safeText(entryActivityLabel(entry), "No Project")}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="text-sm text-muted-foreground max-w-[180px] truncate cursor-pointer hover:underline hover:text-foreground"
                              onClick={() => entry.description && onViewDescription(entry)}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && entry.description) onViewDescription(entry);
                              }}
                              role="button"
                            >
                              {safeText(entry.description, "—")}
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">{formatTime(entry.clockIn)}</TableCell>
                            <TableCell className="text-sm tabular-nums">
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
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Flat list fallback note for date display on empty days not needed */}
      {!loading && entries.length > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">
          Showing {entries.length} entr{entries.length === 1 ? "y" : "ies"} · {formatDate(getDateStr(weekDays[0]))} –{" "}
          {formatDate(getDateStr(weekDays[6]))}
        </p>
      )}
    </div>
  );
}
