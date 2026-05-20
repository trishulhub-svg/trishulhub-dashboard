"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { safeArray, safeText } from "@/lib/utils";
import {
  Clock, Plus, Trash2, CalendarDays, AlertCircle, ChevronLeft, ChevronRight,
  CheckCircle2, Circle, CalendarClock, Edit3, X, RefreshCw,
  Users, BarChart3, Timer, Target, Video, FileText, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  taskCount: number;
  doneTaskCount: number;
  meetingCount: number;
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
  tasks: { id: string; title: string; status: string; priority: string; deadline: string; projectName: string | null; projectStatus: string | null }[];
  timeEntries: { id: string; description: string; clockIn: string; clockOut: string; totalHours: number; status: string; projectName: string | null }[];
  meetings: { id: string; title: string; startTime: string; endTime: string; meetingType: string; status: string }[];
  totalScheduledHours: number;
  totalWorkedHours: number;
  taskSummary: { total: number; done: number; inProgress: number; todo: number };
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


// ─── Task status config ───────────────────────────────────────────────────────

const TASK_STATUS_STYLES: Record<string, { color: string; bg: string; darkBg: string; label: string }> = {
  DONE: { color: "text-green-700", bg: "bg-green-100", darkBg: "dark:bg-green-900/30", label: "Done" },
  IN_PROGRESS: { color: "text-sky-700", bg: "bg-sky-100", darkBg: "dark:bg-sky-900/30", label: "In Progress" },
  TODO: { color: "text-gray-600", bg: "bg-gray-100", darkBg: "dark:bg-gray-800/50", label: "To Do" },
  REVIEW: { color: "text-amber-700", bg: "bg-amber-100", darkBg: "dark:bg-amber-900/30", label: "Review" },
  AWAITING_APPROVAL: { color: "text-purple-700", bg: "bg-purple-100", darkBg: "dark:bg-purple-900/30", label: "Awaiting" },
};

// ─── Priority config ───────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, { color: string; label: string }> = {
  CRITICAL: { color: "text-red-600", label: "Critical" },
  HIGH: { color: "text-orange-600", label: "High" },
  MEDIUM: { color: "text-yellow-600", label: "Medium" },
  LOW: { color: "text-green-600", label: "Low" },
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  // ── Core data (useQuery with 60s cache) ──
  const queryClient = useQueryClient();
  const { data: coreData, isLoading: loading, error: coreError } = useQuery({
    queryKey: ["availability-core"],
    queryFn: async () => {
      const [availRes, overrideRes, teamRes] = await Promise.all([
        fetch("/api/availability", { credentials: "include" }),
        fetch("/api/availability/overrides", { credentials: "include" }),
        fetch("/api/team?type=users", { credentials: "include" }),
      ]);
      if (availRes.status === 401 || overrideRes.status === 401 || teamRes.status === 401) {
        router.push("/login");
        throw new Error("Unauthorized");
      }
      const availabilities = availRes.ok ? safeArray<AvailabilityEntry>(await availRes.json()) : [];
      const overrides = overrideRes.ok ? safeArray<OverrideEntry>(await overrideRes.json()) : [];
      const teamUsers = teamRes.ok ? safeArray<TeamUser>(await teamRes.json()) : [];
      return { availabilities, overrides, teamUsers };
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled: !!isUserAdmin,
  });
  const teamUsers = coreData?.teamUsers ?? [];
  const availabilities = coreData?.availabilities ?? [];
  const overrides = coreData?.overrides ?? [];
  const [error, setError] = useState<string | null>(null);

  // ── Daily Schedule state (must be declared before useEffect below) ──
  const [dailyDate, setDailyDate] = useState<Date>(new Date());
  const [dailyUserId, setDailyUserId] = useState<string>("");

  // Set dailyUserId from first team user if not set
  useEffect(() => {
    if (teamUsers.length > 0 && !dailyUserId) {
      setDailyUserId(teamUsers[0].id);
    }
  }, [teamUsers, dailyUserId]);

  // ── Weekly Overview state ──
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    userId: string; userName: string; date: string; dayData: WeekDayData
  } | null>(null);

  // ── Computed values (needed by useQuery) ──
  const currentWeekStart = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return getWeekStart(now);
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);
  const weekStartStr = formatDateOnly(currentWeekStart);
  const weekEndStr = formatDateOnly(weekDates[6]);

  // ── Weekly Overview (useQuery with 60s cache) ──
  const { data: weekSchedule, isLoading: weekLoading } = useQuery({
    queryKey: ["availability-week", weekStartStr],
    queryFn: async () => {
      const res = await fetch(`/api/availability/schedule?type=week&date=${weekStartStr}`, {
        credentials: "include",
      });
      if (res.status === 401) { router.push("/login"); throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load");
      return await res.json();
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled: !!isUserAdmin && !loading,
  });

  // ── Daily Schedule (useQuery with 60s cache) ──
  const dailyDateStr = formatDateOnly(dailyDate);
  const { data: dailySchedule, isLoading: dailyLoading } = useQuery({
    queryKey: ["availability-daily", dailyUserId, dailyDateStr],
    queryFn: async () => {
      const res = await fetch(
        `/api/availability/schedule?date=${dailyDateStr}&userId=${dailyUserId}`,
        { credentials: "include" }
      );
      if (res.status === 401) { router.push("/login"); throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load");
      return await res.json();
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled: !!isUserAdmin && !loading && !!dailyUserId,
  });

  // ── Dialog states ──
  const [availDialogOpen, setAvailDialogOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<AvailabilityEntry | null>(null);
  const [editingOverride, setEditingOverride] = useState<OverrideEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  // ── Invalidate helpers for mutations ──
  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["availability-core"] });
    queryClient.invalidateQueries({ queryKey: ["availability-week"] });
    queryClient.invalidateQueries({ queryKey: ["availability-daily"] });
  }, [queryClient]);

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
        refreshAll();
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
        refreshAll();
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
        refreshAll();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
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
        refreshAll();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
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
        <Button variant="outline" onClick={() => { setError(null); refreshAll(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Try Again
        </Button>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Availability Management" description="Manage team schedules, daily views, and availability overrides">
        <Button variant="outline" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
          <CalendarDays className="h-4 w-4 mr-2" /> Add Override
        </Button>
        <Button onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Availability
        </Button>
      </PageHeader>

      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weekly">
            <CalendarDays className="h-4 w-4 mr-1.5" /> Weekly Overview
          </TabsTrigger>
          <TabsTrigger value="daily">
            <Clock className="h-4 w-4 mr-1.5" /> Daily Schedule
          </TabsTrigger>
          <TabsTrigger value="overrides">
            <CalendarClock className="h-4 w-4 mr-1.5" /> Overrides
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: Weekly Overview
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="weekly" className="space-y-4">
          {/* Week Navigation */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevWeek} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-[220px] justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {new Date(weekStartStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" — "}
                    {new Date(weekEndStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
              <Button variant="outline" size="sm" onClick={nextWeek} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={goToToday}>
                  Today
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Unavailable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> On Leave
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Override
              </span>
            </div>
          </div>

          {/* Weekly Grid */}
          <Card>
            <CardContent className="p-0">
              {weekLoading ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-6 w-full" />
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : !weekSchedule || weekSchedule.users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Users className="h-12 w-12 opacity-50 mb-3" />
                  <p className="text-sm">No team members found for this week</p>
                </div>
              ) : (
                <div className="w-full overflow-x-auto -mx-6">
                  <div className="min-w-[900px] px-6">
                    {/* Header row */}
                    <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b bg-muted/50 sticky top-0 z-10">
                      <div className="p-3 text-xs font-semibold text-muted-foreground border-r flex items-center">
                        Team Member
                      </div>
                      {weekDates.map((date, i) => {
                        const dayStr = formatDateOnly(date);
                        const isToday = dayStr === formatDateOnly(new Date());
                        return (
                          <div
                            key={dayStr}
                            className={`p-3 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                          >
                            <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                              {DAY_NAMES_SHORT[i]}
                            </div>
                            <div className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                              {date.getDate()}
                            </div>
                            <div className={`text-[10px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                              {date.toLocaleDateString("en-US", { month: "short" })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* User rows */}
                    {weekSchedule.users.map((userSchedule) => (
                      <div
                        key={userSchedule.user.id}
                        className="grid grid-cols-[180px_repeat(7,1fr)] border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        {/* User info */}
                        <div className="p-3 border-r flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={userSchedule.user.avatar || undefined} alt={userSchedule.user.name} />
                            <AvatarFallback className="text-[10px]">
                              {getUserInitials(userSchedule.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{userSchedule.user.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {safeText(userSchedule.user.role, "")}
                            </div>
                          </div>
                        </div>

                        {/* Day cells */}
                        {weekDates.map((date) => {
                          const dayStr = formatDateOnly(date);
                          const dayData = userSchedule.days[dayStr];
                          const isToday = dayStr === formatDateOnly(new Date());

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
                                  onClick={() => setSelectedDayDetail({
                                    userId: userSchedule.user.id,
                                    userName: userSchedule.user.name,
                                    date: dayStr,
                                    dayData,
                                  })}
                                >
                                  {/* Status badges */}
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

                                  {/* Availability slots */}
                                  {dayData.isOnLeave ? (
                                    <div className="flex-1 flex items-center justify-center">
                                      <span className="text-[10px] text-sky-500 font-medium">Off</span>
                                    </div>
                                  ) : dayData.availability.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {dayData.availability.slice(0, 3).map((slot) => (
                                        <Badge
                                          key={slot.id}
                                          className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0"
                                        >
                                          {slot.startTime}-{slot.endTime}
                                        </Badge>
                                      ))}
                                      {dayData.availability.length > 3 && (
                                        <span className="text-[9px] text-muted-foreground">+{dayData.availability.length - 3}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                      <span className="text-[10px] text-muted-foreground">Not Set</span>
                                    </div>
                                  )}

                                  {/* Counts row */}
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-auto pt-1 border-t border-border/50">
                                    {(dayData.taskCount > 0 || dayData.doneTaskCount > 0) && (
                                      <span className="flex items-center gap-0.5">
                                        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                                        {dayData.doneTaskCount}/{dayData.taskCount}
                                      </span>
                                    )}
                                    {dayData.meetingCount > 0 && (
                                      <span className="flex items-center gap-0.5">
                                        <Video className="h-2.5 w-2.5 text-sky-500" />
                                        {dayData.meetingCount}
                                      </span>
                                    )}
                                  </div>
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
                                  <div className="text-[10px] text-muted-foreground">
                                    Tasks: {dayData.doneTaskCount}/{dayData.taskCount} done
                                    {dayData.meetingCount > 0 && ` | Meetings: ${dayData.meetingCount}`}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day Detail Panel */}
          {selectedDayDetail && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {selectedDayDetail.userName} — {selectedDayDetail.dayData.dayName}
                    </CardTitle>
                    <CardDescription>
                      {selectedDayDetail.date}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDayDetail(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Availability */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Availability</h4>
                    {selectedDayDetail.dayData.isOnLeave ? (
                      <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0">
                        On Leave
                      </Badge>
                    ) : selectedDayDetail.dayData.availability.length > 0 ? (
                      <div className="space-y-1">
                        {selectedDayDetail.dayData.availability.map((slot) => (
                          <div key={slot.id} className="flex items-center gap-2 text-sm">
                            <Clock className="h-3.5 w-3.5 text-green-500" />
                            <span>{slot.startTime} – {slot.endTime}</span>
                            <span className="text-muted-foreground text-xs">({slot.hours}h)</span>
                          </div>
                        ))}
                        <div className="text-xs text-muted-foreground pt-1">
                          Total scheduled: {selectedDayDetail.dayData.totalHours}h
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not configured</span>
                    )}
                    {selectedDayDetail.dayData.override && (
                      <div className="mt-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Override Active</div>
                        <div className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                          {selectedDayDetail.dayData.override.isAvailable ? "Available" : "Unavailable"}
                          {selectedDayDetail.dayData.override.startTime && selectedDayDetail.dayData.override.endTime
                            ? ` (${selectedDayDetail.dayData.override.startTime}–${selectedDayDetail.dayData.override.endTime})`
                            : " (All Day)"}
                        </div>
                        {selectedDayDetail.dayData.override.reason && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {safeText(selectedDayDetail.dayData.override.reason)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Tasks</h4>
                    <div className="flex items-center gap-2 text-2xl font-bold">
                      <span>{selectedDayDetail.dayData.doneTaskCount}</span>
                      <span className="text-muted-foreground text-base font-normal">/ {selectedDayDetail.dayData.taskCount}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">done / total</div>
                    {selectedDayDetail.dayData.taskCount > 0 && (
                      <Progress
                        value={(selectedDayDetail.dayData.doneTaskCount / selectedDayDetail.dayData.taskCount) * 100}
                        className="h-1.5"
                      />
                    )}
                  </div>

                  {/* Meetings */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Meetings</h4>
                    <div className="flex items-center gap-2">
                      <Video className="h-5 w-5 text-sky-500" />
                      <span className="text-2xl font-bold">{selectedDayDetail.dayData.meetingCount}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">scheduled</div>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground">Quick Actions</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => {
                        setSelectedDayDetail(null);
                        setDailyDate(new Date(selectedDayDetail.date + "T00:00:00"));
                        setDailyUserId(selectedDayDetail.userId);
                        // Switch to daily tab programmatically via DOM
                        const dailyTab = document.querySelector('[data-state][value="daily"]') as HTMLElement;
                        if (dailyTab) dailyTab.click();
                      }}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> View Daily Detail
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: Daily Schedule
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date picker */}
            <Popover open={dailyCalendarOpen} onOpenChange={setDailyCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[180px] justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dailyDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
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

            {/* User selector */}
            <Select value={dailyUserId} onValueChange={setDailyUserId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {teamUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={u.avatar || undefined} alt={u.name} />
                        <AvatarFallback className="text-[8px]">{getUserInitials(u.name)}</AvatarFallback>
                      </Avatar>
                      {u.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Quick nav buttons */}
            <Button variant="ghost" size="sm" onClick={() => setDailyDate(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() - 1);
              setDailyDate(d);
            }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() + 1);
              setDailyDate(d);
            }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Daily Schedule Content */}
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
                    <div className="h-8 w-8 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center">
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
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Timer className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{dailySchedule.totalScheduledHours}h</div>
                        <div className="text-xs text-muted-foreground">Scheduled</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{dailySchedule.totalWorkedHours}h</div>
                        <div className="text-xs text-muted-foreground">Worked</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <Target className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {dailySchedule.taskSummary.done}/{dailySchedule.taskSummary.total}
                        </div>
                        <div className="text-xs text-muted-foreground">Tasks Done</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                        <Video className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{dailySchedule.meetings.length}</div>
                        <div className="text-xs text-muted-foreground">Meetings</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Task completion progress */}
              {dailySchedule.taskSummary.total > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Task Completion</span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round((dailySchedule.taskSummary.done / dailySchedule.taskSummary.total) * 100)}%
                      </span>
                    </div>
                    <Progress value={(dailySchedule.taskSummary.done / dailySchedule.taskSummary.total) * 100} className="h-2.5" />
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" /> {dailySchedule.taskSummary.done} done
                      </span>
                      <span className="flex items-center gap-1">
                        <Circle className="h-3 w-3 text-sky-500" /> {dailySchedule.taskSummary.inProgress} in progress
                      </span>
                      <span className="flex items-center gap-1">
                        <Circle className="h-3 w-3 text-gray-400" /> {dailySchedule.taskSummary.todo} to do
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline Area */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Availability timeline */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Timer className="h-4 w-4 text-emerald-500" />
                      Availability Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dailySchedule.availability.length === 0 && !dailySchedule.isOnLeave ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                        No availability configured for {dailySchedule.dayName}
                      </div>
                    ) : dailySchedule.availability.length > 0 ? (
                      dailySchedule.availability.map((slot) => {
                        const startMin = timeToMinutes(slot.startTime);
                        const endMin = timeToMinutes(slot.endTime);
                        const duration = endMin - startMin;
                        const dayStart = 480; // 8:00 AM
                        const dayEnd = 1200; // 8:00 PM
                        const totalRange = dayEnd - dayStart;
                        const leftPct = Math.max(0, ((startMin - dayStart) / totalRange) * 100);
                        const widthPct = Math.max(2, (duration / totalRange) * 100);

                        return (
                          <div key={slot.id} className="space-y-1">
                            <div className="relative h-10 bg-muted/50 rounded-md overflow-hidden">
                              {/* Time markers */}
                              <div className="absolute inset-0 flex justify-between px-1 text-[8px] text-muted-foreground/50">
                                <span>8am</span><span>10am</span><span>12pm</span><span>2pm</span><span>4pm</span><span>6pm</span><span>8pm</span>
                              </div>
                              {/* Available block */}
                              <div
                                className="absolute top-1 bottom-1 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              >
                                <span className="text-[9px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap px-1">
                                  {slot.startTime}-{slot.endTime}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : null}

                    {/* Override info */}
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

                {/* Right: Tasks & Meetings timeline */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Target className="h-4 w-4 text-violet-500" />
                      Tasks & Meetings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-2">
                        {/* Tasks */}
                        {dailySchedule.tasks.length === 0 && dailySchedule.meetings.length === 0 && (
                          <div className="text-center py-6 text-muted-foreground text-sm">
                            <FileText className="h-8 w-8 mx-auto opacity-30 mb-2" />
                            No tasks or meetings for this day
                          </div>
                        )}

                        {dailySchedule.tasks.map((task) => {
                          const statusStyle = TASK_STATUS_STYLES[task.status] || TASK_STATUS_STYLES.TODO;
                          const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM;
                          return (
                            <div
                              key={task.id}
                              className={`p-2.5 rounded-md border ${statusStyle.bg} ${statusStyle.darkBg} transition-colors`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm font-medium ${task.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                                    {safeText(task.title, "Untitled Task")}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge className={`text-[9px] px-1.5 py-0 ${statusStyle.bg} ${statusStyle.darkBg} ${statusStyle.color} border-0`}>
                                      {statusStyle.label}
                                    </Badge>
                                    <Badge className={`text-[9px] px-1.5 py-0 bg-transparent border-0 ${priorityStyle.color}`}>
                                      {priorityStyle.label}
                                    </Badge>
                                    {task.projectName && (
                                      <span className="text-[10px] text-muted-foreground truncate">
                                        {safeText(task.projectName)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {task.status === "DONE" && (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Meetings */}
                        {dailySchedule.meetings.map((meeting) => (
                          <div
                            key={meeting.id}
                            className="p-2.5 rounded-md border bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800"
                          >
                            <div className="flex items-start gap-2">
                              <Video className="h-4 w-4 text-sky-500 flex-shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{safeText(meeting.title, "Meeting")}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {safeText(meeting.startTime)} – {safeText(meeting.endTime)}
                                  {meeting.meetingType && (
                                    <Badge className="ml-2 text-[9px] px-1.5 py-0 bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300 border-0">
                                      {safeText(meeting.meetingType)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
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
            TAB 3: Overrides
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overrides" className="space-y-4">
          {/* Upcoming overrides */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Create Override
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => openEditOverride(override)}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit override</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-400 hover:text-red-600"
                                    onClick={() => handleDeleteOverride(override.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete override</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                <div className="rounded-md border overflow-hidden">
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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => openEditOverride(override)}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit override</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-400 hover:text-red-600"
                                    onClick={() => handleDeleteOverride(override.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete override</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
