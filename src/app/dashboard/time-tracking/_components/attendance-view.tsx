"use client";

import { Calendar, Clock, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { safeNumber, safeText } from "@/lib/utils";
import type { AttendanceRecord, TeamUser } from "./types";
import { ATT_STATUS_COLORS } from "./types";
import { formatAttDate, formatAttTime } from "./utils";

interface AttendanceViewProps {
  records: AttendanceRecord[];
  loading: boolean;
  teamUsers: TeamUser[];
  dateFrom: string;
  dateTo: string;
  userFilter: string;
  stats: { total: number; present: number; absent: number; halfDay: number; leave: number };
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  onUserFilter: (v: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onAdd: () => void;
  onEdit: (record: AttendanceRecord) => void;
  onDelete: (id: string) => void;
}

export function AttendanceView({
  records,
  loading,
  teamUsers,
  dateFrom,
  dateTo,
  userFilter,
  stats,
  onDateFrom,
  onDateTo,
  onUserFilter,
  onClearFilters,
  onRefresh,
  onAdd,
  onEdit,
  onDelete,
}: AttendanceViewProps) {
  const hasFilters = !!(dateFrom || dateTo || userFilter !== "all");

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm sm:text-base font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Roster
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Attendance from time tracking and availability
          </p>
        </div>
        <Button size="sm" onClick={onAdd} className="h-9">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Record
        </Button>
      </div>

      {/* Compact stats strip — not 5 equal cards */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border px-3.5 py-2.5 bg-card/50 text-sm">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">Summary</span>
        <span className="tabular-nums">
          <span className="font-semibold">{stats.total}</span>
          <span className="text-muted-foreground text-xs ml-1">total</span>
        </span>
        <span className="text-border">·</span>
        <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
          <span className="font-semibold">{stats.present}</span>
          <span className="text-xs ml-1 opacity-80">present</span>
        </span>
        <span className="tabular-nums text-red-600 dark:text-red-400">
          <span className="font-semibold">{stats.absent}</span>
          <span className="text-xs ml-1 opacity-80">absent</span>
        </span>
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          <span className="font-semibold">{stats.halfDay}</span>
          <span className="text-xs ml-1 opacity-80">half</span>
        </span>
        <span className="tabular-nums text-sky-700 dark:text-sky-400">
          <span className="font-semibold">{stats.leave}</span>
          <span className="text-xs ml-1 opacity-80">leave</span>
        </span>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => onDateTo(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Employee</Label>
            <Select value={userFilter} onValueChange={onUserFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {safeText(u.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onClearFilters}>
                Clear
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading attendance...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-11 w-11 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No attendance records found</p>
            <p className="text-xs mt-1">Adjust filters or add a manual record</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {records.map((record) => {
              const required = safeNumber(record.requiredHours);
              const worked = safeNumber(record.workedHours);
              return (
                <div
                  key={record.id}
                  className="flex items-center justify-between gap-2 sm:gap-3 px-3.5 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={record.user?.avatar || ""} alt={safeText(record.user?.name)} />
                      <AvatarFallback className="text-[10px]">
                        {safeText(record.user?.name, "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs sm:text-sm font-medium truncate">
                          {safeText(record.user?.name, "Unknown")}
                        </p>
                        {record.isManual && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            Manual
                          </Badge>
                        )}
                        <Badge className={`text-[10px] ${ATT_STATUS_COLORS[record.status] || ""}`}>
                          {safeText(record.status, "").replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                        {formatAttDate(record.date)}
                        {record.checkIn && <span> · In: {formatAttTime(record.checkIn)}</span>}
                        {record.checkOut && <span> · Out: {formatAttTime(record.checkOut)}</span>}
                      </p>
                      {required > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 max-w-[150px] sm:max-w-[200px]">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  worked >= required
                                    ? "bg-emerald-500"
                                    : worked >= required * 0.5
                                      ? "bg-amber-500"
                                      : "bg-red-400"
                                }`}
                                style={{ width: `${Math.min(100, (worked / required) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums">
                            {worked}h / {required}h
                          </span>
                        </div>
                      )}
                      {record.notes && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 truncate max-w-[200px] sm:max-w-[400px]">
                          {safeText(record.notes)}
                        </p>
                      )}
                    </div>
                  </div>
                  {record.isManual && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        aria-label="Edit attendance"
                        onClick={() => onEdit(record)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label="Delete attendance"
                        onClick={() => onDelete(record.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
