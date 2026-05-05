"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Calendar, Plus, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, Trash2, Ban, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// ━━ Helpers ━━
const safeArray = <T,>(data: unknown): T[] => Array.isArray(data) ? data : [];

function safeDateStr(date: unknown): Date {
  const d = new Date(date as string);
  return isNaN(d.getTime()) ? new Date() : d;
}

interface LeaveRecord {
  id: string;
  userId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; role: string };
  approver?: { id: string; name: string } | null;
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
}

const leaveTypeColors: Record<string, string> = {
  SICK_LEAVE: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  CASUAL_LEAVE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  ANNUAL_LEAVE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  PUBLIC_HOLIDAY: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  OTHER: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const leaveTypeLabels: Record<string, string> = {
  SICK_LEAVE: "Sick Leave",
  CASUAL_LEAVE: "Casual Leave",
  ANNUAL_LEAVE: "Annual Leave",
  PUBLIC_HOLIDAY: "Public Holiday",
  OTHER: "Other",
};

const leaveStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const leaveCalendarColors: Record<string, string> = {
  SICK_LEAVE: "border-l-pink-500",
  CASUAL_LEAVE: "border-l-blue-500",
  ANNUAL_LEAVE: "border-l-purple-500",
  PUBLIC_HOLIDAY: "border-l-orange-500",
  OTHER: "border-l-gray-500",
};

const calendarBgColors: Record<string, string> = {
  SICK_LEAVE: "bg-pink-500",
  CASUAL_LEAVE: "bg-blue-500",
  ANNUAL_LEAVE: "bg-purple-500",
  PUBLIC_HOLIDAY: "bg-orange-500",
  OTHER: "bg-gray-500",
};

export default function LeaveManagementPage() {
  const { data: session, status } = useSession();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());

  // Filter state
  const [filterEmployee, setFilterEmployee] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // Form state
  const [formUserId, setFormUserId] = useState("");
  const [formLeaveType, setFormLeaveType] = useState("CASUAL_LEAVE");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");

  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function loadData() {
      try {
        const leavesRes = await fetch("/api/leaves", { credentials: "include", signal });
        if (leavesRes.ok) setLeaves(safeArray<LeaveRecord>(await leavesRes.json()));

        if (isUserAdmin) {
          const teamRes = await fetch("/api/team?type=users", { credentials: "include", signal });
          if (teamRes.ok) setTeamUsers(safeArray<TeamUser>(await teamRes.json()));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to fetch data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
    return () => controller.abort();
  }, [isUserAdmin]);

  const fetchData = useCallback(async () => {
    try {
      const leavesRes = await fetch("/api/leaves", { credentials: "include" });
      if (leavesRes.ok) setLeaves(safeArray<LeaveRecord>(await leavesRes.json()));

      if (isUserAdmin) {
        const teamRes = await fetch("/api/team?type=users", { credentials: "include" });
        if (teamRes.ok) setTeamUsers(safeArray<TeamUser>(await teamRes.json()));
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to refresh data");
    }
  }, [isUserAdmin]);

  const handleSubmit = async () => {
    if (!formStartDate || !formEndDate) {
      toast.error("Please select start and end dates");
      return;
    }
    if (new Date(formStartDate) > new Date(formEndDate)) {
      toast.error("Start date must be before or equal to end date");
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(formEndDate) < today) {
      toast.error("Leave dates cannot be in the past");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        leaveType: formLeaveType,
        startDate: formStartDate,
        endDate: formEndDate,
        reason: formReason,
      };
      if (isUserAdmin && formUserId) {
        payload.userId = formUserId;
      }

      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Leave request submitted");
        setDialogOpen(false);
        setFormLeaveType("CASUAL_LEAVE");
        setFormStartDate("");
        setFormEndDate("");
        setFormReason("");
        setFormUserId("");
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to submit leave request");
      }
    } catch (err) {
      console.error("[leaves] handleSubmit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (leaveId: string, status: "APPROVED" | "REJECTED" | "CANCELLED") => {
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Leave ${status.toLowerCase()}`);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update leave");
      }
    } catch (err) {
      console.error("[leaves] handleStatusChange error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update leave");
    }
  };

  const handleDelete = async (leaveId: string) => {
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Leave deleted");
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete leave");
      }
    } catch (err) {
      console.error("[leaves] handleDelete error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete leave");
    }
  };

  // Calendar helpers
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const getLeavesForDate = useCallback((day: number) => {
    const date = new Date(currentYear, currentMonth, day);
    return leaves.filter((leave) => {
      if (leave.status === "CANCELLED" || leave.status === "REJECTED") return false;
      const start = safeDateStr(leave.startDate);
      const end = safeDateStr(leave.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return date >= start && date <= end;
    });
  }, [currentYear, currentMonth, leaves]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Filtered leaves for the table
  const filteredLeaves = useMemo(
    () => leaves.filter((leave) => {
      const matchesEmployee = filterEmployee === "ALL" || leave.userId === filterEmployee;
      const matchesStatus = filterStatus === "ALL" || leave.status === filterStatus;
      return matchesEmployee && matchesStatus;
    }),
    [leaves, filterEmployee, filterStatus],
  );

  const pendingLeaves = useMemo(() => leaves.filter((l) => l.status === "PENDING"), [leaves]);
  const myLeaves = useMemo(() => leaves.filter((l) => l.userId === session?.user?.id), [leaves, session?.user?.id]);
  const approvedThisMonth = useMemo(
    () => leaves.filter(
      (l) => l.status === "APPROVED" && safeDateStr(l.createdAt).getMonth() === new Date().getMonth()
    ),
    [leaves],
  );

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Session loading guard
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-muted-foreground text-sm">Manage team leaves and availability blocking</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Leave
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <span className="text-3xl font-bold">{pendingLeaves.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My Leaves</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-500" />
              <span className="text-3xl font-bold">{myLeaves.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved This Month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <span className="text-3xl font-bold">{approvedThisMonth.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Team On Leave Today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <span className="text-3xl font-bold">
                {leaves.filter((l) => {
                  if (l.status !== "APPROVED") return false;
                  const now = new Date();
                  const start = safeDateStr(l.startDate);
                  const end = safeDateStr(l.endDate);
                  return now >= start && now <= end;
                }).length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calendar View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Leave Calendar</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-2">
            {Object.entries(leaveTypeLabels).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`h-3 w-3 rounded-sm ${calendarBgColors[key] || "bg-gray-400"}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {/* Day headers */}
            {dayNames.map((day) => (
              <div key={day} className="bg-muted px-2 py-2 text-center text-xs font-semibold">
                {day}
              </div>
            ))}
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-card min-h-[80px] p-1" />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayLeaves = getLeavesForDate(day);
              const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
              return (
                <div key={day} className={`bg-card min-h-[80px] p-1 ${isToday ? "ring-2 ring-primary ring-inset" : ""}`}>
                  <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day}</div>
                  <TooltipProvider>
                    {dayLeaves.slice(0, 2).map((leave) => (
                      <Tooltip key={leave.id}>
                        <TooltipTrigger asChild>
                          <div className={`text-[10px] px-1 py-0.5 rounded border-l-2 mb-0.5 truncate ${leaveCalendarColors[leave.leaveType] || "border-l-gray-400"} ${leave.status === "APPROVED" ? "bg-green-50 dark:bg-green-900/20" : "bg-yellow-50 dark:bg-yellow-900/20"}`}>
                            {leave.user?.name?.split(" ")[0]}
                          </div>
                        </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{leave.user?.name}</p>
                            <p className="text-xs">{leaveTypeLabels[leave.leaveType] || leave.leaveType}</p>
                            <p className="text-xs">{safeDateStr(leave.startDate).toLocaleDateString()} - {safeDateStr(leave.endDate).toLocaleDateString()}</p>
                            <Badge className={`text-[9px] mt-1 ${leaveStatusColors[leave.status]}`}>{leave.status}</Badge>
                          </TooltipContent>
                      </Tooltip>
                    ))}
                  </TooltipProvider>
                  {dayLeaves.length > 2 && (
                    <div className="text-[9px] text-muted-foreground pl-1">+{dayLeaves.length - 2} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending Approvals (Admin only) */}
      {isUserAdmin && pendingLeaves.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Review and approve or reject leave requests</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingLeaves.map((leave) => (
              <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{leave.user?.name || "Unknown"}</span>
                    <Badge className={`text-[10px] ${leaveTypeColors[leave.leaveType] || ""}`}>{leaveTypeLabels[leave.leaveType] || leave.leaveType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {safeDateStr(leave.startDate).toLocaleDateString()} - {safeDateStr(leave.endDate).toLocaleDateString()}
                    {" "} ({(() => { const s = safeDateStr(leave.startDate); const e = safeDateStr(leave.endDate); const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1; return isNaN(diff) ? "?" : `${diff}`; })()} days)
                  </p>
                  {leave.reason && <p className="text-xs text-muted-foreground mt-1">Reason: {leave.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleStatusChange(leave.id, "APPROVED")}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleStatusChange(leave.id, "REJECTED")}>
                    <XCircle className="h-3 w-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Leave List with Filters */}
      <Card>
        <CardHeader>
          <CardTitle>All Leave Records</CardTitle>
          <div className="flex gap-2 flex-wrap mt-2">
            {isUserAdmin && (
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Employees</SelectItem>
                  {teamUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredLeaves.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm text-muted-foreground">No leave records found</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Leave
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeaves.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium text-sm">{leave.user?.name || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${leaveTypeColors[leave.leaveType] || ""}`}>
                          {leaveTypeLabels[leave.leaveType] || leave.leaveType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {safeDateStr(leave.startDate).toLocaleDateString()} - {safeDateStr(leave.endDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {leave.reason || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${leaveStatusColors[leave.status] || ""}`}>
                          {leave.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isUserAdmin && leave.status === "PENDING" && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={() => handleStatusChange(leave.id, "APPROVED")}>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => handleStatusChange(leave.id, "REJECTED")}>
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {leave.status === "PENDING" && (leave.userId === session?.user?.id || isUserAdmin) && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500" onClick={() => handleStatusChange(leave.id, "CANCELLED")}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(leave.userId === session?.user?.id || isUserAdmin) && leave.status === "PENDING" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => handleDelete(leave.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* Add Leave Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isUserAdmin && (
              <div>
                <Label>Employee</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee (or leave blank for yourself)" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Leave Type</Label>
              <Select value={formLeaveType} onValueChange={setFormLeaveType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                  <SelectItem value="CASUAL_LEAVE">Casual Leave</SelectItem>
                  <SelectItem value="ANNUAL_LEAVE">Annual Leave</SelectItem>
                  <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Reason (Optional)</Label>
              <Textarea
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Brief reason for the leave..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
