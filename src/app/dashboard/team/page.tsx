"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  User, Calendar, CheckCircle2, XCircle, Plus, AlertCircle, RefreshCw, Pencil,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

// Role colors for badge styling
const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  PROJECT_MANAGER: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DEVELOPER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  VIEWER: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  CLIENT: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session, status: sessionStatus } = useSession();

  const currentUserId = session?.user?.id || "";
  // [I11] useMemo to prevent unnecessary fetchData recomputation
  const isAdminUser = useMemo(() => session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN", [session?.user?.role]);

  // Default tab based on role — non-admins default to "leaves"
  const [tab, setTab] = useState<"team" | "leaves">(isAdminUser ? "team" : "leaves");
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

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [userRes, leaveRes] = await Promise.all([
        isAdminUser
          ? fetch("/api/team", { credentials: "include", signal })
          : Promise.resolve({ ok: true, json: async () => [] }),
        fetch("/api/team?type=leaves", { credentials: "include", signal }),
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[team] fetchData Error:", err);
      setError("Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [isAdminUser]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

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
    // [W18] Client-side password complexity validation
    if (!/[a-zA-Z]/.test(memberForm.password) || !/[0-9]/.test(memberForm.password)) {
      toast.error("Password must contain at least one letter and one number");
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

  // [I10] useMemo — must be called before any conditional early returns (Rules of Hooks)
  const filteredLeaves = useMemo(
    () => leaves.filter(l => leaveFilter === "all" || l.status === leaveFilter),
    [leaves, leaveFilter]
  );
  const pendingLeavesCount = useMemo(() => leaves.filter(l => l.status === "PENDING").length, [leaves]);

  // [I10] Consolidated loading skeleton
  if (sessionStatus === "loading" || loading) {
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

  return (
    <div className="space-y-4">
      <PageHeader title={isAdminUser ? "Team Management" : "My Leaves"} description={isAdminUser ? "Manage team members and leave requests" : "View and manage your leave requests"}>
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
      </div>

      {/* ═══════════════ TEAM TAB ═══════════════ */}
      {tab === "team" && isAdminUser && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {users.map((user) => (
            <Card key={user.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
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
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit member" onClick={() => openEditDialog(user)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {users.length === 0 && (
            <div className="col-span-1 sm:col-span-2 text-center py-12 text-muted-foreground">
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
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{safeText(leave.user?.name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {safeText(leave.type)} leave: {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        <span className="ml-1.5 text-muted-foreground/70">({getLeaveDays(leave.startDate, leave.endDate)} day(s))</span>
                      </p>
                      {leave.reason && <p className="text-xs mt-1 truncate max-w-[200px] sm:max-w-[300px]">{safeText(leave.reason)}</p>}
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
                        <Button size="sm" variant="ghost" className="h-7 text-green-600" onClick={() => handleLeaveAction(leave.id, "APPROVED")} disabled={mutating} aria-label="Approve leave">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => { setRejectingLeaveId(leave.id); setRejectFeedback(""); setRejectDialogOpen(true); }} disabled={mutating} aria-label="Reject leave">
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

      {/* ═══════════════ DIALOGS ═══════════════ */}

      {/* Apply Leave Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <DialogContent className="sm:max-w-[500px]">
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
        <DialogContent className="sm:max-w-[500px]">
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
                  {/* [W17] Only SUPER_ADMIN can assign ADMIN, PROJECT_MANAGER, or SUPER_ADMIN roles */}
                  {session?.user?.role === "SUPER_ADMIN" && (
                    <>
                      <SelectItem value="PROJECT_MANAGER">Project Manager</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    </>
                  )}
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
        <DialogContent className="sm:max-w-[500px]">
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
                  {/* [W17] Only SUPER_ADMIN can assign ADMIN, PROJECT_MANAGER, or SUPER_ADMIN roles */}
                  {session?.user?.role === "SUPER_ADMIN" && (
                    <>
                      <SelectItem value="PROJECT_MANAGER">Project Manager</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    </>
                  )}
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
    </div>
  );
}
