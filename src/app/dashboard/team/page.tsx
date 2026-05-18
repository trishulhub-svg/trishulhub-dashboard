"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  User, Clock, Calendar, CheckCircle2, XCircle, Shield, Plus, Trash2, AlertCircle, RefreshCw, MessageSquare, Pencil, Search, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { safeArray, safeText } from "@/lib/utils";
import { DEPARTMENTS } from "@/lib/types";

// ── TypeScript Interfaces ──

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  isActive: boolean;
  avatar?: string | null;
}

interface LeaveRecord {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  feedback?: string | null;
  status: string;
  approvedBy?: string | null;
  user?: { id: string; name: string; email: string; role: string };
}

interface AttendanceRecord {
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

// Role colors for badge styling
const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEVELOPER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  VIEWER: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  CLIENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

// Attendance status colors
const attStatusColors: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ABSENT: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  HALF_DAY: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  LEAVE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

// Leave status colors
const leaveStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

// Helper to calculate leave days
function getLeaveDays(start: string, end: string): number {
  const diff = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 1;
}

// Helper to format time from ISO string
function formatTime(isoStr?: string | null): string {
  if (!isoStr) return "N/A";
  try {
    return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "N/A";
  }
}

// Helper to format date from ISO string
function formatDate(isoStr?: string | null): string {
  if (!isoStr) return "N/A";
  try {
    return new Date(isoStr).toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "N/A";
  }
}

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const userRole = session?.user?.role || "DEVELOPER";
  const currentUserId = session?.user?.id || "";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  // Default tab based on role — non-admins default to "leaves"
  const [tab, setTab] = useState<"team" | "leaves" | "attendance">(isAdminUser ? "team" : "leaves");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [mutating, setMutating] = useState(false);

  // Edit user dialog state
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<TeamUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", department: "", isActive: true });
  const [editLoading, setEditLoading] = useState(false);

  // Leave status filter
  const [leaveFilter, setLeaveFilter] = useState<"all" | "PENDING" | "APPROVED" | "REJECTED">("all");

  // Leave form
  const [leaveForm, setLeaveForm] = useState({ userId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });

