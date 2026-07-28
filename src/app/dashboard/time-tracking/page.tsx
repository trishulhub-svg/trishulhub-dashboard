"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { safeArray, safeNumber, safeText } from "@/lib/utils";
import { useUrlState } from "@/hooks/use-url-state";

import type {
  AnalyticsData,
  AttendanceRecord,
  Project,
  TeamUser,
  TimeEntry,
  TimeTrackingTab,
  TrainingAssignment,
} from "./_components/types";
import { canEditWorkNotes } from "./_components/types";
import {
  dayBounds,
  escapeCSV,
  formatDate,
  formatTime,
  formatTimeHHMM,
  fromDatetimeLocal,
  getDateStr,
  getWeekDays,
  rangeLast7Days,
  rangeThisWeek,
  shiftWeek,
  toDatetimeLocal,
  toLocalDateStr,
  type DateRangeBounds,
} from "./_components/utils";
import { TodayView } from "./_components/today-view";
import { TimesheetView } from "./_components/timesheet-view";
import { InsightsView } from "./_components/insights-view";
import { AttendanceView } from "./_components/attendance-view";
import {
  AddAttendanceDialog,
  AddEntryDialog,
  ClockOutDialog,
  DeleteAttendanceDialog,
  DeleteEntryDialog,
  EditAttendanceDialog,
  EditEntryDialog,
  EndSessionDialog,
  MilestoneBriefingDialog,
  RedirectWorkspaceDialog,
  SwitchSessionDialog,
  ViewDescriptionDialog,
  type SessionMilestone,
} from "./_components/dialogs";

export default function TimeTrackingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading time tracking…</div>}>
      <TimeTrackingPageInner />
    </Suspense>
  );
}

