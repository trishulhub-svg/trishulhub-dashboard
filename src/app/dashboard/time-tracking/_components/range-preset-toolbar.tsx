"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  rangeForMonth,
  rangeLast7Days,
  rangeLastMonth,
  rangeLastWeek,
  rangeThisMonth,
  type DateRangeBounds,
} from "./utils";

export interface RangePresetToolbarProps {
  dateFrom: string;
  dateTo: string;
  onDateFrom: (v: string) => void;
  onDateTo: (v: string) => void;
  /** Apply a full from/to range (presets / month picker). */
  onApplyRange: (range: DateRangeBounds) => void;
  /** Show optional `<input type="month">` for calendar month jump. */
  showMonthPicker?: boolean;
  /** Extra controls rendered after the date inputs (e.g. employee filter). */
  children?: ReactNode;
  className?: string;
}

const PRESETS: { id: string; label: string; range: () => DateRangeBounds }[] = [
  { id: "last7", label: "Last 7 days", range: () => rangeLast7Days() },
  { id: "lastWeek", label: "Last week", range: () => rangeLastWeek() },
  { id: "thisMonth", label: "This month", range: () => rangeThisMonth() },
  { id: "lastMonth", label: "Last month", range: () => rangeLastMonth() },
];

function activePresetId(from: string, to: string): string | null {
  for (const p of PRESETS) {
    const r = p.range();
    if (r.from === from && r.to === to) return p.id;
  }
  return null;
}

export function RangePresetToolbar({
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  onApplyRange,
  showMonthPicker = true,
  children,
  className,
}: RangePresetToolbarProps) {
  const active = activePresetId(dateFrom, dateTo);
  const monthValue =
    dateFrom && dateFrom.slice(0, 7) === dateTo.slice(0, 7) ? dateFrom.slice(0, 7) : "";

  return (
    <div className={className ?? "rounded-xl border border-border p-3 space-y-3"}>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const selected = active === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onApplyRange(p.range())}
              className={`h-8 px-2.5 rounded-md text-xs font-medium border transition-colors ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFrom(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateTo(e.target.value)}
            className="h-9"
          />
        </div>
        {showMonthPicker && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const [y, m] = v.split("-").map(Number);
                if (!y || !m) return;
                onApplyRange(rangeForMonth(y, m - 1));
              }}
              className="h-9"
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
