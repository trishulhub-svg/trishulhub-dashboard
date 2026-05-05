"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  Clock, Play, Square, Timer, TrendingUp, Users, BarChart3,
  Download, Trash2, StopCircle, CalendarDays, FolderKanban,
  RefreshCw, AlertCircle, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// ── Types ──
interface TimeEntry {
  id: string;
  userId: string;
  projectId: string | null;
  description: string | null;
  status: string;
  clockIn: string;
  clockOut: string | null;
  totalHours: number | null;
  date: string;
  user?: { id: string; name: string; email: string };
  project?: { id: string; name: string } | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

interface AnalyticsData {
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

// ── Helpers ── [FIX C1: safe array fallback]
function safeArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

function formatDuration(ms: number): string {
  if (ms < 0) return "0m"; // [FIX: handle negative elapsed]
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatHours(hours: number | null | undefined): string {
  if (!hours) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

function getWeekDays(): Date[] {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

function getDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// [FIX M3: Proper CSV escaping]
function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

// ── Component ──
export default function TimeTrackingPage() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const userId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // State
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamEntries, setTeamEntries] = useState<TimeEntry[]>([]);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("my-time");
  const [analyticsTab, setAnalyticsTab] = useState("employee");
  const [dateRange, setDateRange] = useState("week");
  const [teamLoading, setTeamLoading] = useState(false); // [FIX M6]
  const [analyticsLoading, setAnalyticsLoading] = useState(false); // [FIX M6]

  // Timer state
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Form state
  const [selectedProject, setSelectedProject] = useState("");
  const [timerDescription, setTimerDescription] = useState("");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Team filter state
  const [teamFilterUser, setTeamFilterUser] = useState("");
  const [teamFilterProject, setTeamFilterProject] = useState("");
  const [teamFilterStartDate, setTeamFilterStartDate] = useState("");
  const [teamFilterEndDate, setTeamFilterEndDate] = useState("");

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Team users
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; name: string }>>([]);

  // ── Fetch entries ──
  const fetchEntries = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/time-tracking", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        // [FIX C1: safe array fallback]
        const arr = safeArray<TimeEntry>(data);
        setEntries(arr);
        const active = arr.find((e) => e.status === "ACTIVE");
        setActiveEntry(active || null);
      } else {
        // [FIX H1: Show error toast for non-ok responses]
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load time entries");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch entries");
      setError(err instanceof Error ? err.message : "Failed to load time entries");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch projects ──
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        // [FIX C1: safe array fallback before .filter()]
        const arr = safeArray<Project>(data);
        setProjects(arr.filter((p) => p.status !== "COMPLETED"));
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load projects");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch projects");
    }
  }, []);

  // ── Fetch team users ──
  const fetchTeamUsers = useCallback(async (signal?: AbortSignal) => {
    if (!isAdminUser) return;
    try {
      const res = await fetch("/api/team", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        // [FIX C1: safe array fallback before .map()]
        const arr = safeArray<any>(data);
        setTeamUsers(arr.map((u: any) => ({ id: u.id, name: u.name })));
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load team users");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch team users");
    }
  }, [isAdminUser]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    fetchEntries(signal);
    fetchProjects(signal);
    fetchTeamUsers(signal);
    return () => controller.abort();
  }, [fetchEntries, fetchProjects, fetchTeamUsers]);

  // ── Timer tick ──
  useEffect(() => {
    if (activeEntry) {
      const update = () => {
        const diff = Date.now() - new Date(activeEntry.clockIn).getTime();
        setElapsed(diff);
      };
      update();
      timerRef.current = setInterval(update, 1000);
    } else {
      setElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeEntry]);

  // ── Start timer ── [FIX M5: wrap in useCallback]
  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/time-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProject === "none" ? undefined : (selectedProject || undefined),
          description: timerDescription || undefined,
        }),
      });
      if (res.ok) {
        const entry = await res.json();
        setActiveEntry(entry);
        toast.success("Timer started!");
        fetchEntries();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to start timer");
      }
    } catch {
      toast.error("Failed to start timer");
    } finally {
      setStarting(false);
    }
  }, [selectedProject, timerDescription, fetchEntries]);

  // ── Stop timer ── [FIX M5: wrap in useCallback]
  const handleStop = useCallback(async () => {
    if (!activeEntry) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/time-tracking/${activeEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: activeEntry.id, status: "COMPLETED" }),
      });
      if (res.ok) {
        setActiveEntry(null);
        toast.success("Timer stopped!");
        fetchEntries();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to stop timer");
      }
    } catch {
      toast.error("Failed to stop timer");
    } finally {
      setStopping(false);
    }
  }, [activeEntry, fetchEntries]);

  // ── Fetch team logs ── (declared before handleDelete to avoid use-before-declaration)
  const fetchTeamLogs = useCallback(async (signal?: AbortSignal) => {
    if (!isAdminUser) return;
    setTeamLoading(true); // [FIX M6]
    try {
      const params = new URLSearchParams();
      // [FIX H2/H3: Don't send "all" as userId/projectId to API]
      if (teamFilterUser && teamFilterUser !== "all") params.set("userId", teamFilterUser);
      if (teamFilterProject && teamFilterProject !== "all") params.set("projectId", teamFilterProject);
      if (teamFilterStartDate) params.set("startDate", teamFilterStartDate);
      if (teamFilterEndDate) params.set("endDate", teamFilterEndDate);
      // If no date filter, show this week
      if (!teamFilterStartDate && !teamFilterEndDate) {
        const weekDays = getWeekDays();
        params.set("startDate", getDateStr(weekDays[0]));
        params.set("endDate", getDateStr(weekDays[6]));
      }
      params.set("status", "COMPLETED");

      const res = await fetch(`/api/time-tracking?${params}`, { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        setTeamEntries(safeArray<TimeEntry>(data)); // [FIX C1]
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load team logs");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch team logs");
    } finally {
      setTeamLoading(false); // [FIX M6]
    }
  }, [isAdminUser, teamFilterUser, teamFilterProject, teamFilterStartDate, teamFilterEndDate]);

  // ── Delete entry ──
  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/time-tracking/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Entry deleted");
        fetchEntries();
        if (activeTab === "team") fetchTeamLogs();
      } else {
        // [FIX H4: Read error body from API response]
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to delete entry");
      }
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeleteId(null);
    }
  }, [deleteId, activeTab, fetchEntries, fetchTeamLogs]);

  useEffect(() => {
    if (activeTab === "team" && isAdminUser) {
      const controller = new AbortController();
      fetchTeamLogs(controller.signal);
      return () => controller.abort();
    }
  }, [activeTab, isAdminUser, fetchTeamLogs]);

  // ── Fetch analytics ──
  const fetchAnalytics = useCallback(async (signal?: AbortSignal) => {
    setAnalyticsLoading(true); // [FIX M6]
    try {
      const params = new URLSearchParams();
      params.set("type", analyticsTab);

      const now = new Date();
      if (dateRange === "week") {
        const days = getWeekDays();
        params.set("startDate", getDateStr(days[0]));
        params.set("endDate", getDateStr(days[6]));
      } else if (dateRange === "month") {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        params.set("startDate", getDateStr(start));
        params.set("endDate", getDateStr(end));
      }

      const res = await fetch(`/api/time-tracking/analytics?${params}`, { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load analytics");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch analytics");
    } finally {
      setAnalyticsLoading(false); // [FIX M6]
    }
  }, [analyticsTab, dateRange]);

  useEffect(() => {
    if (activeTab === "analytics") {
      const controller = new AbortController();
      fetchAnalytics(controller.signal);
      return () => controller.abort();
    }
  }, [activeTab, fetchAnalytics]);

  // ── Export CSV ──
  const exportCSV = useCallback(() => {
    const headers = ["Employee", "Project", "Description", "Date", "Clock In", "Clock Out", "Duration (hours)"];
    const rows = teamEntries.map((e) => [
      e.user?.name || "Unknown",
      e.project?.name || "No Project",
      e.description || "",
      formatDate(e.date),
      formatTime(e.clockIn),
      e.clockOut ? formatTime(e.clockOut) : "Active",
      e.totalHours ? e.totalHours.toFixed(2) : "0",
    ]);

    // [FIX M3: Proper CSV escaping]
    const csv = [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${getDateStr(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [teamEntries]);

  // ── Computed stats ──
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekDays = getWeekDays();
  const endOfWeek = new Date(weekDays[6].getTime() + 86400000);

  const todayHours = entries
    .filter((e) => {
      const d = new Date(e.date);
      return d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
    })
    .reduce((sum, e) => sum + (e.totalHours || 0), 0);

  const weekHours = entries
    .filter((e) => {
      const d = new Date(e.date);
      return d >= weekDays[0] && d < endOfWeek;
    })
    .reduce((sum, e) => sum + (e.totalHours || 0), 0);

  // Add active timer hours to today and week
  const activeTimerHours = activeEntry ? elapsed / (1000 * 60 * 60) : 0;
  const todayTotal = todayHours + activeTimerHours;
  const weekTotal = weekHours + activeTimerHours;

  // [FIX M4: Add end bound to activeProjectIds filter]
  const activeProjectIds = new Set(
    entries
      .filter((e) => {
        const d = new Date(e.date);
        return d >= weekDays[0] && d < endOfWeek && e.projectId;
      })
      .map((e) => e.projectId)
  );

  const completedEntries = entries.filter((e) => e.status === "COMPLETED");
  const myTodayEntries = completedEntries.filter((e) => {
    const d = new Date(e.date);
    return d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
  });

  // Weekly grid data
  const weeklyGrid = weekDays.map((day) => {
    const dayStart = day.getTime();
    const dayEnd = dayStart + 86400000;
    const dayEntries = completedEntries.filter((e) => {
      const d = new Date(e.date).getTime();
      return d >= dayStart && d < dayEnd;
    });
    const total = dayEntries.reduce((sum, e) => sum + (e.totalHours || 0), 0);
    const isToday = day.toDateString() === today.toDateString();
    return { day, total, entries: dayEntries, isToday };
  });

  // [FIX C2: Show loading skeleton during session loading]
  if (sessionStatus === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Time Tracking</h1>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Time Tracking</h1>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchEntries(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Time Tracking
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your work hours and manage time entries
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* [FIX M7: Add refresh button] */}
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchEntries(); }}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>

          {/* Active Timer Status */}
          {activeEntry && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  Working on {activeEntry.project?.name || "General"}
                </span>
              </div>
              <span className="text-lg font-bold text-green-700 dark:text-green-300 tabular-nums">
                {formatDuration(elapsed)}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                onClick={handleStop}
                disabled={stopping}
              >
                <Square className="h-3.5 w-3.5 mr-1.5" />
                {stopping ? "Stopping..." : "STOP"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Today&apos;s Hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Timer className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-2xl font-bold tabular-nums">{formatHours(todayTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">This Week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-2xl font-bold tabular-nums">{formatHours(weekTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Active Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-2xl font-bold">{activeProjectIds.size}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{isAdminUser ? "Team Entries" : "My Entries"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-2xl font-bold">{completedEntries.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="my-time">My Time</TabsTrigger>
          {isAdminUser && <TabsTrigger value="team">Team Logs</TabsTrigger>}
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My Time ── */}
        <TabsContent value="my-time" className="space-y-6 mt-4">
          {/* Timer Control */}
          <Card className={activeEntry ? "border-green-200 dark:border-green-800" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-4 w-4" />
                {activeEntry ? "Timer Running" : "Start Timer"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeEntry ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                          {activeEntry.project?.name || "No Project"}
                        </Badge>
                        <span className="text-3xl font-bold tabular-nums text-green-600 dark:text-green-400">
                          {formatDuration(elapsed)}
                        </span>
                      </div>
                      {activeEntry.description && (
                        <p className="text-sm text-muted-foreground">{activeEntry.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Started at {formatTime(activeEntry.clockIn)}
                      </p>
                    </div>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="h-12 px-8 text-base font-semibold"
                      onClick={handleStop}
                      disabled={stopping}
                    >
                      <StopCircle className="h-5 w-5 mr-2" />
                      {stopping ? "Stopping..." : "STOP"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm mb-1.5 block">Project (optional)</Label>
                      <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Project</SelectItem>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm mb-1.5 block">Description (optional)</Label>
                      <Input
                        placeholder="What are you working on?"
                        value={timerDescription}
                        onChange={(e) => setTimerDescription(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="h-12 px-8 text-base font-semibold bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleStart}
                    disabled={starting}
                  >
                    <Play className="h-5 w-5 mr-2" />
                    {starting ? "Starting..." : "START"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Timesheet Grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Weekly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {weeklyGrid.map(({ day, total, isToday }, i) => {
                  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                  return (
                    <div
                      key={day.toISOString()} // [FIX M1: Use stable key instead of array index]
                      className={`text-center p-3 rounded-lg border transition-colors ${
                        isToday
                          ? "bg-primary/5 border-primary/30"
                          : total > 0
                          ? "bg-muted/50"
                          : ""
                      }`}
                    >
                      <div className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {dayNames[i]}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {day.getDate()}
                      </div>
                      <div className={`text-sm font-bold mt-1 ${total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {total > 0 ? formatHours(total) : "\u2014"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Week Total</span>
                <span className="text-sm font-bold">{formatHours(weekTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Today's Entries */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today&apos;s Entries</CardTitle>
              <CardDescription>
                {myTodayEntries.length === 0 ? "No completed entries today" : `${myTodayEntries.length} completed entr${myTodayEntries.length === 1 ? "y" : "ies"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myTodayEntries.length === 0 ? (
                <div className="text-center py-6">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground opacity-40 mb-2" />
                  <p className="text-sm text-muted-foreground">Start a timer to begin tracking</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myTodayEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {entry.project?.name || "No Project"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {entry.description || "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{formatTime(entry.clockIn)}</TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {entry.clockOut ? formatTime(entry.clockOut) : "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm font-medium tabular-nums">
                            {formatHours(entry.totalHours)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteId(entry.id)}
                              aria-label="Delete time entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Team Logs (Admin) ── */}
        {isAdminUser && (
          <TabsContent value="team" className="space-y-6 mt-4">
            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Employee</Label>
                    <Select value={teamFilterUser} onValueChange={setTeamFilterUser}>
                      <SelectTrigger>
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {teamUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Project</Label>
                    <Select value={teamFilterProject} onValueChange={setTeamFilterProject}>
                      <SelectTrigger>
                        <SelectValue placeholder="All projects" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All projects</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Start Date</Label>
                    <Input
                      type="date"
                      value={teamFilterStartDate}
                      onChange={(e) => setTeamFilterStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">End Date</Label>
                    <Input
                      type="date"
                      value={teamFilterEndDate}
                      onChange={(e) => setTeamFilterEndDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" onClick={() => fetchTeamLogs()} className="w-full">
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Entries Table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Team Time Logs</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportCSV} disabled={teamEntries.length === 0}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* [FIX M6: Loading state for team logs] */}
                {teamLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading team logs...</span>
                  </div>
                ) : teamEntries.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 mx-auto text-muted-foreground opacity-40 mb-2" />
                    <p className="text-sm text-muted-foreground">No entries found for the selected filters</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                          <TableHead>Duration</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-sm font-medium">
                              {entry.user?.name || "Unknown"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {entry.project?.name || "No Project"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {entry.description || "\u2014"}
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(entry.date)}</TableCell>
                            <TableCell className="text-sm tabular-nums">{formatTime(entry.clockIn)}</TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {entry.clockOut ? formatTime(entry.clockOut) : "\u2014"}
                            </TableCell>
                            <TableCell className="text-sm font-medium tabular-nums">
                              {formatHours(entry.totalHours)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Tab 3: Analytics ── */}
        <TabsContent value="analytics" className="space-y-6 mt-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Tabs value={analyticsTab} onValueChange={setAnalyticsTab}>
              <TabsList>
                <TabsTrigger value="employee">By Employee</TabsTrigger>
                <TabsTrigger value="project">By Project</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Analytics Content */}
          {/* [FIX M6: Loading state for analytics] */}
          {analyticsLoading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading analytics...</span>
              </CardContent>
            </Card>
          ) : analyticsData && analyticsData.data.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {analyticsTab === "employee" ? "Hours by Employee" : "Hours by Project"}
                </CardTitle>
                <CardDescription>
                  Total: {formatHours(analyticsData.totalHours)} across {analyticsData.data.length} {analyticsTab === "employee" ? "employees" : "projects"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analyticsData.data.map((item, i) => {
                  const name = analyticsTab === "employee" ? item.name : item.projectName;
                  const hours = item.totalHours;
                  const maxHours = analyticsData.data[0]?.totalHours || 1;
                  const percentage = analyticsData.totalHours > 0
                    ? Math.round((hours / analyticsData.totalHours) * 100)
                    : 0;
                  const barWidth = Math.max(2, (hours / maxHours) * 100);

                  const colors = [
                    "bg-emerald-500",
                    "bg-teal-500",
                    "bg-cyan-500",
                    "bg-sky-500",
                    "bg-violet-500",
                    "bg-fuchsia-500",
                    "bg-pink-500",
                    "bg-rose-500",
                    "bg-orange-500",
                    "bg-amber-500",
                  ];
                  const color = colors[i % colors.length];
                  // [FIX M2: Use stable key instead of array index]
                  const stableKey = analyticsTab === "employee" ? item.userId : item.projectId;

                  return (
                    <div key={stableKey || i} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate max-w-[200px]">{name || "Unknown"}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground text-xs">{percentage}%</span>
                          <span className="font-bold tabular-nums">{formatHours(hours)}</span>
                        </div>
                      </div>
                      <div className="h-6 w-full bg-muted rounded-md overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-md transition-all duration-500`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground opacity-40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No data available for the selected period
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this time entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