function TimeTrackingPageInner() {
  const { data: session, status: sessionStatus } = useSession();
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // ── Core data ──
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTabRaw] = useUrlState("tab", "today");
  const setActiveTab = useCallback(
    (tab: TimeTrackingTab | string) => setActiveTabRaw(String(tab)),
    [setActiveTabRaw]
  );

  // Timer
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerCardRef = useRef<HTMLDivElement>(null);

  const [selectedProject, setSelectedProject] = useState("");
  const [timerDescription, setTimerDescription] = useState("");
  const [selectedTrainingAssignmentId, setSelectedTrainingAssignmentId] = useState("");
  const [trainingAssignments, setTrainingAssignments] = useState<TrainingAssignment[]>([]);
  const [trainingAssignmentsLoading, setTrainingAssignmentsLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchProject, setSwitchProject] = useState("");
  const [switchDescription, setSwitchDescription] = useState("");
  const [switchTrainingAssignmentId, setSwitchTrainingAssignmentId] = useState("");
  const [switchStartingMode, setSwitchStartingMode] = useState<"end" | "delete" | null>(null);

  // Admin running sessions
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [activeElapsedMap, setActiveElapsedMap] = useState<Record<string, number>>({});
  const [endingEntryId, setEndingEntryId] = useState<string | null>(null);
  const [endSessionConfirmId, setEndSessionConfirmId] = useState<string | null>(null);

  // Team / timesheet
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [timesheetEntries, setTimesheetEntries] = useState<TimeEntry[]>([]);
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekDays()[0]);
  const [filterUser, setFilterUser] = useState("all");
  const [filterProject, setFilterProject] = useState("all");

  // Insights
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState("employee");
  const [insightsRangeInit] = useState(() => rangeThisWeek());
  const [insightsDateFrom, setInsightsDateFrom] = useState(insightsRangeInit.from);
  const [insightsDateTo, setInsightsDateTo] = useState(insightsRangeInit.to);

  // Dialogs
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState("");
  const clockOutNotesRef = useRef("");

  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [addEntryUserId, setAddEntryUserId] = useState("");
  const [addEntryProjectId, setAddEntryProjectId] = useState("");
  const [addEntryDescription, setAddEntryDescription] = useState("");
  const [addEntryClockIn, setAddEntryClockIn] = useState("");
  const [addEntryClockOut, setAddEntryClockOut] = useState("");
  const [addEntrySaving, setAddEntrySaving] = useState(false);

  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [viewDescriptionEntry, setViewDescriptionEntry] = useState<TimeEntry | null>(null);
  const [savingWorkNotes, setSavingWorkNotes] = useState(false);

  // Attendance
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attRangeInit] = useState(() => rangeLast7Days());
  const [attDateFrom, setAttDateFrom] = useState(attRangeInit.from);
  const [attDateTo, setAttDateTo] = useState(attRangeInit.to);
  const [attUserFilter, setAttUserFilter] = useState("all");
  const [attDialogOpen, setAttDialogOpen] = useState(false);
  const [attForm, setAttForm] = useState({
    userId: "",
    date: "",
    status: "PRESENT",
    checkIn: "",
    checkOut: "",
    notes: "",
  });
  const [attLoading, setAttLoading] = useState(false);
  const [editAttDialogOpen, setEditAttDialogOpen] = useState(false);
  const [editAttForm, setEditAttForm] = useState({
    id: "",
    status: "PRESENT",
    checkIn: "",
    checkOut: "",
    notes: "",
  });
  const [attEditLoading, setAttEditLoading] = useState(false);
  const [deleteAttId, setDeleteAttId] = useState<string | null>(null);

  // Deep-link
  const [showRedirectPopup, setShowRedirectPopup] = useState(false);
  const [fromWorkspace, setFromWorkspace] = useState(false);
  const [pendingWorkspaceRedirect, setPendingWorkspaceRedirect] = useState(false);

  // Milestone briefing (clock-in) + due checklist (clock-out)
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingMilestones, setBriefingMilestones] = useState<SessionMilestone[]>([]);
  const [briefingProjectName, setBriefingProjectName] = useState("");
  const [dueMilestones, setDueMilestones] = useState<SessionMilestone[]>([]);
  const [dueMilestonesLoading, setDueMilestonesLoading] = useState(false);
  const [checkedMilestoneIds, setCheckedMilestoneIds] = useState<Set<string>>(new Set());
  const [carryForwardMilestoneIds, setCarryForwardMilestoneIds] = useState<Set<string>>(new Set());

  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const thisWeekStart = useMemo(() => getWeekDays()[0], []);
  const canGoNextWeek = weekDays[0].getTime() < thisWeekStart.getTime();

  // ── Deep-link: ?action=start | ?action=clockout ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (action === "start") {
      setFromWorkspace(true);
      setActiveTab("today");
      setTimeout(() => {
        timerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        timerCardRef.current?.classList.add("ring-2", "ring-emerald-400", "ring-offset-2");
        setTimeout(() => {
          timerCardRef.current?.classList.remove("ring-2", "ring-emerald-400", "ring-offset-2");
        }, 3000);
      }, 500);
    }
  }, [loading, setActiveTab]);

  // ── Fetch entries (default week + active) ──
  const fetchEntries = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/time-tracking", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        let arr: TimeEntry[];
        if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
          arr = safeArray<TimeEntry>(data.entries);
          setActiveEntries(safeArray<TimeEntry>(data.activeEntries));
        } else {
          arr = safeArray<TimeEntry>(data);
        }
        setEntries(arr);
        // Only the current user's ACTIVE timer drives the hero (admins see others in Running sessions)
        const myId = session?.user?.id;
        const active = arr.find(
          (e) => e.status === "ACTIVE" && (!myId || e.userId === myId)
        );
        setActiveEntry(active || null);
      } else {
        const errData = await res.json().catch(() => null);
        const msg = safeText(errData?.error, "Failed to load time entries");
        toast.error(msg);
        if (res.status !== 429) setError(msg);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load time entries. Please try again.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [session?.user?.id]);

  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/projects?fields=minimal", { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        const arr = safeArray<Project>(Array.isArray(data) ? data : data?.data || data);
        setProjects(arr.filter((p) => p.status !== "COMPLETED"));
      } else {
        const res2 = await fetch("/api/projects", { credentials: "include", signal });
        if (res2.ok) {
          const data2 = await res2.json();
          const arr2 = safeArray<Project>(Array.isArray(data2) ? data2 : data2?.data || data2);
          setProjects(arr2.filter((p) => p.status !== "COMPLETED"));
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }, []);

  const fetchTeamUsers = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdminUser) return;
      try {
        // Active staff only — deactivated users must not appear in assign/create pickers
        const res = await fetch("/api/team?type=users", { credentials: "include", signal });
        if (res.ok) {
          const data = await res.json();
          const arr = safeArray<unknown>(data);
          setTeamUsers(
            arr
              .filter(
                (u): u is { id: string; name: string; isActive?: boolean } =>
                  typeof u === "object" &&
                  u !== null &&
                  "id" in u &&
                  "name" in u &&
                  (u as { isActive?: boolean }).isActive !== false
              )
              .map((u) => ({ id: u.id, name: u.name }))
          );
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(safeText(errData?.error, "Failed to load team users"));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    },
    [isAdminUser]
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const loadBootstrap = async () => {
      try {
        const res = await fetch("/api/bootstrap/time-tracking", {
          credentials: "include",
          signal,
        });
        if (!res.ok) {
          // Fallback to parallel legacy fetches if bootstrap unavailable
          await Promise.all([
            fetchEntries(signal),
            fetchProjects(signal),
            fetchTeamUsers(signal),
          ]);
          return;
        }
        const data = await res.json();
        if (signal.aborted) return;

        let arr: TimeEntry[];
        if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
          arr = safeArray<TimeEntry>(data.entries);
          setActiveEntries(safeArray<TimeEntry>(data.activeEntries));
        } else {
          arr = safeArray<TimeEntry>(data);
        }
        setEntries(arr);
        const myId = session?.user?.id;
        const active = arr.find(
          (e) => e.status === "ACTIVE" && (!myId || e.userId === myId)
        );
        setActiveEntry(active || null);

        const projectsArr = safeArray<Project>(
          Array.isArray(data.projects) ? data.projects : []
        );
        setProjects(projectsArr.filter((p) => p.status !== "COMPLETED"));

        if (isAdminUser && Array.isArray(data.teamUsers)) {
          setTeamUsers(
            safeArray<{ id: string; name: string }>(data.teamUsers).map((u) => ({
              id: u.id,
              name: u.name,
            }))
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Failed to load time entries. Please try again.");
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    };

    void loadBootstrap();
    return () => controller.abort();
  }, [fetchEntries, fetchProjects, fetchTeamUsers, isAdminUser, session?.user?.id]);

  // Live timer
  useEffect(() => {
    if (activeEntry) {
      const update = () => setElapsed(Date.now() - new Date(activeEntry.clockIn).getTime());
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

  // Admin running-session elapsed (ms)
  const updateActiveElapsedMap = useCallback(() => {
    const map: Record<string, number> = {};
    for (const entry of activeEntries) {
      if (entry.status === "ACTIVE" && entry.clockIn) {
        map[entry.id] = Date.now() - new Date(entry.clockIn).getTime();
      }
    }
    setActiveElapsedMap((prev) => {
      const keys = Object.keys(map);
      if (keys.length !== Object.keys(prev).length) return map;
      for (const k of keys) {
        if (Math.abs((prev[k] || 0) - map[k]) > 500) return map;
      }
      return prev;
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

  // ── Start / stop ──
  const loadBriefing = useCallback(async (projectId: string, projectName?: string) => {
    setBriefingLoading(true);
    setBriefingProjectName(projectName || "");
    setBriefingOpen(true);
    try {
      const res = await fetch(
        `/api/milestones/session?projectId=${encodeURIComponent(projectId)}&mode=briefing`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setBriefingMilestones(safeArray<SessionMilestone>(data.milestones));
        if (data.projectName) setBriefingProjectName(safeText(data.projectName));
      } else {
        setBriefingMilestones([]);
      }
    } catch {
      setBriefingMilestones([]);
    } finally {
      setBriefingLoading(false);
    }
  }, []);

  const loadTrainingAssignments = useCallback(async () => {
    setTrainingAssignmentsLoading(true);
    try {
      const res = await fetch("/api/training/assignments?mine=1", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const assignments = safeArray<TrainingAssignment>(data?.assignments).filter(
          (assignment) => assignment.status !== "DONE"
        );
        setTrainingAssignments(assignments);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(safeText(err?.error, "Failed to load assigned trainings"));
        setTrainingAssignments([]);
      }
    } catch {
      toast.error("Failed to load assigned trainings");
      setTrainingAssignments([]);
    } finally {
      setTrainingAssignmentsLoading(false);
    }
  }, []);

  const handleTimerProjectChange = useCallback(
    (value: string) => {
      setSelectedProject(value);
      if (value === "__training__") {
        void loadTrainingAssignments();
      } else {
        setSelectedTrainingAssignmentId("");
      }
    },
    [loadTrainingAssignments]
  );

  const handleSwitchProjectChange = useCallback(
    (value: string) => {
      setSwitchProject(value);
      if (value === "__training__") {
        void loadTrainingAssignments();
      } else {
        setSwitchTrainingAssignmentId("");
      }
    },
    [loadTrainingAssignments]
  );

  const buildStartPayload = useCallback(
    (
      projectValue: string,
      descriptionValue: string,
      trainingAssignmentId: string
    ): {
      payload: Record<string, unknown>;
      projectId?: string;
      isTraining: boolean;
      label: string;
    } | null => {
      const value = projectValue || "none";
      const description = descriptionValue.trim();

      if (value === "__training__") {
        const assignment = trainingAssignments.find((a) => a.id === trainingAssignmentId);
        if (!assignment) {
          toast.error("Select an assigned training before starting");
          return null;
        }
        return {
          isTraining: true,
          label: assignment.title,
          payload: {
            activityType: "TRAINING",
            trainingAssignmentId: assignment.id,
            description: description || `Training: ${assignment.title}`,
          },
        };
      }

      if (value === "__supervision__") {
        return {
          isTraining: false,
          label: "Supervision",
          payload: {
            activityType: "SUPERVISION",
            description: description || "Supervision",
          },
        };
      }

      if (value === "__hr_admin__") {
        return {
          isTraining: false,
          label: "HR & Administration",
          payload: {
            activityType: "HR_ADMIN",
            description: description || "HR & Administration",
          },
        };
      }

      if (value === "__rd_sa__") {
        return {
          isTraining: false,
          label: "R&D / SA",
          payload: {
            activityType: "RD_SA",
            description: description || "R&D / SA",
          },
        };
      }

      const projectId = value === "none" ? undefined : value;
      return {
        projectId,
        isTraining: false,
        label: projectId ? projects.find((p) => p.id === projectId)?.name || "project" : "No activity",
        payload: {
          projectId,
          activityType: projectId ? "PROJECT" : undefined,
          description: description || undefined,
        },
      };
    },
    [projects, trainingAssignments]
  );

  const handleStart = useCallback(async () => {
    const built = buildStartPayload(
      selectedProject,
      timerDescription,
      selectedTrainingAssignmentId
    );
    if (!built) return;

    setStarting(true);
    try {
      const { buildClientClockPayload } = await import("@/lib/clock-integrity");
      const clockPayload = buildClientClockPayload();
      const res = await fetch("/api/time-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...built.payload,
          ...clockPayload,
        }),
      });
      if (res.ok) {
        const entry = await res.json();
        setActiveEntry(entry);
        toast.success(built.isTraining ? "Training session started!" : "Timer started!");
        fetchEntries();
        // Briefing first (all project milestones). Defer workspace redirect until briefing closes.
        if (built.projectId) {
          const pname =
            entry?.project?.name ||
            projects.find((p) => p.id === built.projectId)?.name ||
            "";
          void loadBriefing(built.projectId, pname);
          if (fromWorkspace) {
            // Remember to offer redirect after briefing — handled via pendingRedirect
            setPendingWorkspaceRedirect(true);
          }
        } else {
          toast.message("Tip: select a project when clocking in to see milestones.");
          if (fromWorkspace) setShowRedirectPopup(true);
        }
      } else {
        const err = await res.json().catch(() => null);
        toast.error(safeText(err?.error, "Failed to start timer"));
      }
    } catch {
      toast.error("Failed to start timer");
    } finally {
      setStarting(false);
    }
  }, [
    buildStartPayload,
    selectedProject,
    timerDescription,
    selectedTrainingAssignmentId,
    fetchEntries,
    fromWorkspace,
    loadBriefing,
    projects,
  ]);

  const openSwitchDialog = useCallback(() => {
    setSwitchProject("");
    setSwitchDescription("");
    setSwitchTrainingAssignmentId("");
    setSwitchOpen(true);
  }, []);

  const handleSwitchSession = useCallback(
    async (mode: "end" | "delete") => {
      const built = buildStartPayload(
        switchProject,
        switchDescription,
        switchTrainingAssignmentId
      );
      if (!built) return;

      setSwitchStartingMode(mode);
      try {
        const { buildClientClockPayload } = await import("@/lib/clock-integrity");
        const clockPayload = buildClientClockPayload();
        const res = await fetch("/api/time-tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...built.payload,
            switchMode: mode,
            ...clockPayload,
          }),
        });
        if (res.ok) {
          const entry = await res.json();
          setActiveEntry(entry);
          setSwitchOpen(false);
          toast.success(
            mode === "end"
              ? "Previous session ended and new timer started"
              : "Previous session deleted and new timer started"
          );
          fetchEntries();
          if (built.projectId) {
            const pname =
              entry?.project?.name ||
              projects.find((p) => p.id === built.projectId)?.name ||
              "";
            void loadBriefing(built.projectId, pname);
          }
        } else {
          const err = await res.json().catch(() => null);
          toast.error(safeText(err?.error, "Failed to switch session"));
        }
      } catch {
        toast.error("Failed to switch session");
      } finally {
        setSwitchStartingMode(null);
      }
    },
    [
      buildStartPayload,
      switchProject,
      switchDescription,
      switchTrainingAssignmentId,
      fetchEntries,
      loadBriefing,
      projects,
    ]
  );

  const handleClockOutClick = useCallback(() => {
    if (!activeEntry) return;
    setClockOutNotes("");
    clockOutNotesRef.current = "";
    setCheckedMilestoneIds(new Set());
    setCarryForwardMilestoneIds(new Set());
    setDueMilestones([]);
    setClockOutOpen(true);

    const projectId = activeEntry.projectId || activeEntry.project?.id;
    if (!projectId) return;

    setDueMilestonesLoading(true);
    fetch(
      `/api/milestones/session?projectId=${encodeURIComponent(projectId)}&mode=due`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setDueMilestones(safeArray<SessionMilestone>(data.milestones));
      })
      .catch(() => setDueMilestones([]))
      .finally(() => setDueMilestonesLoading(false));
  }, [activeEntry]);

  // Open clock-out dialog when arriving from workspace Clock Out button
  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "clockout") return;
    setActiveTab("today");
    if (!activeEntry) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch {
      /* ignore */
    }
    handleClockOutClick();
  }, [loading, activeEntry, setActiveTab, handleClockOutClick]);

  const handleToggleDueMilestone = useCallback((milestoneId: string, checked: boolean) => {
    setCheckedMilestoneIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(milestoneId);
      else next.delete(milestoneId);
      return next;
    });
    if (checked) {
      setCarryForwardMilestoneIds((prev) => {
        const next = new Set(prev);
        next.delete(milestoneId);
        return next;
      });
    }
  }, []);

  const handleCarryForwardMilestone = useCallback((milestoneId: string, carry: boolean) => {
    setCarryForwardMilestoneIds((prev) => {
      const next = new Set(prev);
      if (carry) next.add(milestoneId);
      else next.delete(milestoneId);
      return next;
    });
    if (carry) {
      setCheckedMilestoneIds((prev) => {
        const next = new Set(prev);
        next.delete(milestoneId);
        return next;
      });
    }
  }, []);

  const executeClockOut = useCallback(async () => {
    if (!activeEntry) return;
    const notes = clockOutNotesRef.current.trim();
    setStopping(true);
    try {
      const { buildClientClockPayload } = await import("@/lib/clock-integrity");
      const clockPayload = buildClientClockPayload();
      const res = await fetch(`/api/time-tracking/${activeEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: activeEntry.id,
          status: "COMPLETED",
          workNotes: notes || null,
          acknowledgedMilestoneIds: Array.from(checkedMilestoneIds),
          carryForwardMilestoneIds: Array.from(carryForwardMilestoneIds),
          ...clockPayload,
        }),
      });
      if (res.ok) {
        setActiveEntry(null);
        toast.success(
          notes
            ? "Clocked out — milestones updated"
            : "Clocked out — add work notes within 24 hours"
        );
        setClockOutOpen(false);
        setClockOutNotes("");
        setDueMilestones([]);
        setCheckedMilestoneIds(new Set());
        setCarryForwardMilestoneIds(new Set());
        fetchEntries();
      } else {
        const err = await res.json().catch(() => null);
        if (err?.code === "MILESTONES_INCOMPLETE" && Array.isArray(err.milestones)) {
          setDueMilestones(err.milestones as SessionMilestone[]);
          toast.error(safeText(err.error, "Tick due milestones first"));
        } else {
          toast.error(safeText(err?.error, "Failed to clock out"));
        }
      }
    } catch {
      toast.error("Failed to clock out");
    } finally {
      setStopping(false);
    }
  }, [activeEntry, fetchEntries, checkedMilestoneIds, carryForwardMilestoneIds]);

  // ── Timesheet fetch ──
  const fetchTimesheet = useCallback(
    async (signal?: AbortSignal) => {
      setTimesheetLoading(true);
      try {
        const days = getWeekDays(weekAnchor);
        const params = new URLSearchParams();
        params.set("startDate", getDateStr(days[0]));
        params.set("endDate", getDateStr(days[6]));
        params.set("status", "COMPLETED");
        params.set("limit", "200");
        if (isAdminUser && filterUser && filterUser !== "all") params.set("userId", filterUser);
        if (isAdminUser && filterProject && filterProject !== "all") {
          params.set("projectId", filterProject);
        }

        const res = await fetch(`/api/time-tracking?${params}`, {
          credentials: "include",
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data && !Array.isArray(data) && Array.isArray(data.entries)) {
            setTimesheetEntries(safeArray<TimeEntry>(data.entries));
          } else {
            setTimesheetEntries(safeArray<TimeEntry>(data));
          }
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(safeText(errData?.error, "Failed to load timesheet"));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setTimesheetLoading(false);
      }
    },
    [weekAnchor, isAdminUser, filterUser, filterProject]
  );

  useEffect(() => {
    if (activeTab !== "timesheet") return;
    const controller = new AbortController();
    fetchTimesheet(controller.signal);
    return () => controller.abort();
  }, [activeTab, fetchTimesheet]);

  const applyInsightsRange = useCallback((range: DateRangeBounds) => {
    setInsightsDateFrom(range.from);
    setInsightsDateTo(range.to);
  }, []);

  const applyAttendanceRange = useCallback((range: DateRangeBounds) => {
    setAttDateFrom(range.from);
    setAttDateTo(range.to);
  }, []);

  // ── Insights ──
  const fetchAnalytics = useCallback(
    async (signal?: AbortSignal) => {
      setAnalyticsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("type", analyticsTab);
        params.set("startDate", insightsDateFrom);
        params.set("endDate", insightsDateTo);
        const res = await fetch(`/api/time-tracking/analytics?${params}`, {
          credentials: "include",
          signal,
        });
        if (res.ok) {
          setAnalyticsData(await res.json());
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(safeText(errData?.error, "Failed to load insights"));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [analyticsTab, insightsDateFrom, insightsDateTo]
  );

  useEffect(() => {
    if (activeTab !== "insights") return;
    const controller = new AbortController();
    fetchAnalytics(controller.signal);
    return () => controller.abort();
  }, [activeTab, fetchAnalytics]);

  // ── Attendance ──
  const fetchAttendance = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAdminUser) return;
      setAttendanceLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("type", "attendance");
        params.set("from", attDateFrom);
        params.set("to", attDateTo);
        const res = await fetch(`/api/team?${params.toString()}`, {
          credentials: "include",
          signal,
        });
        if (res.ok) {
          const data = await res.json();
          setAttendance(Array.isArray(data) ? data : []);
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(safeText(errData?.error, "Failed to load attendance data"));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setAttendanceLoading(false);
      }
    },
    [isAdminUser, attDateFrom, attDateTo]
  );

  useEffect(() => {
    if (activeTab !== "attendance" || !isAdminUser) return;
    const controller = new AbortController();
    fetchAttendance(controller.signal);
    return () => controller.abort();
  }, [activeTab, isAdminUser, fetchAttendance]);

  // ── Admin CRUD ──
  const refreshAfterMutation = useCallback(() => {
    fetchEntries();
    if (activeTab === "timesheet") fetchTimesheet();
  }, [fetchEntries, fetchTimesheet, activeTab]);

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
      if (addEntryProjectId && addEntryProjectId !== "none" && addEntryProjectId !== "__training__") {
        payload.projectId = addEntryProjectId;
      }
      if (addEntryProjectId === "__training__") {
        payload.description = addEntryDescription.trim() || "Training";
      } else if (addEntryDescription) {
        payload.description = addEntryDescription;
      }
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
        refreshAfterMutation();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(safeText(err?.error, "Failed to create entry"));
      }
    } catch {
      toast.error("Failed to create entry");
    } finally {
      setAddEntrySaving(false);
    }
  }, [
    addEntryUserId,
    addEntryClockIn,
    addEntryProjectId,
    addEntryDescription,
    addEntryClockOut,
    refreshAfterMutation,
  ]);

  const openEditDialog = useCallback((entry: TimeEntry) => {
    setEditEntry(entry);
    setEditDescription(entry.description || "");
    const pid = entry.projectId || entry.project?.id || "";
    if (pid) {
      setEditProjectId(pid);
    } else if (entry.activityType === "TRAINING") {
      setEditProjectId("__training__");
    } else if (entry.activityType === "SUPERVISION") {
      setEditProjectId("__supervision__");
    } else if (entry.activityType === "HR_ADMIN") {
      setEditProjectId("__hr_admin__");
    } else if (entry.activityType === "RD_SA") {
      setEditProjectId("__rd_sa__");
    } else {
      setEditProjectId("none");
    }
    setEditClockIn(toDatetimeLocal(entry.clockIn));
    setEditClockOut(entry.clockOut ? toDatetimeLocal(entry.clockOut) : "");
  }, []);

  const handleAdminEditEntry = useCallback(async () => {
    if (!editEntry) return;
    if (!editClockIn) {
      toast.error("Clock-in time is required");
      return;
    }
    setEditSaving(true);
    try {
      const isTraining = editProjectId === "__training__";
      const isSupervision = editProjectId === "__supervision__";
      const isHr = editProjectId === "__hr_admin__";
      const isRd = editProjectId === "__rd_sa__";
      const isNone = editProjectId === "none" || !editProjectId;
      const nextProjectId =
        isTraining || isSupervision || isHr || isRd || isNone ? null : editProjectId;

      const payload: Record<string, unknown> = {
        id: editEntry.id,
        description:
          isTraining && !editDescription.trim()
            ? "Training"
            : isSupervision && !editDescription.trim()
              ? "Supervision"
              : isHr && !editDescription.trim()
                ? "HR & Administration"
                : isRd && !editDescription.trim()
                  ? "R&D / SA"
                  : editDescription.trim() || null,
        projectId: nextProjectId,
        activityType: isTraining
          ? "TRAINING"
          : isSupervision
            ? "SUPERVISION"
            : isHr
              ? "HR_ADMIN"
              : isRd
                ? "RD_SA"
                : nextProjectId
                  ? "PROJECT"
                  : null,
        trainingAssignmentId: isTraining ? editEntry.trainingAssignmentId || null : null,
        clockIn: fromDatetimeLocal(editClockIn),
        clockOut: editClockOut ? fromDatetimeLocal(editClockOut) : null,
      };

      const res = await fetch(`/api/time-tracking/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = (await res.json().catch(() => null)) as TimeEntry | null;
        toast.success("Entry updated successfully");
        setEditEntry(null);
        if (updated?.id) {
          setEntries((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
          setActiveEntries((prev) =>
            prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
          );
          setActiveEntry((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
          setTimesheetEntries((prev) =>
            prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
          );
        }
        refreshAfterMutation();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(safeText(err?.error, "Failed to update entry"));
      }
    } catch {
      toast.error("Failed to update entry");
    } finally {
      setEditSaving(false);
    }
  }, [editEntry, editDescription, editProjectId, editClockIn, editClockOut, refreshAfterMutation]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/time-tracking/${deleteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Entry deleted");
        refreshAfterMutation();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(safeText(errData?.error, "Failed to delete entry"));
      }
    } catch {
      toast.error("Failed to delete entry");
    } finally {
      setDeleteId(null);
    }
  }, [deleteId, refreshAfterMutation]);

  const handleAdminEndSession = useCallback(
    async (entryId: string, milestoneAction: "complete" | "carry" | "leave") => {
      setEndingEntryId(entryId);
      try {
        const res = await fetch(`/api/time-tracking/${entryId}/admin-end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ milestoneAction }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          const hours =
            typeof data.totalHours === "number" ? data.totalHours.toFixed(2) : "?";
          toast.success(`Session ended. Total: ${hours}h`);
          refreshAfterMutation();
        } else {
          toast.error(safeText(data?.error, "Failed to end session"));
        }
      } catch {
        toast.error("Failed to end session");
      } finally {
        setEndingEntryId(null);
        setEndSessionConfirmId(null);
      }
    },
    [refreshAfterMutation]
  );

  // Attendance CRUD
  const handleAddAttendance = useCallback(async () => {
    if (!attForm.userId || !attForm.date) {
      toast.error("Employee and date are required");
      return;
    }
    setAttLoading(true);
    try {
      const payload: Record<string, unknown> = {
        type: "attendance",
        userId: attForm.userId,
        date: attForm.date,
        status: attForm.status,
      };
      if (attForm.checkIn) {
        payload.checkIn = new Date(`${attForm.date}T${attForm.checkIn}`).toISOString();
      }
      if (attForm.checkOut) {
        payload.checkOut = new Date(`${attForm.date}T${attForm.checkOut}`).toISOString();
      }
      if (attForm.notes.trim()) payload.notes = attForm.notes.trim();

      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Attendance record added");
        setAttDialogOpen(false);
        setAttForm({
          userId: "",
          date: "",
          status: "PRESENT",
          checkIn: "",
          checkOut: "",
          notes: "",
        });
        fetchAttendance();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(safeText(errData?.error, "Failed to add attendance record"));
      }
    } catch {
      toast.error("Failed to add attendance record");
    } finally {
      setAttLoading(false);
    }
  }, [attForm, fetchAttendance]);

  const openEditAttDialog = useCallback((record: AttendanceRecord) => {
    setEditAttForm({
      id: record.id,
      status: record.status,
      checkIn: formatTimeHHMM(record.checkIn),
      checkOut: formatTimeHHMM(record.checkOut),
      notes: record.notes || "",
    });
    setEditAttDialogOpen(true);
  }, []);

  const handleEditAttendance = useCallback(async () => {
    if (!editAttForm.id) return;
    setAttEditLoading(true);
    try {
      const originalRecord = attendance.find((a) => a.id === editAttForm.id);
      const recordDateStr = originalRecord?.date
        ? toLocalDateStr(new Date(originalRecord.date))
        : "";

      const payload: Record<string, unknown> = {
        type: "attendance",
        status: editAttForm.status,
      };
      if (editAttForm.checkIn && recordDateStr) {
        payload.checkIn = new Date(`${recordDateStr}T${editAttForm.checkIn}:00`).toISOString();
      } else {
        payload.checkIn = null;
      }
      if (editAttForm.checkOut && recordDateStr) {
        payload.checkOut = new Date(`${recordDateStr}T${editAttForm.checkOut}:00`).toISOString();
      } else {
        payload.checkOut = null;
      }
      payload.notes = editAttForm.notes.trim() || null;

      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: editAttForm.id, ...payload }),
      });
      if (res.ok) {
        toast.success("Attendance record updated");
        setEditAttDialogOpen(false);
        setEditAttForm({ id: "", status: "PRESENT", checkIn: "", checkOut: "", notes: "" });
        fetchAttendance();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(safeText(errData?.error, "Failed to update attendance record"));
      }
    } catch {
      toast.error("Failed to update attendance record");
    } finally {
      setAttEditLoading(false);
    }
  }, [editAttForm, fetchAttendance, attendance]);

  const handleDeleteAttendance = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const res = await fetch(`/api/team?type=attendance&id=${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (res.ok) {
          toast.success("Attendance record deleted");
          setDeleteAttId(null);
          fetchAttendance();
        } else {
          const errData = await res.json().catch(() => null);
          toast.error(safeText(errData?.error, "Failed to delete attendance record"));
        }
      } catch {
        toast.error("Failed to delete attendance record");
      }
    },
    [fetchAttendance]
  );

  const filteredAttendance = useMemo(
    () =>
      attUserFilter === "all"
        ? attendance
        : attendance.filter((a) => a.userId === attUserFilter),
    [attUserFilter, attendance]
  );

  const attStats = useMemo(
    () => ({
      total: filteredAttendance.length,
      present: filteredAttendance.filter((a) => a.status === "PRESENT").length,
      absent: filteredAttendance.filter((a) => a.status === "ABSENT").length,
      halfDay: filteredAttendance.filter((a) => a.status === "HALF_DAY").length,
      leave: filteredAttendance.filter((a) => a.status === "LEAVE").length,
    }),
    [filteredAttendance]
  );

  const exportCSV = useCallback(() => {
    const headers = [
      "Employee",
      "Project",
      "Description",
      "Date",
      "Clock In",
      "Clock Out",
      "Duration (hours)",
    ];
    const rows = timesheetEntries.map((e) => [
      safeText(e.user?.name, "Unknown"),
      safeText(e.project?.name, "No Project"),
      safeText(e.description),
      formatDate(e.date),
      formatTime(e.clockIn),
      e.clockOut ? formatTime(e.clockOut) : "Active",
      e.totalHours ? safeNumber(e.totalHours).toFixed(2) : "0",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-entries-${getDateStr(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [timesheetEntries]);

  // Today stats from default week fetch
  const { todayHours, weekHours, weeklyGrid, myTodayEntries } = useMemo(() => {
    const today = new Date();
    const { start: startOfToday, end: endOfToday } = dayBounds(today);
    const currentWeek = getWeekDays();
    const endOfWeek = new Date(currentWeek[6].getTime() + 86400000);

    const completed = entries.filter((e) => e.status === "COMPLETED");

    const todayHours = completed
      .filter((e) => {
        const d = new Date(e.date);
        return d >= startOfToday && d < endOfToday;
      })
      .reduce((sum, e) => sum + safeNumber(e.totalHours), 0);

    const weekHours = completed
      .filter((e) => {
        const d = new Date(e.date);
        return d >= currentWeek[0] && d < endOfWeek;
      })
      .reduce((sum, e) => sum + safeNumber(e.totalHours), 0);

    const weeklyGrid = currentWeek.map((day) => {
      const { start, end } = dayBounds(day);
      const dayEntries = completed.filter((e) => {
        const d = new Date(e.date).getTime();
        return d >= start.getTime() && d < end.getTime();
      });
      const total = dayEntries.reduce((sum, e) => sum + safeNumber(e.totalHours), 0);
      return {
        day,
        total,
        isToday: day.toDateString() === today.toDateString(),
      };
    });

    const myTodayEntries = completed.filter((e) => {
      const d = new Date(e.date);
      return d >= startOfToday && d < endOfToday;
    });

    return { todayHours, weekHours, weeklyGrid, myTodayEntries };
  }, [entries]);

  const activeTimerHours = activeEntry ? elapsed / (1000 * 60 * 60) : 0;
  const todayTotal = todayHours + activeTimerHours;
  const weekTotal = weekHours + activeTimerHours;

  const handleTabChange = (v: string) => {
    if (v === "attendance" && !isAdminUser) return;
    setActiveTab(v as TimeTrackingTab);
  };

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="space-y-4 sm:space-y-6 th-page-enter">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted/40 animate-pulse rounded" />
        </div>
        <div className="h-12 bg-muted/40 animate-pulse rounded-xl" />
        <div className="h-48 sm:h-56 bg-muted/50 animate-pulse rounded-2xl" />
        <div className="h-32 bg-muted/40 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] gap-3 sm:gap-4 px-4">
        <AlertCircle className="h-10 w-10 sm:h-12 sm:w-12 text-destructive" />
        <p className="text-sm sm:text-base text-muted-foreground text-center">{safeText(error)}</p>
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchEntries();
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 th-page-enter">
      <PageHeader title="Time Tracking" description="Clock in, review your week, and see where time goes">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchEntries();
            if (activeTab === "timesheet") fetchTimesheet();
            if (activeTab === "insights") fetchAnalytics();
            if (activeTab === "attendance") fetchAttendance();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 [contain:layout]">
        <TabsList className="w-full sm:w-auto h-auto flex-wrap justify-start">
          <TabsTrigger value="today" className="text-xs sm:text-sm">
            Today
          </TabsTrigger>
          <TabsTrigger value="timesheet" className="text-xs sm:text-sm">
            Timesheet
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs sm:text-sm">
            Insights
          </TabsTrigger>
          {isAdminUser && (
            <TabsTrigger value="attendance" className="text-xs sm:text-sm">
              Roster
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <TodayView
            timerRef={timerCardRef}
            activeEntry={activeEntry}
            elapsed={elapsed}
            projects={projects}
            userRole={userRole}
            selectedProject={selectedProject}
            timerDescription={timerDescription}
            trainingAssignments={trainingAssignments}
            selectedTrainingAssignmentId={selectedTrainingAssignmentId}
            trainingAssignmentsLoading={trainingAssignmentsLoading}
            starting={starting}
            stopping={stopping}
            fromWorkspace={fromWorkspace}
            todayTotal={todayTotal}
            weekTotal={weekTotal}
            weeklyGrid={weeklyGrid}
            todayEntries={myTodayEntries}
            isAdmin={isAdminUser}
            activeEntries={activeEntries}
            activeElapsedMap={activeElapsedMap}
            endingEntryId={endingEntryId}
            onProjectChange={handleTimerProjectChange}
            onDescriptionChange={setTimerDescription}
            onTrainingAssignmentChange={setSelectedTrainingAssignmentId}
            onStart={handleStart}
            onSwitchClick={openSwitchDialog}
            onClockOutClick={handleClockOutClick}
            onViewDescription={setViewDescriptionEntry}
            onEditEntry={openEditDialog}
            onDeleteEntry={setDeleteId}
            onEndSessionConfirm={setEndSessionConfirmId}
          />
        </TabsContent>

        <TabsContent value="timesheet" className="mt-4">
          <TimesheetView
            weekDays={weekDays}
            entries={timesheetEntries}
            loading={timesheetLoading}
            isAdmin={isAdminUser}
            teamUsers={teamUsers}
            projects={projects}
            filterUser={filterUser}
            filterProject={filterProject}
            onFilterUser={setFilterUser}
            onFilterProject={setFilterProject}
            onPrevWeek={() => setWeekAnchor((w) => shiftWeek(w, -1))}
            onNextWeek={() => setWeekAnchor((w) => shiftWeek(w, 1))}
            onThisWeek={() => setWeekAnchor(getWeekDays()[0])}
            onExportCSV={exportCSV}
            onAddEntry={() => setAddEntryOpen(true)}
            onViewDescription={setViewDescriptionEntry}
            onEditEntry={openEditDialog}
            onDeleteEntry={setDeleteId}
            canGoNext={canGoNextWeek}
          />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <InsightsView
            analyticsTab={analyticsTab}
            dateFrom={insightsDateFrom}
            dateTo={insightsDateTo}
            data={analyticsData}
            loading={analyticsLoading}
            isAdmin={isAdminUser}
            onAnalyticsTab={setAnalyticsTab}
            onDateFrom={setInsightsDateFrom}
            onDateTo={setInsightsDateTo}
            onApplyRange={applyInsightsRange}
          />
        </TabsContent>

        {isAdminUser && (
          <TabsContent value="attendance" className="mt-4">
            <AttendanceView
              records={filteredAttendance}
              loading={attendanceLoading}
              teamUsers={teamUsers}
              dateFrom={attDateFrom}
              dateTo={attDateTo}
              userFilter={attUserFilter}
              stats={attStats}
              onDateFrom={setAttDateFrom}
              onDateTo={setAttDateTo}
              onApplyRange={applyAttendanceRange}
              onUserFilter={setAttUserFilter}
              onClearFilters={() => {
                const range = rangeLast7Days();
                setAttDateFrom(range.from);
                setAttDateTo(range.to);
                setAttUserFilter("all");
              }}
              onRefresh={() => fetchAttendance()}
              onAdd={() => {
                setAttForm({
                  userId: "",
                  date: toLocalDateStr(new Date()),
                  status: "PRESENT",
                  checkIn: "",
                  checkOut: "",
                  notes: "",
                });
                setAttDialogOpen(true);
              }}
              onEdit={openEditAttDialog}
              onDelete={setDeleteAttId}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      <ClockOutDialog
        open={clockOutOpen}
        onOpenChange={setClockOutOpen}
        activeEntry={activeEntry}
        elapsed={elapsed}
        notes={clockOutNotes}
        onNotesChange={(v) => {
          setClockOutNotes(v);
          clockOutNotesRef.current = v;
        }}
        stopping={stopping}
        onConfirm={executeClockOut}
        dueMilestones={dueMilestones}
        milestonesLoading={dueMilestonesLoading}
        checkedMilestoneIds={checkedMilestoneIds}
        carryForwardMilestoneIds={carryForwardMilestoneIds}
        onToggleMilestone={(id, checked) => handleToggleDueMilestone(id, checked)}
        onCarryForwardMilestone={(id, carry) => handleCarryForwardMilestone(id, carry)}
      />

      <SwitchSessionDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        projects={projects}
        userRole={userRole}
        selectedProject={switchProject}
        description={switchDescription}
        trainingAssignments={trainingAssignments}
        selectedTrainingAssignmentId={switchTrainingAssignmentId}
        trainingAssignmentsLoading={trainingAssignmentsLoading}
        switchingMode={switchStartingMode}
        onProjectChange={handleSwitchProjectChange}
        onDescriptionChange={setSwitchDescription}
        onTrainingAssignmentChange={setSwitchTrainingAssignmentId}
        onConfirm={handleSwitchSession}
      />

      <MilestoneBriefingDialog
        open={briefingOpen}
        onOpenChange={(open) => {
          setBriefingOpen(open);
          if (!open && pendingWorkspaceRedirect) {
            setPendingWorkspaceRedirect(false);
            setShowRedirectPopup(true);
          }
        }}
        projectName={briefingProjectName}
        milestones={briefingMilestones}
        loading={briefingLoading}
      />

      <DeleteEntryDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        onConfirm={handleDelete}
      />

      <EndSessionDialog
        open={!!endSessionConfirmId}
        onOpenChange={(open) => !open && setEndSessionConfirmId(null)}
        ending={!!endingEntryId}
        onConfirm={(milestoneAction) =>
          endSessionConfirmId && handleAdminEndSession(endSessionConfirmId, milestoneAction)
        }
      />

      <ViewDescriptionDialog
        entry={viewDescriptionEntry}
        onClose={() => setViewDescriptionEntry(null)}
        canEditNotes={
          !!viewDescriptionEntry &&
          viewDescriptionEntry.userId === session?.user?.id &&
          canEditWorkNotes(viewDescriptionEntry)
        }
        savingNotes={savingWorkNotes}
        onSaveNotes={async (notes) => {
          if (!viewDescriptionEntry) return;
          setSavingWorkNotes(true);
          try {
            const res = await fetch(`/api/time-tracking/${viewDescriptionEntry.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ id: viewDescriptionEntry.id, workNotes: notes || null }),
            });
            if (res.ok) {
              const updated = await res.json().catch(() => null);
              toast.success("Work notes saved");
              setViewDescriptionEntry((prev) =>
                prev
                  ? {
                      ...prev,
                      workNotes: (updated?.workNotes as string | null | undefined) ?? (notes || null),
                    }
                  : prev
              );
              fetchEntries();
            } else {
              const err = await res.json().catch(() => null);
              toast.error(safeText(err?.error, "Failed to save notes"));
            }
          } catch {
            toast.error("Failed to save notes");
          } finally {
            setSavingWorkNotes(false);
          }
        }}
      />

      <EditEntryDialog
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        projects={(() => {
          if (!editEntry?.project?.id) return projects;
          if (projects.some((p) => p.id === editEntry.project!.id)) return projects;
          return [
            {
              id: editEntry.project.id,
              name: editEntry.project.name,
              status: "IN_PROGRESS",
            },
            ...projects,
          ];
        })()}
        description={editDescription}
        projectId={editProjectId}
        clockIn={editClockIn}
        clockOut={editClockOut}
        saving={editSaving}
        onDescription={setEditDescription}
        onProjectId={setEditProjectId}
        onClockIn={setEditClockIn}
        onClockOut={setEditClockOut}
        onSave={handleAdminEditEntry}
      />

      <AddEntryDialog
        open={addEntryOpen}
        onOpenChange={setAddEntryOpen}
        teamUsers={teamUsers}
        projects={projects}
        userId={addEntryUserId}
        projectId={addEntryProjectId}
        description={addEntryDescription}
        clockIn={addEntryClockIn}
        clockOut={addEntryClockOut}
        saving={addEntrySaving}
        onUserId={setAddEntryUserId}
        onProjectId={setAddEntryProjectId}
        onDescription={setAddEntryDescription}
        onClockIn={setAddEntryClockIn}
        onClockOut={setAddEntryClockOut}
        onSave={handleAdminAddEntry}
      />

      <AddAttendanceDialog
        open={attDialogOpen}
        onOpenChange={setAttDialogOpen}
        teamUsers={teamUsers}
        form={attForm}
        setForm={setAttForm}
        loading={attLoading}
        onSave={handleAddAttendance}
      />

      <EditAttendanceDialog
        open={editAttDialogOpen}
        onOpenChange={setEditAttDialogOpen}
        form={editAttForm}
        setForm={setEditAttForm}
        loading={attEditLoading}
        onSave={handleEditAttendance}
      />

      <DeleteAttendanceDialog
        open={!!deleteAttId}
        onOpenChange={(open) => !open && setDeleteAttId(null)}
        onConfirm={() => deleteAttId && handleDeleteAttendance(deleteAttId)}
      />

      <RedirectWorkspaceDialog
        open={showRedirectPopup}
        onOpenChange={setShowRedirectPopup}
        activeEntry={activeEntry}
        elapsed={elapsed}
      />
    </div>
  );
}
