export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string | null;
  description: string | null;
  status: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  date: string;
  source?: string | null;
  agentSessionId?: string | null;
  clockInMethod?: string | null;
  clockOutMethod?: string | null;
  user?: { id: string; name: string; email: string; avatar?: string | null; role?: string };
  project?: { id: string; name: string } | null;
}

export interface Project {
  id: string;
  name: string;
  status: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  notes?: string | null;
  isManual?: boolean;
  requiredHours?: number | null;
  workedHours?: number | null;
  user?: { id: string; name: string; email: string; role: string; avatar?: string | null };
}

export interface AnalyticsData {
  type: string;
  startDate: string;
  endDate: string;
  data: Array<{
    userId?: string;
    name?: string;
    projectId?: string;
    projectName?: string;
    totalHours: number;
    entries?: number;
    contributorCount?: number;
  }>;
  totalHours: number;
}

export interface TeamUser {
  id: string;
  name: string;
}

export type TimeTrackingTab = "today" | "timesheet" | "insights" | "attendance";

export const ATT_STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  HALF_DAY: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  LEAVE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  NO_SCHEDULE: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const BAR_COLORS = [
  "bg-teal-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-cyan-600",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-slate-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-500",
] as const;
