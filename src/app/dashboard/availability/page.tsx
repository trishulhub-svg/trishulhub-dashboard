"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { safeArray, safeText } from "@/lib/utils";
import {
  Clock, Plus, Trash2, CalendarDays, AlertCircle, ChevronLeft, ChevronRight,
  CalendarClock, Edit3, X, RefreshCw,
  Users, BarChart3, Timer, FileText, Eye,
  MoreHorizontal, LayoutGrid, List, Copy, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  users: WeekScheduleUser[];
}

interface DailySchedule {
  date: string;
  dayOfWeek: number;
  dayName: string;
  user: { id: string; name: string; email: string; role: string; department: string | null; avatar: string | null };
  availability: { id: string; startTime: string; endTime: string; isAvailable: boolean; hours: number }[];
  overrides: { id: string; date: string; startTime: string | null; endTime: string | null; isAvailable: boolean; reason: string | null }[];
  isOnLeave: boolean;
  leaveInfo: unknown;
  timeEntries: { id: string; description: string; clockIn: string; clockOut: string; totalHours: number; status: string; projectName: string | null }[];
  totalScheduledHours: number;
  totalWorkedHours: number;
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}


// ─── Main Component ────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const isSessionLoading = status === "loading";

  // ── Core data ──
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [availabilities, setAvailabilities] = useState<AvailabilityEntry[]>([]);
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Weekly Overview state ──
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    userId: string; userName: string; date: string; dayData: WeekDayData
  } | null>(null);

  // ── Daily Schedule state ──
  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [dailyUserId, setDailyUserId] = useState<string>("");
  const [dailySchedule, setDailySchedule] = useState<DailySchedule | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // ── Dialog states ──
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityEntry | null>(null);
  const [editingOverride, setEditingOverride] = useState<OverrideEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Delete confirmation states ──
  const [deleteAvailId, setDeleteAvailId] = useState<string | null>(null);
  const [deleteOverrideId, setDeleteOverrideId] = useState<string | null>(null);

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

  // ── Calendar popover state ──
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dailyCalendarOpen, setDailyCalendarOpen] = useState(false);

  // ── Schedules tab state ──
  const [schedUserId, setSchedUserId] = useState<string>("");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetUserId, setCopyTargetUserId] = useState<string>("");
  const [copying, setCopying] = useState(false);

  // ── Week user filter ──
  const [weekUserFilter, setWeekUserFilter] = useState<string>("all");

  // ── Team view day status filter ──
  const [dayStatusFilter, setDayStatusFilter] = useState<string>("all");

  // ── Day detail popup state ──
  const [dayDetailDialogOpen, setDayDetailDialogOpen] = useState(false);

  // ── Team view filter ──
  const [teamViewFilter, setTeamViewFilter] = useState<string>("all");

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

  // ── Helper: navigate to daily tab ──
  const navigateToDaily = useCallback((userId: string, date: string) => {
    setDailyUserId(userId);
    setDailyDate(new Date(date + "T00:00:00"));
    setSelectedDayDetail(null);
    setDayDetailDialogOpen(false);
    const dailyTab = document.querySelector('[data-state][value="daily"]') as HTMLElement;
    if (dailyTab) dailyTab.click();
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

  // ── Computed values ──
  const currentWeekStart = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return getWeekStart(now);
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);

  const weekStartStr = formatDateOnly(currentWeekStart);
  const weekEndStr = formatDateOnly(weekDates[6]);

  // ── Data fetching ──
  const fetchCoreData = useCallback(async () => {
    try {
      const [availRes, overrideRes, teamRes] = await Promise.all([
        fetch("/api/availability", { credentials: "include" }),
        fetch("/api/availability/overrides", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
      ]);
      if (availRes.status === 401 || overrideRes.status === 401 || teamRes.status === 401) {
        router.push("/login");
        return;
      }
      if (availRes.ok) setAvailabilities(safeArray(await availRes.json()));
      if (overrideRes.ok) setOverrides(safeArray(await overrideRes.json()));
      if (teamRes.ok) {
        const users = safeArray<TeamUser>(await teamRes.json());
        setTeamUsers(users);
        if (!dailyUserId && users.length > 0) {
          setDailyUserId(users[0].id);
        }
        if (!schedUserId && users.length > 0) {
          setSchedUserId(users[0].id);
        }
      }
    } catch (err: unknown) {
      console.error("[availability] Failed to fetch data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router, dailyUserId]);

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

  const fetchDailySchedule = useCallback(async () => {
    if (!dailyUserId) return;
    setDailyLoading(true);
    try {
      const dateStr = formatDateOnly(dailyDate);
      const res = await fetch(
        `/api/availability/schedule?date=${dateStr}&userId=${dailyUserId}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setDailySchedule(data);
      } else if (res.status === 401) {
        router.push("/login");
      }
    } catch (err: unknown) {
      console.error("Failed to fetch daily schedule:", err);
    } finally {
      setDailyLoading(false);
    }
  }, [dailyUserId, dailyDate, router]);

  useEffect(() => {
    if (isUserAdmin) fetchCoreData();
  }, [fetchCoreData, isUserAdmin]);

  useEffect(() => {
    if (isUserAdmin && !loading) fetchWeekSchedule();
  }, [fetchWeekSchedule, isUserAdmin, loading]);

  useEffect(() => {
    if (isUserAdmin && !loading && dailyUserId) fetchDailySchedule();
  }, [fetchDailySchedule, isUserAdmin, loading, dailyUserId]);

  // ── Filter upcoming overrides ──
  const upcomingOverrides = useMemo(
    () => overrides.filter((o) => {
      const d = new Date(o.date + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d >= today;
    }),
    [overrides]
  );

  const pastOverrides = useMemo(
    () => overrides.filter((o) => {
      const d = new Date(o.date + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d < today;
    }),
    [overrides]
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
        const err = await res.json();
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
        const err = await res.json();
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

  // ── Copy Schedule Handler ──
  const handleCopySchedule = async () => {
    if (!schedUserId || !copyTargetUserId || schedUserId === copyTargetUserId) {
      toast.error("Select a different target user");
      return;
    }
    setCopying(true);
    try {
      const sourceSlots = availabilities.filter((a) => a.userId === schedUserId);
      if (sourceSlots.length === 0) {
        toast.error("No schedule found for the source user");
        setCopying(false);
        return;
      }

      // Delete target user's existing slots
      const targetSlots = availabilities.filter((a) => a.userId === copyTargetUserId);
      await Promise.all(
        targetSlots.map((s) =>
          fetch(`/api/availability/${s.id}`, { method: "DELETE", credentials: "include" })
        )
      );

      // Create new slots for target (with small delay to avoid overlap conflicts)
      let failCount = 0;
      for (const s of sourceSlots) {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: copyTargetUserId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isAvailable: s.isAvailable,
          }),
        });
        if (!res.ok) failCount++;
      }

      if (failCount === 0) {
        toast.success("Schedule copied successfully");
      } else {
        toast.error(`${failCount}/${sourceSlots.length} slots failed to copy`);
      }
      setCopyDialogOpen(false);
      setCopyTargetUserId("");
      fetchCoreData();
      fetchWeekSchedule();
    } catch {
      toast.error("Failed to copy schedule");
    } finally {
      setCopying(false);
    }
  };

  // ── Navigation ──
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

  if (!isUserAdmin) {
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
  const todayStr = formatDateOnly(new Date());

  // Helper: compute slot hours
  const slotHours = (start: string, end: string) => {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    return Math.round((diff / 60) * 10) / 10;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title="Availability Management" description="Manage team schedules, daily views, and availability overrides">
        <Button variant="outline" size="sm" className="md:hidden" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
          <CalendarDays className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Override</span>
        </Button>
        <Button size="sm" className="md:hidden" onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" /> <span className="hidden sm:inline">Availability</span>
        </Button>
        <Button variant="outline" className="hidden md:inline-flex" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
          <CalendarDays className="h-4 w-4 mr-2" /> Add Override
        </Button>
        <Button className="hidden md:inline-flex" onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Availability
        </Button>
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
              <div className="text-[10px] md:text-xs text-muted-foreground">Active Overrides</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-3 sm:px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
              <Timer className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <div className="text-lg font-bold">
                {weekSchedule ? weekSchedule.users.reduce((acc, u) => {
                  const d = u.days[todayStr];
                  if (d && d.totalHours > 0) acc++;
                  return acc;
                }, 0) : 0}
              </div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Available Today</div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="schedules" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="schedules" className="text-xs sm:text-sm">
            <LayoutGrid className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Manage </span>Schedules
          </TabsTrigger>
          <TabsTrigger value="team" className="text-xs sm:text-sm">
            <CalendarDays className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Team </span>View
          </TabsTrigger>
          <TabsTrigger value="daily" className="text-xs sm:text-sm">
            <Clock className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Daily </span>Schedule
          </TabsTrigger>
          <TabsTrigger value="overrides" className="text-xs sm:text-sm">
            <CalendarClock className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Overrides </span>({upcomingOverrides.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: Manage Schedules (per-user)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="schedules" className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Select value={schedUserId} onValueChange={setSchedUserId}>
              <SelectTrigger className="w-[160px] sm:w-[220px] h-9 text-xs sm:text-sm">
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
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => { setCopyTargetUserId(""); setCopyDialogOpen(true); }}
              disabled={!schedUserId || availabilities.filter((a) => a.userId === schedUserId).length === 0}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy Schedule
            </Button>
          </div>

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
                      <Timer className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium text-foreground">{Math.round(totalWeeklyHours * 10) / 10}h</span> total weekly
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-sky-500" />
                      <span className="font-medium text-foreground">{configuredDays}</span>/7 days configured
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openQuickAddSlot(schedUserId, dayIndex)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Slot
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      {daySlots.length === 0 ? (
                        <div className="flex items-center justify-between py-3 text-muted-foreground">
                          <span className="text-xs">No availability configured</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => openQuickAddSlot(schedUserId, dayIndex)}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {daySlots
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
                                      <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 border-0">
                                        Unavailable
                                      </Badge>
                                    )}
                                  </div>
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
                <CalendarDays className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">Select a team member to manage their weekly schedule</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: Team View (weekly grid – mobile cards, desktop grid)
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="team" className="space-y-4">
          {/* Week Navigation */}
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
                <SelectTrigger className="w-[110px] sm:w-[160px] h-9 text-xs">
                  <Filter className="h-3 w-3 mr-1 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { value: "all", label: "All", dot: "bg-gray-400" },
              { value: "available", label: "Available", dot: "bg-green-500" },
              { value: "unavailable", label: "Not Set", dot: "bg-gray-300 dark:bg-gray-600" },
              { value: "leave", label: "On Leave", dot: "bg-sky-500" },
              { value: "override", label: "Override", dot: "bg-amber-500" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setDayStatusFilter(f.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all shrink-0 ${
                  dayStatusFilter === f.value
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${f.dot}`} />
                {f.label}
              </button>
            ))}
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
                              <div className="text-sm font-semibold truncate">{userSchedule.user.name}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {Math.round(totalHours * 10) / 10}h/week · {configuredDays} days configured
                              </div>
                            </div>
                            <Badge className="text-[9px] px-1.5 py-0 bg-muted border-0 shrink-0">
                              {safeText(userSchedule.user.role, "Member").toUpperCase()}
                            </Badge>
                          </div>

                          {/* 7-day dot strip */}
                          <div className="flex">
                            {weekDates.map((date, i) => {
                              const ds = formatDateOnly(date);
                              const dd = userSchedule.days[ds];
                              const isToday = ds === todayStr;
                              let dotColor = "bg-gray-300 dark:bg-gray-600"; // not set
                              if (dd) {
                                if (dd.isOnLeave) dotColor = "bg-sky-500";
                                else if (dd.override && !dd.isOnLeave) dotColor = "bg-amber-500";
                                else if (dd.availability.length > 0) dotColor = "bg-green-500";
                              }
                              return (
                                <button
                                  key={ds}
                                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 border-r last:border-r-0 transition-colors ${isToday ? "bg-primary/5" : "hover:bg-muted/30"}`}
                                  onClick={() => dd && openDayDetail(userSchedule.user.id, userSchedule.user.name, ds, dd)}
                                >
                                  <span className={`text-[9px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                    {DAY_NAMES_SHORT[i]}
                                  </span>
                                  <span className={`h-3 w-3 rounded-full ${dotColor}`} />
                                  <span className={`text-[9px] ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                                    {date.getDate()}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Manage button */}
                          <div className="border-t p-2.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-9 text-xs justify-center"
                              onClick={() => {
                                setSchedUserId(userSchedule.user.id);
                              }}
                            >
                              <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Manage Schedule →
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
                    <div className="min-w-[700px] lg:min-w-[900px]">
                      {/* Header row */}
                      <div className="grid grid-cols-[130px_repeat(7,1fr)] border-b bg-muted/50 sticky top-0 z-10">
                        <div className="p-2 sm:p-3 text-[10px] sm:text-xs font-semibold text-muted-foreground border-r flex items-center">
                          Team Member
                        </div>
                        {weekDates.map((date, i) => {
                          const dayStr = formatDateOnly(date);
                          const isToday = dayStr === todayStr;
                          return (
                            <div
                              key={dayStr}
                              className={`p-1.5 sm:p-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                            >
                              <div className={`text-[9px] sm:text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                {DAY_NAMES_SHORT[i]}
                              </div>
                              <div className={`text-sm sm:text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                                {date.getDate()}
                              </div>
                              <div className={`text-[8px] sm:text-[10px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                {date.toLocaleDateString("en-US", { month: "short" })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* User rows */}
                      {weekSchedule.users
                        .filter((u) => weekUserFilter === "all" || u.user.id === weekUserFilter)
                        .map((userSchedule) => (
                        <div
                          key={userSchedule.user.id}
                          className="grid grid-cols-[130px_repeat(7,1fr)] border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                        >
                          {/* User info */}
                          <div className="p-2 sm:p-3 border-r flex items-center gap-1.5 sm:gap-2">
                            <Avatar className="h-5 w-5 sm:h-7 sm:w-7">
                              <AvatarImage src={userSchedule.user.avatar || undefined} alt={userSchedule.user.name} />
                              <AvatarFallback className="text-[8px] sm:text-[10px]">
                                {getUserInitials(userSchedule.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="text-[10px] sm:text-sm font-medium truncate">{userSchedule.user.name}</div>
                              <div className="text-[8px] sm:text-[10px] text-muted-foreground truncate">
                                {safeText(userSchedule.user.role, "")}
                              </div>
                            </div>
                          </div>

                          {/* Day cells */}
                          {weekDates.map((date) => {
                            const dayStr = formatDateOnly(date);
                            const dayData = userSchedule.days[dayStr];
                            const isToday = dayStr === todayStr;

                            if (!dayData) {
                              return (
                                <div key={dayStr} className="p-2 border-r last:border-r-0 flex items-center justify-center">
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                </div>
                              );
                            }

                            return (
                              <Tooltip key={dayStr}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`p-2 border-r last:border-r-0 cursor-pointer transition-colors hover:bg-muted/40 min-h-[80px] flex flex-col gap-1 ${isToday ? "bg-primary/[0.03]" : ""}`}
                                    onClick={() => openDayDetail(userSchedule.user.id, userSchedule.user.name, dayStr, dayData)}
                                  >
                                    <div className="flex flex-wrap gap-1">
                                      {dayData.isOnLeave && (
                                        <Badge className="text-[9px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0">
                                          LEAVE
                                        </Badge>
                                      )}
                                      {dayData.override && !dayData.isOnLeave && (
                                        <Badge className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                                          OVERRIDE
                                        </Badge>
                                      )}
                                    </div>
                                    {dayData.isOnLeave ? (
                                      <div className="flex-1 flex items-center justify-center">
                                        <span className="text-[10px] text-sky-500 font-medium">Off</span>
                                      </div>
                                    ) : dayData.availability.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {dayData.availability.slice(0, 3).map((slot) => {
                                          const rawEntry = findAvailEntry(slot.id);
                                          return (
                                            <Badge
                                              key={slot.id}
                                              className={`text-[9px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0 transition-colors ${rawEntry ? "cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50" : ""}`}
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
                                        {dayData.availability.length > 3 && (
                                          <span className="text-[9px] text-muted-foreground">+{dayData.availability.length - 3}</span>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex-1 flex items-center justify-center">
                                        <span className="text-[10px] text-muted-foreground">Not Set</span>
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[260px]">
                                  <div className="space-y-1.5 text-left">
                                    <div className="font-semibold text-xs">{userSchedule.user.name} — {dayData.dayName}, {dayStr}</div>
                                    <Separator />
                                    {dayData.isOnLeave ? (
                                      <div className="text-[11px] text-sky-600 font-medium">On Leave</div>
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
                                        <span className="font-medium text-amber-600">Override: </span>
                                        {dayData.override.isAvailable ? "Available" : "Unavailable"}
                                        {dayData.override.reason && ` — ${dayData.override.reason}`}
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 3: Daily Schedule
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Popover open={dailyCalendarOpen} onOpenChange={setDailyCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 min-w-[140px] sm:min-w-[180px] justify-start text-left font-normal text-xs sm:text-sm">
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {dailyDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dailyDate}
                  onSelect={(d) => { if (d) { setDailyDate(d); setDailyCalendarOpen(false); } }}
                />
              </PopoverContent>
            </Popover>

            <Select value={dailyUserId} onValueChange={setDailyUserId}>
              <SelectTrigger className="w-[120px] sm:w-[200px] h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Select member" />
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
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="ghost" size="sm" onClick={() => setDailyDate(new Date())} className="h-9 text-xs">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() - 1);
              setDailyDate(d);
            }} className="h-9 w-9 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() + 1);
              setDailyDate(d);
            }} className="h-9 w-9 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {dailyLoading ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-[400px] rounded-lg" />
            </div>
          ) : dailySchedule ? (
            <div className="space-y-4">
              {/* Leave banner */}
              {dailySchedule.isOnLeave && (
                <Card className="border-sky-200 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
                  <CardContent className="py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
                      <CalendarDays className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-sky-700 dark:text-sky-300">
                        {safeText(dailySchedule.user.name)} is on leave today
                      </div>
                      {(() => {
                        const info = dailySchedule.leaveInfo;
                        if (info && typeof info === "object" && "reason" in info) {
                          const reason = (info as Record<string, unknown>).reason;
                          if (reason && typeof reason === "string") {
                            return <div className="text-xs text-sky-600 dark:text-sky-400">{safeText(reason)}</div>;
                          }
                        }
                        return null;
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stats cards */}
              <div className="grid gap-3 grid-cols-2">
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <Timer className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">{dailySchedule.totalScheduledHours}h</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Scheduled</div>
                    </div>
                  </div>
                </Card>
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                      <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">{dailySchedule.totalWorkedHours}h</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Worked</div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Timeline Area */}
              <div className="grid grid-cols-1 gap-4">
                {/* Left: Availability timeline */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Timer className="h-4 w-4 text-emerald-500" />
                      Availability Schedule
                    </CardTitle>
                    <Button
                      variant="ghost" size="sm" className="h-8 text-xs ml-auto"
                      onClick={() => openQuickAddSlot(dailyUserId, dailySchedule.dayOfWeek)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dailySchedule.availability.length === 0 && !dailySchedule.isOnLeave ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                        No availability configured for {dailySchedule.dayName}
                        <div className="mt-3">
                          <Button variant="outline" size="sm" onClick={() => openQuickAddSlot(dailyUserId, dailySchedule.dayOfWeek)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Availability
                          </Button>
                        </div>
                      </div>
                    ) : dailySchedule.availability.length > 0 ? (
                      dailySchedule.availability.map((slot) => {
                        const startMin = timeToMinutes(slot.startTime);
                        const endMin = timeToMinutes(slot.endTime);
                        const duration = endMin - startMin;
                        const dayStart = 480;
                        const dayEnd = 1200;
                        const totalRange = dayEnd - dayStart;
                        const leftPct = Math.max(0, ((startMin - dayStart) / totalRange) * 100);
                        const widthPct = Math.max(2, (duration / totalRange) * 100);
                        const slotEntry = findAvailEntry(slot.id) || makeEntryFromSlot(slot, dailyUserId, dailySchedule.dayOfWeek);

                        return (
                          <div key={slot.id} className="space-y-1.5">
                            <div
                              className="relative h-10 bg-muted/50 rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500/30 transition-all"
                              onClick={() => openEditAvailability(slotEntry)}
                            >
                              <div className="absolute inset-0 flex justify-between px-1 text-[8px] text-muted-foreground/50">
                                <span>8am</span><span>10am</span><span>12pm</span><span>2pm</span><span>4pm</span><span>6pm</span><span>8pm</span>
                              </div>
                              <div
                                className="absolute top-1 bottom-1 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              >
                                <span className="text-[9px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap px-1">
                                  {slot.startTime}-{slot.endTime}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs text-muted-foreground">{slot.hours}h scheduled</span>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => openEditAvailability(slotEntry)}>
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setDeleteAvailId(slot.id)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : null}

                    {dailySchedule.overrides.length > 0 && (
                      <div className="mt-3 p-2 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Active Override(s)</div>
                        {dailySchedule.overrides.map((o) => (
                          <div key={o.id} className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                            {o.isAvailable ? "Available" : "Unavailable"}
                            {o.startTime && o.endTime ? ` (${o.startTime}–${o.endTime})` : " (All Day)"}
                            {o.reason && ` — ${safeText(o.reason)}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Time Entries Summary */}
              {dailySchedule.timeEntries.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-500" />
                      Time Entries
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs">Project</TableHead>
                              <TableHead className="text-xs">Clock In</TableHead>
                              <TableHead className="text-xs">Clock Out</TableHead>
                              <TableHead className="text-xs text-right">Hours</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailySchedule.timeEntries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell className="text-xs font-medium max-w-[200px] truncate">
                                  {safeText(entry.description, "No description")}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {safeText(entry.projectName, "—")}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {safeText(entry.clockIn)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {safeText(entry.clockOut, "—")}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-right">
                                  {entry.totalHours}h
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={`text-[9px] px-1.5 py-0 border-0 ${
                                      entry.status === "APPROVED"
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                        : entry.status === "PENDING"
                                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                          : "bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400"
                                    }`}
                                  >
                                    {safeText(entry.status)}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-muted/50 font-semibold">
                              <TableCell colSpan={4} className="text-xs">Total</TableCell>
                              <TableCell className="text-xs text-right">{dailySchedule.totalWorkedHours}h</TableCell>
                              <TableCell />
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 flex flex-col items-center text-muted-foreground">
                <Clock className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">Select a date and team member to view the daily schedule</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 4: Overrides
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overrides" className="space-y-4">
          {/* Upcoming overrides */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>Upcoming Overrides</CardTitle>
                  <CardDescription>Active and future availability overrides</CardDescription>
                </div>
                <Button size="sm" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Override
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingOverrides.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <CalendarClock className="h-12 w-12 opacity-30 mb-3" />
                  <p className="text-sm">No upcoming overrides</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                    <Plus className="h-3 w-3 mr-1" /> Create Override
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile card layout */}
                  <div className="space-y-2 md:hidden">
                    {upcomingOverrides.map((override) => (
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
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                }`}
                              >
                                {override.isAvailable ? "Available" : "Unavailable"}
                              </Badge>
                            </div>
                            {override.reason && (
                              <div className="text-xs text-muted-foreground mt-1">{safeText(override.reason)}</div>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => openEditOverride(override)}>
                                <Edit3 className="h-3 w-3 mr-1" /> Edit
                              </Button>
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setDeleteOverrideId(override.id)}>
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table layout */}
                  <div className="hidden md:block rounded-md border overflow-hidden">
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
                        {upcomingOverrides.map((override) => (
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
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                }`}
                              >
                                {override.isAvailable ? "Available" : "Unavailable"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {override.reason ? safeText(override.reason) : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => openEditOverride(override)}>
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setDeleteOverrideId(override.id)}>
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Past overrides */}
          {pastOverrides.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Past Overrides</CardTitle>
                <CardDescription>Historical override records</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="hidden md:block rounded-md border overflow-hidden">
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
                      {pastOverrides.map((override) => (
                        <TableRow key={override.id} className="opacity-60">
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
                              month: "short", day: "numeric",
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
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                              }`}
                            >
                              {override.isAvailable ? "Available" : "Unavailable"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {override.reason ? safeText(override.reason) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => openEditOverride(override)}>
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" onClick={() => setDeleteOverrideId(override.id)}>
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile past overrides */}
                <div className="md:hidden space-y-2">
                  {pastOverrides.map((override) => (
                    <div key={override.id} className="p-3 rounded-lg border bg-muted/20 opacity-60">
                      <div className="flex items-start gap-2.5">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={override.user?.avatar || undefined} alt={override.user?.name || ""} />
                          <AvatarFallback className="text-[8px]">
                            {override.user?.name ? getUserInitials(override.user.name) : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{override.user?.name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(override.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge className={`text-[10px] px-2 py-0.5 border-0 ${override.isAvailable ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
                              {override.isAvailable ? "Available" : "Unavailable"}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {override.startTime && override.endTime ? `${override.startTime}–${override.endTime}` : "All Day"}
                            </span>
                          </div>
                          {override.reason && (
                            <div className="text-xs text-muted-foreground mt-1">{safeText(override.reason)}</div>
                          )}
                          <div className="flex items-center gap-1 mt-2">
                            <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px]" onClick={() => openEditOverride(override)}>Edit</Button>
                            <Button variant="outline" size="sm" className="h-8 px-2.5 text-[10px] text-red-600 border-red-200 dark:border-red-800" onClick={() => setDeleteOverrideId(override.id)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
                <div className="flex items-center gap-2 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                  <CalendarDays className="h-4 w-4 text-sky-500 shrink-0" />
                  <span className="text-sm font-medium text-sky-700 dark:text-sky-300">On Leave</span>
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
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDayDetailDialogOpen(false); openQuickAddSlot(selectedDayDetail.userId, selectedDayDetail.dayData.dayOfWeek); }}>
                    <Plus className="h-3 w-3 mr-0.5" /> Add
                  </Button>
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
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setDayDetailDialogOpen(false); openEditAvailability(entry); }}>
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] text-red-600 border-red-200 dark:border-red-800" onClick={() => { setDeleteAvailId(slot.id); setDayDetailDialogOpen(false); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
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
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Override Active</span>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] text-amber-600" onClick={() => {
                      const ovr = overrides.find(o => o.id === selectedDayDetail.dayData.override!.id);
                      if (ovr) { setDayDetailDialogOpen(false); openEditOverride(ovr); }
                    }}>
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">
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
                <Button variant="outline" size="sm" className="flex-1 min-w-[100px] h-9 text-xs" onClick={() => { setDayDetailDialogOpen(false); navigateToDaily(selectedDayDetail.userId, selectedDayDetail.date); }}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Daily
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
            <DialogTitle>{editingAvailability ? "Edit Availability" : "Add Availability"}</DialogTitle>
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
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
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
            <Button onClick={handleSaveAvailability} disabled={submitting}>
              {submitting ? "Saving..." : editingAvailability ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOverride ? "Edit Override" : "Add Availability Override"}</DialogTitle>
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
              <Popover>
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
                    onSelect={(d) => { if (d) setFormOverrideDate(formatDateOnly(d)); }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <Input
                  type="time"
                  value={formOverrideStartTime}
                  onChange={(e) => setFormOverrideStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                <Input
                  type="time"
                  value={formOverrideEndTime}
                  onChange={(e) => setFormOverrideEndTime(e.target.value)}
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
            <Button onClick={handleSaveOverride} disabled={submitting}>
              {submitting ? "Saving..." : editingOverride ? "Update Override" : "Add Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Availability Confirmation Dialog */}
      <AlertDialog open={!!deleteAvailId} onOpenChange={() => setDeleteAvailId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Availability</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this availability slot? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteAvailId && handleDeleteAvailability(deleteAvailId)} className="bg-red-600 hover:bg-red-700">
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
            <AlertDialogAction onClick={() => deleteOverrideId && handleDeleteOverride(deleteOverrideId)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy Schedule Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Weekly Schedule</DialogTitle>
            <DialogDescription>
              Copy the entire weekly schedule from one team member to another. This will replace the target user&apos;s existing schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <div className="text-sm font-medium px-3 py-2 bg-muted rounded-md">
                {teamUsers.find((u) => u.id === schedUserId)?.name || "Unknown"}
                <span className="text-muted-foreground ml-2 text-xs">
                  ({availabilities.filter((a) => a.userId === schedUserId).length} slots)
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Employee</Label>
              <Select value={copyTargetUserId} onValueChange={setCopyTargetUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select target employee" />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers
                    .filter((u) => u.id !== schedUserId)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This will delete all existing availability slots for the target user and create new ones matching the source schedule.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCopySchedule}
              disabled={copying || !copyTargetUserId}
            >
              {copying ? "Copying..." : <><Copy className="h-4 w-4 mr-1.5" /> Copy Schedule</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
