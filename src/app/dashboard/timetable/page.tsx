"use client";

import { useEffect, useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  Plus,
  Edit3,
  Trash2,
  Check,
  Clock,
  Briefcase,
  Bot,
  GraduationCap,
  Video,
  Shield,
  TreePine,
  PencilLine,
  BookOpen,
  Users,
  Heart,
  Banknote,
  Sparkles,
  Lightbulb,
  Loader2,
  AlertCircle,
  CalendarRange,
  CalendarDays,
  X,
} from "lucide-react";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from "date-fns";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// ── Types ──

interface PersonalTask {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  date: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  category: "PERSONAL" | "HEALTH" | "FINANCE" | "STUDY" | "SOCIAL" | "OTHER" | "WORK_LOCAL";
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkTask {
  id: string;
  sourceType: "AGENT_TASK" | "PROJECT_TASK" | "TRAINING" | "MEETING" | "LEAVE" | "APPROVAL" | "WORK_LOCAL";
  sourceLabel: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  agentName?: string;
  agentType?: string;
  projectName?: string;
  meetingType?: string;
  organizerName?: string;
  leaveType?: string;
  type?: string;
  createdAt?: string;
  isApprover?: boolean;
}

interface TimetableSettings {
  id?: string;
  userId?: string;
  sleepHours: number;
  workSplitPercent: number;
  weekStartsOn: "MONDAY" | "SUNDAY";
}

type ViewMode = "day" | "week" | "month";

// ── Color Helpers ──

const priorityConfig: Record<string, { color: string; border: string; bg: string; badge: string }> = {
  URGENT: { color: "text-red-600 dark:text-red-400", border: "border-red-300 dark:border-red-700 hover:border-red-500/50", bg: "bg-red-50 dark:bg-red-950/30", badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300" },
  HIGH: { color: "text-orange-600 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700 hover:border-orange-500/50", bg: "bg-orange-50 dark:bg-orange-950/30", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300" },
  MEDIUM: { color: "text-sky-600 dark:text-sky-400", border: "border-sky-300 dark:border-sky-700 hover:border-sky-500/50", bg: "bg-sky-50 dark:bg-sky-950/30", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" },
  LOW: { color: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-700 hover:border-emerald-500/50", bg: "bg-emerald-50 dark:bg-emerald-950/30", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300" },
};

const sourceConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  AGENT_TASK: { icon: Bot, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/40" },
  PROJECT_TASK: { icon: Briefcase, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-900/40" },
  TRAINING: { icon: GraduationCap, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  MEETING: { icon: Video, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" },
  APPROVAL: { icon: Shield, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/40" },
  LEAVE: { icon: TreePine, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/40" },
};

const categoryConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; badge: string }> = {
  PERSONAL: { icon: Sparkles, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800/50", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  HEALTH: { icon: Heart, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40", badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" },
  FINANCE: { icon: Banknote, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300" },
  STUDY: { icon: BookOpen, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" },
  SOCIAL: { icon: Users, color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/40", badge: "bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300" },
  OTHER: { icon: PencilLine, color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-100 dark:bg-gray-800/50", badge: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  WORK_LOCAL: { icon: Briefcase, color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-900/40", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300" },
};

// Left border colors for task cards
const categoryBorderColors: Record<string, string> = {
  PERSONAL: "border-l-slate-400",
  HEALTH: "border-l-green-500",
  FINANCE: "border-l-amber-500",
  STUDY: "border-l-blue-500",
  SOCIAL: "border-l-pink-500",
  OTHER: "border-l-gray-400",
  WORK_LOCAL: "border-l-cyan-500",
};

const sourceBorderColors: Record<string, string> = {
  AGENT_TASK: "border-l-purple-500",
  PROJECT_TASK: "border-l-cyan-500",
  TRAINING: "border-l-emerald-500",
  MEETING: "border-l-amber-500",
  APPROVAL: "border-l-rose-500",
  LEAVE: "border-l-violet-500",
  WORK_LOCAL: "border-l-cyan-500",
};

function formatTimeStr(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Extract HH:mm from ISO string for <input type="time"> — BUG #1 FIX
function extractTimeForInput(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return "09:00";
  }
}

function safeArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

function getDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Component ──

export default function TimetablePage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const queryClient = useQueryClient();

  // Core state
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [settings, setSettings] = useState<TimetableSettings>({
    sleepHours: 8,
    workSplitPercent: 60,
    weekStartsOn: "MONDAY",
  });

  // ── Computed date ranges (needed by queries) ──
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      return { start: selectedDate, end: selectedDate, label: format(selectedDate, "EEEE, MMM d, yyyy") };
    }
    if (viewMode === "week") {
      const weekStartsOn = settings.weekStartsOn === "SUNDAY" ? 0 : 1;
      const start = startOfWeek(selectedDate, { weekStartsOn });
      const end = endOfWeek(selectedDate, { weekStartsOn });
      return { start, end, label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}` };
    }
    // month
    const start = startOfMonth(selectedDate);
    const end = endOfMonth(selectedDate);
    return { start, end, label: format(selectedDate, "MMMM yyyy") };
  }, [viewMode, selectedDate, settings.weekStartsOn]);

  // ── Data Fetching via React Query ──

  const { data: personalTasks = [], isLoading: personalLoading } = useQuery({
    queryKey: ["timetable-personal-tasks", viewMode, getDateStr(selectedDate), getDateStr(dateRange.start), getDateStr(dateRange.end)],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (viewMode === "day") {
        params.set("date", getDateStr(selectedDate));
      } else {
        params.set("startDate", getDateStr(dateRange.start));
        params.set("endDate", getDateStr(dateRange.end));
      }
      const res = await fetch(`/api/timetable/personal-tasks?${params}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      return safeArray<PersonalTask>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const { data: workTasks = [], isLoading: workLoading } = useQuery({
    queryKey: ["timetable-work-tasks", viewMode, getDateStr(selectedDate), getDateStr(dateRange.start), getDateStr(dateRange.end)],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (viewMode === "day") {
        params.set("date", getDateStr(selectedDate));
      } else {
        params.set("startDate", getDateStr(dateRange.start));
        params.set("endDate", getDateStr(dateRange.end));
      }
      const res = await fetch(`/api/timetable/work-data?${params}`, { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      return safeArray<WorkTask>(data);
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const { isLoading: settingsLoading } = useQuery({
    queryKey: ["timetable-settings"],
    queryFn: async () => {
      const res = await fetch("/api/timetable/settings", { credentials: "include" });
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const s: TimetableSettings = {
        sleepHours: data.sleepHours ?? 8,
        workSplitPercent: data.workSplitPercent ?? 60,
        weekStartsOn: data.weekStartsOn ?? "MONDAY",
      };
      setSettings(s);
      setSettingsForm(s);
      return s;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const loading = personalLoading;

  // Dialog states
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<{ type: "personal" | "work"; task: PersonalTask | WorkTask } | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("10:00");
  const [formPriority, setFormPriority] = useState("MEDIUM");
  const [formCategory, setFormCategory] = useState("PERSONAL");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Settings form
  const [settingsForm, setSettingsForm] = useState<TimetableSettings>(settings);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);

  // Active mobile tab
  const [mobileTab, setMobileTab] = useState<"work" | "personal">("work");

  // Work task dialog state
  const [workTaskDialogOpen, setWorkTaskDialogOpen] = useState(false);
  const [workFormTitle, setWorkFormTitle] = useState("");
  const [workFormDescription, setWorkFormDescription] = useState("");
  const [workFormStartTime, setWorkFormStartTime] = useState("09:00");
  const [workFormEndTime, setWorkFormEndTime] = useState("10:00");
  const [workFormPriority, setWorkFormPriority] = useState("MEDIUM");
  const [workFormSubmitting, setWorkFormSubmitting] = useState(false);

  // Overlap warning state
  const [overlapWarning, setOverlapWarning] = useState<PersonalTask | null>(null);

  // ── Computed ──

  const weekDays = useMemo(() => {
    if (viewMode !== "week") return [];
    const weekStartsOn = settings.weekStartsOn === "SUNDAY" ? 0 : 1;
    const start = startOfWeek(selectedDate, { weekStartsOn });
    return eachDayOfInterval({ start, end: addDays(start, 6) });
  }, [viewMode, selectedDate, settings.weekStartsOn]);

  const monthDays = useMemo(() => {
    if (viewMode !== "month") return [];
    return eachDayOfInterval({ start: startOfMonth(selectedDate), end: endOfMonth(selectedDate) });
  }, [viewMode, selectedDate]);

  // Time split calculations
  const sleepHours = settings.sleepHours;
  const availableHours = 24 - sleepHours;
  const workHours = availableHours * (settings.workSplitPercent / 100);
  const personalHours = availableHours * ((100 - settings.workSplitPercent) / 100);

  // ── Navigation ──

  const goPrev = () => {
    if (viewMode === "day") setSelectedDate(addDays(selectedDate, -1));
    else if (viewMode === "week") setSelectedDate(addDays(selectedDate, -7));
    else setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const goNext = () => {
    if (viewMode === "day") setSelectedDate(addDays(selectedDate, 1));
    else if (viewMode === "week") setSelectedDate(addDays(selectedDate, 7));
    else setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  const goToday = () => setSelectedDate(new Date());

  // ── Task CRUD ──

  const openAddDialog = () => {
    setEditingTask(null);
    setFormTitle("");
    setFormDescription("");
    setFormStartTime("09:00");
    setFormEndTime("10:00");
    setFormPriority("MEDIUM");
    setFormCategory("PERSONAL");
    setOverlapWarning(null);
    setTaskDialogOpen(true);
  };

  const openWorkTaskDialog = () => {
    setWorkFormTitle("");
    setWorkFormDescription("");
    setWorkFormStartTime("09:00");
    setWorkFormEndTime("10:00");
    setWorkFormPriority("MEDIUM");
    setWorkTaskDialogOpen(true);
  };

  const openEditDialog = (task: PersonalTask) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || "");
    setFormStartTime(extractTimeForInput(task.startTime));
    setFormEndTime(extractTimeForInput(task.endTime));
    setFormPriority(task.priority);
    setFormCategory(task.category);
    setTaskDialogOpen(true);
  };

  const createPersonalTask = async (descriptionSuffix?: string) => {
    const dateStr = getDateStr(selectedDate);
    const startDateTime = `${dateStr}T${formStartTime}:00`;
    const endDateTime = `${dateStr}T${formEndTime}:00`;
    const finalDescription = descriptionSuffix
      ? (formDescription || "") + " " + descriptionSuffix
      : (formDescription || null);

    const res = await fetch("/api/timetable/personal-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: formTitle,
        description: finalDescription || null,
        startTime: startDateTime,
        endTime: endDateTime,
        date: dateStr,
        priority: formPriority,
        category: formCategory,
      }),
    });
    if (res.ok) {
      toast.success("Task created");
      setTaskDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to create task");
    }
  };

  const handleSubmitTask = async (mergeWithOverlap?: boolean) => {
    if (!formTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setFormSubmitting(true);
    try {
      if (editingTask) {
        const dateStr = getDateStr(selectedDate);
        const startDateTime = `${dateStr}T${formStartTime}:00`;
        const endDateTime = `${dateStr}T${formEndTime}:00`;
        const res = await fetch(`/api/timetable/personal-tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: formTitle,
            description: formDescription || null,
            startTime: startDateTime,
            endTime: endDateTime,
            priority: formPriority,
            category: formCategory,
          }),
        });
        if (res.ok) {
          toast.success("Task updated");
          setTaskDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
        } else {
          const err = await res.json();
          toast.error(err.error || "Failed to update task");
        }
      } else {
        // Check for time overlaps (only for new tasks)
        if (!mergeWithOverlap) {
          const dateStr = getDateStr(selectedDate);
          const newStart = new Date(`${dateStr}T${formStartTime}:00`).getTime();
          const newEnd = new Date(`${dateStr}T${formEndTime}:00`).getTime();
          const overlapTasks = personalTasks.filter((t) => {
            if (t.status === "COMPLETED" || t.status === "CANCELLED") return false;
            const existingStart = new Date(t.startTime).getTime();
            const existingEnd = new Date(t.endTime).getTime();
            return newStart < existingEnd && newEnd > existingStart;
          });
          if (overlapTasks.length > 0) {
            setFormSubmitting(false);
            setOverlapWarning(overlapTasks[0]);
            return;
          }
        }
        if (mergeWithOverlap && overlapWarning) {
          const suffix = `[Merged with ${overlapWarning.title}]`;
          await createPersonalTask(suffix);
          setOverlapWarning(null);
        } else {
          await createPersonalTask();
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSubmitWorkTask = async () => {
    if (!workFormTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setWorkFormSubmitting(true);
    try {
      const dateStr = getDateStr(selectedDate);
      const startDateTime = `${dateStr}T${workFormStartTime}:00`;
      const endDateTime = `${dateStr}T${workFormEndTime}:00`;

      // Check for overlap
      const newStart = new Date(startDateTime).getTime();
      const newEnd = new Date(endDateTime).getTime();
      const overlapTasks = personalTasks.filter((t) => {
        if (t.status === "COMPLETED" || t.status === "CANCELLED") return false;
        const existingStart = new Date(t.startTime).getTime();
        const existingEnd = new Date(t.endTime).getTime();
        return newStart < existingEnd && newEnd > existingStart;
      });

      const finalDescription = overlapTasks.length > 0
        ? (workFormDescription || "") + ` [Merged with ${overlapTasks[0].title}]`
        : (workFormDescription || null);

      const res = await fetch("/api/timetable/personal-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: workFormTitle,
          description: finalDescription || null,
          startTime: startDateTime,
          endTime: endDateTime,
          date: dateStr,
          priority: workFormPriority,
          category: "WORK_LOCAL",
        }),
      });
      if (res.ok) {
        toast.success("Work task added");
        setWorkTaskDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create work task");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setWorkFormSubmitting(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/timetable/personal-tasks/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Task deleted");
        queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
      } else {
        toast.error("Failed to delete task");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setDeleteDialogOpen(false);
      setDeleteId(null);
    }
  };

  const handleComplete = async () => {
    if (!completeTarget) return;
    try {
      if (completeTarget.type === "personal") {
        const task = completeTarget.task as PersonalTask;
        const res = await fetch(`/api/timetable/personal-tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "COMPLETED" }),
        });
        if (res.ok) {
          toast.success("Task completed!");
          queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
        } else {
          toast.error("Failed to complete task");
        }
      } else {
        const task = completeTarget.task as WorkTask;
        const res = await fetch("/api/timetable/complete-work-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sourceType: task.sourceType, taskId: task.id }),
        });
        if (res.ok) {
          const actionLabels: Record<string, string> = {
            MEETING: "Meeting marked as completed",
            LEAVE: "Leave cancelled",
            APPROVAL: "Request approved",
          };
          toast.success(actionLabels[task.sourceType] || "Work task completed!");
          queryClient.invalidateQueries({ queryKey: ["timetable-work-tasks"] });
        } else {
          toast.error("Failed to complete work task");
        }
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setCompleteDialogOpen(false);
      setCompleteTarget(null);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSubmitting(true);
    try {
      const res = await fetch("/api/timetable/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        setSettings(settingsForm);
        toast.success("Settings saved");
        setSettingsDialogOpen(false);
        // BUG #6 FIX: Refresh data when settings change (weekStartsOn affects week view)
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["timetable-personal-tasks"] });
          queryClient.invalidateQueries({ queryKey: ["timetable-work-tasks"] });
        }, 100);
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSettingsSubmitting(false);
    }
  };

  // ── Filtered tasks for day/week/month view ──

  const getFilteredPersonalTasks = (date: Date) => {
    const dateStr = getDateStr(date);
    return personalTasks.filter((t) => getDateStr(new Date(t.date)) === dateStr);
  };

  const getFilteredWorkTasks = (date: Date) => {
    const dateStr = getDateStr(date);
    return workTasks.filter((t) => {
      // For tasks with a specific date (meetings, leaves, etc.)
      const specificDate = t.date || t.dueDate;
      if (specificDate && !t.startDate && !t.endDate) {
        return getDateStr(new Date(specificDate)) === dateStr;
      }
      // For range-based tasks (leaves, training) — check if the selected date falls within the range
      const rangeStart = t.startDate || t.dueDate || t.date;
      const rangeEnd = t.endDate || t.dueDate || t.date;
      if (rangeStart && rangeEnd) {
        const d = new Date(dateStr + "T00:00:00");
        const s = new Date(rangeStart + "T00:00:00");
        const e = new Date(rangeEnd + "T23:59:59");
        return d >= s && d <= e;
      }
      // For training tasks with startDate + dueDate (no endDate)
      if (t.startDate && t.dueDate) {
        const d = new Date(dateStr + "T00:00:00");
        const s = new Date(t.startDate + "T00:00:00");
        const e = new Date(t.dueDate + "T23:59:59");
        return d >= s && d <= e;
      }
      // Fallback: match on dueDate
      if (specificDate) {
        return getDateStr(new Date(specificDate)) === dateStr;
      }
      return false;
    });
  };

  // ── Productivity Insight ──

  const insight = useMemo(() => {
    const totalTasks = personalTasks.length + workTasks.length;
    const completedPersonal = personalTasks.filter((t) => t.status === "COMPLETED").length;
    const urgentCount = [...personalTasks.filter((t) => t.priority === "URGENT"), ...workTasks.filter((t) => t.priority === "URGENT")].length;
    const highCount = [...personalTasks.filter((t) => t.priority === "HIGH"), ...workTasks.filter((t) => t.priority === "HIGH")].length;

    if (totalTasks === 0) return "No tasks scheduled. Add a personal task or check your work assignments!";
    if (urgentCount > 0) return `⚡ You have ${urgentCount} urgent task${urgentCount > 1 ? "s" : ""} that need immediate attention!`;
    if (highCount > 0) return `🔥 ${highCount} high-priority task${highCount > 1 ? "s" : ""} on your plate. Stay focused!`;
    return `You have ${totalTasks} tasks today. ${completedPersonal} personal task${completedPersonal !== 1 ? "s" : ""} completed. Keep going!`;
  }, [personalTasks, workTasks]);

  // ── Loading / auth checks ──

  if (sessionStatus === "loading" || loading || settingsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-9" />
        </div>
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-24 w-full rounded-xl" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Month view ──

  if (viewMode === "month") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarRange className="h-6 w-6 text-primary" />
              Personalized Time Table
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Plan and manage your daily schedule
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Task
            </Button>
            <Button variant="outline" size="icon" onClick={() => setSettingsDialogOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[220px] text-center">{dateRange.label}</h2>
            <Button variant="outline" size="icon" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <Button
              key={v}
              variant={viewMode === v ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode(v)}
              className="capitalize text-xs"
            >
              {v}
            </Button>
          ))}
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {d}
                </div>
              ))}
              {monthDays.map((day) => {
                const dayPersonal = getFilteredPersonalTasks(day);
                const dayWork = getFilteredWorkTasks(day);
                const taskCount = dayPersonal.length + dayWork.length;
                const isSelected = isSameDay(day, selectedDate);
                return (
                  <button
                    key={day.toISOString()}
                    className={cn(
                      "relative flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:bg-accent/50 min-h-[72px] text-left",
                      isSelected && "bg-primary/5 border-primary/30 ring-1 ring-primary/20",
                      isToday(day) && !isSelected && "bg-accent/30",
                      !isSelected && "border-transparent"
                    )}
                    onClick={() => {
                      setSelectedDate(day);
                      setViewMode("day");
                    }}
                  >
                    <span className={cn(
                      "text-sm font-medium",
                      isToday(day) ? "bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center text-xs" : "text-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                    {taskCount > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {dayWork.length > 0 && (
                          <div className="h-1.5 w-1.5 rounded-full bg-purple-500" title={`${dayWork.length} work task(s)`} />
                        )}
                        {dayPersonal.length > 0 && (
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={`${dayPersonal.length} personal task(s)`} />
                        )}
                      </div>
                    )}
                    {taskCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">{taskCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* BUG #7 FIX: Productivity Insight for month view */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
          <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">{insight}</p>
        </div>
      </div>
    );
  }

  // ── Week view ──

  if (viewMode === "week") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarRange className="h-6 w-6 text-primary" />
              Personalized Time Table
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Plan and manage your daily schedule
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-1.5" /> Add Task
            </Button>
            <Button variant="outline" size="icon" onClick={() => setSettingsDialogOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[260px] text-center">{dateRange.label}</h2>
            <Button variant="outline" size="icon" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {(["day", "week", "month"] as ViewMode[]).map((v) => (
            <Button
              key={v}
              variant={viewMode === v ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode(v)}
              className="capitalize text-xs"
            >
              {v}
            </Button>
          ))}
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayPersonal = getFilteredPersonalTasks(day);
            const dayWork = getFilteredWorkTasks(day);
            const isSelected = isSameDay(day, selectedDate);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "rounded-xl border p-3 transition-all cursor-pointer min-h-[200px]",
                  isSelected ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/20",
                  today && "ring-1 ring-primary/20"
                )}
                onClick={() => {
                  setSelectedDate(day);
                  setViewMode("day");
                }}
              >
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{format(day, "EEE")}</p>
                  <p className={cn(
                    "text-lg font-bold",
                    today && "text-primary"
                  )}>
                    {format(day, "d")}
                  </p>
                </div>
                <ScrollArea className="max-h-[160px] space-y-1.5">
                  {dayWork.slice(0, 3).map((t) => {
                    const sc = sourceConfig[t.sourceType];
                    return (
                      <div key={t.id} className="text-[10px] px-1.5 py-1 rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/30 truncate">
                        {t.title}
                      </div>
                    );
                  })}
                  {dayPersonal.slice(0, 3).map((t) => {
                    const cc = categoryConfig[t.category] || categoryConfig.OTHER;
                    return (
                      <div key={t.id} className="text-[10px] px-1.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 truncate">
                        {t.title}
                      </div>
                    );
                  })}
                  {(dayWork.length + dayPersonal.length) > 3 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      +{(dayWork.length + dayPersonal.length) - 3} more
                    </p>
                  )}
                </ScrollArea>
              </div>
            );
          })}
        </div>

        {/* Insight */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
          <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-200">{insight}</p>
        </div>
      </div>
    );
  }

  // ── Day View (main view) ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarRange className="h-6 w-6 text-primary" />
              Personalized Time Table
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Plan and manage your daily schedule
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Task
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsDialogOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[260px] justify-start font-semibold text-left">
                <CalendarDays className="mr-2 h-4 w-4" />
                {dateRange.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={goToday}>
          Today
        </Button>
      </div>

      {/* View Tabs */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        {(["day", "week", "month"] as ViewMode[]).map((v) => (
          <Button
            key={v}
            variant={viewMode === v ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode(v)}
            className="capitalize text-xs"
          >
            {v}
          </Button>
        ))}
      </div>

      {/* Time Split Bar */}
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setSettingsDialogOpen(true)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">😴</span>
              <span className="font-medium">Sleep: {sleepHours}h</span>
            </div>
            <div className="flex-1 w-full">
              <div className="flex rounded-full overflow-hidden h-6 bg-muted">
                <div
                  className="bg-indigo-500 dark:bg-indigo-600 transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${workHours > 0 ? (workHours / 24) * 100 : 0}%` }}
                >
                  {workHours > 3 && (
                    <span className="text-[10px] font-bold text-white truncate px-1">
                      💼 {workHours.toFixed(1)}h Work
                    </span>
                  )}
                </div>
                <div
                  className="bg-emerald-500 dark:bg-emerald-600 transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${personalHours > 0 ? (personalHours / 24) * 100 : 0}%` }}
                >
                  {personalHours > 3 && (
                    <span className="text-[10px] font-bold text-white truncate px-1">
                      🏠 {personalHours.toFixed(1)}h Personal
                    </span>
                  )}
                </div>
                <div
                  className="bg-slate-400 dark:bg-slate-600 transition-all duration-500 flex items-center justify-center"
                  style={{ width: `${(sleepHours / 24) * 100}%` }}
                >
                  {sleepHours > 3 && (
                    <span className="text-[10px] font-bold text-white truncate px-1">
                      😴
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              💼 Work: {settings.workSplitPercent}% &nbsp;|&nbsp; 🏠 Personal: {100 - settings.workSplitPercent}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Tab Switcher */}
      <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as "work" | "personal")} className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="work" className="flex-1">
            💼 Work ({workTasks.length})
          </TabsTrigger>
          <TabsTrigger value="personal" className="flex-1">
            🏠 Personal ({personalTasks.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Task Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Work Timetable ── */}
        <div className={cn("hidden lg:block", mobileTab === "work" && "block")}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Work Timetable
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button onClick={openWorkTaskDialog} size="sm" variant="outline" className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                  <Badge variant="secondary" className="text-xs">
                    {workTasks.length + personalTasks.filter((t) => t.category === "WORK_LOCAL").length} tasks
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {workLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading work tasks...</span>
                </div>
              ) : (() => {
                // Combine work tasks with WORK_LOCAL personal tasks
                const workLocalTasks = personalTasks
                  .filter((t) => t.category === "WORK_LOCAL")
                  .map((t): WorkTask => ({
                    id: t.id,
                    sourceType: "WORK_LOCAL" as const,
                    sourceLabel: "Local Task",
                    title: t.title,
                    description: t.description,
                    priority: t.priority,
                    status: t.status,
                    startTime: formatTimeStr(t.startTime),
                    endTime: formatTimeStr(t.endTime),
                    date: t.date,
                    createdAt: t.createdAt,
                  }));
                const allWorkItems = [...workTasks, ...workLocalTasks];
                // Sort by time ascending
                const sortedWorkItems = [...allWorkItems].sort((a, b) => {
                  const aTime = a.startTime ? new Date(`2000-01-01T${a.startTime}`).getTime() : (a.dueDate ? new Date(a.dueDate).getTime() : Infinity);
                  const bTime = b.startTime ? new Date(`2000-01-01T${b.startTime}`).getTime() : (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
                  return aTime - bTime;
                });
                // Find first non-completed index for "current task" highlighting
                const firstPendingIdx = sortedWorkItems.findIndex((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "DONE");

                if (sortedWorkItems.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <Briefcase className="h-10 w-10 mx-auto text-muted-foreground opacity-40 mb-2" />
                      <p className="text-sm text-muted-foreground">No work tasks for this day</p>
                      <p className="text-xs text-muted-foreground mt-1">Tasks from projects, training, and meetings will appear here</p>
                    </div>
                  );
                }

                return (
                  <ScrollArea className="max-h-[500px] pr-2">
                    <div className="space-y-3">
                      {sortedWorkItems.map((task, idx) => {
                        const sc = sourceConfig[task.sourceType];
                        const pc = priorityConfig[task.priority] || priorityConfig.MEDIUM;
                        const SourceIcon = sc?.icon || Briefcase;
                        const borderColor = sourceBorderColors[task.sourceType] || "border-l-gray-400";
                        const isCompleted = task.status === "COMPLETED" || task.status === "DONE";
                        const isCancelled = task.status === "CANCELLED";
                        const isCurrentOrNext = idx === firstPendingIdx;
                        const timeLabel = task.startTime && task.endTime
                          ? `${task.startTime} – ${task.endTime}`
                          : task.dueDate
                            ? `Due: ${formatTimeStr(task.dueDate)}`
                            : task.startDate
                              ? `${format(new Date(task.startDate), "MMM d")} – ${format(new Date(task.endDate || task.startDate), "MMM d")}`
                              : "";

                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "group relative rounded-xl border-l-[3px] border transition-all duration-300",
                              borderColor,
                              isCompleted || isCancelled
                                ? "p-2 opacity-50 border-t border-r border-b"
                                : isCurrentOrNext
                                  ? "p-5 border-t border-r border-b shadow-md ring-1 ring-primary/20 bg-primary/[0.03]"
                                  : "p-4 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 bg-card"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                isCompleted || isCancelled ? "h-7 w-7" : isCurrentOrNext ? "h-10 w-10" : "h-9 w-9",
                                "rounded-lg flex items-center justify-center shrink-0",
                                sc?.bg
                              )}>
                                <SourceIcon className={cn(
                                  isCompleted || isCancelled ? "h-3 w-3" : isCurrentOrNext ? "h-5 w-5" : "h-4 w-4",
                                  sc?.color
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {isCurrentOrNext && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border border-primary/20 shrink-0">
                                      ⬅ Current
                                    </Badge>
                                  )}
                                  <h3 className={cn(
                                    "font-semibold truncate",
                                    isCompleted || isCancelled
                                      ? "text-xs line-through text-muted-foreground"
                                      : isCurrentOrNext
                                        ? "text-base"
                                        : "text-sm"
                                  )}>
                                    {task.title}
                                  </h3>
                                  <Badge className={cn("text-[10px] px-1.5 py-0", sc?.bg, sc?.color)}>
                                    {task.sourceLabel}
                                  </Badge>
                                </div>
                                {task.description && !isCompleted && !isCancelled && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                                )}
                                {task.description && (isCompleted || isCancelled) && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                                )}
                                {timeLabel && (
                                  <p className={cn("flex items-center gap-1", isCompleted || isCancelled ? "text-[11px] text-muted-foreground mt-0.5" : "text-xs text-muted-foreground mt-1.5")}>
                                    <Clock className={isCompleted || isCancelled ? "h-2.5 w-2.5" : "h-3 w-3"} />
                                    {timeLabel}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge className={cn("text-[10px] px-1.5 py-0", pc.badge)}>
                                    {task.priority}
                                  </Badge>
                                  {!isCompleted && !isCancelled && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {task.status}
                                    </Badge>
                                  )}
                                  {isCompleted && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                      ✓ Done
                                    </Badge>
                                  )}
                                  {isCancelled && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                      Cancelled
                                    </Badge>
                                  )}
                                  {task.agentName && (
                                    <span className="text-[10px] text-muted-foreground">Agent: {task.agentName}</span>
                                  )}
                                  {task.projectName && (
                                    <span className="text-[10px] text-muted-foreground">Project: {task.projectName}</span>
                                  )}
                                </div>
                              </div>
                              {!isCompleted && !isCancelled && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompleteTarget({ type: "work", task });
                                    setCompleteDialogOpen(true);
                                  }}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  {task.sourceType === "WORK_LOCAL"
                                    ? "Done"
                                    : task.sourceType === "LEAVE"
                                      ? "Cancel"
                                      : task.sourceType === "APPROVAL"
                                        ? "Approve"
                                        : "Done"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* ── Personal Timetable ── */}
        <div className={cn("hidden lg:block", mobileTab === "personal" && "block")}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Personal Timetable
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {personalTasks.filter((t) => t.category !== "WORK_LOCAL").length} tasks
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button onClick={openAddDialog} size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Personal Task
                </Button>
              </div>
              {(() => {
                const nonWorkLocalTasks = personalTasks.filter((t) => t.category !== "WORK_LOCAL");
                if (nonWorkLocalTasks.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <Sparkles className="h-10 w-10 mx-auto text-muted-foreground opacity-40 mb-2" />
                      <p className="text-sm text-muted-foreground">No personal tasks for this day</p>
                      <p className="text-xs text-muted-foreground mt-1">Click &quot;Add Personal Task&quot; to plan your day</p>
                    </div>
                  );
                }
                // Sort by startTime ascending
                const sortedPersonalTasks = [...nonWorkLocalTasks].sort((a, b) => {
                  return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                });
                // Find first non-completed index for "current task" highlighting
                const firstPendingIdx = sortedPersonalTasks.findIndex((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");

                return (
                  <ScrollArea className="max-h-[460px] pr-2">
                    <div className="space-y-3">
                      {sortedPersonalTasks.map((task, idx) => {
                        const pc = priorityConfig[task.priority] || priorityConfig.MEDIUM;
                        const cc = categoryConfig[task.category] || categoryConfig.OTHER;
                        const CatIcon = cc.icon;
                        const isCompleted = task.status === "COMPLETED";
                        const isCancelled = task.status === "CANCELLED";
                        const isCurrentOrNext = idx === firstPendingIdx;
                        const borderColor = categoryBorderColors[task.category] || "border-l-gray-400";

                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "group relative rounded-xl border-l-[3px] border transition-all duration-300",
                              borderColor,
                              isCompleted || isCancelled
                                ? "p-2 opacity-50 border-t border-r border-b"
                                : isCurrentOrNext
                                  ? "p-5 border-t border-r border-b shadow-md ring-1 ring-primary/20 bg-primary/[0.03]"
                                  : "p-4 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 bg-card"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                isCompleted || isCancelled ? "h-7 w-7" : isCurrentOrNext ? "h-10 w-10" : "h-9 w-9",
                                "rounded-lg flex items-center justify-center shrink-0",
                                cc.bg
                              )}>
                                <CatIcon className={cn(
                                  isCompleted || isCancelled ? "h-3 w-3" : isCurrentOrNext ? "h-5 w-5" : "h-4 w-4",
                                  cc.color
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {isCurrentOrNext && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border border-primary/20 shrink-0">
                                      ↑ Next
                                    </Badge>
                                  )}
                                  <h3 className={cn(
                                    "font-semibold truncate",
                                    isCompleted || isCancelled
                                      ? "text-xs line-through text-muted-foreground"
                                      : isCurrentOrNext
                                        ? "text-base"
                                        : "text-sm"
                                  )}>
                                    {task.title}
                                  </h3>
                                </div>
                                {task.description && !isCompleted && !isCancelled && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                                )}
                                {task.description && (isCompleted || isCancelled) && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                                )}
                                <p className={cn("flex items-center gap-1", isCompleted || isCancelled ? "text-[11px] text-muted-foreground mt-0.5" : "text-xs text-muted-foreground mt-1.5")}>
                                  <Clock className={isCompleted || isCancelled ? "h-2.5 w-2.5" : "h-3 w-3"} />
                                  {formatTimeStr(task.startTime)} – {formatTimeStr(task.endTime)}
                                </p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge className={cn("text-[10px] px-1.5 py-0", pc.badge)}>
                                    {task.priority}
                                  </Badge>
                                  <Badge className={cn("text-[10px] px-1.5 py-0", cc.badge)}>
                                    {task.category}
                                  </Badge>
                                  {isCompleted && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                      ✓ Completed
                                    </Badge>
                                  )}
                                  {isCancelled && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                      Cancelled
                                    </Badge>
                                  )}
                                  {!isCompleted && !isCancelled && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {task.status}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {!isCompleted && !isCancelled && (
                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCompleteTarget({ type: "personal", task });
                                      setCompleteDialogOpen(true);
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDialog(task);
                                    }}
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-950/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteId(task.id);
                                      setDeleteDialogOpen(true);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Productivity Insight */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
        <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200">{insight}</p>
      </div>

      {/* ── Task Dialog (Add/Edit) ── */}
      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Personal Task" : "Add Personal Task"}</DialogTitle>
            <DialogDescription>
              {editingTask ? "Update the details of your task." : "Create a new task for your personal schedule."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Title *</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="What do you need to do?"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm">Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Add any notes..."
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Start Time *</Label>
                <Input
                  type="time"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">End Time *</Label>
                <Input
                  type="time"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Priority</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL">Personal</SelectItem>
                    <SelectItem value="HEALTH">Health</SelectItem>
                    <SelectItem value="FINANCE">Finance</SelectItem>
                    <SelectItem value="STUDY">Study</SelectItem>
                    <SelectItem value="SOCIAL">Social</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                    {editingTask && editingTask.category === "WORK_LOCAL" && (
                      <SelectItem value="WORK_LOCAL">Work (Local)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => handleSubmitTask()} disabled={formSubmitting}>
              {formSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</>
              ) : editingTask ? (
                "Update Task"
              ) : (
                "Create Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settings Dialog ── */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Time Table Settings</DialogTitle>
            <DialogDescription>
              Configure your daily time allocation and preferences.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Sleep Hours</Label>
                <span className="text-sm font-semibold">{settingsForm.sleepHours}h</span>
              </div>
              <Slider
                value={[settingsForm.sleepHours]}
                onValueChange={([v]) => setSettingsForm((prev) => ({ ...prev, sleepHours: v }))}
                min={0}
                max={12}
                step={0.5}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0h</span>
                <span>12h</span>
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Work Time Split</Label>
                <span className="text-sm font-semibold">{settingsForm.workSplitPercent}%</span>
              </div>
              <Slider
                value={[settingsForm.workSplitPercent]}
                onValueChange={([v]) => setSettingsForm((prev) => ({ ...prev, workSplitPercent: v }))}
                min={0}
                max={100}
                step={5}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0% Work</span>
                <span>100% Work</span>
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-sm mb-2 block">Week Starts On</Label>
              <Select
                value={settingsForm.weekStartsOn}
                onValueChange={(v) => setSettingsForm((prev) => ({ ...prev, weekStartsOn: v as "MONDAY" | "SUNDAY" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONDAY">Monday</SelectItem>
                  <SelectItem value="SUNDAY">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={settingsSubmitting}>
              {settingsSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</>
              ) : (
                "Save Settings"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Complete Confirmation ── */}
      <AlertDialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "LEAVE"
                ? "Cancel Leave"
                : completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "APPROVAL"
                  ? "Approve Request"
                  : "Complete Task"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "LEAVE"
                ? `Are you sure you want to cancel "${completeTarget?.task.title}"?`
                : completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "APPROVAL"
                  ? `Are you sure you want to approve "${completeTarget?.task.title}"?`
                  : `Are you sure you have completed "${completeTarget?.task.title}"? This will mark it as done.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleComplete}
              className={completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "LEAVE"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-emerald-600 text-white hover:bg-emerald-700"}
            >
              {completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "LEAVE"
                ? "Yes, Cancel Leave"
                : completeTarget?.type === "work" && (completeTarget.task as WorkTask).sourceType === "APPROVAL"
                  ? "Yes, Approve"
                  : "Yes, Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Work Task Dialog ── */}
      <Dialog open={workTaskDialogOpen} onOpenChange={setWorkTaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Work Task</DialogTitle>
            <DialogDescription>
              Create a work-related task for your timetable. It will appear in both the Work and Personal panels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Title *</Label>
              <Input
                value={workFormTitle}
                onChange={(e) => setWorkFormTitle(e.target.value)}
                placeholder="What work task needs to be done?"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm">Description</Label>
              <Textarea
                value={workFormDescription}
                onChange={(e) => setWorkFormDescription(e.target.value)}
                placeholder="Add any notes..."
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Start Time *</Label>
                <Input
                  type="time"
                  value={workFormStartTime}
                  onChange={(e) => setWorkFormStartTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm">End Time *</Label>
                <Input
                  type="time"
                  value={workFormEndTime}
                  onChange={(e) => setWorkFormEndTime(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Priority</Label>
              <Select value={workFormPriority} onValueChange={setWorkFormPriority}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkTaskDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitWorkTask} disabled={workFormSubmitting}>
              {workFormSubmitting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating...</>
              ) : (
                "Create Work Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Overlap Merge Warning Dialog ── */}
      <AlertDialog open={!!overlapWarning} onOpenChange={(open) => { if (!open) setOverlapWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Time Overlap Detected
            </AlertDialogTitle>
            <AlertDialogDescription>
              This time overlaps with your task &quot;{overlapWarning?.title}&quot; ({overlapWarning ? `${formatTimeStr(overlapWarning.startTime)} – ${formatTimeStr(overlapWarning.endTime)}` : ""}). Do you want to merge?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setOverlapWarning(null)}>No, Change Time</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSubmitTask(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Yes, Merge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
