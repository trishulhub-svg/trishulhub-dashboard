"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { safeArray, safeText } from "@/lib/utils";
import {
  Clock, Plus, Trash2, CalendarDays, AlertCircle, ChevronLeft, ChevronRight,
  CheckCircle2, Circle, CalendarClock, Edit3, X, RefreshCw,
  Users, BarChart3, Timer, Target, Video, FileText, Eye,
  Copy, MoreHorizontal, UserCog, LayoutGrid, List,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// ─── Inline Edit Availability Slot Component ──────────────────────────────────
function InlineSlotEditor({
  slot,
  onSave,
  onDelete,
  onCancel,
}: {
  slot: { id: string; startTime: string; endTime: string; isAvailable: boolean };
  onSave: (id: string, startTime: string, endTime: string) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(slot.startTime);
  const [end, setEnd] = useState(slot.endTime);

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/80 border">
      <Input
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="h-7 text-xs w-[100px]"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="h-7 text-xs w-[100px]"
      />
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onSave(slot.id, start, end)}>
        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onCancel}>
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

// ─── Per-User Day Card (for mobile view) ───────────────────────────────────────
function UserDayCard({
  userName,
  userAvatar,
  dayData,
  dateStr,
  onEditSlot,
  onDeleteSlot,
  onAddSlot,
  onViewDaily,
  onAddOverride,
}: {
  userName: string;
  userAvatar?: string | null;
  dayData: WeekDayData;
  dateStr: string;
  onEditSlot: (slot: { id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }) => void;
  onDeleteSlot: (id: string) => void;
  onAddSlot: (userId: string, userName: string, dayOfWeek: number) => void;
  onViewDaily: (userId: string, userName: string, date: string) => void;
  onAddOverride: (userId: string, userName: string, date: string) => void;
}) {
  // Find the raw availability entries for this user/day from the full data
  // We pass the slot data from the parent which has the id
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-6 w-6">
            <AvatarImage src={userAvatar || undefined} alt={userName} />
            <AvatarFallback className="text-[8px]">{getUserInitials(userName)}</AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium truncate">{userName}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {dayData.isOnLeave && (
            <Badge className="text-[8px] px-1.5 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0">LEAVE</Badge>
          )}
          {dayData.override && !dayData.isOnLeave && (
            <Badge className="text-[8px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">OVERRIDE</Badge>
          )}
        </div>
      </div>
      <div className="p-3 space-y-2">
        {/* Availability slots */}
        {dayData.isOnLeave ? (
          <div className="text-xs text-sky-500 font-medium py-1">On Leave</div>
        ) : dayData.availability.length > 0 ? (
          <div className="space-y-1.5">
            {dayData.availability.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-xs font-medium">{slot.startTime} – {slot.endTime}</span>
                  <span className="text-[10px] text-muted-foreground">({slot.hours}h)</span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => onEditSlot({ id: slot.id, userId: "", dayOfWeek: dayData.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, isAvailable: true })}
                  >
                    <Edit3 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon" variant="ghost" className="h-6 w-6"
                    onClick={() => onDeleteSlot(slot.id)}
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-1">Not configured</div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
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
          {dayData.totalHours > 0 && (
            <span>{dayData.totalHours}h</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={onAddSlot}>
            <Plus className="h-3 w-3 mr-1" /> Slot
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={onAddOverride}>
            <CalendarClock className="h-3 w-3 mr-1" /> Override
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onViewDaily}>
            <Eye className="h-3 w-3 mr-1" /> Detail
          </Button>
        </div>
      </div>
    </Card>
  );
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

  // ── Inline editing state ──
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  // ── Quick-add state (for adding slot with pre-filled user/day) ──
  const [quickAddUserId, setQuickAddUserId] = useState("");
  const [quickAddDayOfWeek, setQuickAddDayOfWeek] = useState<number>(1);

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

  // ── Week view mode: "grid" (desktop) or "cards" (mobile-friendly) ──
  const [weekViewMode, setWeekViewMode] = useState<"grid" | "cards">("grid");

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

  // ── Quick-add helpers ──
  const openQuickAddSlot = (userId: string, userName: string, dayOfWeek: number) => {
    setQuickAddUserId(userId);
    setQuickAddDayOfWeek(dayOfWeek);
    setEditingAvailability(null);
    setFormUserId(userId);
    setFormDayOfWeek(dayOfWeek.toString());
    setFormStartTime("09:00");
    setFormEndTime("17:00");
    setFormIsAvailable(true);
    setAvailDialogOpen(true);
  };

  const openQuickAddOverride = (userId: string, userName: string, date: string) => {
    setFormOverrideUserId(userId);
    setFormOverrideDate(date);
    setFormOverrideStartTime("");
    setFormOverrideEndTime("");
    setFormOverrideIsAvailable(false);
    setFormOverrideReason("");
    setEditingOverride(null);
    setOverrideDialogOpen(true);
  };

  // ── Inline save (from grid or card) ──
  const handleInlineSave = async (id: string, startTime: string, endTime: string) => {
    if (startTime >= endTime) {
      toast.error("Start time must be before end time");
      return;
    }
    try {
      const res = await fetch(`/api/availability/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startTime, endTime }),
      });
      if (res.ok) {
        toast.success("Availability updated");
        setEditingSlotId(null);
        fetchCoreData();
        fetchWeekSchedule();
      } else {
        const err = await res.json();
        toast.error(safeText(err.error, "Failed to update"));
      }
    } catch {
      toast.error("Failed to update");
    }
    setEditingSlotId(null);
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

  // ── Navigate to daily view from any context ──
  const navigateToDaily = useCallback((userId: string, userName: string, date: string) => {
    setDailyUserId(userId);
    setDailyDate(new Date(date + "T00:00:00"));
    setSelectedDayDetail(null);
    const dailyTab = document.querySelector('[data-state][value="daily"]') as HTMLElement;
    if (dailyTab) dailyTab.click();
  }, []);

  // ── Get user name from id ──
  const getUserName = useCallback((userId: string) => {
    const u = teamUsers.find((t) => t.id === userId);
    return u?.name || "Unknown";
  }, [teamUsers]);

  // ── Get user avatar from id ──
  const getUserAvatar = useCallback((userId: string) => {
    const u = teamUsers.find((t) => t.id === userId);
    return u?.avatar || null;
  }, [teamUsers]);

  // ── Get availability entries for a user/day ──
  const getUserDayAvailabilities = useCallback((userId: string, dayOfWeek: number) => {
    return availabilities.filter((a) => a.userId === userId && a.dayOfWeek === dayOfWeek);
  }, [availabilities]);

  // ── Find the raw availability entry by id ──
  const findAvailEntry = useCallback((id: string) => {
    return availabilities.find((a) => a.id === id);
  }, [availabilities]);

  // ── Handle edit from grid cell ──
  const handleEditFromCell = useCallback((slot: { id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }) => {
    const entry = findAvailEntry(slot.id);
    if (entry) {
      openEditAvailability(entry);
    }
  }, [findAvailEntry]);

  // ── Handle delete from cell ──
  const handleDeleteFromCell = useCallback((id: string) => {
    setDeleteAvailId(id);
  }, []);

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

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader title="Availability Management" description="Manage team schedules, daily views, and availability overrides">
        <Button variant="outline" size="sm" className="md:hidden" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
          <CalendarDays className="h-4 w-4 mr-1.5 sm:mr-2" /> <span className="hidden xs:inline">Override</span>
        </Button>
        <Button size="sm" className="md:hidden" onClick={() => { resetAvailForm(); setAvailDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5 sm:mr-2" /> <span className="hidden xs:inline">Slot</span>
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
        <Card className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <Users className="h-4.5 w-4.5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{teamUsers.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Team Members</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Clock className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{availabilities.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Schedule Slots</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <CalendarClock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-lg font-bold">{upcomingOverrides.length}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Active Overrides</div>
            </div>
          </div>
        </Card>
        <Card className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
              <Timer className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <div className="text-lg font-bold">
                {weekSchedule ? weekSchedule.users.reduce((acc, u) => {
                  const todayData = u.days[todayStr];
                  if (todayData && todayData.totalHours > 0) acc++;
                  return acc;
                }, 0) : 0}
              </div>
              <div className="text-[10px] md:text-xs text-muted-foreground">Available Today</div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="weekly" className="text-xs sm:text-sm">
            <CalendarDays className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Weekly </span>Overview
          </TabsTrigger>
          <TabsTrigger value="daily" className="text-xs sm:text-sm">
            <Clock className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Daily </span>Schedule
          </TabsTrigger>
          <TabsTrigger value="overrides" className="text-xs sm:text-sm">
            <CalendarClock className="h-4 w-4 mr-1 sm:mr-1.5" /> <span className="hidden xs:inline">Overrides </span>({upcomingOverrides.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 1: Weekly Overview
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="weekly" className="space-y-4">
          {/* Week Navigation */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={prevWeek} aria-label="Previous week" className="h-8 w-8 p-0">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-w-[160px] sm:min-w-[220px] justify-start text-left font-normal h-8 text-xs sm:text-sm">
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
              <Button variant="outline" size="sm" onClick={nextWeek} aria-label="Next week" className="h-8 w-8 p-0">
                <ChevronRight className="h-4 w-4" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" onClick={goToToday} className="h-8 text-xs">
                  Today
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="hidden md:flex items-center border rounded-md">
                <Button
                  variant={weekViewMode === "grid" ? "secondary" : "ghost"}
                  size="sm" className="h-7 w-7 p-0 rounded-r-none"
                  onClick={() => setWeekViewMode("grid")}
                  title="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={weekViewMode === "cards" ? "secondary" : "ghost"}
                  size="sm" className="h-7 w-7 p-0 rounded-l-none"
                  onClick={() => setWeekViewMode("cards")}
                  title="Card view"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-2.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-[10px]">Available</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-[10px]">Unavailable</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  <span className="text-[10px]">On Leave</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-[10px]">Override</span>
                </span>
              </div>
            </div>
          </div>

          {/* Weekly Content */}
          {weekLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-full" />
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !weekSchedule || weekSchedule.users.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Users className="h-12 w-12 opacity-50 mb-3" />
                <p className="text-sm">No team members found for this week</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── Desktop Grid View ── */}
              <div className={weekViewMode === "cards" ? "hidden md:block" : ""}>
                <Card>
                  <CardContent className="p-0">
                    <div className="w-full overflow-x-auto -mx-4 px-4 md:-mx-6 md:px-6">
                      <div className="min-w-[780px] lg:min-w-[900px]">
                        {/* Header row */}
                        <div className="grid grid-cols-[140px_repeat(7,1fr)] border-b bg-muted/50 sticky top-0 z-10">
                          <div className="p-2.5 text-xs font-semibold text-muted-foreground border-r flex items-center">
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
                                <div className={`text-[10px] sm:text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                                  {DAY_NAMES_SHORT[i]}
                                </div>
                                <div className={`text-base sm:text-lg font-bold ${isToday ? "text-primary" : ""}`}>
                                  {date.getDate()}
                                </div>
                                <div className={`text-[9px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
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
                            className="grid grid-cols-[140px_repeat(7,1fr)] border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                          >
                            {/* User info */}
                            <div className="p-2.5 border-r flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={userSchedule.user.avatar || undefined} alt={userSchedule.user.name} />
                                <AvatarFallback className="text-[9px]">
                                  {getUserInitials(userSchedule.user.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="text-xs font-medium truncate">{userSchedule.user.name}</div>
                                <div className="text-[9px] text-muted-foreground truncate">
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
                                      className={`p-2 border-r last:border-r-0 cursor-pointer transition-colors hover:bg-muted/40 min-h-[72px] flex flex-col gap-1 ${isToday ? "bg-primary/[0.03]" : ""}`}
                                      onClick={() => setSelectedDayDetail({
                                        userId: userSchedule.user.id,
                                        userName: userSchedule.user.name,
                                        date: dayStr,
                                        dayData,
                                      })}
                                    >
                                      {/* Status badges */}
                                      <div className="flex flex-wrap gap-0.5">
                                        {dayData.isOnLeave && (
                                          <Badge className="text-[8px] px-1 py-0 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0">
                                            LEAVE
                                          </Badge>
                                        )}
                                        {dayData.override && !dayData.isOnLeave && (
                                          <Badge className="text-[8px] px-1 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
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
                                        <div className="flex flex-wrap gap-0.5">
                                          {dayData.availability.slice(0, 3).map((slot) => (
                                            <Badge
                                              key={slot.id}
                                              className="text-[8px] px-1 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0"
                                            >
                                              {slot.startTime}-{slot.endTime}
                                            </Badge>
                                          ))}
                                          {dayData.availability.length > 3 && (
                                            <span className="text-[8px] text-muted-foreground">+{dayData.availability.length - 3}</span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="flex-1 flex items-center justify-center">
                                          <span className="text-[10px] text-muted-foreground">Not Set</span>
                                        </div>
                                      )}

                                      {/* Counts row */}
                                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mt-auto pt-0.5 border-t border-border/50">
                                        {(dayData.taskCount > 0 || dayData.doneTaskCount > 0) && (
                                          <span className="flex items-center gap-0.5">
                                            <CheckCircle2 className="h-2 w-2 text-green-500" />
                                            {dayData.doneTaskCount}/{dayData.taskCount}
                                          </span>
                                        )}
                                        {dayData.meetingCount > 0 && (
                                          <span className="flex items-center gap-0.5">
                                            <Video className="h-2 w-2 text-sky-500" />
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
                                      <Separator />
                                      <div className="text-[10px] text-muted-foreground italic">Click for actions</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Mobile Card View (always on mobile, toggle on desktop) ── */}
              <div className={weekViewMode === "grid" ? "md:hidden space-y-3" : "space-y-3"}>
                {/* Day selector for mobile cards */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {weekDates.map((date, i) => {
                    const dayStr = formatDateOnly(date);
                    const isToday = dayStr === todayStr;
                    return (
                      <div
                        key={dayStr}
                        className={`shrink-0 text-center rounded-lg px-3 py-1.5 cursor-pointer transition-colors border
                          ${isToday ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}
                      >
                        <div className="text-[9px] font-medium opacity-70">{DAY_NAMES_SHORT[i]}</div>
                        <div className="text-sm font-bold">{date.getDate()}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Cards for each user on each day - show selected day or today */}
                <MobileDayCards
                  weekSchedule={weekSchedule}
                  weekDates={weekDates}
                  todayStr={todayStr}
                  onEditSlot={handleEditFromCell}
                  onDeleteSlot={handleDeleteFromCell}
                  onAddSlot={openQuickAddSlot}
                  onViewDaily={navigateToDaily}
                  onAddOverride={openQuickAddOverride}
                  getUserName={getUserName}
                  getUserAvatar={getUserAvatar}
                />
              </div>

              {/* Day Detail Panel */}
              {selectedDayDetail && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm sm:text-base">
                          {selectedDayDetail.userName} — {selectedDayDetail.dayData.dayName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {selectedDayDetail.date}
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDayDetail(null)} aria-label="Close day detail">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Availability */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-muted-foreground">Availability</h4>
                          <Button
                            variant="ghost" size="sm" className="h-6 text-[10px]"
                            onClick={() => openQuickAddSlot(selectedDayDetail.userId, selectedDayDetail.userName, selectedDayDetail.dayData.dayOfWeek)}
                          >
                            <Plus className="h-3 w-3 mr-0.5" /> Add
                          </Button>
                        </div>
                        {selectedDayDetail.dayData.isOnLeave ? (
                          <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0">
                            On Leave
                          </Badge>
                        ) : selectedDayDetail.dayData.availability.length > 0 ? (
                          <div className="space-y-1.5">
                            {selectedDayDetail.dayData.availability.map((slot) => {
                              const rawEntry = findAvailEntry(slot.id);
                              return editingSlotId === slot.id ? (
                                <InlineSlotEditor
                                  key={slot.id}
                                  slot={slot}
                                  onSave={handleInlineSave}
                                  onDelete={handleDeleteFromCell}
                                  onCancel={() => setEditingSlotId(null)}
                                />
                              ) : (
                                <div key={slot.id} className="flex items-center gap-2 text-sm group">
                                  <Clock className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                  <span className="flex-1">{slot.startTime} – {slot.endTime}</span>
                                  <span className="text-muted-foreground text-xs">({slot.hours}h)</span>
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    onClick={() => rawEntry && openEditAvailability(rawEntry)}
                                  >
                                    <Edit3 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-red-400 hover:text-red-600"
                                    onClick={() => handleDeleteFromCell(slot.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                            <div className="text-xs text-muted-foreground pt-1">
                              Total scheduled: {selectedDayDetail.dayData.totalHours}h
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-sm text-muted-foreground">Not configured</span>
                            <Button
                              variant="outline" size="sm" className="h-7 text-xs w-full"
                              onClick={() => openQuickAddSlot(selectedDayDetail.userId, selectedDayDetail.userName, selectedDayDetail.dayData.dayOfWeek)}
                            >
                              <Plus className="h-3 w-3 mr-1" /> Add Availability
                            </Button>
                          </div>
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
                        {/* Quick override button */}
                        <Button
                          variant="outline" size="sm" className="h-7 text-xs w-full mt-1"
                          onClick={() => openQuickAddOverride(selectedDayDetail.userId, selectedDayDetail.userName, selectedDayDetail.date)}
                        >
                          <CalendarClock className="h-3 w-3 mr-1" /> Add Override
                        </Button>
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
                          className="w-full justify-start text-xs"
                          onClick={() => navigateToDaily(selectedDayDetail.userId, selectedDayDetail.userName, selectedDayDetail.date)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> View Daily Detail
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════════
            TAB 2: Daily Schedule
        ═══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Date picker */}
            <Popover open={dailyCalendarOpen} onOpenChange={setDailyCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 min-w-[150px] sm:min-w-[180px] justify-start text-left font-normal text-xs sm:text-sm">
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

            {/* User selector */}
            <Select value={dailyUserId} onValueChange={setDailyUserId}>
              <SelectTrigger className="w-[140px] sm:w-[200px] h-8 text-xs sm:text-sm">
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
                      <span className="truncate">{u.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Quick nav buttons */}
            <Button variant="ghost" size="sm" onClick={() => setDailyDate(new Date())} className="h-8 text-xs">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() - 1);
              setDailyDate(d);
            }} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const d = new Date(dailyDate);
              d.setDate(d.getDate() + 1);
              setDailyDate(d);
            }} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Daily Schedule Content */}
          {dailyLoading ? (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
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
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <Timer className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">{dailySchedule.totalScheduledHours}h</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Scheduled</div>
                    </div>
                  </div>
                </Card>
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                      <BarChart3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">{dailySchedule.totalWorkedHours}h</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Worked</div>
                    </div>
                  </div>
                </Card>
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                      <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">
                        {dailySchedule.taskSummary.done}/{dailySchedule.taskSummary.total}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Tasks Done</div>
                    </div>
                  </div>
                </Card>
                <Card className="py-3 px-3 sm:px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                      <Video className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <div className="text-xl sm:text-2xl font-bold">{dailySchedule.meetings.length}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground">Meetings</div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Task completion progress */}
              {dailySchedule.taskSummary.total > 0 && (
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Task Completion</span>
                      <span className="text-sm text-muted-foreground">
                        {Math.round((dailySchedule.taskSummary.done / dailySchedule.taskSummary.total) * 100)}%
                      </span>
                    </div>
                    <Progress value={(dailySchedule.taskSummary.done / dailySchedule.taskSummary.total) * 100} className="h-2.5" />
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
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
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Timer className="h-4 w-4 text-emerald-500" />
                        Availability Schedule
                      </CardTitle>
                      <Button
                        variant="outline" size="sm" className="h-7 text-[10px]"
                        onClick={() => {
                          const dayOfWeek = dailySchedule.dayOfWeek;
                          const userId = dailyUserId;
                          const userName = dailySchedule.user.name;
                          openQuickAddSlot(userId, userName, dayOfWeek);
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Slot
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dailySchedule.availability.length === 0 && !dailySchedule.isOnLeave ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Clock className="h-8 w-8 mx-auto opacity-30 mb-2" />
                        No availability configured for {dailySchedule.dayName}
                        <div className="mt-3">
                          <Button
                            variant="outline" size="sm"
                            onClick={() => openQuickAddSlot(dailyUserId, dailySchedule.user.name, dailySchedule.dayOfWeek)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Availability
                          </Button>
                        </div>
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
                        const rawEntry = findAvailEntry(slot.id);

                        return (
                          <div key={slot.id} className="space-y-1 group/slot">
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
                            {/* Inline actions */}
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover/slot:opacity-100 transition-opacity">
                              {rawEntry && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => openEditAvailability(rawEntry)}>
                                    <Edit3 className="h-3 w-3 mr-0.5" /> Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-[10px] text-red-500" onClick={() => handleDeleteFromCell(slot.id)}>
                                    <Trash2 className="h-3 w-3 mr-0.5" /> Delete
                                  </Button>
                                </>
                              )}
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
                          <div key={o.id} className="text-xs text-amber-600 dark:text-amber-500 mt-0.5 flex items-center justify-between">
                            <span>
                              {o.isAvailable ? "Available" : "Unavailable"}
                              {o.startTime && o.endTime ? ` (${o.startTime}–${o.endTime})` : " (All Day)"}
                              {o.reason && ` — ${safeText(o.reason)}`}
                            </span>
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
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Description</TableHead>
                            <TableHead className="text-xs">Project</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Clock In</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Clock Out</TableHead>
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
                              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                {safeText(entry.clockIn)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
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
                  <CardTitle className="text-sm sm:text-base">Upcoming Overrides</CardTitle>
                  <CardDescription className="text-xs">Active and future availability overrides</CardDescription>
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={() => { resetOverrideForm(); setOverrideDialogOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
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
                /* Mobile card layout */
                <div className="space-y-2 md:hidden">
                  {upcomingOverrides.map((override) => (
                    <Card key={override.id} className="overflow-hidden">
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={override.user?.avatar || undefined} alt={override.user?.name || ""} />
                              <AvatarFallback className="text-[8px]">
                                {override.user?.name ? getUserInitials(override.user.name) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate">{override.user?.name || "Unknown"}</span>
                          </div>
                          <Badge
                            className={`text-[9px] px-2 py-0.5 border-0 shrink-0 ${
                              override.isAvailable
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            }`}
                          >
                            {override.isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{new Date(override.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                          <span>{override.startTime && override.endTime ? `${override.startTime} – ${override.endTime}` : "All Day"}</span>
                        </div>
                        {override.reason && (
                          <p className="text-xs text-muted-foreground truncate">{safeText(override.reason)}</p>
                        )}
                        <div className="flex items-center gap-1 pt-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditOverride(override)}>
                            <Edit3 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => setDeleteOverrideId(override.id)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              {/* Desktop table layout */}
              {upcomingOverrides.length > 0 && (
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
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openEditOverride(override)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-400 hover:text-red-600"
                                onClick={() => setDeleteOverrideId(override.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
                <CardDescription className="text-xs">Historical override records</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Mobile cards */}
                <div className="space-y-2 md:hidden">
                  {pastOverrides.map((override) => (
                    <Card key={override.id} className="opacity-60">
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={override.user?.avatar || undefined} alt={override.user?.name || ""} />
                              <AvatarFallback className="text-[7px]">
                                {override.user?.name ? getUserInitials(override.user.name) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate">{override.user?.name || "Unknown"}</span>
                          </div>
                          <Badge
                            className={`text-[9px] px-1.5 py-0.5 border-0 ${
                              override.isAvailable
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                            }`}
                          >
                            {override.isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(override.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {override.startTime && override.endTime ? ` · ${override.startTime}–${override.endTime}` : " · All Day"}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                {/* Desktop table */}
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
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openEditOverride(override)}
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-400 hover:text-red-600"
                                onClick={() => setDeleteOverrideId(override.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">{editingAvailability ? "Edit Availability" : "Add Availability"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingAvailability && (
              <div className="space-y-2">
                <Label className="text-xs">Employee</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger className="w-full h-9 text-sm">
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
              <Label className="text-xs">Day of Week</Label>
              <Select value={formDayOfWeek} onValueChange={setFormDayOfWeek}>
                <SelectTrigger className="w-full h-9 text-sm">
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
                <Label className="text-xs">Start Time</Label>
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">End Time</Label>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Available</Label>
                <p className="text-[10px] text-muted-foreground">Toggle on if available, off if unavailable</p>
              </div>
              <Switch checked={formIsAvailable} onCheckedChange={setFormIsAvailable} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvailDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveAvailability} disabled={submitting}>
              {submitting ? "Saving..." : editingAvailability ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base">{editingOverride ? "Edit Override" : "Add Availability Override"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingOverride && (
              <div className="space-y-2">
                <Label className="text-xs">Employee</Label>
                <Select value={formOverrideUserId} onValueChange={setFormOverrideUserId}>
                  <SelectTrigger className="w-full h-9 text-sm">
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
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
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
                <Label className="text-xs">Start Time <span className="text-muted-foreground">(Optional)</span></Label>
                <Input
                  type="time"
                  value={formOverrideStartTime}
                  onChange={(e) => setFormOverrideStartTime(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">End Time <span className="text-muted-foreground">(Optional)</span></Label>
                <Input
                  type="time"
                  value={formOverrideEndTime}
                  onChange={(e) => setFormOverrideEndTime(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Available</Label>
                <p className="text-[10px] text-muted-foreground">Toggle on if available, off if unavailable</p>
              </div>
              <Switch checked={formOverrideIsAvailable} onCheckedChange={setFormOverrideIsAvailable} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Reason <span className="text-muted-foreground">(Optional)</span></Label>
              <Textarea
                value={formOverrideReason}
                onChange={(e) => setFormOverrideReason(e.target.value)}
                placeholder="Reason for the override..."
                rows={2}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveOverride} disabled={submitting}>
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
    </div>
  );
}

// ─── Mobile Day Cards Renderer ─────────────────────────────────────────────────
function MobileDayCards({
  weekSchedule,
  weekDates,
  todayStr,
  onEditSlot,
  onDeleteSlot,
  onAddSlot,
  onViewDaily,
  onAddOverride,
  getUserName,
  getUserAvatar,
}: {
  weekSchedule: WeekSchedule;
  weekDates: Date[];
  todayStr: string;
  onEditSlot: (slot: { id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }) => void;
  onDeleteSlot: (id: string) => void;
  onAddSlot: (userId: string, userName: string, dayOfWeek: number) => void;
  onViewDaily: (userId: string, userName: string, date: string) => void;
  onAddOverride: (userId: string, userName: string, date: string) => void;
  getUserName: (userId: string) => string;
  getUserAvatar: (userId: string) => string | null;
}) {
  // Find today's index or default to 0
  const todayIndex = weekDates.findIndex((d) => formatDateOnly(d) === todayStr);
  const focusIndex = todayIndex >= 0 ? todayIndex : 0;
  const focusDate = weekDates[focusIndex];
  const focusDateStr = formatDateOnly(focusDate);

  // Collect all users with data for this day
  const dayEntries = weekSchedule.users
    .map((u) => ({
      userId: u.user.id,
      userName: u.user.name,
      userAvatar: u.user.avatar,
      dayData: u.days[focusDateStr],
    }))
    .filter((e) => e.dayData);

  if (dayEntries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center text-muted-foreground">
          <Users className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">No team data for this day</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium px-1">
        {focusDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>
      {dayEntries.map((entry) => (
        <UserDayCard
          key={entry.userId}
          userName={entry.userName}
          userAvatar={entry.userAvatar}
          dayData={entry.dayData}
          dateStr={focusDateStr}
          onEditSlot={(slot) => onEditSlot({ ...slot, userId: entry.userId })}
          onDeleteSlot={onDeleteSlot}
          onAddSlot={(uid, name, dow) => onAddSlot(entry.userId, entry.userName, entry.dayData.dayOfWeek)}
          onViewDaily={(uid, name, date) => onViewDaily(entry.userId, entry.userName, focusDateStr)}
          onAddOverride={(uid, name, date) => onAddOverride(entry.userId, entry.userName, focusDateStr)}
        />
      ))}
    </div>
  );
}