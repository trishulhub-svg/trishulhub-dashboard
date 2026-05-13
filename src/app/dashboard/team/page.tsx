"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  User, Clock, Calendar, CheckCircle2, XCircle, Shield, Plus, Trash2, AlertCircle, RefreshCw, MessageSquare,
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

// ── TypeScript Interfaces ── [FIX M3: Replace unknown[] with proper types]

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
  user?: { id: string; name: string; email: string; role: string };
}

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  user?: { id: string; name: string; email: string; role: string };
}

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  DEVELOPER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CLIENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

// ── Helper: safe array fallback ── [FIX C1: Prevent .map crash on non-array responses]
function safeArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"team" | "leaves" | "attendance">("team");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // [FIX C2: Use sessionStatus to avoid redirecting during loading]
  const userRole = session?.user?.role || "DEVELOPER";
  const isAdminUser = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [mutating, setMutating] = useState(false); // [FIX H3: Global mutation loading guard]

  // Leave form
  const [leaveForm, setLeaveForm] = useState({ userId: "", leaveType: "CASUAL", startDate: "", endDate: "", reason: "" });

  // Add member form
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "DEVELOPER", department: "Engineering", password: "" });

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [userRes, leaveRes, attendRes] = await Promise.all([
        fetch("/api/team", { credentials: 'include', signal }),
        fetch("/api/team?type=leaves", { credentials: 'include', signal }),
        fetch("/api/team?type=attendance", { credentials: 'include', signal }),
      ]);

      // [FIX C1: Safe array fallback for all responses]
      // [FIX H2: Show error toast for non-ok responses]
      if (userRes.ok) {
        const userData = await userRes.json();
        setUsers(safeArray<TeamUser>(userData));
      } else {
        const errData = await userRes.json().catch(() => null);
        toast.error(errData?.error || "Failed to load team members");
      }

      if (leaveRes.ok) {
        const leaveData = await leaveRes.json();
        setLeaves(safeArray<LeaveRecord>(leaveData));
      } else {
        const errData = await leaveRes.json().catch(() => null);
        toast.error(errData?.error || "Failed to load leave requests");
      }

      if (attendRes.ok) {
        const attendData = await attendRes.json();
        setAttendance(safeArray<AttendanceRecord>(attendData));
      } else {
        const errData = await attendRes.json().catch(() => null);
        toast.error(errData?.error || "Failed to load attendance data");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const handleLeaveAction = useCallback(async (id: string, status: string, feedback?: string) => {
    if (mutating) return; // [FIX H3: Prevent double-click]
    setMutating(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ type: "leave", id, status, feedback }),
      });
      if (res.ok) {
        toast.success(`Leave ${status.toLowerCase()}`);
        fetchData();
      } else {
        // [FIX H4: Show error toast for non-ok leave action response]
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
    // [FIX M7: Client-side date validation]
    if (leaveForm.startDate && leaveForm.endDate && new Date(leaveForm.startDate) > new Date(leaveForm.endDate)) {
      toast.error("End date must be on or after start date");
      return;
    }
    if (mutating) return; // [FIX H3]
    setMutating(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
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
    // [FIX H1: Match client-side validation with API minimum of 8 characters]
    if (memberForm.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    // [FIX: Client-side email validation]
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
        toast.success(`${memberForm.name} added to the team`);
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

  // [FIX C2: Wait for session to load before checking role guard]
  // Show loading skeleton while session is loading to prevent false redirect
  if (sessionStatus === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  // Role guard — only redirect AFTER session is confirmed loaded and user is not admin
  if (!isAdminUser) {
    router.push("/dashboard");
    return null;
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

  // Tab counts for badges
  const pendingLeavesCount = leaves.filter(l => l.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team Management</h1>
          <p className="text-muted-foreground text-sm">Manage team members and leave requests</p>
        </div>
        <div className="flex gap-2">
          {/* [FIX M10: Add refresh button] */}
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); fetchData(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {tab === "team" && (
            <Button size="sm" onClick={() => setAddMemberOpen(true)} className="bg-primary hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1" /> Add Member
            </Button>
          )}
          {tab === "leaves" && (
            <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Apply Leave
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["team", "leaves", "attendance"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "default" : "outline"} size="sm" onClick={() => setTab(t)}>
            {t === "team" ? `Team (${users.length})`
              : t === "leaves" ? `Leave Requests${pendingLeavesCount > 0 ? ` (${pendingLeavesCount})` : ""}`
              : "Attendance"}
          </Button>
        ))}
      </div>

      {tab === "team" && (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* [FIX M8: Show user avatar if available] */}
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar || undefined} alt={user.name} />
                    <AvatarFallback className="bg-muted">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                    {user.department && (
                      <p className="text-xs text-muted-foreground mt-0.5">{user.department}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-[10px] ${roleColors[user.role] || ""}`}>{user.role.replace("_", " ")}</Badge>
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-[10px]">
                      {user.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {/* [FIX M1: Empty state for team tab] */}
          {users.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No team members found.</p>
              <p className="text-xs mt-1">Click &quot;Add Member&quot; to invite someone to the team.</p>
            </div>
          )}
        </div>
      )}

      {tab === "leaves" && (
        <div className="space-y-3">
          {leaves.map((leave) => (
            <Card key={leave.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{leave.user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {leave.type} leave: {new Date(leave.startDate).toLocaleDateString()} - {new Date(leave.endDate).toLocaleDateString()}
                      </p>
                      {leave.reason && <p className="text-xs mt-1">{leave.reason}</p>}
                      {leave.feedback && (
                        <p className="text-xs mt-1 text-orange-600 dark:text-orange-400">
                          Feedback: {leave.feedback}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{leave.status}</Badge>
                    {leave.status === "PENDING" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-green-600"
                          onClick={() => handleLeaveAction(leave.id, "APPROVED")}
                          disabled={mutating}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        {/* [FIX H6: Reject button opens feedback dialog instead of instant reject] */}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-red-500"
                          onClick={() => { setRejectingLeaveId(leave.id); setRejectFeedback(""); setRejectDialogOpen(true); }}
                          disabled={mutating}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {leaves.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No leave requests</p>
          )}
        </div>
      )}

      {tab === "attendance" && (
        <div className="space-y-3">
          {attendance.map((record) => (
            <Card key={record.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{record.user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(record.date).toLocaleDateString()} &bull;
                        Check-in: {record.checkIn ? new Date(record.checkIn).toLocaleTimeString() : "N/A"} &bull;
                        Check-out: {record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">{record.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {/* [FIX M2: Empty state for attendance tab] */}
          {attendance.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No attendance records found.</p>
              <p className="text-xs mt-1">Attendance data will appear here once team members start checking in.</p>
            </div>
          )}
        </div>
      )}

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
            {/* [FIX M7: Show date validation error] */}
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

      {/* [FIX H6: Reject Leave Dialog with feedback] */}
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
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={memberForm.department} onValueChange={(v) => setMemberForm(p => ({ ...p, department: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Sales">Sales</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              {/* [FIX H1: Match placeholder with API requirement of 8 characters] */}
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
    </div>
  );
}
