"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Clock, Play, Square, Timer, TrendingUp, Users, BarChart3,
  Download, Trash2, StopCircle, CalendarDays, FolderKanban,
  RefreshCw, AlertCircle, Loader2, UserCheck, Pencil, Plus, Eye,
  ArrowLeft,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

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
  // ── Phase A3: agent attendance fields ──
  source?: string | null; // MANUAL, AGENT_OTP, ADMIN_OVERRIDE
  agentSessionId?: string | null;
  clockInMethod?: string | null; // OTP, MANUAL, ADMIN
  clockOutMethod?: string | null; // END_COMMAND, MANUAL, ADMIN_OVERRIDE, AUTO_MISSED
  user?: { id: string; name: string; email: string; avatar?: string | null; role?: string };
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
  if (ms < 0) return "00:00:00"; // [FIX: handle negative elapsed]
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationShort(ms: number): string {
  if (ms < 0) return "0m";
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

// Convert ISO string to datetime-local input format (YYYY-MM-DDTHH:MM)
function toDatetimeLocal(isoStr: string): string {
  const d = new Date(isoStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Convert datetime-local input value to ISO string
function fromDatetimeLocal(localStr: string): string {
  return new Date(localStr).toISOString();
}

// [FIX M3: Proper CSV escaping]
function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}

// ── Module-scope constants ──
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLORS = [
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

// ── Component ──
export default function TimeTrackingPage() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
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
  const [teamLoading, setTeamLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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

  // Admin: End running session (admin override on /api/time-tracking/[id]/admin-end)
  const [endingEntryId, setEndingEntryId] = useState<string | null>(null);
  const [endSessionConfirmId, setEndSessionConfirmId] = useState<string | null>(null);

  // Team users
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; name: string }>>([]);

  // Clock-out dialog state
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState("");
  const clockOutNotesRef = useRef("");

  // Active entries (who's online - admin only)
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [activeElapsedMap, setActiveElapsedMap] = useState<Record<string, number>>({});

  // Admin: Add entry dialog
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addEntryUserId, setAddEntryUserId] = useState("");
  const [addEntryProjectId, setAddEntryProjectId] = useState("");
  const [addEntryDescription, setAddEntryDescription] = useState("");
  const [addEntryClockIn, setAddEntryClockIn] = useState("");
  const [addEntryClockOut, setAddEntryClockOut] = useState("");
  const [addEntrySaving, setAddEntrySaving] = useState(false);

  // Admin: Edit entry dialog
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // View description dialog
  const [viewDescriptionEntry, setViewDescriptionEntry] = useState<TimeEntry | null>(null);

  // Deep-link + redirect popup state
  const [showRedirectPopup, setShowRedirectPopup] = useState(false);
  const [fromWorkspace, setFromWorkspace] = useState(false);
  const timerCardRef = useRef<HTMLDivElement>(null);

  // ── Deep-link: check for ?action=start param and scroll to timer ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "start") {
      setFromWorkspace(true);
      // Wait for page to render, then scroll to timer card
      setTimeout(() => {
        timerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        timerCardRef.current?.classList.add("ring-2", "ring-green-400", "ring-offset-2");
        // Remove highlight after 3 seconds
        setTimeout(() => {
          timerCardRef.current?.classList.remove("ring-2", "ring-green-400", "ring-offset-2");
        }, 3000);
      }, 500);
    }
  }, [loading]);

  // ── Fetch entries ──
  const fetchEntries = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/time-tracking", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        // Handle both new shape { entries, activeEntries } and legacy array
        let arr: TimeEntry[];
        if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
          arr = safeArray<TimeEntry>(data.entries);
          setActiveEntries(safeArray<TimeEntry>(data.activeEntries));
        } else {
          arr = safeArray<TimeEntry>(data);
        }
        setEntries(arr);
        const active = arr.find((e) => e.status === "ACTIVE");
        setActiveEntry(active || null);
      } else {
        const errData = await res.json().catch(() => null);
        const msg = errData?.error || "Failed to load time entries";
        toast.error(msg);
        // Only set error state for non-429 errors so the page shows something useful
        if (res.status !== 429) {
          setError(msg);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load time entries. Please try again.");
    } finally {
      // [FIX: Don't set loading false on abort — prevents race condition
      //  where the page briefly renders empty data between abort and replacement fetch]
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // ── Fetch projects ──
  // Fetch only id + name + status for fast loading (no need for full project details)
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects?fields=minimal", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        // Handle both array response and { data: [...] } response
        const arr = safeArray<Project>(Array.isArray(data) ? data : (data?.data || data));
        setProjects(arr.filter((p) => p.status !== "COMPLETED"));
      } else {
        // Fallback: try without the fields param
        const res2 = await fetch("/api/projects", { credentials: "include", signal });
        if (res2.ok) {
          const data2 = await res2.json();
          const arr2 = safeArray<Project>(Array.isArray(data2) ? data2 : (data2?.data || data2));
          setProjects(arr2.filter((p) => p.status !== "COMPLETED"));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
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
        const arr = safeArray<unknown>(data);
        setTeamUsers(arr.filter((u): u is { id: string; name: string } => typeof u === 'object' && u !== null && 'id' in u && 'name' in u).map((u) => ({ id: u.id, name: u.name })));
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load team users");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // silently ignore abort for background fetches
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

  // ── Active entries elapsed timer (admin - who's online) ──
  const updateActiveElapsedMap = useCallback(() => {
    const map: Record<string, number> = {};
    for (const entry of activeEntries) {
      if (entry.status === "ACTIVE" && entry.clockIn) {
        map[entry.id] = Math.floor((Date.now() - new Date(entry.clockIn).getTime()) / 1000);
      }
    }
    setActiveElapsedMap(prev => {
      // Only update if values actually changed
      if (JSON.stringify(prev) === JSON.stringify(map)) return prev;
      return { ...map };
    });
  }, [activeEntries]);

  useEffect(() => {
    if (!isAdminUser || activeEntries.length === 0) {
      setActiveElapsedMap({});
      return;
    }
    updateActiveElapsedMap();
    const interval = setInterval(updateActiveElapsedMap, 1000);
    return () => clearInterval(interval);
  }, [isAdminUser, activeEntries, updateActiveElapsedMap]);

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
        // If user came from workspace, show redirect popup
        if (fromWorkspace) {
          setShowRedirectPopup(true);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to start timer");
      }
    } catch {
      toast.error("Failed to start timer");
    } finally {
      setStarting(false);
    }
  }, [selectedProject, timerDescription, fetchEntries, fromWorkspace]);

  // ── Clock-out dialog handlers ──
  const handleClockOutClick = useCallback(() => {
    if (activeEntry) {
      setClockOutNotes("");
      setClockOutOpen(true);
    }
  }, [activeEntry]);

  const executeClockOut = useCallback(async () => {
    if (!activeEntry) return;
    const notes = clockOutNotesRef.current;
    setStopping(true);
    try {
      const res = await fetch(`/api/time-tracking/${activeEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: activeEntry.id, status: "COMPLETED", description: notes || undefined }),
      });
      if (res.ok) {
        setActiveEntry(null);
        toast.success("Clocked out successfully!");
        setClockOutOpen(false);
        setClockOutNotes("");
        fetchEntries();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to clock out");
      }
    } catch {
      toast.error("Failed to clock out");
    } finally {
      setStopping(false);
    }
  }, [activeEntry, fetchEntries]);

  // ── Fetch team logs ── (declared before handleDelete to avoid use-before-declaration)
  const fetchTeamLogs = useCallback(async (signal?: AbortSignal) => {
    if (!isAdminUser) return;
    setTeamLoading(true);
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
        // Handle both new shape { entries } and legacy array
        if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
          setTeamEntries(safeArray<TimeEntry>(data.entries));
        } else {
          setTeamEntries(safeArray<TimeEntry>(data));
        }
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load team logs");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // silently ignore abort for background fetches
    } finally {
      setTeamLoading(false);
    }
  }, [isAdminUser, teamFilterUser, teamFilterProject, teamFilterStartDate, teamFilterEndDate]);

  // ── Admin: Add entry handler ──
  const handleAdminAddEntry = useCallback(async () => {
    if (!addEntryUserId || !addEntryClockIn) {
      toast.error("Employee and clock-in time are required");
      return;
    }
    setAddEntrySaving(true);
    try {
      const payload: Record<string, unknown> = {
        userId: addEntryUserId,
        clockIn: fromDatetimeLocal(addEntryClockIn),
      };
      if (addEntryProjectId && addEntryProjectId !== "none") payload.projectId = addEntryProjectId;
      if (addEntryDescription) payload.description = addEntryDescription;
      if (addEntryClockOut) payload.clockOut = fromDatetimeLocal(addEntryClockOut);

      const res = await fetch("/api/time-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Time entry created successfully");
        setAddEntryOpen(false);
        setAddEntryUserId("");
        setAddEntryProjectId("");
        setAddEntryDescription("");
        setAddEntryClockIn("");
        setAddEntryClockOut("");
        fetchEntries();
        if (activeTab === "team") fetchTeamLogs();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create entry");
      }
    } catch {
      toast.error("Failed to create entry");
    } finally {
      setAddEntrySaving(false);
    }
  }, [addEntryUserId, addEntryClockIn, addEntryProjectId, addEntryDescription, addEntryClockOut, activeTab, fetchEntries, fetchTeamLogs]);

  // ── Admin: Edit entry handler ──
  const openEditDialog = useCallback((entry: TimeEntry) => {
    setEditEntry(entry);
    setEditDescription(entry.description || "");
    setEditProjectId(entry.projectId || "none");
    setEditClockIn(toDatetimeLocal(entry.clockIn));
    setEditClockOut(entry.clockOut ? toDatetimeLocal(entry.clockOut) : "");
  }, []);

  const handleAdminEditEntry = useCallback(async () => {
    if (!editEntry) return;
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: editEntry.id,
        description: editDescription || undefined,
        projectId: editProjectId === "none" ? null : (editProjectId || undefined),
        clockIn: fromDatetimeLocal(editClockIn),
      };
      if (editClockOut) {
        payload.clockOut = fromDatetimeLocal(editClockOut);
      } else {
        payload.clockOut = null;
      }

      const res = await fetch(`/api/time-tracking/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Entry updated successfully");
        setEditEntry(null);
        fetchEntries();
        if (activeTab === "team") fetchTeamLogs();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update entry");
      }
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setEditSaving(false);
    }
  }, [editEntry, editDescription, editProjectId, editClockIn, editClockOut, activeTab, fetchEntries, fetchTeamLogs]);

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

  // ── Admin: End running session (admin override) ──
  // Calls /api/time-tracking/[id]/admin-end to force-clock-out a user who forgot.
  const handleAdminEndSession = useCallback(async (entryId: string) => {
    setEndingEntryId(entryId);
    try {
      const res = await fetch(`/api/time-tracking/${entryId}/admin-end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const hours = typeof data.totalHours === "number" ? data.totalHours.toFixed(2) : "?";
        toast.success(`Session ended. Total: ${hours}h`);
        fetchEntries();
        if (activeTab === "team") fetchTeamLogs();
      } else {
        toast.error(data?.error || "Failed to end session");
      }
    } catch {
      toast.error("Failed to end session");
    } finally {
      setEndingEntryId(null);
      setEndSessionConfirmId(null);
    }
  }, [activeTab, fetchEntries, fetchTeamLogs]);

  useEffect(() => {
    if (activeTab === "team" && isAdminUser) {
      const controller = new AbortController();
      fetchTeamLogs(controller.signal);
      return () => controller.abort();
    }
  }, [activeTab, isAdminUser, fetchTeamLogs]);

  // ── Fetch analytics ──
  const fetchAnalytics = useCallback(async (signal?: AbortSignal) => {
    setAnalyticsLoading(true);
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
      // silently ignore abort for background fetches
    } finally {
      setAnalyticsLoading(false);
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

  // ── Computed stats (memoized) ──
  // [FIX: Move date computations inside useMemo to avoid stale closure over
  //  external variables that are NOT in the dependency array. Previously,
  // today/startOfToday/weekDays/endOfWeek were computed outside useMemo but
  //  referenced inside it with only [entries] as the dependency — meaning
  //  date changes wouldn't trigger recomputation.]
  const { todayHours, weekHours, activeProjectIds, completedEntries, weeklyGrid, myTodayEntries,
          today, startOfToday, weekDays, endOfWeek } = useMemo(() => {
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

    const activeProjectIds = new Set(
      entries
        .filter((e) => {
          const d = new Date(e.date);
          return d >= weekDays[0] && d < endOfWeek && e.projectId;
        })
        .map((e) => e.projectId)
    );

    const completedEntries = entries.filter((e) => e.status === "COMPLETED");

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

    const myTodayEntries = completedEntries.filter((e) => {
      const d = new Date(e.date);
      return d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
    });

    return { todayHours, weekHours, activeProjectIds, completedEntries, weeklyGrid, myTodayEntries,
             today, startOfToday, weekDays, endOfWeek };
  }, [entries]);

  // Add active timer hours to today and week
  const activeTimerHours = activeEntry ? elapsed / (1000 * 60 * 60) : 0;
  const todayTotal = todayHours + activeTimerHours;
  const weekTotal = weekHours + activeTimerHours;

  // [FIX C2: Show loading skeleton during session loading or data loading]
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">Time Tracking</h1>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 sm:h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-48 sm:h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] gap-3 sm:gap-4 px-4">
        <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-destructive" />
        <p className="text-sm sm:text-base text-muted-foreground text-center">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchEntries(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <PageHeader title="Time Tracking" description="Track your work hours and manage time entries">
        <div className="flex flex-wrap items-center gap-2">
          {isAdminUser && (
            <Button size="sm" onClick={() => setAddEntryOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> <span className="hidden sm:inline">Add Entry</span><span className="sm:hidden">Add</span>
            </Button>
          )}
          {/* [FIX M7: Add refresh button] */}
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchEntries(); }}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Active Timer Status — compact on mobile */}
          {activeEntry && (
            <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-green-500" />
                </span>
                <span className="text-xs sm:text-sm font-medium text-green-700 dark:text-green-300 truncate max-w-[80px] sm:max-w-none">
                  {activeEntry.project?.name || "Working"}
                </span>
              </div>
              <span className="text-sm sm:text-lg font-bold text-green-700 dark:text-green-300 tabular-nums tracking-wider">
                {formatDuration(elapsed)}
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 sm:h-8 px-2 sm:px-3"
                onClick={handleClockOutClick}
                disabled={stopping}
              >
                <Square className="h-3 w-3 sm:h-3.5 sm:w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">{stopping ? "Stopping..." : "CLOCK OUT"}</span>
              </Button>
            </div>
          )}
        </div>
      </PageHeader>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs">Today&apos;s Hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Timer className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold tabular-nums">{formatHours(todayTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs">This Week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold tabular-nums">{formatHours(weekTotal)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs">Active Projects</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                <FolderKanban className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold">{activeProjectIds.size}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs">{isAdminUser ? "Team Entries" : "My Entries"}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-xl sm:text-2xl font-bold">{completedEntries.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Running Sessions - Admin Only (Phase A3) */}
      {isAdminUser && activeEntries && activeEntries.length > 0 && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-green-600" />
                Running Sessions
              </CardTitle>
              <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                {activeEntries.length} active
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Users currently clocked in. Use &ldquo;End Session&rdquo; to force clock-out a user who forgot.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeEntries.map((entry) => {
                const isEnding = endingEntryId === entry.id;
                const sourceLabel =
                  entry.source === "AGENT_OTP" ? "OTP"
                  : entry.source === "ADMIN_OVERRIDE" ? "Admin"
                  : entry.clockInMethod === "OTP" ? "OTP"
                  : "Manual";
                const sourceBadgeClass =
                  entry.source === "AGENT_OTP" || entry.clockInMethod === "OTP"
                    ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800"
                    : "bg-slate-50 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-200 dark:border-slate-800";
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={entry.user?.avatar || ""} alt={entry.user?.name || ""} />
                        <AvatarFallback className="text-xs">
                          {entry.user?.name?.charAt(0)?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{entry.user?.name || "Unknown"}</p>
                          <Badge variant="outline" className={`text-[10px] ${sourceBadgeClass}`}>
                            {sourceLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.project?.name || "No project"} &bull; Since {new Date(entry.clockIn).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end shrink-0">
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px] tabular-nums font-mono">
                        {formatDuration(activeElapsedMap[entry.id] || 0)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        disabled={isEnding}
                        onClick={() => setEndSessionConfirmId(entry.id)}
                        aria-label={`End session for ${entry.user?.name || "user"}`}
                      >
                        {isEnding ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Ending...</>
                        ) : (
                          <><StopCircle className="h-3 w-3 mr-1" />End Session</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="my-time" className="text-xs sm:text-sm">My Time</TabsTrigger>
          {isAdminUser && <TabsTrigger value="team" className="text-xs sm:text-sm">Team Logs</TabsTrigger>}
          <TabsTrigger value="analytics" className="text-xs sm:text-sm">Analytics</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My Time ── */}
        <TabsContent value="my-time" className="space-y-6 mt-4">
          {/* Timer Control */}
          <Card ref={timerCardRef as any} className={activeEntry ? "border-green-200 dark:border-green-800 transition-shadow" : "transition-shadow"}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <Timer className="h-4 w-4" />
                {activeEntry ? "Timer Running" : "Start Timer"}
                {fromWorkspace && !activeEntry && (
                  <Badge variant="default" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20 ml-auto">
                    Clock in to continue
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeEntry ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="space-y-1.5 w-full">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                        </span>
                        <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 text-xs">
                          {activeEntry.project?.name || "No Project"}
                        </Badge>
                      </div>
                      <p className="text-3xl sm:text-4xl font-bold tabular-nums text-green-600 dark:text-green-400 tracking-wide pl-5">
                        {formatDuration(elapsed)}
                      </p>
                      {activeEntry.description && (
                        <p className="text-xs sm:text-sm text-muted-foreground pl-5">{activeEntry.description}</p>
                      )}
                      <p className="text-[10px] sm:text-xs text-muted-foreground pl-5">
                        Started at {formatTime(activeEntry.clockIn)} &bull;{" "}
                        {formatDurationShort(elapsed)} elapsed
                      </p>
                    </div>
                    <Button
                      size="lg"
                      variant="destructive"
                      className="h-10 sm:h-12 px-6 sm:px-8 text-sm sm:text-base font-semibold w-full sm:w-auto"
                      onClick={handleClockOutClick}
                      disabled={stopping}
                    >
                      <StopCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      {stopping ? "Stopping..." : "CLOCK OUT"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <Label className="text-xs sm:text-sm mb-1.5 block">Project (optional)</Label>
                      <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger className="h-9 sm:h-10">
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
                      <Label className="text-xs sm:text-sm mb-1.5 block">Description (optional)</Label>
                      <Input
                        placeholder="What are you working on?"
                        value={timerDescription}
                        onChange={(e) => setTimerDescription(e.target.value)}
                        className="h-9 sm:h-10 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="h-10 sm:h-12 px-6 sm:px-8 text-sm sm:text-base font-semibold bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                    onClick={handleStart}
                    disabled={starting}
                  >
                    <Play className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    {starting ? "Starting..." : "START"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Timesheet Grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Weekly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weeklyGrid.map(({ day, total, isToday }, i) => {
                  return (
                    <div
                      key={day.toISOString()}
                      className={`text-center p-1.5 sm:p-3 rounded-lg border transition-colors ${
                        isToday
                          ? "bg-primary/5 border-primary/30"
                          : total > 0
                          ? "bg-muted/50"
                          : ""
                      }`}
                    >
                      <div className={`text-[9px] sm:text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {DAY_NAMES[i]}
                      </div>
                      <div className="text-[9px] sm:text-xs text-muted-foreground mt-0.5">
                        {day.getDate()}
                      </div>
                      <div className={`text-[10px] sm:text-sm font-bold mt-1 ${total > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {total > 0 ? formatHours(total) : "\u2014"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <span className="text-xs sm:text-sm text-muted-foreground">Week Total</span>
                <span className="text-xs sm:text-sm font-bold">{formatHours(weekTotal)}</span>
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
                  <Table aria-label="Today's time entries">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Duration</TableHead>
                        {isAdminUser && <TableHead className="w-20">Actions</TableHead>}
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
                          <TableCell
                            className="text-sm text-muted-foreground max-w-[200px] truncate cursor-pointer hover:underline hover:text-foreground transition-colors"
                            onClick={() => entry.description && setViewDescriptionEntry(entry)}
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') entry.description && setViewDescriptionEntry(entry) }}
                            role="button"
                          >
                            {entry.description || "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{formatTime(entry.clockIn)}</TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {entry.clockOut ? formatTime(entry.clockOut) : "\u2014"}
                          </TableCell>
                          <TableCell className="text-sm font-medium tabular-nums">
                            {formatHours(entry.totalHours)}
                          </TableCell>
                          {isAdminUser && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => openEditDialog(entry)}
                                  aria-label="Edit time entry"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteId(entry.id)}
                                  aria-label="Delete time entry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
                  <CardTitle className="text-base">
                    Team Time Logs
                    {teamEntries.length > 0 && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({teamEntries.reduce((s, e) => s + (e.totalHours || 0), 0).toFixed(1)}h total)
                      </span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setAddEntryOpen(true)} className="bg-green-600 hover:bg-green-700 text-white">
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Entry
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCSV} disabled={teamEntries.length === 0}>
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                    </Button>
                  </div>
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
                    <Table aria-label="Team time logs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead className="w-20">Actions</TableHead>
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
                            <TableCell
                              className="text-sm text-muted-foreground max-w-[200px] truncate cursor-pointer hover:underline hover:text-foreground transition-colors"
                              onClick={() => entry.description && setViewDescriptionEntry(entry)}
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter') entry.description && setViewDescriptionEntry(entry) }}
                              role="button"
                            >
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
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => openEditDialog(entry)}
                                  aria-label="Edit time entry"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteId(entry.id)}
                                  aria-label="Delete time entry"
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

                  const color = COLORS[i % COLORS.length];
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

      {/* Clock-Out Dialog */}
      <Dialog open={clockOutOpen} onOpenChange={(open) => { setClockOutOpen(open); if (!open) setClockOutNotes(""); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StopCircle className="h-5 w-5 text-destructive" />
              Clock Out
            </DialogTitle>
            <DialogDescription>
              {activeEntry ? (
                <>
                  You&apos;ve been working for{" "}
                  <span className="font-semibold text-foreground">{formatDuration(elapsed)}</span>
                  {activeEntry.project?.name && (
                    <> on <span className="font-semibold text-foreground">{activeEntry.project.name}</span></>
                  )}
                  .
                </>
              ) : (
                "Record your work summary for this session."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clock-out-notes">
                Work Summary / Notes
                <span className="text-muted-foreground font-normal ml-1">(optional)</span>
              </Label>
              <Textarea
                id="clock-out-notes"
                value={clockOutNotes}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 500)
                  setClockOutNotes(val)
                  clockOutNotesRef.current = val
                }}
                placeholder="What did you work on during this session?"
                rows={4}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Add a brief description of what you accomplished.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                Clock-out time:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setClockOutOpen(false); setClockOutNotes(""); }}>
              Cancel
            </Button>
            <Button onClick={executeClockOut} disabled={stopping}>
              {stopping ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Stopping...
                </>
              ) : (
                <>
                  <StopCircle className="h-4 w-4 mr-2" />
                  Clock Out
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* End Session Confirmation Dialog (Admin Override) — Phase A3 */}
      <AlertDialog
        open={!!endSessionConfirmId}
        onOpenChange={(open) => !open && setEndSessionConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Running Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will force clock-out the user now and mark the entry as completed with
              method <span className="font-medium">ADMIN_OVERRIDE</span>. The user&rsquo;s
              session will be terminated. This action is audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!endingEntryId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => endSessionConfirmId && handleAdminEndSession(endSessionConfirmId)}
              disabled={!!endingEntryId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {endingEntryId ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ending...</>
              ) : (
                <><StopCircle className="h-4 w-4 mr-2" />End Session</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Description Dialog */}
      <Dialog open={!!viewDescriptionEntry} onOpenChange={(open) => !open && setViewDescriptionEntry(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Entry Details
            </DialogTitle>
          </DialogHeader>
          {viewDescriptionEntry && (
            <div className="space-y-4">
              {viewDescriptionEntry.user && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={viewDescriptionEntry.user.avatar || ""} alt={viewDescriptionEntry.user.name || ""} />
                    <AvatarFallback className="text-xs">
                      {viewDescriptionEntry.user.name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{viewDescriptionEntry.user.name}</p>
                    {viewDescriptionEntry.project && (
                      <p className="text-xs text-muted-foreground">{viewDescriptionEntry.project.name}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clock In</p>
                  <p className="font-medium tabular-nums">{formatTime(viewDescriptionEntry.clockIn)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Clock Out</p>
                  <p className="font-medium tabular-nums">{viewDescriptionEntry.clockOut ? formatTime(viewDescriptionEntry.clockOut) : "Active"}</p>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Duration</p>
                <p className="font-medium">{formatHours(viewDescriptionEntry.totalHours)}</p>
              </div>
              {viewDescriptionEntry.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Description</p>
                  <div className="bg-muted/30 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {viewDescriptionEntry.description}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDescriptionEntry(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog (Admin) */}
      <Dialog open={!!editEntry} onOpenChange={(open) => { if (!open) setEditEntry(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Time Entry
            </DialogTitle>
            <DialogDescription>Modify this time entry. Changes will recalculate duration automatically.</DialogDescription>
          </DialogHeader>
          {editEntry && (
            <div className="space-y-4">
              {/* User info (read-only) */}
              <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={editEntry.user?.avatar || ""} alt={editEntry.user?.name || ""} />
                  <AvatarFallback className="text-xs">
                    {editEntry.user?.name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{editEntry.user?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(editEntry.date)}</p>
                </div>
              </div>

              {/* Project */}
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={editProjectId} onValueChange={setEditProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, 1000))}
                  placeholder="What was worked on..."
                  rows={3}
                  maxLength={1000}
                  className="resize-none"
                />
              </div>

              {/* Clock In / Clock Out */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clock In</Label>
                  <Input
                    type="datetime-local"
                    value={editClockIn}
                    onChange={(e) => setEditClockIn(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Clock Out <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    type="datetime-local"
                    value={editClockOut}
                    onChange={(e) => setEditClockOut(e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              {/* Preview calculated duration */}
              {editClockIn && editClockOut && (
                <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                  Calculated duration:{" "}
                  <span className="font-medium text-foreground">
                    {(() => {
                      const diff = new Date(editClockOut).getTime() - new Date(editClockIn).getTime();
                      return diff > 0 ? formatHours(diff / (1000 * 60 * 60)) : "Invalid (clock-out before clock-in)";
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={handleAdminEditEntry} disabled={editSaving || !editClockIn}>
              {editSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog (Admin) */}
      <Dialog open={addEntryOpen} onOpenChange={(open) => { if (!open) setAddEntryOpen(false); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Time Entry
            </DialogTitle>
            <DialogDescription>Manually create a time entry for any team member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee */}
            <div className="space-y-2">
              <Label>Employee <span className="text-destructive">*</span></Label>
              <Select value={addEntryUserId} onValueChange={setAddEntryUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={addEntryProjectId} onValueChange={setAddEntryProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={addEntryDescription}
                onChange={(e) => setAddEntryDescription(e.target.value.slice(0, 1000))}
                placeholder="What was worked on..."
                rows={3}
                maxLength={1000}
                className="resize-none"
              />
            </div>

            {/* Clock In / Clock Out */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Clock In <span className="text-destructive">*</span></Label>
                <Input
                  type="datetime-local"
                  value={addEntryClockIn}
                  onChange={(e) => setAddEntryClockIn(e.target.value)}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label>Clock Out <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="datetime-local"
                  value={addEntryClockOut}
                  onChange={(e) => setAddEntryClockOut(e.target.value)}
                  className="tabular-nums"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {addEntryClockOut
                ? "Entry will be created as completed with calculated duration."
                : "Entry will be created as active (running timer) if no clock-out is set."}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddEntryOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAdminAddEntry}
              disabled={addEntrySaving || !addEntryUserId || !addEntryClockIn}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {addEntrySaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create Entry</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redirect to Workspace Popup — shown after clock-in from workspace deep-link */}
      <Dialog open={showRedirectPopup} onOpenChange={setShowRedirectPopup}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ArrowLeft className="h-5 w-5 text-primary" />
              Ready to Work!
            </DialogTitle>
            <DialogDescription>
              You&apos;re now clocked in. Would you like to go back to the workspace to start your AI session?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Timer Running</p>
              <p className="text-xs text-green-600 dark:text-green-400">
                {activeEntry?.project?.name || "No project"} &bull; {formatDuration(elapsed)}
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowRedirectPopup(false)}>
              Stay Here
            </Button>
            <Button
              onClick={() => {
                setShowRedirectPopup(false);
                // Navigate to workspace — the page will refresh and detect the user is now clocked in
                window.location.href = "/dashboard/workspace";
              }}
              className="bg-primary hover:bg-primary/90"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go to Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
