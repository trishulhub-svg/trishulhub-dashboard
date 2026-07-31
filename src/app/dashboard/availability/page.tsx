"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { safeArray, safeText } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";
import {
  Clock, Plus, Trash2, CalendarDays, AlertCircle, ChevronLeft, ChevronRight,
  CalendarClock, Edit3, RefreshCw, Users, CalendarRange, Copy, Filter,
  LayoutGrid, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface AvailabilityEntry {
  id: string;
  userId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  createdAt?: string;
  updatedAt?: string;
  user?: { id: string; name: string; email: string; role: string; avatar: string | null };
}

interface OverrideEntry {
  id: string;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: { id: string; name: string; email: string; avatar: string | null };
}

interface DateRangeEntry {
  id: string;
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm or null = all day
  endTime: string | null;
  isAvailable: boolean;
  reason: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: { id: string; name: string; email: string; avatar: string | null };
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
  avatar?: string | null;
}

interface WeekDayData {
  dayOfWeek: number;
  dayName: string;
  availability: { id: string; startTime: string; endTime: string; isAvailable: boolean; hours: number }[];
  override: { id: string; date: string; startTime: string | null; endTime: string | null; isAvailable: boolean; reason: string | null } | null;
  isOnLeave: boolean;
  totalHours: number;
}

interface WeekScheduleUser {
  user: { id: string; name: string; email: string; role: string; department: string | null; avatar: string | null };
  days: Record<string, WeekDayData>;
}

interface WeekSchedule {
  weekStart: string;
  weekEnd: string;
  totalUsers?: number;
  warning?: string;
  users: WeekScheduleUser[];
  dateRanges?: { id: string; userId: string; startDate: string; endDate: string; startTime: string | null; endTime: string | null; isAvailable: boolean; reason: string | null }[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(startDate: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getUserInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function slotHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 10) / 10;
}

// ─── Cell status type (for color coding) ──────────────────────────────────────

type CellStatus = "leave" | "unavailable" | "available" | "partial" | "notset";

function getCellStatus(dayData: WeekDayData | undefined): CellStatus {
  if (!dayData) return "notset";
  if (dayData.isOnLeave) return "leave";
  if (dayData.override && !dayData.override.isAvailable && dayData.availability.length === 0) return "unavailable";
  if (dayData.availability.length > 0) {
    // Partial = override exists OR fewer than 4 hours
    if (dayData.override || dayData.totalHours < 4) return "partial";
    return "available";
  }
  return "notset";
}

const CELL_BG: Record<CellStatus, string> = {
  leave: "bg-sky-50 dark:bg-sky-900/40 border-sky-200 dark:border-sky-700",
  unavailable: "bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700",
  available: "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700",
  partial: "bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700",
  notset: "bg-muted/20 border-border",
};

const CELL_TEXT: Record<CellStatus, string> = {
  leave: "text-sky-700 dark:text-sky-300",
  unavailable: "text-red-700 dark:text-red-300",
  available: "text-green-700 dark:text-green-300",
  partial: "text-amber-800 dark:text-amber-200",
  notset: "text-muted-foreground",
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading availability…</div>}>
      <AvailabilityPageInner />
    </Suspense>
  );
}