  // Add member form
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "DEVELOPER", department: "Engineering", password: "" });

  // ── Attendance management state ──
  const [attDialogOpen, setAttDialogOpen] = useState(false);
  const [editAttDialogOpen, setEditAttDialogOpen] = useState(false);
  const [attForm, setAttForm] = useState({ userId: "", date: "", status: "PRESENT", checkIn: "", checkOut: "", notes: "" });
  const [editAttForm, setEditAttForm] = useState({ id: "", status: "PRESENT", checkIn: "", checkOut: "", notes: "" });
  const [attLoading, setAttLoading] = useState(false);
  const [attEditLoading, setAttEditLoading] = useState(false);
  const [attDateFrom, setAttDateFrom] = useState("");
  const [attDateTo, setAttDateTo] = useState("");
  const [attUserFilter, setAttUserFilter] = useState("all");

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [userRes, leaveRes, attendRes] = await Promise.all([
        isAdminUser
          ? fetch("/api/team", { credentials: "include", signal })
          : Promise.resolve({ ok: true, json: async () => [] }),
        fetch("/api/team?type=leaves", { credentials: "include", signal }),
        isAdminUser
          ? fetch("/api/team?type=attendance", { credentials: "include", signal })
          : Promise.resolve({ ok: true, json: async () => [] }),
      ]);

      if (userRes.ok) {
        const userData = await (userRes as Response).json();
        setUsers(safeArray<TeamUser>(userData));
      } else {
        const errData = await (userRes as Response).json().catch(() => null);
        toast.error(errData?.error || "Failed to load team members");
      }

      if (leaveRes.ok) {
        const leaveData = await (leaveRes as Response).json();
        setLeaves(safeArray<LeaveRecord>(leaveData));
      } else {
        const errData = await (leaveRes as Response).json().catch(() => null);
        toast.error(errData?.error || "Failed to load leave requests");
      }

      if (attendRes.ok) {
        const attendData = await (attendRes as Response).json();
        setAttendance(safeArray<AttendanceRecord>(attendData));
      } else {
        const errData = await (attendRes as Response).json().catch(() => null);
        toast.error(errData?.error || "Failed to load attendance data");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [isAdminUser]);

  // Fetch attendance with filters
  const fetchAttendance = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      params.set("type", "attendance");
      if (attDateFrom) params.set("from", attDateFrom);
      if (attDateTo) params.set("to", attDateTo);
      const res = await fetch(`/api/team?${params.toString()}`, { credentials: "include", signal });
      if (res.ok) {
        const data = await res.json();
        setAttendance(safeArray<AttendanceRecord>(data));
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to load attendance data");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
    }
  }, [attDateFrom, attDateTo]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Refetch attendance when date filters change
  useEffect(() => {
    if (tab === "attendance" && isAdminUser) {
      const controller = new AbortController();
      fetchAttendance(controller.signal);
      return () => controller.abort();
    }
  }, [tab, fetchAttendance, isAdminUser]);

  // Edit user handler
  const handleEditUser = useCallback(async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: editUser.id,
          name: editForm.name,
          role: editForm.role,
          department: editForm.department || null,
          isActive: editForm.isActive,
        }),
      });
      if (res.ok) {
        toast.success(`${safeText(editForm.name)} updated successfully`);
        setEditUserOpen(false);
        setEditUser(null);
        fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to update user");
      }
    } catch {
      toast.error("Failed to update user");
    } finally {
      setEditLoading(false);
    }
  }, [editUser, editForm, fetchData]);

  const openEditDialog = useCallback((user: TeamUser) => {
    setEditUser(user);
    setEditForm({ name: user.name, role: user.role, department: user.department || "", isActive: user.isActive });
    setEditUserOpen(true);
  }, []);

  const handleLeaveAction = useCallback(async (id: string, status: string, feedback?: string) => {
    if (mutating) return;
    setMutating(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "leave", id, status, feedback }),
      });
      if (res.ok) {
        toast.success(`Leave ${status.toLowerCase()}`);
        fetchData();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || `Failed to ${status.toLowerCase()} leave`);
      }
    } catch {
      toast.error("Failed to update leave");
    } finally {
      setMutating(false);
    }
  }, [mutating, fetchData]);

  const handleApplyLeave = useCallback(async () => {
    if (leaveForm.startDate && leaveForm.endDate && new Date(leaveForm.startDate) > new Date(leaveForm.endDate)) {
      toast.error("End date must be on or after start date");
      return;
    }
    if (mutating) return;
    setMutating(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "leave", ...leaveForm }),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setLeaveDialogOpen(false);
        setLeaveForm({ userId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to submit leave");
      }
    } catch {
      toast.error("Failed to submit leave");
    } finally {
      setMutating(false);
    }
  }, [leaveForm, mutating, fetchData]);

  const handleAddMember = useCallback(async () => {
    if (!memberForm.name || !memberForm.email || !memberForm.password) {
      toast.error("Name, email, and password are required");
      return;
    }
    if (memberForm.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(memberForm.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setAddMemberLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "user",
          name: memberForm.name,
          email: memberForm.email,
          role: memberForm.role,
          department: memberForm.department,
          password: memberForm.password,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${safeText(memberForm.name)} added to the team`);
        setAddMemberOpen(false);
        setMemberForm({ name: "", email: "", role: "DEVELOPER", department: "Engineering", password: "" });
        fetchData();
      } else {
        toast.error(data.error || "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddMemberLoading(false);
    }
  }, [memberForm, fetchData]);

  // ── Attendance CRUD handlers ──

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
      if (attForm.checkIn) payload.checkIn = new Date(`${attForm.date}T${attForm.checkIn}`).toISOString();
      if (attForm.checkOut) payload.checkOut = new Date(`${attForm.date}T${attForm.checkOut}`).toISOString();
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
        setAttForm({ userId: "", date: "", status: "PRESENT", checkIn: "", checkOut: "", notes: "" });
        fetchAttendance();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to add attendance record");
      }
    } catch {
      toast.error("Failed to add attendance record");
    } finally {
      setAttLoading(false);
    }
  }, [attForm, fetchAttendance]);

  const handleEditAttendance = useCallback(async () => {
    if (!editAttForm.id) return;
    setAttEditLoading(true);
    try {
      const payload: Record<string, unknown> = {
        type: "attendance",
        status: editAttForm.status,
      };
      if (editAttForm.checkIn) payload.checkIn = editAttForm.checkIn;
      else payload.checkIn = null;
      if (editAttForm.checkOut) payload.checkOut = editAttForm.checkOut;
      else payload.checkOut = null;
      if (editAttForm.notes.trim()) payload.notes = editAttForm.notes.trim();
      else payload.notes = null;

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
        toast.error(errData?.error || "Failed to update attendance record");
      }
    } catch {
      toast.error("Failed to update attendance record");
    } finally {
      setAttEditLoading(false);
    }
  }, [editAttForm, fetchAttendance]);

  const handleDeleteAttendance = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this attendance record?")) return;
    try {
      const res = await fetch(`/api/team?type=attendance&id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Attendance record deleted");
        fetchAttendance();
      } else {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to delete attendance record");
      }
    } catch {
      toast.error("Failed to delete attendance record");
    }
  }, [fetchAttendance]);

  const openEditAttDialog = useCallback((record: AttendanceRecord) => {
    setEditAttForm({
      id: record.id,
      status: record.status,
      checkIn: record.checkIn ? formatTime(record.checkIn) : "",
      checkOut: record.checkOut ? formatTime(record.checkOut) : "",
      notes: record.notes || "",
    });
    setEditAttDialogOpen(true);
  }, []);

  // Show loading skeleton while session is loading
  if (sessionStatus === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); setLoading(true); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // Filtered leaves based on status filter
  const filteredLeaves = leaves.filter(l => leaveFilter === "all" || l.status === leaveFilter);
  const pendingLeavesCount = leaves.filter(l => l.status === "PENDING").length;

  // Filtered attendance based on user filter
  const filteredAttendance = attUserFilter === "all"
    ? attendance
    : attendance.filter(a => a.userId === attUserFilter);

  // Attendance summary stats
  const attStats = {
    total: filteredAttendance.length,
    present: filteredAttendance.filter(a => a.status === "PRESENT").length,
    absent: filteredAttendance.filter(a => a.status === "ABSENT").length,
    halfDay: filteredAttendance.filter(a => a.status === "HALF_DAY").length,
    leave: filteredAttendance.filter(a => a.status === "LEAVE").length,
  };

  return (
    <div className="space-y-4">
      <PageHeader title={isAdminUser ? "Team Management" : "My Leaves"} description={isAdminUser ? "Manage team members, leave requests, and attendance" : "View and manage your leave requests"}>
        <div className="flex gap-2">
          {isAdminUser && (
            <>
              <Button size="sm" variant="outline" onClick={() => { setLoading(true); fetchData(); }} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
              {tab === "team" && (
                <Button size="sm" onClick={() => setAddMemberOpen(true)} className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-1" /> Add Member
                </Button>
              )}
              {tab === "attendance" && (
                <Button size="sm" onClick={() => {
                  setAttForm({ userId: "", date: new Date().toISOString().split("T")[0], status: "PRESENT", checkIn: "", checkOut: "", notes: "" });
                  setAttDialogOpen(true);
                }} className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-1" /> Add Record
                </Button>
              )}
            </>
          )}
          {tab === "leaves" && (
            <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Apply Leave
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Tab buttons */}
      <div className="flex gap-2 flex-wrap">
        {isAdminUser && (
          <Button key="team" variant={tab === "team" ? "default" : "outline"} size="sm" onClick={() => setTab("team")}>
            Team ({users.length})
          </Button>
        )}
        <Button key="leaves" variant={tab === "leaves" ? "default" : "outline"} size="sm" onClick={() => setTab("leaves")}>
          Leave Requests{pendingLeavesCount > 0 ? ` (${pendingLeavesCount})` : ""}
        </Button>
        {isAdminUser && (
          <Button key="attendance" variant={tab === "attendance" ? "default" : "outline"} size="sm" onClick={() => setTab("attendance")}>
            Attendance ({attendance.length})
          </Button>
        )}
      </div>

      {/* ═══════════════ TEAM TAB ═══════════════ */}
      {tab === "team" && isAdminUser && (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar || undefined} alt={safeText(user.name)} />
                    <AvatarFallback className="bg-muted text-xs font-medium">
                      {safeText(user.name)?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{safeText(user.name)}</p>
                    <p className="text-xs text-muted-foreground truncate">{safeText(user.email)}</p>
                    {user.department && (
                      <p className="text-xs text-muted-foreground mt-0.5">{safeText(user.department)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`text-[10px] ${roleColors[user.role] || ""}`}>{user.role.replace("_", " ")}</Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-[10px]">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(user)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No team members found.</p>
              <p className="text-xs mt-1">Click &quot;Add Member&quot; to invite someone to the team.</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ LEAVES TAB ═══════════════ */}
      {tab === "leaves" && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap mb-4">
            {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
              <Button key={s} size="sm" variant={leaveFilter === s ? "default" : "outline"} onClick={() => setLeaveFilter(s)}>
                {s === "all" ? `All (${leaves.length})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${leaves.filter(l => l.status === s).length})`}
              </Button>
            ))}
          </div>

          {filteredLeaves.map((leave) => (
            <Card key={leave.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{safeText(leave.user?.name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {safeText(leave.type)} leave: {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        <span className="ml-1.5 text-muted-foreground/70">({getLeaveDays(leave.startDate, leave.endDate)} day(s))</span>
                      </p>
                      {leave.reason && <p className="text-xs mt-1 truncate max-w-[300px]">{safeText(leave.reason)}</p>}
                      {leave.feedback && (
                        <p className="text-xs mt-1 text-orange-600 dark:text-orange-400">
                          Feedback: {safeText(leave.feedback)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`text-xs ${leaveStatusColors[leave.status] || ""}`}>{safeText(leave.status)}</Badge>
                    {/* Only show approve/reject for admins AND not own leaves */}
                    {isAdminUser && leave.status === "PENDING" && leave.userId !== currentUserId && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 text-green-600" onClick={() => handleLeaveAction(leave.id, "APPROVED")} disabled={mutating}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => { setRejectingLeaveId(leave.id); setRejectFeedback(""); setRejectDialogOpen(true); }} disabled={mutating}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredLeaves.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No leave requests</p>
          )}
        </div>
      )}

      {/* ═══════════════ ATTENDANCE TAB ═══════════════ */}
      {tab === "attendance" && isAdminUser && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Total Records</p>
              <p className="text-xl font-bold">{attStats.total}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Present</p>
              <p className="text-xl font-bold text-green-600">{attStats.present}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Absent</p>
              <p className="text-xl font-bold text-red-600">{attStats.absent}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Half Day</p>
              <p className="text-xl font-bold text-yellow-600">{attStats.halfDay}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">On Leave</p>
              <p className="text-xl font-bold text-blue-600">{attStats.leave}</p>
            </Card>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input type="date" value={attDateFrom} onChange={(e) => setAttDateFrom(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input type="date" value={attDateTo} onChange={(e) => setAttDateTo(e.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={attUserFilter} onValueChange={setAttUserFilter}>
                <SelectTrigger className="h-9 w-48"><SelectValue placeholder="All employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{safeText(u.name)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(attDateFrom || attDateTo || attUserFilter !== "all") && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setAttDateFrom(""); setAttDateTo(""); setAttUserFilter("all"); }}>
                Clear Filters
              </Button>
            )}
          </div>

          {/* Attendance records list */}
          <div className="space-y-2">
            {filteredAttendance.map((record) => (
              <Card key={record.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={record.user?.avatar || undefined} alt={safeText(record.user?.name)} />
                        <AvatarFallback className="bg-muted text-[10px]">
                          {safeText(record.user?.name)?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{safeText(record.user?.name)}</p>
                          {record.isManual && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">Manual</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(record.date)}
                          {record.checkIn && (
                            <span> &bull; In: {formatTime(record.checkIn)}</span>
                          )}
                          {record.checkOut && (
                            <span> &bull; Out: {formatTime(record.checkOut)}</span>
                          )}
                        </p>
                        {/* Hours bar: required vs worked */}
                        {record.requiredHours !== null && record.requiredHours !== undefined && record.requiredHours > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 max-w-[200px]">
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    (record.workedHours || 0) >= record.requiredHours
                                      ? "bg-green-500"
                                      : (record.workedHours || 0) >= record.requiredHours * 0.5
                                        ? "bg-yellow-500"
                                        : "bg-red-400"
                                  }`}
                                  style={{ width: `${Math.min(100, ((record.workedHours || 0) / record.requiredHours) * 100)}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {record.workedHours || 0}h / {record.requiredHours}h req
                            </span>
                          </div>
                        )}
                        {/* Show worked hours even if no requirement */}
                        {(record.workedHours !== null && record.workedHours !== undefined && record.workedHours > 0) && (record.requiredHours === null || record.requiredHours === 0) && (
                          <p className="text-[10px] text-green-600 mt-0.5">
                            Worked {record.workedHours}h{record.status === "PRESENT" ? " (no schedule set)" : ""}
                          </p>
                        )}
                        {record.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate max-w-[400px]">{safeText(record.notes)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge className={`text-[10px] ${attStatusColors[record.status] || ""}`}>{safeText(record.status).replace("_", " ")}</Badge>
                      {record.isManual && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditAttDialog(record)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDeleteAttendance(record.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredAttendance.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No attendance records found.</p>
                <p className="text-xs mt-1">
                  Attendance is auto-computed from Time Tracking and Availability data. If no records show, try:
                </p>
                <ul className="text-xs mt-1 text-muted-foreground/70 space-y-0.5">
                  <li>1. Ensure employees have Availability schedules set up</li>
                  <li>2. Ensure employees have clocked in/out via Time Tracking</li>
                  <li>3. Adjust the date filters to a wider range</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Apply Leave Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm(p => ({ ...p, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASUAL">Casual Leave</SelectItem>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="PAID">Paid Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>
            {leaveForm.startDate && leaveForm.endDate && new Date(leaveForm.startDate) > new Date(leaveForm.endDate) && (
              <p className="text-xs text-destructive">End date must be on or after start date</p>
            )}
            <div className="space-y-2">
              <Label>Reason (Optional)</Label>
              <Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm(p => ({ ...p, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyLeave} disabled={!leaveForm.startDate || !leaveForm.endDate || mutating}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Leave Dialog with feedback */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for rejection (optional)</Label>
              <Textarea
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Provide feedback to the employee..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectingLeaveId(null); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectingLeaveId) {
                  handleLeaveAction(rejectingLeaveId, "REJECTED", rejectFeedback || undefined);
                  setRejectDialogOpen(false);
                  setRejectingLeaveId(null);
                }
              }}
              disabled={mutating}
            >
              Reject Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserOpen} onOpenChange={(open) => {
        setEditUserOpen(open);
        if (!open) setEditUser(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input placeholder="e.g. John Smith" value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={editForm.department} onValueChange={(v) => setEditForm(p => ({ ...p, department: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editForm.isActive}
                onChange={(e) => setEditForm(p => ({ ...p, isActive: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserOpen(false)}>Cancel</Button>
            <Button onClick={handleEditUser} disabled={!editForm.name || editLoading}>
              {editLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Team Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input placeholder="e.g. John Smith" value={memberForm.name} onChange={(e) => setMemberForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" placeholder="e.g. john@trishulhub.com" value={memberForm.email} onChange={(e) => setMemberForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={memberForm.role} onValueChange={(v) => setMemberForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={memberForm.department} onValueChange={(v) => setMemberForm(p => ({ ...p, department: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" placeholder="Minimum 8 characters" value={memberForm.password} onChange={(e) => setMemberForm(p => ({ ...p, password: e.target.value }))} />
              {memberForm.password && memberForm.password.length < 8 && (
                <p className="text-xs text-destructive">Password must be at least 8 characters</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={!memberForm.name || !memberForm.email || !memberForm.password || memberForm.password.length < 8 || addMemberLoading}>
              {addMemberLoading ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Attendance Record Dialog */}
      <Dialog open={attDialogOpen} onOpenChange={setAttDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Attendance Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={attForm.userId} onValueChange={(v) => setAttForm(p => ({ ...p, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.isActive).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{safeText(u.name)} ({safeText(u.email)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={attForm.date} onChange={(e) => setAttForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select value={attForm.status} onValueChange={(v) => setAttForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRESENT">Present</SelectItem>
                    <SelectItem value="ABSENT">Absent</SelectItem>
                    <SelectItem value="HALF_DAY">Half Day</SelectItem>
                    <SelectItem value="LEAVE">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in Time</Label>
                <Input type="time" value={attForm.checkIn} onChange={(e) => setAttForm(p => ({ ...p, checkIn: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Check-out Time</Label>
                <Input type="time" value={attForm.checkOut} onChange={(e) => setAttForm(p => ({ ...p, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea value={attForm.notes} onChange={(e) => setAttForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAttendance} disabled={!attForm.userId || !attForm.date || attLoading}>
              {attLoading ? "Adding..." : "Add Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Attendance Record Dialog */}
      <Dialog open={editAttDialogOpen} onOpenChange={setEditAttDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Attendance Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={editAttForm.status} onValueChange={(v) => setEditAttForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="LEAVE">On Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in Time</Label>
                <Input type="time" value={editAttForm.checkIn} onChange={(e) => setEditAttForm(p => ({ ...p, checkIn: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Check-out Time</Label>
                <Input type="time" value={editAttForm.checkOut} onChange={(e) => setEditAttForm(p => ({ ...p, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editAttForm.notes} onChange={(e) => setEditAttForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any additional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAttDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditAttendance} disabled={!editAttForm.id || attEditLoading}>
              {attEditLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
