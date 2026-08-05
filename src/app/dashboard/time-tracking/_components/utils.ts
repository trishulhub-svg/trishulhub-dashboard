import { safeNumber } from "@/lib/utils";
import { formatDisplayDate, formatDisplayDateWithWeekday, formatDisplayDateShort } from "@/lib/format";

export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getDateStr(d: Date): string {
  return toLocalDateStr(d);
}

export function formatTimeHHMM(isoStr?: string | null): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function formatAttTime(isoStr?: string | null): string {
  if (!isoStr) return "N/A";
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "N/A";
  }
}

export function formatAttDate(isoStr?: string | null): string {
  return formatDisplayDateWithWeekday(isoStr, "N/A");
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationShort(ms: number): string {
  if (ms < 0) return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatHours(hours: number | null | undefined): string {
  const hVal = safeNumber(hours, 0);
  if (!hVal) return "0h 0m";
  const h = Math.floor(hVal);
  const m = Math.round((hVal - h) * 60);
  return `${h}h ${m}m`;
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(dateStr: string): string {
  return formatDisplayDate(dateStr, dateStr);
}

/** Monday-start week containing `ref` (defaults to today). */
export function getWeekDays(ref: Date = new Date()): Date[] {
  const day = ref.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

export function shiftWeek(weekStart: Date, deltaWeeks: number): Date {
  const next = new Date(weekStart);
  next.setDate(weekStart.getDate() + deltaWeeks * 7);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatWeekLabel(weekDays: Date[]): string {
  if (weekDays.length < 7) return "";
  const start = weekDays[0];
  const end = weekDays[6];
  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = sameYear
    ? formatDisplayDateShort(start)
    : formatDisplayDate(start);
  const endFmt = formatDisplayDate(end);
  return `${startFmt} – ${endFmt}`;
}

export function toDatetimeLocal(isoStr: string): string {
  const d = new Date(isoStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDatetimeLocal(localStr: string): string {
  return new Date(localStr).toISOString();
}

export function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

export type DateRangeBounds = { from: string; to: string };

/** Inclusive last 7 local calendar days (today − 6 … today). */
export function rangeLast7Days(ref: Date = new Date()): DateRangeBounds {
  const to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const from = new Date(to);
  from.setDate(to.getDate() - 6);
  return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
}

/** Monday–Sunday week containing `ref`. */
export function rangeThisWeek(ref: Date = new Date()): DateRangeBounds {
  const days = getWeekDays(ref);
  return { from: toLocalDateStr(days[0]), to: toLocalDateStr(days[6]) };
}

/** Previous Monday–Sunday week. */
export function rangeLastWeek(ref: Date = new Date()): DateRangeBounds {
  const thisWeek = getWeekDays(ref);
  const lastMonday = new Date(thisWeek[0]);
  lastMonday.setDate(lastMonday.getDate() - 7);
  return rangeThisWeek(lastMonday);
}

export function rangeForMonth(year: number, monthIndex0: number): DateRangeBounds {
  const from = new Date(year, monthIndex0, 1);
  const to = new Date(year, monthIndex0 + 1, 0);
  return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
}

export function rangeThisMonth(ref: Date = new Date()): DateRangeBounds {
  return rangeForMonth(ref.getFullYear(), ref.getMonth());
}

export function rangeLastMonth(ref: Date = new Date()): DateRangeBounds {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return rangeForMonth(d.getFullYear(), d.getMonth());
}

/** Inclusive last N local calendar days ending today. */
export function rangeLastNDays(n: number, ref: Date = new Date()): DateRangeBounds {
  const to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const from = new Date(to);
  from.setDate(to.getDate() - Math.max(1, n) + 1);
  return { from: toLocalDateStr(from), to: toLocalDateStr(to) };
}
