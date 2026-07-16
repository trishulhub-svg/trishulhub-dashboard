"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  User, Calendar, CheckCircle2, XCircle, Plus, AlertCircle, RefreshCw, Pencil,
  Key, Mail, Loader2, Eye, EyeOff, MoreHorizontal, ChevronDown, Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { cn, safeArray, safeText } from "@/lib/utils";
import { DEPARTMENTS } from "@/lib/types";

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (!password) return { label: "", color: "", width: "0%" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { label: "Weak", color: "bg-red-500", width: "33%" };
  if (score <= 4) return { label: "Medium", color: "bg-yellow-500", width: "66%" };
  return { label: "Strong", color: "bg-green-500", width: "100%" };
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = getPasswordStrength(password);
  return (
    <div className="mt-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: strength.width }} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        Password strength: {strength.label}
      </p>
    </div>
  );
}

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
      onClick={onToggle}
      tabIndex={-1}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}

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

// Role colors for badge styling — primary/muted treatments (no purple pastel wells)
const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-destructive/15 text-destructive",
  ADMIN: "bg-primary/15 text-primary",
  PROJECT_MANAGER: "bg-primary/10 text-primary",
  DEVELOPER: "bg-muted text-foreground",
  VIEWER: "bg-muted text-muted-foreground",
  CLIENT: "bg-success/15 text-success",
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
  const isSuperAdmin = useMemo(() => session?.user?.role === "SUPER_ADMIN", [session?.user?.role]);

  // Default tab based on role — non-admins default to "leaves"
  const [tab, setTab] = useState<"team" | "leaves">(isAdminUser ? "team" : "leaves");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingLeaveId, setRejectingLeaveId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [deactivatedOpen, setDeactivatedOpen] = useState(true);
  const [deleteUserTarget, setDeleteUserTarget] = useState<TeamUser | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  // Edit user dialog state
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<TeamUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", department: "", isActive: true });
  const [editLoading, setEditLoading] = useState(false);

  // Password reset dialog (SUPER_ADMIN) — migrated from Settings
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<TeamUser | null>(null);
  const [resetPasswordAction, setResetPasswordAction] = useState<"send_link" | "direct_reset">("send_link");
  const [resetPasswordNewPwd, setResetPasswordNewPwd] = useState("");
  const [resetPasswordConfirmPwd, setResetPasswordConfirmPwd] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showResetPwdConfirm, setShowResetPwdConfirm] = useState(false);

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

  // Reactivate / toggle active — SUPER_ADMIN only (API enforces same)
  const handleSetActive = useCallback(async (user: TeamUser, isActive: boolean) => {
    if (user.role === "SUPER_ADMIN" && !isActive) {
      toast.error("Cannot deactivate SUPER_ADMIN users");
      return;
    }
    setTogglingUserId(user.id);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "user", id: user.id, isActive }),
      });
      if (res.ok) {
        toast.success(isActive ? `${safeText(user.name)} reactivated` : `${safeText(user.name)} deactivated`);
        fetchData();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Failed to update user status");
      }
    } catch {
      toast.error("Failed to update user status");
    } finally {
      setTogglingUserId(null);
    }
  }, [fetchData]);

  const handleDeleteUser = useCallback(async () => {
    if (!deleteUserTarget) return;
    if (deleteConfirmName.trim() !== deleteUserTarget.name.trim()) {
      toast.error("Type the member's name exactly to confirm");
      return;
    }
    setDeleteUserLoading(true);
    try {
      const res = await fetch(`/api/team?type=user&id=${encodeURIComponent(deleteUserTarget.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`${safeText(deleteUserTarget.name)} permanently deleted`);
        setDeleteUserTarget(null);
        setDeleteConfirmName("");
        fetchData();
      } else {
        toast.error(data.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setDeleteUserLoading(false);
    }
  }, [deleteUserTarget, deleteConfirmName, fetchData]);

  const openResetPasswordDialog = useCallback((user: TeamUser, action: "send_link" | "direct_reset" = "send_link") => {
    setResetPasswordUser(user);
    setResetPasswordAction(action);
    setResetPasswordNewPwd("");
    setResetPasswordConfirmPwd("");
    setShowResetPwd(false);
    setShowResetPwdConfirm(false);
    setResetPasswordOpen(true);
  }, []);

  const handlePasswordReset = useCallback(async () => {
    if (!resetPasswordUser) return;

    if (resetPasswordAction === "direct_reset") {
      if (!resetPasswordNewPwd || !resetPasswordConfirmPwd) {
        toast.error("Please fill in all password fields");
        return;
      }
      if (resetPasswordNewPwd !== resetPasswordConfirmPwd) {
        toast.error("Passwords do not match");
        return;
      }
      if (resetPasswordNewPwd.length < 8) {
        toast.error("Password must be at least 8 characters");
        return;
      }
      if (!/[a-zA-Z]/.test(resetPasswordNewPwd) || !/[0-9]/.test(resetPasswordNewPwd)) {
        toast.error("Password must contain at least one letter and one number");
        return;
      }
    }

    setResetPasswordLoading(true);
    try {
      const body: { userId: string; action: "send_link" | "direct_reset"; newPassword?: string } = {
        userId: resetPasswordUser.id,
        action: resetPasswordAction,
      };
      if (resetPasswordAction === "direct_reset") {
        body.newPassword = resetPasswordNewPwd;
      }

      const res = await fetch("/api/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || "Password reset successful");
        setResetPasswordOpen(false);
        setResetPasswordUser(null);
        setResetPasswordNewPwd("");
        setResetPasswordConfirmPwd("");
        setResetPasswordAction("send_link");
        setShowResetPwd(false);
        setShowResetPwdConfirm(false);
      } else {
        toast.error(data.error || "Failed to reset password");
      }
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetPasswordLoading(false);
    }
  }, [resetPasswordUser, resetPasswordAction, resetPasswordNewPwd, resetPasswordConfirmPwd]);

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
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const deactivatedUsers = useMemo(() => users.filter((u) => !u.isActive), [users]);

  const renderMemberRow = (user: TeamUser, variant: "active" | "deactivated") => {
    const isDeactivated = variant === "deactivated";
    const canResetPassword = isSuperAdmin && user.role !== "SUPER_ADMIN";
    const canToggleActive = isSuperAdmin && user.role !== "SUPER_ADMIN";

    return (
      <li
        key={user.id}
        className={cn(
          "flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 transition-colors",
          isDeactivated ? "opacity-70 hover:bg-muted/20" : "hover:bg-muted/40"
        )}
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user.avatar || undefined} alt={safeText(user.name)} />
          <AvatarFallback className={cn(
            "text-[10px] font-semibold",
            isDeactivated ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          )}>
            {safeText(user.name)?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 basis-[calc(100%-3rem)] sm:basis-auto">
          <p className={cn("text-sm font-medium truncate leading-tight", isDeactivated && "text-muted-foreground")}>
            {safeText(user.name)}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {safeText(user.email)}
            {user.department ? ` · ${safeText(user.department)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 w-full sm:w-auto justify-end pl-10 sm:pl-0">
          <Badge className={`text-[10px] ${roleColors[user.role] || ""}`}>{user.role.replace("_", " ")}</Badge>
          {isDeactivated ? (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground">Deactivated</Badge>
          ) : (
            canToggleActive && (
              <div className="hidden sm:flex items-center gap-1.5">
                <Switch
                  checked={user.isActive}
                  onCheckedChange={() => handleSetActive(user, !user.isActive)}
                  disabled={togglingUserId === user.id}
                  aria-label={`Toggle ${safeText(user.name)} active status`}
                />
              </div>
            )
          )}
          {isDeactivated && isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={togglingUserId === user.id}
              onClick={() => handleSetActive(user, true)}
            >
              {togglingUserId === user.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Reactivate"
              )}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Member actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => openEditDialog(user)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              {canResetPassword && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openResetPasswordDialog(user, "send_link")}>
                    <Mail className="h-3.5 w-3.5 mr-2" /> Send reset link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openResetPasswordDialog(user, "direct_reset")}>
                    <Key className="h-3.5 w-3.5 mr-2" /> Set password
                  </DropdownMenuItem>
                </>
              )}
              {!isDeactivated && canToggleActive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="sm:hidden"
                    disabled={togglingUserId === user.id}
                    onClick={() => handleSetActive(user, false)}
                  >
                    Deactivate
                  </DropdownMenuItem>
                </>
              )}
              {isDeactivated && isSuperAdmin && user.role !== "SUPER_ADMIN" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      setDeleteUserTarget(user);
                      setDeleteConfirmName("");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete permanently
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>
    );
  };

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
    <div className="space-y-4 th-page-enter">
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

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "team" | "leaves")}
        className="space-y-4"
      >
        <TabsList className={cn("bg-muted p-1 rounded-lg h-auto", isAdminUser ? "w-full sm:w-auto" : "w-full sm:w-auto")}>
          {isAdminUser && (
            <TabsTrigger value="team" className="data-[state=active]:bg-card data-[state=active]:shadow-sm">
              Team ({users.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="leaves" className="data-[state=active]:bg-card data-[state=active]:shadow-sm">
            Leave Requests{pendingLeavesCount > 0 ? ` (${pendingLeavesCount})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ TEAM TAB ═══════════════ */}
        {isAdminUser && (
          <TabsContent value="team" className="mt-0 space-y-4">
            {users.length === 0 ? (
              <Card className="liquid-glass-card border-border overflow-hidden">
                <CardContent className="p-0">
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="th-stat-icon mx-auto mb-3">
                      <User className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No team members yet</p>
                    <p className="text-xs mt-1 mb-3">Invite someone to get started.</p>
                    <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Add Member
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Active members */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-0.5">
                    <h3 className="text-sm font-medium text-foreground">
                      Active
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">({activeUsers.length})</span>
                    </h3>
                  </div>
                  <Card className="liquid-glass-card border-border overflow-hidden">
                    <CardContent className="p-0">
                      {activeUsers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No active members
                        </div>
                      ) : (
                        <ul className="divide-y divide-border">
                          {activeUsers.map((user) => renderMemberRow(user, "active"))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Deactivated members — only when present */}
                {deactivatedUsers.length > 0 && (
                  <Collapsible open={deactivatedOpen} onOpenChange={setDeactivatedOpen} className="space-y-2">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-0.5 text-left group"
                      >
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Deactivated
                          <span className="ml-1.5 text-xs font-normal">({deactivatedUsers.length})</span>
                        </h3>
                        <ChevronDown className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          deactivatedOpen && "rotate-180"
                        )} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card className="liquid-glass-card border-border/60 bg-muted/20 overflow-hidden">
                        <CardContent className="p-0">
                          <ul className="divide-y divide-border/60">
                            {deactivatedUsers.map((user) => renderMemberRow(user, "deactivated"))}
                          </ul>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* ═══════════════ LEAVES TAB ═══════════════ */}
        <TabsContent value="leaves" className="mt-0 space-y-3">
          <div className="inline-flex flex-wrap gap-0.5 bg-muted p-1 rounded-lg">
            {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLeaveFilter(s)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  leaveFilter === s
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "all" ? `All (${leaves.length})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${leaves.filter(l => l.status === s).length})`}
              </button>
            ))}
          </div>

          <Card className="liquid-glass-card border-border overflow-hidden">
            <CardContent className="p-0">
              {filteredLeaves.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="th-stat-icon mx-auto mb-3">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No leave requests</p>
                  <p className="text-xs mt-1 mb-3">
                    {leaveFilter === "all" ? "Submit a leave request when you need time off." : "No requests match this filter."}
                  </p>
                  {leaveFilter === "all" && (
                    <Button size="sm" onClick={() => setLeaveDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Apply Leave
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredLeaves.map((leave) => (
                    <li key={leave.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="th-stat-icon shrink-0 !w-8 !h-8">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight">{safeText(leave.user?.name)}</p>
                          <p className="text-xs text-muted-foreground">
                            {safeText(leave.type)} · {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                            <span className="ml-1 text-muted-foreground/70">({getLeaveDays(leave.startDate, leave.endDate)}d)</span>
                          </p>
                          {leave.reason && <p className="text-xs mt-0.5 truncate max-w-[240px] sm:max-w-[360px] text-muted-foreground">{safeText(leave.reason)}</p>}
                          {leave.feedback && (
                            <p className="text-xs mt-0.5 text-primary/80">
                              Feedback: {safeText(leave.feedback)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge className={`text-[10px] ${leaveStatusColors[leave.status] || ""}`}>{safeText(leave.status)}</Badge>
                        {isAdminUser && leave.status === "PENDING" && leave.userId !== currentUserId && (
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success" onClick={() => handleLeaveAction(leave.id, "APPROVED")} disabled={mutating} aria-label="Approve leave">
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => { setRejectingLeaveId(leave.id); setRejectFeedback(""); setRejectDialogOpen(true); }} disabled={mutating} aria-label="Reject leave">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Password Reset Dialog (SUPER_ADMIN) — migrated from Settings */}
      {isSuperAdmin && (
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Reset Password
              </DialogTitle>
            </DialogHeader>
            {resetPasswordUser && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="text-sm font-medium">{safeText(resetPasswordUser.name)}</p>
                  <p className="text-xs text-muted-foreground">{safeText(resetPasswordUser.email)}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Reset Method</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setResetPasswordAction("send_link")}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        resetPasswordAction === "send_link"
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-4 w-4" />
                        <span className="text-sm font-medium">Send Reset Link</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Send a password reset link to the user&apos;s registered email
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetPasswordAction("direct_reset")}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        resetPasswordAction === "direct_reset"
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Key className="h-4 w-4" />
                        <span className="text-sm font-medium">Set Password</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Set a new password for the user directly
                      </p>
                    </button>
                  </div>
                </div>

                {resetPasswordAction === "direct_reset" && (
                  <>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          Use this only if the user cannot access their email. The password will be set immediately.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">New Password *</Label>
                      <p className="text-[10px] text-muted-foreground">Min 8 chars, 3 of: uppercase, lowercase, number, special char</p>
                      <div className="relative">
                        <Input
                          type={showResetPwd ? "text" : "password"}
                          value={resetPasswordNewPwd}
                          onChange={(e) => setResetPasswordNewPwd(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="pr-10"
                        />
                        <PasswordToggle visible={showResetPwd} onToggle={() => setShowResetPwd(!showResetPwd)} />
                      </div>
                      <PasswordStrengthMeter password={resetPasswordNewPwd} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Confirm New Password *</Label>
                      <div className="relative">
                        <Input
                          type={showResetPwdConfirm ? "text" : "password"}
                          value={resetPasswordConfirmPwd}
                          onChange={(e) => setResetPasswordConfirmPwd(e.target.value)}
                          placeholder="Confirm new password"
                          className="pr-10"
                        />
                        <PasswordToggle visible={showResetPwdConfirm} onToggle={() => setShowResetPwdConfirm(!showResetPwdConfirm)} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePasswordReset} disabled={resetPasswordLoading}>
                {resetPasswordLoading ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                ) : resetPasswordAction === "send_link" ? (
                  <><Mail className="h-4 w-4 mr-1" /> Send Reset Link</>
                ) : (
                  <><Key className="h-4 w-4 mr-1" /> Set Password</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Permanent delete deactivated user (SUPER_ADMIN) */}
      <AlertDialog
        open={!!deleteUserTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteUserTarget(null);
            setDeleteConfirmName("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This will permanently remove{" "}
                  <span className="font-medium text-foreground">{safeText(deleteUserTarget?.name)}</span>
                  {" "}({safeText(deleteUserTarget?.email)}). This cannot be undone.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="delete-confirm-name" className="text-foreground">
                    Type <span className="font-semibold">{safeText(deleteUserTarget?.name)}</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm-name"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={deleteUserTarget?.name || ""}
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={
                deleteUserLoading ||
                !deleteUserTarget ||
                deleteConfirmName.trim() !== deleteUserTarget.name.trim()
              }
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteUser();
              }}
            >
              {deleteUserLoading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting...</>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