function AvailabilityPageInner() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  // canViewAvailability: SUPER_ADMIN, ADMIN, PROJECT_MANAGER can all VIEW the page.
  // PROJECT_MANAGER gets read-only access (mutation buttons hidden via isUserAdmin).
  const canViewAvailability = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "PROJECT_MANAGER";
  const isSessionLoading = status === "loading";

  // ── Core data ──
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [availabilities, setAvailabilities] = useState<AvailabilityEntry[]>([]);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [dateRanges, setDateRanges] = useState<DateRangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Active tab (persist) ──
  const [activeTab, setActiveTab] = useUrlState("tab", "overview");

  // ── Weekly Overview state ──
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekUserFilter, setWeekUserFilter] = useUrlState("user", "all");
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── My Schedule state ──
  const [schedUserId, setSchedUserId] = useState<string>("");

  // ── Day detail popup state ──
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    userId: string; userName: string; date: string; dayData: WeekDayData
  } | null>(null);
  const [dayDetailDialogOpen, setDayDetailDialogOpen] = useState(false);

  // ── Dialog states ──
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [dateRangeDialogOpen, setDateRangeDialogOpen] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityEntry | null>(null);
  const [editingOverride, setEditingOverride] = useState<OverrideEntry | null>(null);
  const [editingDateRange, setEditingDateRange] = useState<DateRangeEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Delete confirmation states ──
  const [deleteAvailId, setDeleteAvailId] = useState<string | null>(null);
  const [deleteOverrideId, setDeleteOverrideId] = useState<string | null>(null);
  const [deleteDateRangeId, setDeleteDateRangeId] = useState<string | null>(null);

  // ── Availability form state ──
  const [formUserId, setFormUserId] = useState("");
  const [formDayOfWeek, setFormDayOfWeek] = useState("1");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("17:00");
  const [formIsAvailable, setFormIsAvailable] = useState(true);

  // ── Override form state ──
  const [formOverrideUserId, setFormOverrideUserId] = useState("");
  const [formOverrideDate, setFormOverrideDate] = useState("");
  const [formOverrideStartTime, setFormOverrideStartTime] = useState("");
  const [formOverrideEndTime, setFormOverrideEndTime] = useState("");
  const [formOverrideIsAvailable, setFormOverrideIsAvailable] = useState(false);
  const [formOverrideReason, setFormOverrideReason] = useState("");

  // ── Date range form state ──
  const [formDateRangeUserId, setFormDateRangeUserId] = useState("");
  const [formDateRangeStartDate, setFormDateRangeStartDate] = useState("");
  const [formDateRangeEndDate, setFormDateRangeEndDate] = useState("");
  const [formDateRangeStartTime, setFormDateRangeStartTime] = useState("");
  const [formDateRangeEndTime, setFormDateRangeEndTime] = useState("");
  const [formDateRangeIsAvailable, setFormDateRangeIsAvailable] = useState(true);
  const [formDateRangeReason, setFormDateRangeReason] = useState("");

  // ── Calendar popover state ──
  const [dateRangeStartCalOpen, setDateRangeStartCalOpen] = useState(false);
  const [dateRangeEndCalOpen, setDateRangeEndCalOpen] = useState(false);
  const [overrideCalOpen, setOverrideCalOpen] = useState(false);

  // ── Copy dialog state ──
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySourceUserId, setCopySourceUserId] = useState("");
  const [copyMode, setCopyMode] = useState<"day" | "user" | "date" | "range">("day");
  const [copyTargetUserId, setCopyTargetUserId] = useState("");
  const [copySourceDay, setCopySourceDay] = useState<string>("1"); // Monday default
  const [copyTargetDay, setCopyTargetDay] = useState<string>("1");
  const [copyTargetDate, setCopyTargetDate] = useState("");
  const [copyTargetStartDate, setCopyTargetStartDate] = useState("");
  const [copyTargetEndDate, setCopyTargetEndDate] = useState("");
  const [copyCalOpen, setCopyCalOpen] = useState(false);
  const [copyStartCalOpen, setCopyStartCalOpen] = useState(false);
  const [copyEndCalOpen, setCopyEndCalOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  // ── Live users state (who's currently clocked in) ──
  const [liveUsers, setLiveUsers] = useState<Array<{ userId: string; name: string; projectName: string | null; clockInAt: string; elapsedSec: number }>>([]);
  const [now, setNow] = useState(Date.now());

  // ── Helper: find raw availability entry by id ──
  const findAvailEntry = useCallback((id: string) => {
    return availabilities.find((a) => a.id === id);
  }, [availabilities]);

  // ── Helper: construct AvailabilityEntry from schedule slot data ──
  const makeEntryFromSlot = useCallback((
    slot: { id: string; startTime: string; endTime: string; isAvailable: boolean },
    userId: string,
    dayOfWeek: number,
  ): AvailabilityEntry => ({
    id: slot.id,
    userId,
    dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    isAvailable: slot.isAvailable,
  }), []);

  // ── Helper: open day detail popup ──
  const openDayDetail = useCallback((userId: string, userName: string, date: string, dayData: WeekDayData) => {
    setSelectedDayDetail({ userId, userName, date, dayData });
    setDayDetailDialogOpen(true);
  }, []);

  // ── Helper: open quick-add availability with pre-filled user/day ──
  const openQuickAddSlot = useCallback((userId: string, dayOfWeek: number) => {
    setEditingAvailability(null);
    setFormUserId(userId);
    setFormDayOfWeek(dayOfWeek.toString());
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormIsAvailable(true);
    setAvailDialogOpen(true);
  }, []);

  // ── Helper: open quick-add override with pre-filled user/date ──
  const openQuickAddOverride = useCallback((userId: string, date: string) => {
    setEditingOverride(null);
    setFormOverrideUserId(userId);
    setFormOverrideDate(date);
    setFormOverrideStartTime("");
    setFormOverrideEndTime("");
    setFormOverrideIsAvailable(false);
    setFormOverrideReason("");
    setOverrideDialogOpen(true);
  }, []);

  // ── Helper: open copy dialog with source user (and optional source day) preset ──
  const openCopyDialog = useCallback((sourceUserId: string, sourceDayOfWeek?: number) => {
    setCopySourceUserId(sourceUserId);
    setCopyMode("day");
    setCopyTargetUserId(sourceUserId); // same person by default for day→day
    const day =
      typeof sourceDayOfWeek === "number" && sourceDayOfWeek >= 0 && sourceDayOfWeek <= 6
        ? String(sourceDayOfWeek)
        : "1";
    setCopySourceDay(day);
    setCopyTargetDay(String((Number(day) + 1) % 7)); // always suggest a different weekday
    setCopyTargetDate("");
    setCopyTargetStartDate("");
    setCopyTargetEndDate("");
    setCopyDialogOpen(true);
  }, []);

  // ── Computed values ──
  const currentWeekStart = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return getWeekStart(now);
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);

  const weekStartStr = formatDateOnly(currentWeekStart);
  const weekEndStr = formatDateOnly(weekDates[6]);
  const todayStr = formatDateOnly(new Date());

  // ── Data fetching ──
  const fetchCoreData = useCallback(async () => {
    try {
      const [availRes, overrideRes, dateRangeRes, teamRes] = await Promise.all([
        fetch("/api/availability", { credentials: "include" }),
        fetch("/api/availability/overrides", { credentials: "include" }),
        fetch("/api/availability/date-ranges", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
      ]);
      if (availRes.status === 401 || overrideRes.status === 401 || dateRangeRes.status === 401 || teamRes.status === 401) {
        router.push("/login");
        return;
      }
      if (availRes.ok) {
        const json = await availRes.json();
        setAvailabilities(safeArray<AvailabilityEntry>(json?.data ?? json));
      }
      if (overrideRes.ok) {
        const json = await overrideRes.json();
        setOverrides(safeArray<OverrideEntry>(json?.data ?? json));
      }
      if (dateRangeRes.ok) {
        const drJson = await dateRangeRes.json();
        setDateRanges(safeArray<DateRangeEntry>(drJson?.dateRanges ?? drJson));
      }
      if (teamRes.ok) {
        const users = safeArray<TeamUser>(await teamRes.json());
        setTeamUsers(users);
        if (!schedUserId && users.length > 0) {
          // Default to current session user if available; otherwise first user
          const currentUserId = session?.user?.id;
          const defaultUser = currentUserId
            ? users.find((u) => u.id === currentUserId) || users[0]
            : users[0];
          setSchedUserId(defaultUser.id);
        }
      }
    } catch (err: unknown) {
      console.error("[availability] Failed to fetch data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router, schedUserId, session?.user?.id]);

  const fetchWeekSchedule = useCallback(async () => {
    setWeekLoading(true);
    try {
      const res = await fetch(`/api/availability/schedule?type=week&date=${weekStartStr}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setWeekSchedule(data);
      } else if (res.status === 401) {
        router.push("/login");
      }
    } catch (err: unknown) {
      console.error("Failed to fetch week schedule:", err);
    } finally {
      setWeekLoading(false);
    }
  }, [weekStartStr, router]);

  useEffect(() => {
    if (canViewAvailability) fetchCoreData();
  }, [fetchCoreData, canViewAvailability]);

  useEffect(() => {
    if (canViewAvailability && !loading) fetchWeekSchedule();
  }, [fetchWeekSchedule, canViewAvailability, loading]);

  // ── Live users polling: fetch who's currently clocked in ──
  useEffect(() => {
    if (!canViewAvailability) return;
    let cancelled = false;
    const fetchLive = async () => {
      try {
        const res = await fetch("/api/workspace/live-ops", { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setLiveUsers(data.activeUsers || []);
        }
      } catch { /* silent */ }
    };
    fetchLive();
    const interval = setInterval(fetchLive, 30000); // Poll every 30s
    // Tick 'now' every second for live elapsed time display
    const tickInterval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(tickInterval);
    };
  }, [canViewAvailability]);

  // ── Helper: check if a user is currently live (clocked in) ──
  const isUserLive = useCallback((userId: string): boolean => {
    return liveUsers.some((u) => u.userId === userId);
  }, [liveUsers]);

  // ── Helper: get live info for a user ──
  const getLiveInfo = useCallback((userId: string) => {
    return liveUsers.find((u) => u.userId === userId);
  }, [liveUsers]);

  // ── Helper: check if current time is within any of today's availability slots ──
  // Returns true only if right now falls inside a scheduled time slot
  const isWithinAvailabilityNow = useCallback((availability: Array<{ startTime: string; endTime: string }>): boolean => {
    const currentTime = new Date();
    const currentHours = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    return availability.some((slot) => {
      const [sh, sm] = slot.startTime.split(":").map(Number);
      const [eh, em] = slot.endTime.split(":").map(Number);
      const startTotal = sh * 60 + sm;
      const endTotal = eh * 60 + em;
      // Handle 24:00 end time
      const effectiveEnd = endTotal === 0 ? 24 * 60 : endTotal;
      return currentTotalMinutes >= startTotal && currentTotalMinutes < effectiveEnd;
    });
  }, []);

  // ── Filter upcoming / past overrides ──
  const upcomingOverrides = useMemo(
    () => overrides
      .filter((o) => {
        const d = new Date(o.date + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .sort((a, b) => a.date.localeCompare(b.date)),
    [overrides]
  );

  const pastOverrides = useMemo(
    () => overrides
      .filter((o) => {
        const d = new Date(o.date + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d < today;
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [overrides]
  );

  // ── Active (current / future) date ranges ──
  const activeDateRanges = useMemo(
    () => dateRanges
      .filter((r) => r.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [dateRanges, todayStr]
  );

  const pastDateRanges = useMemo(
    () => dateRanges
      .filter((r) => r.endDate < todayStr)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [dateRanges, todayStr]
  );

  // ── Form reset helpers ──
  const resetAvailForm = () => {
    setFormUserId("");
    setFormDayOfWeek("1");
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormIsAvailable(true);
    setEditingAvailability(null);
  };

  const resetOverrideForm = () => {
    setFormOverrideUserId("");
    setFormOverrideDate("");
    setFormOverrideStartTime("");
    setFormOverrideEndTime("");
    setFormOverrideIsAvailable(false);
    setFormOverrideReason("");
    setEditingOverride(null);
  };

  const resetDateRangeForm = () => {
    setFormDateRangeUserId("");
    setFormDateRangeStartDate("");
    setFormDateRangeEndDate("");
    setFormDateRangeStartTime("");
    setFormDateRangeEndTime("");
    setFormDateRangeIsAvailable(true);
    setFormDateRangeReason("");
    setEditingDateRange(null);
  };

  const openEditAvailability = (entry: AvailabilityEntry) => {
    setEditingAvailability(entry);
    setFormUserId(entry.userId);
    setFormDayOfWeek(entry.dayOfWeek.toString());
    setFormStartTime(entry.startTime);
    setFormEndTime(entry.endTime);
    setFormIsAvailable(entry.isAvailable);
    setAvailDialogOpen(true);
  };

  const openEditOverride = (override: OverrideEntry) => {
    setEditingOverride(override);
    setFormOverrideUserId(override.userId);
    setFormOverrideDate(override.date);
    setFormOverrideStartTime(override.startTime || "");
    setFormOverrideEndTime(override.endTime || "");
    setFormOverrideIsAvailable(override.isAvailable);
    setFormOverrideReason(override.reason || "");
    setOverrideDialogOpen(true);
  };

  const openEditDateRange = (range: DateRangeEntry) => {
    setEditingDateRange(range);
    setFormDateRangeUserId(range.userId);
    setFormDateRangeStartDate(range.startDate);
    setFormDateRangeEndDate(range.endDate);
    setFormDateRangeStartTime(range.startTime || "");
    setFormDateRangeEndTime(range.endTime || "");
    setFormDateRangeIsAvailable(range.isAvailable);
    setFormDateRangeReason(range.reason || "");
    setDateRangeDialogOpen(true);
  };

  // ── CRUD handlers ──
  const handleSaveAvailability = async () => {
    if (!formUserId || formDayOfWeek === undefined) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formStartTime >= formEndTime) {
      toast.error("Start time must be before end time");
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (editingAvailability) {
        res = await fetch(`/api/availability/${editingAvailability.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            dayOfWeek: parseInt(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            isAvailable: formIsAvailable,
          }),
        });
      } else {
        res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: formUserId,
            dayOfWeek: parseInt(formDayOfWeek),
            startTime: formStartTime,
            endTime: formEndTime,
            isAvailable: formIsAvailable,
          }),
        });
      }
      if (res.ok) {
        toast.success(editingAvailability ? "Availability updated" : "Availability added");
        setAvailDialogOpen(false);
        resetAvailForm();
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(safeText(err.error, "Failed to save availability"));
      }
    } catch {
      toast.error("Failed to save availability");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!formOverrideUserId || !formOverrideDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formOverrideStartTime && formOverrideEndTime && formOverrideStartTime >= formOverrideEndTime) {
      toast.error("Start time must be before end time");
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (editingOverride) {
        res = await fetch(`/api/availability/overrides/${editingOverride.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            date: formOverrideDate,
            startTime: formOverrideStartTime || null,
            endTime: formOverrideEndTime || null,
            isAvailable: formOverrideIsAvailable,
            reason: formOverrideReason || null,
          }),
        });
      } else {
        res = await fetch("/api/availability/overrides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: formOverrideUserId,
            date: formOverrideDate,
            startTime: formOverrideStartTime || null,
            endTime: formOverrideEndTime || null,
            isAvailable: formOverrideIsAvailable,
            reason: formOverrideReason || null,
          }),
        });
      }
      if (res.ok) {
        toast.success(editingOverride ? "Override updated" : "Override added");
        setOverrideDialogOpen(false);
        resetOverrideForm();
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(safeText(err.error, "Failed to save override"));
      }
    } catch {
      toast.error("Failed to save override");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAvailability = async (id: string) => {
    try {
      const res = await fetch(`/api/availability/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Availability deleted");
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteAvailId(null);
    }
  };

  const handleDeleteOverride = async (id: string) => {
    try {
      const res = await fetch(`/api/availability/overrides/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Override deleted");
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteOverrideId(null);
    }
  };

  const handleSaveDateRange = async () => {
    if (!formDateRangeUserId || !formDateRangeStartDate || !formDateRangeEndDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formDateRangeStartDate > formDateRangeEndDate) {
      toast.error("Start date must be on or before end date");
      return;
    }
    if (
      (formDateRangeStartTime && !formDateRangeEndTime) ||
      (!formDateRangeStartTime && formDateRangeEndTime)
    ) {
      toast.error("Set both start and end time, or leave both empty for all day");
      return;
    }
    if (
      formDateRangeStartTime &&
      formDateRangeEndTime &&
      formDateRangeStartTime >= formDateRangeEndTime
    ) {
      toast.error("Start time must be before end time");
      return;
    }
    setSubmitting(true);
    try {
      let res: Response;
      const payload = {
        userId: formDateRangeUserId,
        startDate: formDateRangeStartDate,
        endDate: formDateRangeEndDate,
        startTime: formDateRangeStartTime || null,
        endTime: formDateRangeEndTime || null,
        isAvailable: formDateRangeIsAvailable,
        reason: formDateRangeReason || null,
      };
      if (editingDateRange) {
        res = await fetch(`/api/availability/date-ranges/${editingDateRange.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/availability/date-ranges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        toast.success(editingDateRange ? "Date range updated" : "Date range added");
        setDateRangeDialogOpen(false);
        resetDateRangeForm();
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(safeText(err.error, "Failed to save date range"));
      }
    } catch {
      toast.error("Failed to save date range");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDateRange = async (id: string) => {
    try {
      const res = await fetch(`/api/availability/date-ranges/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Date range deleted");
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteDateRangeId(null);
    }
  };

  // ── Copy handlers ──
  // Option 0: Copy one weekday's recurring slots → another weekday (same or different person)
  const copyDayToDay = async (
    sourceUserId: string,
    sourceDay: number,
    targetUserId: string,
    targetDay: number
  ) => {
    const sourceSlots = availabilities.filter(
      (a) => a.userId === sourceUserId && a.dayOfWeek === sourceDay
    );
    if (sourceSlots.length === 0) {
      toast.error(`No ${DAY_NAMES[sourceDay]} schedule found for the source member`);
      return;
    }

    // Same person + same day would be a no-op replace with identical data — still allowed
    // but warn if identical.
    if (sourceUserId === targetUserId && sourceDay === targetDay) {
      toast.error("Pick a different target day (or another member) to copy to");
      return;
    }

    // Replace only the target person's slots for the target weekday
    const targetSlots = availabilities.filter(
      (a) => a.userId === targetUserId && a.dayOfWeek === targetDay
    );
    await Promise.all(
      targetSlots.map((s) =>
        fetch(`/api/availability/${s.id}`, { method: "DELETE", credentials: "include" })
      )
    );

    let failCount = 0;
    for (const s of sourceSlots) {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: targetUserId,
          dayOfWeek: targetDay,
          startTime: s.startTime,
          endTime: s.endTime,
          isAvailable: s.isAvailable,
        }),
      });
      if (!res.ok) failCount++;
    }

    const targetName =
      teamUsers.find((u) => u.id === targetUserId)?.name ||
      (targetUserId === sourceUserId ? "same member" : "target member");
    if (failCount === 0) {
      toast.success(
        `${DAY_NAMES[sourceDay]} → ${DAY_NAMES[targetDay]} copied for ${targetName} (${sourceSlots.length} slot${sourceSlots.length === 1 ? "" : "s"})`
      );
    } else {
      toast.error(`${failCount}/${sourceSlots.length} slots failed to copy`);
    }
  };

  // Option 1: Copy weekly schedule from source user to target user (replaces target's schedule)
  const copyToUser = async (sourceUserId: string, targetUserId: string) => {
    const sourceSlots = availabilities.filter((a) => a.userId === sourceUserId);
    if (sourceSlots.length === 0) {
      toast.error("No schedule found for the source user");
      return;
    }
    // Delete target's existing slots first
    const targetSlots = availabilities.filter((a) => a.userId === targetUserId);
    await Promise.all(
      targetSlots.map((s) =>
        fetch(`/api/availability/${s.id}`, { method: "DELETE", credentials: "include" })
      )
    );
    let failCount = 0;
    for (const s of sourceSlots) {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: targetUserId,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          isAvailable: s.isAvailable,
        }),
      });
      if (!res.ok) failCount++;
    }
    if (failCount === 0) {
      toast.success(`Schedule copied to ${teamUsers.find((u) => u.id === targetUserId)?.name || "target user"}`);
    } else {
      toast.error(`${failCount}/${sourceSlots.length} slots failed to copy`);
    }
  };

  // Option 2: Copy a day-of-week schedule to a specific date as an override
  // (Takes the slots for the day-of-week matching the target date, combines into a single override
  //  using earliest start / latest end. Override model is unique per user+date.)
  const copyToDate = async (sourceUserId: string, targetUserId: string, targetDate: string) => {
    const targetDateObj = new Date(targetDate + "T00:00:00");
    const dow = targetDateObj.getDay();
    const sourceSlots = availabilities.filter(
      (a) => a.userId === sourceUserId && a.dayOfWeek === dow && a.isAvailable
    );
    if (sourceSlots.length === 0) {
      toast.error(`Source user has no availability configured for ${DAY_NAMES[dow]}`);
      return;
    }
    // Combine: earliest start, latest end
    const starts = sourceSlots.map((s) => s.startTime).sort();
    const ends = sourceSlots.map((s) => s.endTime).sort();
    const combinedStart = starts[0];
    const combinedEnd = ends[ends.length - 1];

    // Delete any existing override for this user+date first (unique constraint)
    const existingOverride = overrides.find(
      (o) => o.userId === targetUserId && o.date === targetDate
    );
    if (existingOverride) {
      await fetch(`/api/availability/overrides/${existingOverride.id}`, {
        method: "DELETE",
        credentials: "include",
      });
    }

    const res = await fetch("/api/availability/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: targetUserId,
        date: targetDate,
        startTime: combinedStart,
        endTime: combinedEnd,
        isAvailable: true,
        reason: `Copied from ${teamUsers.find((u) => u.id === sourceUserId)?.name || "source"}'s ${DAY_NAMES[dow]} schedule`,
      }),
    });
    if (res.ok) {
      toast.success(`Schedule applied as override on ${targetDate}`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(safeText(err.error, "Failed to create override"));
    }
  };

  // Option 3: Copy weekly schedule to a date range (one date range entry per day-of-week that has slots).
  // Each entry spans the full target date range but only applies to its specific day-of-week pattern.
  // Since AvailabilityDateRange doesn't have a day-of-week field, we create one combined entry using
  // the most common time range (or we could split into per-day date ranges).
  // Simpler approach: create a single date range using the earliest start / latest end across all days.
  const copyToDateRange = async (
    sourceUserId: string,
    targetUserId: string,
    startDate: string,
    endDate: string
  ) => {
    const sourceSlots = availabilities.filter((a) => a.userId === sourceUserId && a.isAvailable);
    if (sourceSlots.length === 0) {
      toast.error("Source user has no availability configured");
      return;
    }
    const starts = sourceSlots.map((s) => s.startTime).sort();
    const ends = sourceSlots.map((s) => s.endTime).sort();
    const combinedStart = starts[0];
    const combinedEnd = ends[ends.length - 1];

    const res = await fetch("/api/availability/date-ranges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: targetUserId,
        startDate,
        endDate,
        startTime: combinedStart,
        endTime: combinedEnd,
        isAvailable: true,
        reason: `Copied from ${teamUsers.find((u) => u.id === sourceUserId)?.name || "source"}'s weekly schedule`,
      }),
    });
    if (res.ok) {
      toast.success(`Schedule applied as date range ${startDate} → ${endDate}`);
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(safeText(err.error, "Failed to create date range"));
    }
  };

  const handleCopySubmit = async () => {
    if (!copySourceUserId) {
      toast.error("No source user selected");
      return;
    }
    setCopying(true);
    try {
      if (copyMode === "day") {
        const sourceDay = Number(copySourceDay);
        const targetDay = Number(copyTargetDay);
        if (
          Number.isNaN(sourceDay) ||
          Number.isNaN(targetDay) ||
          sourceDay < 0 ||
          sourceDay > 6 ||
          targetDay < 0 ||
          targetDay > 6
        ) {
          toast.error("Select a source day and a target day");
          setCopying(false);
          return;
        }
        const targetUserId = copyTargetUserId || copySourceUserId;
        await copyDayToDay(copySourceUserId, sourceDay, targetUserId, targetDay);
      } else if (copyMode === "user") {
        if (!copyTargetUserId || copyTargetUserId === copySourceUserId) {
          toast.error("Select a different target user");
          setCopying(false);
          return;
        }
        await copyToUser(copySourceUserId, copyTargetUserId);
      } else if (copyMode === "date") {
        if (!copyTargetDate) {
          toast.error("Select a target date");
          setCopying(false);
          return;
        }
        // Default target = source user themselves
        await copyToDate(copySourceUserId, copyTargetUserId || copySourceUserId, copyTargetDate);
      } else if (copyMode === "range") {
        if (!copyTargetStartDate || !copyTargetEndDate) {
          toast.error("Select start and end dates");
          setCopying(false);
          return;
        }
        if (copyTargetStartDate > copyTargetEndDate) {
          toast.error("Start date must be on or before end date");
          setCopying(false);
          return;
        }
        await copyToDateRange(
          copySourceUserId,
          copyTargetUserId || copySourceUserId,
          copyTargetStartDate,
          copyTargetEndDate
        );
      }
      setCopyDialogOpen(false);
      fetchCoreData();
      fetchWeekSchedule();
    } catch {
      toast.error("Failed to copy availability");
    } finally {
      setCopying(false);
    }
  };

  // ── Week navigation ──
  const goToToday = () => setWeekOffset(0);
  const prevWeek = () => setWeekOffset((w) => w - 1);
  const nextWeek = () => setWeekOffset((w) => w + 1);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const now = new Date();
      const selectedWeekStart = getWeekStart(date);
      const currentWeekStartNow = getWeekStart(now);
      const diffMs = selectedWeekStart.getTime() - currentWeekStartNow.getTime();
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      setWeekOffset(diffWeeks);
      setCalendarOpen(false);
    }
  };

  // ─── Loading / Auth states ──────────────────────────────────────────────────

  if (isSessionLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[500px] rounded-lg" />
      </div>
    );
  }

  if (!canViewAvailability) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">You don&apos;t have access to this page</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-56" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[500px] rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchCoreData(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Try Again
        </Button>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Helper: find date ranges overlapping a given day for a user
  const dateRangesForDay = (userId: string, dateStr: string) => {
    return (weekSchedule?.dateRanges || []).filter((dr) => {
      if (dr.userId !== userId) return false;
      return dr.startDate <= dateStr && dr.endDate >= dateStr;
    });
  };

  const copySourceName = teamUsers.find((u) => u.id === copySourceUserId)?.name || "Unknown";

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Availability"
        description="Plan, view, and override your team's weekly availability"
      >
        {isUserAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { resetOverrideForm(); setActiveTab("overrides"); setOverrideDialogOpen(true); }}
          >
            <CalendarClock className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Add Override</span>
          </Button>
        )}
        {isUserAdmin && (
          <Button
            size="sm"
            onClick={() => { resetAvailForm(); setActiveTab("schedule"); setAvailDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Add Slot</span>
          </Button>
        )}
      </PageHeader>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="py-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{teamUsers.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Team Members</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{availabilities.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Schedule Slots</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{upcomingOverrides.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Upcoming Overrides</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <CalendarRange className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{activeDateRanges.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Active Date Ranges</div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            <LayoutGrid className="h-4 w-4 mr-1 sm:mr-1.5" /> Weekly Overview
          </TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs sm:text-sm">
            <Clock className="h-4 w-4 mr-1 sm:mr-1.5" /> My Schedule
          </TabsTrigger>
          <TabsTrigger value="date-ranges" className="text-xs sm:text-sm">
            <CalendarRange className="h-4 w-4 mr-1 sm:mr-1.5" /> Date Ranges ({dateRanges.length})
          </TabsTrigger>
          <TabsTrigger value="overrides" className="text-xs sm:text-sm">
            <CalendarClock className="h-4 w-4 mr-1 sm:mr-1.5" /> Overrides ({upcomingOverrides.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: Weekly Overview (the most important — all members in one grid)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-4">
          {/* Week navigation + legend */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={prevWeek} aria-label="Previous week" className="h-9 w-9 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="min-w-[150px] sm:min-w-[220px] justify-start text-left font-normal h-9 text-xs sm:text-sm">
                      <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {new Date(weekStartStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" — "}
                        {new Date(weekEndStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span className="sm:hidden">
                        {new Date(weekStartStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" – "}
                        {new Date(weekEndStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={currentWeekStart}
                      onSelect={handleCalendarSelect}
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={nextWeek} aria-label="Next week" className="h-9 w-9 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {weekOffset !== 0 && (
                  <Button variant="ghost" size="sm" onClick={goToToday} className="h-9 text-xs">
                    Today
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={weekUserFilter} onValueChange={setWeekUserFilter}>
                  <SelectTrigger className="w-[140px] sm:w-[180px] h-9 text-xs">
                    <Filter className="h-3 w-3 mr-1 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All Members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Color legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700" />
                Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700" />
                Partial / Override
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border bg-sky-50 dark:bg-sky-900/40 border-sky-200 dark:border-sky-700" />
                On Leave
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700" />
                Unavailable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border bg-muted/20 border-border" />
                Not Set
              </span>
              <span className="flex items-center gap-1.5 ml-auto text-[10px] italic">
                <Info className="h-3 w-3" /> Click a cell for details{isUserAdmin ? ", or use Copy to duplicate a member’s schedule" : ""}
              </span>
            </div>
          </div>

          {weekLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : !weekSchedule || weekSchedule.users.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center text-muted-foreground">
                <Users className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">No team members found for this week</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {weekSchedule.warning && (
                <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200">
                  {weekSchedule.warning}
                </div>
              )}

              {/* ── Mobile Cards (<md) ── */}
              <div className="space-y-3 md:hidden">
                {weekSchedule.users
                  .filter((u) => weekUserFilter === "all" || u.user.id === weekUserFilter)
                  .map((userSchedule) => {
                    const totalHours = weekDates.reduce((sum, d) => {
                      const ds = formatDateOnly(d);
                      const dd = userSchedule.days[ds];
                      return sum + (dd ? dd.totalHours : 0);
                    }, 0);
                    const configuredDays = weekDates.filter((d) => {
                      const ds = formatDateOnly(d);
                      const dd = userSchedule.days[ds];
                      return dd && (dd.isOnLeave || dd.availability.length > 0);
                    }).length;
                    const sourceSlotsCount = availabilities.filter((a) => a.userId === userSchedule.user.id).length;

                    return (
                      <Card key={userSchedule.user.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          {/* User header */}
                          <div className="flex items-center gap-3 p-3 border-b">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={userSchedule.user.avatar || undefined} alt={userSchedule.user.name} />
                              <AvatarFallback className="text-xs">
                                {getUserInitials(userSchedule.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold truncate flex items-center gap-1">
                                {userSchedule.user.name}
                                {isUserLive(userSchedule.user.id) && (
                                  <span className="relative flex h-2 w-2 shrink-0" title="Currently working">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {Math.round(totalHours * 10) / 10}h/week · {configuredDays} days
                              </div>
                            </div>
                            {isUserAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[11px] shrink-0"
                              onClick={() => openCopyDialog(userSchedule.user.id)}
                              disabled={sourceSlotsCount === 0}
                            >
                              <Copy className="h-3 w-3 mr-1" /> Copy
                            </Button>
                            )}
                          </div>

                          {/* 7-day cells strip */}
                          <div className="grid grid-cols-7 gap-px bg-border">
                            {weekDates.map((date, i) => {
                              const ds = formatDateOnly(date);
                              const dd = userSchedule.days[ds];
                              const isToday = ds === todayStr;
                              const status = getCellStatus(dd);
                              return (
                                <button
                                  key={ds}
                                  className={`flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${CELL_BG[status]} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                  onClick={() => dd && openDayDetail(userSchedule.user.id, userSchedule.user.name, ds, dd)}
                                >
                                  <span className={`text-[9px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                    {DAY_NAMES_SHORT[i]}
                                  </span>
                                  <span className={`text-[10px] font-bold ${CELL_TEXT[status]}`}>
                                    {date.getDate()}
                                  </span>
                                  <span className={`text-[8px] leading-tight text-center ${CELL_TEXT[status]}`}>
                                    {dd?.isOnLeave ? "Leave" : dd && dd.availability.length > 0 ? `${dd.totalHours}h` : dd?.override && !dd.override.isAvailable ? "Off" : "—"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Manage button */}
                          <div className="border-t p-2.5 flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 h-9 text-xs justify-center"
                              onClick={() => {
                                setSchedUserId(userSchedule.user.id);
                                setActiveTab("schedule");
                              }}
                            >
                              <Clock className="h-3.5 w-3.5 mr-1.5" /> Manage Schedule
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>

              {/* ── Desktop Grid (md+) ── */}
              <Card className="hidden md:block">
                <CardContent className="p-0">
                  <div className="w-full overflow-x-auto">
                    <div className="min-w-[800px] lg:min-w-[1000px]">
                      {/* Header row */}
                      <div className="grid grid-cols-[180px_repeat(7,1fr)_60px] border-b bg-muted/50 sticky top-0 z-10">
                        <div className="p-3 text-xs font-semibold text-muted-foreground border-r flex items-center">
                          Team Member
                        </div>
                        {weekDates.map((date, i) => {
                          const dayStr = formatDateOnly(date);
                          const isToday = dayStr === todayStr;
                          return (
                            <div
                              key={dayStr}
                              className={`p-2 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                            >
                              <div className={`text-[10px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                {DAY_NAMES_SHORT[i]}
                              </div>
                              <div className={`text-base font-bold ${isToday ? "text-primary" : ""}`}>
                                {date.getDate()}
                              </div>
                              <div className={`text-[10px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                {date.toLocaleDateString("en-US", { month: "short" })}
                              </div>
                            </div>
                          );
                        })}
                        <div className="p-3 text-xs font-semibold text-muted-foreground flex items-center justify-center">
                          Action
                        </div>
                      </div>

                      {/* User rows */}
                      {weekSchedule.users
                        .filter((u) => weekUserFilter === "all" || u.user.id === weekUserFilter)
                        .map((userSchedule) => {
                          const sourceSlotsCount = availabilities.filter((a) => a.userId === userSchedule.user.id).length;
                          return (
                            <div
                              key={userSchedule.user.id}
                              className="grid grid-cols-[180px_repeat(7,1fr)_60px] border-b last:border-b-0 hover:bg-muted/10 transition-colors"
                            >
                              {/* User info */}
                              <div className="p-3 border-r flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={userSchedule.user.avatar || undefined} alt={userSchedule.user.name} />
                                  <AvatarFallback className="text-[10px]">
                                    {getUserInitials(userSchedule.user.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate flex items-center gap-1">
                                    {userSchedule.user.name}
                                    {isUserLive(userSchedule.user.id) && (
                                      <span className="relative flex h-2 w-2 shrink-0" title="Currently working">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {safeText(userSchedule.user.role, "")}
                                  </div>
                                </div>
                              </div>

                              {/* Day cells */}
                              {weekDates.map((date) => {
                                const dayStr = formatDateOnly(date);
                                const dayData = userSchedule.days[dayStr];
                                const isToday = dayStr === todayStr;
                                const status = getCellStatus(dayData);
                                const dayDateRanges = dateRangesForDay(userSchedule.user.id, dayStr);

                                if (!dayData) {
                                  return (
                                    <div key={dayStr} className={`p-2 border-r last:border-r-0 flex items-center justify-center ${CELL_BG.notset}`}>
                                      <span className="text-[10px] text-muted-foreground">—</span>
                                    </div>
                                  );
                                }

                                return (
                                  <Tooltip key={dayStr}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`p-2 border-r last:border-r-0 cursor-pointer transition-all hover:ring-2 hover:ring-primary/30 min-h-[80px] flex flex-col gap-1 ${CELL_BG[status]} ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}
                                        onClick={() => openDayDetail(userSchedule.user.id, userSchedule.user.name, dayStr, dayData)}
                                      >
                                        <div className="flex flex-wrap gap-1">
                                          {dayData.isOnLeave && (
                                            <Badge className="text-[8px] px-1 py-0 bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200 border-0">
                                              LEAVE
                                            </Badge>
                                          )}
                                          {dayData.override && !dayData.isOnLeave && (
                                            <Badge className="text-[8px] px-1 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-0">
                                              OVERRIDE
                                            </Badge>
                                          )}
                                          {dayDateRanges.length > 0 && (
                                            <Badge className="text-[8px] px-1 py-0 bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200 border-0">
                                              RANGE
                                            </Badge>
                                          )}
                                        </div>
                                        {dayData.isOnLeave ? (
                                          <div className="flex-1 flex items-center justify-center">
                                            <span className="text-[10px] text-sky-700 dark:text-sky-200 font-medium">On Leave</span>
                                          </div>
                                        ) : dayData.availability.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {isToday && isUserLive(userSchedule.user.id) && (
                                              <div className="w-full flex items-center gap-1 mb-0.5">
                                                <span className="relative flex h-2 w-2 shrink-0">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                                </span>
                                                <span className="text-[8px] font-bold text-red-600 dark:text-red-400">
                                                  LIVE {Math.floor((now - new Date(getLiveInfo(userSchedule.user.id)?.clockInAt || Date.now()).getTime()) / 60000)}m
                                                </span>
                                              </div>
                                            )}
                                            {isToday && !isUserLive(userSchedule.user.id) && isWithinAvailabilityNow(dayData.availability) && (
                                              <div className="w-full text-[8px] text-muted-foreground/60 italic mb-0.5">
                                                Not started
                                              </div>
                                            )}
                                            {dayData.availability.slice(0, 2).map((slot) => {
                                              const rawEntry = findAvailEntry(slot.id);
                                              return (
                                                <Badge
                                                  key={slot.id}
                                                  className="text-[8px] px-1 py-0 bg-white/70 dark:bg-black/30 text-green-700 dark:text-green-300 border-0"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (rawEntry) openEditAvailability(rawEntry);
                                                  }}
                                                  title={rawEntry ? "Click to edit" : undefined}
                                                >
                                                  {slot.startTime}-{slot.endTime}
                                                </Badge>
                                              );
                                            })}
                                            {dayData.availability.length > 2 && (
                                              <span className="text-[8px] text-muted-foreground">+{dayData.availability.length - 2}</span>
                                            )}
                                            <div className="w-full text-[9px] text-muted-foreground mt-0.5">
                                              {dayData.totalHours}h total
                                            </div>
                                          </div>
                                        ) : dayData.override && !dayData.override.isAvailable ? (
                                          <div className="flex-1 flex items-center justify-center">
                                            <span className="text-[10px] text-red-700 dark:text-red-200 font-medium">Off</span>
                                          </div>
                                        ) : (
                                          <div className="flex-1 flex items-center justify-center">
                                            <span className="text-[10px] text-muted-foreground">Not Set</span>
                                          </div>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[280px]">
                                      <div className="space-y-1.5 text-left">
                                        <div className="font-semibold text-xs">{userSchedule.user.name} — {dayData.dayName}, {dayStr}</div>
                                        <Separator />
                                        {dayData.isOnLeave ? (
                                          <div className="text-[11px] text-sky-700 dark:text-sky-200 font-medium">On Leave</div>
                                        ) : dayData.availability.length > 0 ? (
                                          <div className="space-y-0.5">
                                            <div className="text-[11px] font-medium">Availability:</div>
                                            {dayData.availability.map((s) => (
                                              <div key={s.id} className="text-[10px] text-muted-foreground">
                                                {s.startTime} – {s.endTime} ({s.hours}h)
                                              </div>
                                            ))}
                                            <div className="text-[10px] text-muted-foreground">
                                              Total: {dayData.totalHours}h scheduled
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-[11px] text-muted-foreground">No availability set</div>
                                        )}
                                        {dayData.override && (
                                          <div className="text-[10px]">
                                            <span className="font-medium text-amber-700 dark:text-amber-300">Override: </span>
                                            {dayData.override.isAvailable ? "Available" : "Unavailable"}
                                            {dayData.override.startTime && dayData.override.endTime
                                              ? ` (${dayData.override.startTime}–${dayData.override.endTime})`
                                              : " (All Day)"}
                                            {dayData.override.reason && ` — ${safeText(dayData.override.reason)}`}
                                          </div>
                                        )}
                                        {dayDateRanges.length > 0 && (
                                          <div className="text-[10px]">
                                            <span className="font-medium text-violet-700 dark:text-violet-300">Date Ranges: </span>
                                            {dayDateRanges.map((dr, i) => (
                                              <span key={dr.id}>
                                                {i > 0 && ", "}
                                                {dr.isAvailable ? "Available" : "Unavailable"}
                                                {dr.startTime && dr.endTime ? ` (${dr.startTime}–${dr.endTime})` : " (All Day)"}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}

                              {/* Copy action — admin only */}
                              <div className="p-2 border-r last:border-r-0 flex items-center justify-center">
                                {isUserAdmin ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => openCopyDialog(userSchedule.user.id)}
                                  disabled={sourceSlotsCount === 0}
                                  title={sourceSlotsCount === 0 ? "No schedule to copy" : "Copy schedule"}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: My Schedule (recurring weekly schedule)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="schedule" className="space-y-4">
          {/* Controls */}
          <Card className="py-3 px-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Select value={schedUserId} onValueChange={setSchedUserId}>
                  <SelectTrigger className="h-9 w-full text-xs sm:w-[260px] sm:text-sm">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4">
                            <AvatarImage src={u.avatar || undefined} alt={u.name} />
                            <AvatarFallback className="text-[7px]">{getUserInitials(u.name)}</AvatarFallback>
                          </Avatar>
                          {u.name}
                          {u.id === session?.user?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isUserAdmin && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {schedUserId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 text-xs"
                        onClick={() => openCopyDialog(schedUserId)}
                        disabled={availabilities.filter((a) => a.userId === schedUserId).length === 0}
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Schedule
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Add Slot
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {schedUserId ? (
            <div className="space-y-3">
              {/* Weekly hours summary */}
              {(() => {
                const userAvails = availabilities.filter((a) => a.userId === schedUserId && a.isAvailable);
                const totalWeeklyHours = userAvails.reduce((sum, a) => sum + slotHours(a.startTime, a.endTime), 0);
                const configuredDays = new Set(userAvails.map((a) => a.dayOfWeek)).size;
                return (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground px-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium text-foreground">{Math.round(totalWeeklyHours * 10) / 10}h</span> total weekly
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-sky-500" />
                      <span className="font-medium text-foreground">{configuredDays}</span>/7 days configured
                    </span>
                    <span className="flex items-center gap-1.5">
                      <LayoutGrid className="h-3.5 w-3.5 text-amber-500" />
                      <span className="font-medium text-foreground">{userAvails.length}</span> total slots
                    </span>
                  </div>
                );
              })()}

              {/* 7-day schedule cards */}
              {DAY_NAMES.map((dayName, dayIndex) => {
                const daySlots = availabilities.filter(
                  (a) => a.userId === schedUserId && a.dayOfWeek === dayIndex
                );
                const dayHours = daySlots
                  .filter((a) => a.isAvailable)
                  .reduce((sum, a) => sum + slotHours(a.startTime, a.endTime), 0);
                const isToday = dayIndex === new Date().getDay();

                return (
                  <Card key={dayIndex} className={isToday ? "border-primary/30 bg-primary/[0.02]" : ""}>
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${daySlots.length > 0 ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                          <CardTitle className="text-sm font-semibold">
                            {dayName}
                            {isToday && (
                              <Badge className="ml-2 text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-0">Today</Badge>
                            )}
                          </CardTitle>
                          {daySlots.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(dayHours * 10) / 10}h)
                            </span>
                          )}
                        </div>
                        {isUserAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => openQuickAddSlot(schedUserId, dayIndex)}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add Slot
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {daySlots.length === 0 ? (
                        <div className="flex items-center justify-between py-3 text-muted-foreground">
                          <span className="text-xs">No availability configured</span>
                          {isUserAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openQuickAddSlot(schedUserId, dayIndex)}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {daySlots
                            .slice()
                            .sort((a, b) => a.startTime.localeCompare(b.startTime))
                            .map((slot) => {
                              const hours = slotHours(slot.startTime, slot.endTime);
                              return (
                                <div
                                  key={slot.id}
                                  className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                                >
                                  <div className={`h-2 w-2 rounded-full shrink-0 ${slot.isAvailable ? "bg-green-500" : "bg-red-400"}`} />
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium">
                                      {slot.startTime} – {slot.endTime}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-1.5">({hours}h)</span>
                                    {!slot.isAvailable && (
                                      <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200 border-0">
                                        Unavailable
                                      </Badge>
                                    )}
                                  </div>
                                  {isUserAdmin && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-2.5 text-xs"
                                        onClick={() => openEditAvailability(slot)}
                                      >
                                        <Edit3 className="h-3 w-3 mr-1" />Edit
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-2.5 text-xs text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                                        onClick={() => setDeleteAvailId(slot.id)}
                                      >
                                        <Trash2 className="h-3 w-3 mr-1" />Delete
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 flex flex-col items-center text-muted-foreground">
                <Clock className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">Select a team member to manage their weekly schedule</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: Date Ranges (clean list, mobile + desktop)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="date-ranges" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-violet-500" />
                    Date Ranges
                  </CardTitle>
                  <CardDescription>
                    Set availability or unavailability for a span of dates (vacation, project travel, multi-day leave).
                  </CardDescription>
                </div>
                {isUserAdmin && (
                  <Button size="sm" onClick={() => { resetDateRangeForm(); setDateRangeDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add Date Range
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {dateRanges.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <CalendarRange className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm">No date ranges configured</p>
                  <p className="text-xs mt-1 text-center max-w-md">Use date ranges for multi-day availability or leave (e.g., vacation, project travel, conference).</p>
                  {isUserAdmin && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetDateRangeForm(); setDateRangeDialogOpen(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Create Date Range
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Active range list */}
                  {activeDateRanges.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Active &amp; Upcoming ({activeDateRanges.length})
                      </div>
                      <DateRangeList
                        ranges={activeDateRanges}
                        onEdit={openEditDateRange}
                        onDelete={(id) => setDeleteDateRangeId(id)}
                        canEdit={isUserAdmin}
                      />
                    </>
                  )}
                  {pastDateRanges.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground mt-5 mb-2">
                        Past ({pastDateRanges.length})
                      </div>
                      <DateRangeList
                        ranges={pastDateRanges}
                        onEdit={openEditDateRange}
                        onDelete={(id) => setDeleteDateRangeId(id)}
                        dimmed
                        canEdit={isUserAdmin}
                      />
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: Overrides (single-day, clean list)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overrides" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-amber-500" />
                    Overrides
                  </CardTitle>
                  <CardDescription>
                    Single-day changes to recurring availability (sick day, extra hours, unexpected absence).
                  </CardDescription>
                </div>
                {isUserAdmin && (
                  <Button size="sm" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1.5" /> Add Override
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {overrides.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <CalendarClock className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm">No overrides configured</p>
                  <p className="text-xs mt-1 text-center max-w-md">Overrides apply to a single date only — perfect for sick days, extra hours, or unexpected changes.</p>
                  {isUserAdmin && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Create Override
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {upcomingOverrides.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground mb-2">
                        Upcoming &amp; Active ({upcomingOverrides.length})
                      </div>
                      <OverrideList
                        overrides={upcomingOverrides}
                        onEdit={openEditOverride}
                        onDelete={(id) => setDeleteOverrideId(id)}
                        canEdit={isUserAdmin}
                      />
                    </>
                  )}
                  {pastOverrides.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground mt-5 mb-2">
                        Past ({pastOverrides.length})
                      </div>
                      <OverrideList
                        overrides={pastOverrides}
                        onEdit={openEditOverride}
                        onDelete={(id) => setDeleteOverrideId(id)}
                        dimmed
                        canEdit={isUserAdmin}
                      />
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Day Detail Popup Dialog */}
      <Dialog open={dayDetailDialogOpen} onOpenChange={(open) => { setDayDetailDialogOpen(open); if (!open) setSelectedDayDetail(null); }}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {selectedDayDetail && (
                <>
                  <span>{selectedDayDetail.userName}</span>
                  <span className="text-muted-foreground font-normal">—</span>
                  <span>{selectedDayDetail.dayData.dayName}, {selectedDayDetail.date}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedDayDetail && (
            <div className="space-y-4">
              {/* Leave status */}
              {selectedDayDetail.dayData.isOnLeave && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-sky-50 dark:bg-sky-900/40 border border-sky-200 dark:border-sky-700">
                  <CalendarDays className="h-4 w-4 text-sky-500 shrink-0" />
                  <span className="text-sm font-medium text-sky-800 dark:text-sky-200">On Leave</span>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-1 gap-3">
                <div className="text-center p-2.5 rounded-lg bg-muted/30">
                  <div className="text-lg font-bold">{selectedDayDetail.dayData.totalHours}h</div>
                  <div className="text-[10px] text-muted-foreground">Scheduled</div>
                </div>
              </div>

              {/* Availability slots */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Availability Slots</h4>
                  {isUserAdmin && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDayDetailDialogOpen(false); openQuickAddSlot(selectedDayDetail.userId, selectedDayDetail.dayData.dayOfWeek); }}>
                      <Plus className="h-3 w-3 mr-0.5" /> Add
                    </Button>
                  )}
                </div>
                {selectedDayDetail.dayData.availability.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedDayDetail.dayData.availability.map((slot) => {
                      const entry = findAvailEntry(slot.id) || makeEntryFromSlot(slot, selectedDayDetail.userId, selectedDayDetail.dayData.dayOfWeek);
                      return (
                        <div key={slot.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${slot.isAvailable ? "bg-green-500" : "bg-red-400"}`} />
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => { setDayDetailDialogOpen(false); openEditAvailability(entry); }}
                          >
                            <span className="text-sm font-medium">{slot.startTime} – {slot.endTime}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">({slot.hours}h)</span>
                          </button>
                          {isUserAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setDayDetailDialogOpen(false); openEditAvailability(entry); }}>
                                <Edit3 className="h-3 w-3" />
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] text-red-600 border-red-200 dark:border-red-800" onClick={() => { setDeleteAvailId(slot.id); setDayDetailDialogOpen(false); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="text-xs text-muted-foreground pt-0.5">
                      Total: {selectedDayDetail.dayData.totalHours}h scheduled
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No availability configured
                  </div>
                )}
              </div>

              {/* Override info */}
              {selectedDayDetail.dayData.override && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Override Active</span>
                    {isUserAdmin && (
                      <Button variant="ghost" size="sm" className="h-7 text-[10px] text-amber-700 dark:text-amber-300" onClick={() => {
                        const ovr = overrides.find(o => o.id === selectedDayDetail.dayData.override!.id);
                        if (ovr) { setDayDetailDialogOpen(false); openEditOverride(ovr); }
                      }}>
                        <Edit3 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    {selectedDayDetail.dayData.override.isAvailable ? "Available" : "Unavailable"}
                    {selectedDayDetail.dayData.override.startTime && selectedDayDetail.dayData.override.endTime
                      ? ` (${selectedDayDetail.dayData.override.startTime}–${selectedDayDetail.dayData.override.endTime})`
                      : " (All Day)"}
                  </div>
                  {selectedDayDetail.dayData.override.reason && (
                    <div className="text-xs text-muted-foreground mt-0.5">{safeText(selectedDayDetail.dayData.override.reason)}</div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1 min-w-[100px] h-9 text-xs" onClick={() => { setDayDetailDialogOpen(false); openQuickAddSlot(selectedDayDetail.userId, selectedDayDetail.dayData.dayOfWeek); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Slot
                </Button>
                <Button variant="outline" size="sm" className="flex-1 min-w-[100px] h-9 text-xs" onClick={() => { setDayDetailDialogOpen(false); openQuickAddOverride(selectedDayDetail.userId, selectedDayDetail.date); }}>
                  <CalendarClock className="h-3.5 w-3.5 mr-1" /> Add Override
                </Button>
                <Button variant="outline" size="sm" className="flex-1 min-w-[100px] h-9 text-xs" onClick={() => { setDayDetailDialogOpen(false); openCopyDialog(selectedDayDetail.userId, selectedDayDetail.dayData.dayOfWeek); }}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Day
                </Button>
                <Button variant="outline" size="sm" className="flex-1 min-w-[100px] h-9 text-xs" onClick={() => { setDayDetailDialogOpen(false); setSchedUserId(selectedDayDetail.userId); setActiveTab("schedule"); }}>
                  <Clock className="h-3.5 w-3.5 mr-1" /> Open Schedule
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* Add/Edit Availability Dialog */}
      <Dialog open={availDialogOpen} onOpenChange={setAvailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAvailability ? "Edit Availability Slot" : "Add Availability Slot"}</DialogTitle>
            <DialogDescription>
              Set a recurring weekly time slot. This applies to every matching day of the week.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingAvailability && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select value={formDayOfWeek} onValueChange={setFormDayOfWeek}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimeSelect value={formStartTime} onChange={setFormStartTime} placeholder="Start time" className="h-9" />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimeSelect value={formEndTime} onChange={setFormEndTime} placeholder="End time" allowEndOfDay className="h-9" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Available</Label>
                <p className="text-xs text-muted-foreground">Toggle on if available, off if unavailable</p>
              </div>
              <Switch checked={formIsAvailable} onCheckedChange={setFormIsAvailable} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvailDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAvailability} disabled={submitting || !isUserAdmin}>
              {submitting ? "Saving..." : editingAvailability ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOverride ? "Edit Override" : "Add Single-Day Override"}</DialogTitle>
            <DialogDescription>
              A one-day change to recurring availability (sick day, extra hours, weather, etc.).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingOverride && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={formOverrideUserId} onValueChange={setFormOverrideUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={overrideCalOpen} onOpenChange={setOverrideCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {formOverrideDate
                      ? new Date(formOverrideDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formOverrideDate ? new Date(formOverrideDate + "T00:00:00") : undefined}
                    onSelect={(d) => { if (d) { setFormOverrideDate(formatDateOnly(d)); setOverrideCalOpen(false); } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TimeSelect
                  value={formOverrideStartTime}
                  onChange={setFormOverrideStartTime}
                  placeholder="Start time"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TimeSelect
                  value={formOverrideEndTime}
                  onChange={setFormOverrideEndTime}
                  placeholder="End time"
                  allowEndOfDay
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Available</Label>
                <p className="text-xs text-muted-foreground">Toggle on if available, off if unavailable</p>
              </div>
              <Switch checked={formOverrideIsAvailable} onCheckedChange={setFormOverrideIsAvailable} />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(Optional)</span></Label>
              <Textarea
                value={formOverrideReason}
                onChange={(e) => setFormOverrideReason(e.target.value)}
                placeholder="Reason for the override..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveOverride} disabled={submitting || !isUserAdmin}>
              {submitting ? "Saving..." : editingOverride ? "Update Override" : "Add Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Date Range Dialog */}
      <Dialog open={dateRangeDialogOpen} onOpenChange={setDateRangeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDateRange ? "Edit Date Range" : "Add Availability Date Range"}</DialogTitle>
            <DialogDescription>
              Set availability or unavailability for a span of consecutive dates. Times are optional — leave empty for all-day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingDateRange && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={formDateRangeUserId} onValueChange={setFormDateRangeUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover open={dateRangeStartCalOpen} onOpenChange={setDateRangeStartCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formDateRangeStartDate
                        ? new Date(formDateRangeStartDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDateRangeStartDate ? new Date(formDateRangeStartDate + "T00:00:00") : undefined}
                      onSelect={(d) => {
                        if (d) {
                          const ds = formatDateOnly(d);
                          setFormDateRangeStartDate(ds);
                          if (formDateRangeEndDate && formDateRangeEndDate < ds) {
                            setFormDateRangeEndDate(ds);
                          }
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover open={dateRangeEndCalOpen} onOpenChange={setDateRangeEndCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {formDateRangeEndDate
                        ? new Date(formDateRangeEndDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDateRangeEndDate ? new Date(formDateRangeEndDate + "T00:00:00") : undefined}
                      onSelect={(d) => { if (d) { setFormDateRangeEndDate(formatDateOnly(d)); setDateRangeEndCalOpen(false); } }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TimeSelect
                  value={formDateRangeStartTime}
                  onChange={setFormDateRangeStartTime}
                  placeholder="Start time"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>End Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <TimeSelect
                  value={formDateRangeEndTime}
                  onChange={setFormDateRangeEndTime}
                  placeholder="End time"
                  allowEndOfDay
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Available</Label>
                <p className="text-xs text-muted-foreground">
                  {formDateRangeIsAvailable ? "Available during this range" : "Unavailable (leave / vacation)"}
                </p>
              </div>
              <Switch checked={formDateRangeIsAvailable} onCheckedChange={setFormDateRangeIsAvailable} />
            </div>
            <div className="space-y-2">
              <Label>Reason <span className="text-muted-foreground text-xs">(Optional)</span></Label>
              <Textarea
                value={formDateRangeReason}
                onChange={(e) => setFormDateRangeReason(e.target.value)}
                placeholder="Reason for this date range (e.g., project travel, vacation)..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateRangeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDateRange} disabled={submitting || !isUserAdmin}>
              {submitting ? "Saving..." : editingDateRange ? "Update Date Range" : "Add Date Range"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Availability Confirmation Dialog */}
      <AlertDialog open={!!deleteAvailId} onOpenChange={() => setDeleteAvailId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Availability Slot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this availability slot? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteAvailId && handleDeleteAvailability(deleteAvailId)} className="bg-red-600 hover:bg-red-700" disabled={!isUserAdmin}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Override Confirmation Dialog */}
      <AlertDialog open={!!deleteOverrideId} onOpenChange={() => setDeleteOverrideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Override</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this availability override? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteOverrideId && handleDeleteOverride(deleteOverrideId)} className="bg-red-600 hover:bg-red-700" disabled={!isUserAdmin}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Date Range Confirmation Dialog */}
      <AlertDialog open={!!deleteDateRangeId} onOpenChange={() => setDeleteDateRangeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Date Range</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this date range? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDateRangeId && handleDeleteDateRange(deleteDateRangeId)} className="bg-red-600 hover:bg-red-700" disabled={!isUserAdmin}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════════
          COPY AVAILABILITY DIALOG
      ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Copy Availability
            </DialogTitle>
            <DialogDescription>
              Copy <span className="font-medium text-foreground">{copySourceName}</span>&apos;s schedule — one weekday to another day (same person or anyone else), a full week, a date, or a range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Source info */}
            <div className="p-3 rounded-md bg-muted/40 border">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Source</div>
              <div className="text-sm font-medium mt-0.5">{copySourceName}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {availabilities.filter((a) => a.userId === copySourceUserId).length} recurring slots
                {copyMode === "day" ? ` · ${DAY_NAMES[Number(copySourceDay)] || "day"} selected` : ""}
              </div>
            </div>

            {/* Mode selector */}
            <div className="space-y-2">
              <Label>Copy Mode</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCopyMode("day");
                    if (!copyTargetUserId) setCopyTargetUserId(copySourceUserId);
                  }}
                  className={`text-xs px-3 py-2.5 rounded-md border transition-all ${copyMode === "day" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <CalendarClock className="h-3.5 w-3.5 mx-auto mb-1" />
                  Day → Day
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCopyMode("user");
                    if (copyTargetUserId === copySourceUserId) setCopyTargetUserId("");
                  }}
                  className={`text-xs px-3 py-2.5 rounded-md border transition-all ${copyMode === "user" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <Users className="h-3.5 w-3.5 mx-auto mb-1" />
                  Full Week
                </button>
                <button
                  type="button"
                  onClick={() => setCopyMode("date")}
                  className={`text-xs px-3 py-2.5 rounded-md border transition-all ${copyMode === "date" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <CalendarDays className="h-3.5 w-3.5 mx-auto mb-1" />
                  Specific Date
                </button>
                <button
                  type="button"
                  onClick={() => setCopyMode("range")}
                  className={`text-xs px-3 py-2.5 rounded-md border transition-all ${copyMode === "range" ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                >
                  <CalendarRange className="h-3.5 w-3.5 mx-auto mb-1" />
                  Date Range
                </button>
              </div>
            </div>

            {/* Day → Day: same person or another member, any weekday mapping */}
            {copyMode === "day" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Source Day</Label>
                    <Select value={copySourceDay} onValueChange={setCopySourceDay}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Source day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_NAMES.map((name, i) => (
                          <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Target Day</Label>
                    <Select value={copyTargetDay} onValueChange={setCopyTargetDay}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Target day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_NAMES.map((name, i) => (
                          <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Copy To Member</Label>
                  <Select value={copyTargetUserId || copySourceUserId} onValueChange={setCopyTargetUserId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.id === copySourceUserId ? `${u.name} (same person)` : u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Copies <strong>{DAY_NAMES[Number(copySourceDay)] || "source day"}</strong> slots onto{" "}
                    <strong>{DAY_NAMES[Number(copyTargetDay)] || "target day"}</strong> for the selected member
                    (same person OK). Only that target weekday is replaced.
                  </p>
                </div>
              </div>
            )}

            {/* Conditional fields based on mode */}
            {copyMode === "user" && (
              <div className="space-y-2">
                <Label>Target Employee</Label>
                <Select value={copyTargetUserId} onValueChange={setCopyTargetUserId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select target employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers
                      .filter((u) => u.id !== copySourceUserId)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700">
                  <p className="text-[11px] text-amber-800 dark:text-amber-200">
                    This will <strong>replace</strong> the target user&apos;s entire recurring weekly schedule. For same-person day copies, use <strong>Day → Day</strong>.
                  </p>
                </div>
              </div>
            )}

            {copyMode === "date" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Apply To</Label>
                  <Select value={copyTargetUserId || copySourceUserId} onValueChange={setCopyTargetUserId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Source member (${copySourceName})`} />
                    </SelectTrigger>
                    <SelectContent>
                      {teamUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.id === copySourceUserId ? `${u.name} (same person)` : u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {copyTargetDate
                          ? new Date(copyTargetDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })
                          : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={copyTargetDate ? new Date(copyTargetDate + "T00:00:00") : undefined}
                        onSelect={(d) => { if (d) setCopyTargetDate(formatDateOnly(d)); }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Creates an <strong>override</strong> on the target date using the source member&apos;s availability for that day of the week (combined into a single time range). Any existing override for that date will be replaced.
                  </p>
                </div>
              </div>
            )}

            {copyMode === "range" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Apply To</Label>
                  <Select value={copyTargetUserId || copySourceUserId} onValueChange={setCopyTargetUserId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Source member (${copySourceName})`} />
                    </SelectTrigger>
                    <SelectContent>
                      {teamUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.id === copySourceUserId ? `${u.name} (same person)` : u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {copyTargetStartDate
                            ? new Date(copyTargetStartDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "Pick"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={copyTargetStartDate ? new Date(copyTargetStartDate + "T00:00:00") : undefined}
                          onSelect={(d) => {
                            if (d) {
                              const ds = formatDateOnly(d);
                              setCopyTargetStartDate(ds);
                              if (copyTargetEndDate && copyTargetEndDate < ds) setCopyTargetEndDate(ds);
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarDays className="mr-2 h-4 w-4" />
                          {copyTargetEndDate
                            ? new Date(copyTargetEndDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "Pick"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={copyTargetEndDate ? new Date(copyTargetEndDate + "T00:00:00") : undefined}
                          onSelect={(d) => { if (d) setCopyTargetEndDate(formatDateOnly(d)); }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Creates a <strong>date range entry</strong> covering the selected dates using the source member&apos;s combined weekly availability window (earliest start → latest end across all days).
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCopySubmit} disabled={copying}>
              {copying ? "Copying..." : <><Copy className="h-4 w-4 mr-1.5" /> Copy Availability</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponents: OverrideList & DateRangeList ──────────────────────────────

function OverrideList({
  overrides,
  onEdit,
  onDelete,
  dimmed = false,
  canEdit = true,
}: {
  overrides: OverrideEntry[];
  onEdit: (o: OverrideEntry) => void;
  onDelete: (id: string) => void;
  dimmed?: boolean;
  canEdit?: boolean;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className={`space-y-2 md:hidden ${dimmed ? "opacity-60" : ""}`}>
        {overrides.map((override) => (
          <div key={override.id} className="p-3 rounded-lg border bg-muted/20">
            <div className="flex items-start gap-2.5">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={override.user?.avatar || undefined} alt={override.user?.name || ""} />
                <AvatarFallback className="text-xs">
                  {override.user?.name ? getUserInitials(override.user.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{override.user?.name || "Unknown"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(override.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {override.startTime && override.endTime
                    ? `${override.startTime} – ${override.endTime}`
                    : "All Day"}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    className={`text-[10px] px-2 py-0.5 border-0 ${
                      override.isAvailable
                        ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                    }`}
                  >
                    {override.isAvailable ? "Available" : "Unavailable"}
                  </Badge>
                </div>
                {override.reason && (
                  <div className="text-xs text-muted-foreground mt-1">{safeText(override.reason)}</div>
                )}
                {canEdit && (
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onEdit(override)}>
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => onDelete(override.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden md:block rounded-md border overflow-hidden ${dimmed ? "opacity-70" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Employee</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Time</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {overrides.map((override) => (
              <TableRow key={override.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={override.user?.avatar || undefined} alt={override.user?.name || ""} />
                      <AvatarFallback className="text-[8px]">
                        {override.user?.name ? getUserInitials(override.user.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{override.user?.name || "Unknown"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {new Date(override.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "short", month: "short", day: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {override.startTime && override.endTime
                    ? `${override.startTime} – ${override.endTime}`
                    : "All Day"}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`text-[10px] px-2 py-0.5 border-0 ${
                      override.isAvailable
                        ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                    }`}
                  >
                    {override.isAvailable ? "Available" : "Unavailable"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {override.reason ? safeText(override.reason) : "—"}
                </TableCell>
                <TableCell>
                  {canEdit ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => onEdit(override)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => onDelete(override.id)}>
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function DateRangeList({
  ranges,
  onEdit,
  onDelete,
  dimmed = false,
  canEdit = true,
}: {
  ranges: DateRangeEntry[];
  onEdit: (r: DateRangeEntry) => void;
  onDelete: (id: string) => void;
  dimmed?: boolean;
  canEdit?: boolean;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className={`space-y-2 md:hidden ${dimmed ? "opacity-60" : ""}`}>
        {ranges.map((range) => {
          const isSingleDay = range.startDate === range.endDate;
          return (
            <div key={range.id} className="p-3 rounded-lg border bg-muted/20">
              <div className="flex items-start gap-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={range.user?.avatar || undefined} alt={range.user?.name || ""} />
                  <AvatarFallback className="text-xs">
                    {range.user?.name ? getUserInitials(range.user.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{range.user?.name || "Unknown"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isSingleDay
                      ? new Date(range.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                      : <>
                        {new Date(range.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" → "}
                        {new Date(range.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {range.startTime && range.endTime
                      ? `${range.startTime} – ${range.endTime}`
                      : "All Day"}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge
                      className={`text-[10px] px-2 py-0.5 border-0 ${
                        range.isAvailable
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                      }`}
                    >
                      {range.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                  </div>
                  {range.reason && (
                    <div className="text-xs text-muted-foreground mt-1">{safeText(range.reason)}</div>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onEdit(range)}>
                        <Edit3 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => onDelete(range.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className={`hidden md:block rounded-md border overflow-hidden ${dimmed ? "opacity-70" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Employee</TableHead>
              <TableHead className="text-xs">Date Range</TableHead>
              <TableHead className="text-xs">Time</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranges.map((range) => {
              const isSingleDay = range.startDate === range.endDate;
              return (
                <TableRow key={range.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={range.user?.avatar || undefined} alt={range.user?.name || ""} />
                        <AvatarFallback className="text-[8px]">
                          {range.user?.name ? getUserInitials(range.user.name) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{range.user?.name || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {isSingleDay
                      ? new Date(range.startDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                      : <>
                        {new Date(range.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" → "}
                        {new Date(range.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {range.startTime && range.endTime
                      ? `${range.startTime} – ${range.endTime}`
                      : "All Day"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] px-2 py-0.5 border-0 ${
                        range.isAvailable
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
                      }`}
                    >
                      {range.isAvailable ? "Available" : "Unavailable"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {range.reason ? safeText(range.reason) : "—"}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => onEdit(range)}>
                          <Edit3 className="h-3 w-3 mr-1" />Edit
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => onDelete(range.id)}>
                          <Trash2 className="h-3 w-3 mr-1" />Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
