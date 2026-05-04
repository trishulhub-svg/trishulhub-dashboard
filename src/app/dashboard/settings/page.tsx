"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Settings, User, Bell, Palette, Shield, Moon, Sun, Monitor,
  Users, UserPlus, Loader2, Pencil, Trash2, CheckCircle2, XCircle,
  Mail, Server, Plus, TestTube, AlertCircle, Key, Clock, Filter, Eye, EyeOff,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
import { Skeleton } from "@/components/ui/skeleton";

// ─── Team Member Type ──────────────────────────────────────────
interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  isActive: boolean;
  createdAt: string;
}

// ─── Email Log Type ────────────────────────────────────────────
interface EmailLog {
  id: string;
  to: string;
  subject: string;
  type: string;
  status: string;
  smtpHost: string | null;
  method: string | null;
  error: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

// ─── Relative Time Helper ──────────────────────────────────────
function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(session?.user?.name || "");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [budgetAlerts, setBudgetAlerts] = useState(true);

  // ── Change Password state (OTP flow) ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [passwordOtpCode, setPasswordOtpCode] = useState("");

  // Team Management state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("DEVELOPER");
  const [newUserDepartment, setNewUserDepartment] = useState("");

  // Edit role state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");
  const [editRoleLoading, setEditRoleLoading] = useState(false);

  // Email Change state
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmailAddress, setNewEmailAddress] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  // SMTP Config state (SUPER_ADMIN only)
  const [smtpConfigs, setSmtpConfigs] = useState<any[]>([]);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [smtpEditId, setSmtpEditId] = useState<string | null>(null);
  const [smtpForm, setSmtpForm] = useState({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: "TrishulHub", secure: false, isPrimary: true });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Email Logs state (SUPER_ADMIN only)
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailLogsTotal, setEmailLogsTotal] = useState(0);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailLogTypeFilter, setEmailLogTypeFilter] = useState<string>("ALL");
  const [emailLogStatusFilter, setEmailLogStatusFilter] = useState<string>("ALL");
  const [clearingLogs, setClearingLogs] = useState(false);

  // Password Reset Dialog state (SUPER_ADMIN only)
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<TeamMember | null>(null);
  const [resetPasswordAction, setResetPasswordAction] = useState<"send_link" | "direct_reset">("send_link");
  const [resetPasswordNewPwd, setResetPasswordNewPwd] = useState("");
  const [resetPasswordConfirmPwd, setResetPasswordConfirmPwd] = useState("");
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Password visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showResetPwdConfirm, setShowResetPwdConfirm] = useState(false);
  const [showEmailChangePassword, setShowEmailChangePassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const userRole = (session?.user as { role?: string })?.role || "DEVELOPER";
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  // Sync name with session
  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  // ── Fetch Team Members ──
  const fetchTeamMembers = useCallback(async () => {
    if (!isSuperAdmin) return;
    setTeamLoading(true);
    try {
      const res = await fetch("/api/team?type=users", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTeamMembers(data);
      } else {
        toast.error("Failed to load team members");
      }
    } catch (err) {
      console.error("Failed to fetch team members:", err);
    } finally {
      setTeamLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  // ── Fetch SMTP Configs ──
  const fetchSmtpConfigs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setSmtpLoading(true);
    try {
      const res = await fetch("/api/smtp", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSmtpConfigs(data);
      } else {
        toast.error("Failed to load SMTP configurations");
      }
    } catch (err) {
      console.error("Failed to fetch SMTP configs:", err);
    } finally {
      setSmtpLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchSmtpConfigs();
  }, [fetchSmtpConfigs]);

  // ── Fetch Email Logs ──
  const fetchEmailLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setEmailLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (emailLogTypeFilter !== "ALL") params.set("type", emailLogTypeFilter);
      if (emailLogStatusFilter !== "ALL") params.set("status", emailLogStatusFilter);
      const res = await fetch(`/api/email-logs?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEmailLogs(data.logs || []);
        setEmailLogsTotal(data.total || 0);
      } else {
        toast.error("Failed to load email logs");
      }
    } catch (err) {
      console.error("Failed to fetch email logs:", err);
    } finally {
      setEmailLogsLoading(false);
    }
  }, [isSuperAdmin, emailLogTypeFilter, emailLogStatusFilter]);

  useEffect(() => {
    fetchEmailLogs();
  }, [fetchEmailLogs]);

  // ── Add User ──
  const handleAddUser = async () => {
    if (!newUserName || !newUserEmail || !newUserPassword) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (newUserPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setAddUserLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "user",
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          department: newUserDepartment || null,
        }),
      });

      if (res.ok) {
        toast.success("User added successfully");
        setAddUserOpen(false);
        setNewUserName("");
        setNewUserEmail("");
        setNewUserPassword("");
        setNewUserRole("DEVELOPER");
        setNewUserDepartment("");
        fetchTeamMembers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add user");
      }
    } catch {
      toast.error("Failed to add user");
    } finally {
      setAddUserLoading(false);
    }
  };

  // ── Update User Role ──
  const handleUpdateRole = async (userId: string, role: string) => {
    setEditRoleLoading(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "user", id: userId, role }),
      });

      if (res.ok) {
        toast.success("Role updated successfully");
        setEditingUserId(null);
        fetchTeamMembers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    } finally {
      setEditRoleLoading(false);
    }
  };

  // ── Toggle User Active ──
  const handleToggleActive = async (userId: string, currentActive: boolean, memberRole: string) => {
    if (memberRole === "SUPER_ADMIN") {
      toast.error("Cannot deactivate SUPER_ADMIN users");
      return;
    }
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "user", id: userId, isActive: !currentActive }),
      });

      if (res.ok) {
        toast.success(currentActive ? "User deactivated" : "User activated");
        fetchTeamMembers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update user status");
      }
    } catch {
      toast.error("Failed to update user status");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: (session?.user as any)?.id,
          name: name,
        }),
      });
      if (res.ok) {
        toast.success("Settings saved successfully!");
        await updateSession();
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // ── Change Password: Step 1 – Send OTP ──
  const handlePasswordSendOtp = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/password-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordOtpSent(true);
        toast.success(data.message || "OTP sent to your email");
      } else {
        toast.error(data.error || "Failed to send OTP");
      }
    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Change Password: Step 2 – Verify OTP & Change ──
  const handlePasswordVerifyOtp = async () => {
    if (!passwordOtpCode) {
      toast.error("Please enter the OTP");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/password-change", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp: passwordOtpCode, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordOtpCode("");
        setPasswordOtpSent(false);
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        // If server requires re-auth (session invalidated after password change),
        // sign out and redirect to login
        if (data.requiresReauth) {
          setTimeout(() => {
            signOut({ callbackUrl: "/login?reason=password_changed" });
          }, 1500);
        }
      } else {
        toast.error(data.error || "Failed to change password");
      }
    } catch {
      toast.error("Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Email Change: Send OTP ──
  const handleSendOTP = async () => {
    if (!newEmailAddress || !emailChangePassword) {
      toast.error("New email and current password are required");
      return;
    }
    setEmailChangeLoading(true);
    try {
      const res = await fetch("/api/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newEmail: newEmailAddress, currentPassword: emailChangePassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        toast.success(data.message || "OTP sent to your new email");
      } else {
        toast.error(data.error || "Failed to send OTP");
      }
    } catch {
      toast.error("Failed to send OTP");
    } finally {
      setEmailChangeLoading(false);
    }
  };

  // ── Email Change: Verify OTP ──
  const handleVerifyOTP = async () => {
    if (!otpCode) {
      toast.error("Please enter the OTP");
      return;
    }
    setEmailChangeLoading(true);
    try {
      const res = await fetch("/api/email-change", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp: otpCode, newEmail: newEmailAddress }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Email changed successfully!");
        setChangeEmailOpen(false);
        setNewEmailAddress("");
        setEmailChangePassword("");
        setOtpCode("");
        setOtpSent(false);
        // If the server requires re-auth (session invalidated after email change),
        // sign out and redirect to login
        if (data.requiresReauth) {
          setTimeout(() => {
            signOut({ callbackUrl: "/login?reason=email_changed" });
          }, 1500);
        } else {
          // Refresh session to reflect new email
          setTimeout(() => window.location.reload(), 1000);
        }
      } else {
        toast.error(data.error || "OTP verification failed");
      }
    } catch {
      toast.error("OTP verification failed");
    } finally {
      setEmailChangeLoading(false);
    }
  };

  // ── SMTP: Save Config ──
  const handleSaveSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username || !smtpForm.fromEmail) {
      toast.error("Host, username, and from email are required");
      return;
    }
    // Password is required for new configs, optional when editing (leave blank to keep current)
    if (!smtpEditId && !smtpForm.password) {
      toast.error("Password is required for new SMTP configurations");
      return;
    }
    setSmtpSaving(true);
    try {
      const url = "/api/smtp";
      const method = smtpEditId ? "PATCH" : "POST";
      const body = smtpEditId
        ? { id: smtpEditId, ...smtpForm }
        : smtpForm;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(smtpEditId ? "SMTP config updated" : "SMTP config added");
        setSmtpDialogOpen(false);
        setSmtpEditId(null);
        setSmtpForm({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: "TrishulHub", secure: false, isPrimary: true });
        fetchSmtpConfigs();
      } else {
        // Show detailed error for debugging - includes backend detail if available
        const errorDetail = data.detail ? ` (${data.detail})` : "";
        toast.error(`${data.error || "Failed to save SMTP config"}${errorDetail}`, { duration: 8000 });
      }
    } catch (err: any) {
      // Network error or timeout - likely Vercel function timeout
      toast.error("Network error saving SMTP. This may be a timeout - try clicking Add again.", { duration: 8000 });
    } finally {
      setSmtpSaving(false);
    }
  };

  // ── SMTP: Test Connection ──
  const handleTestSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username) {
      toast.error("Host and username are required to test");
      return;
    }
    if (!smtpForm.password) {
      toast.error(smtpEditId ? "Enter the password to test the connection (current password is not shown)" : "Password is required to test");
      return;
    }
    setSmtpTesting(true);
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(smtpForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("SMTP connection successful!");
      } else {
        toast.error(data.error || "SMTP connection failed");
      }
    } catch {
      toast.error("SMTP connection test failed");
    } finally {
      setSmtpTesting(false);
    }
  };

  // ── SMTP: Delete Config ──
  const handleDeleteSmtp = async (id: string) => {
    if (!confirm("Are you sure you want to delete this SMTP configuration?")) return;
    try {
      const res = await fetch(`/api/smtp?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("SMTP config deleted");
        fetchSmtpConfigs();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete SMTP config");
    }
  };

  // ── SMTP: Edit Config ──
  const handleEditSmtp = (config: any) => {
    setSmtpEditId(config.id);
    setSmtpForm({
      host: config.host,
      port: config.port,
      username: config.username,
      password: "", // Don't prefill password - user must re-enter
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      secure: config.secure,
      isPrimary: config.isPrimary,
    });
    setSmtpDialogOpen(true);
  };

  // ── Email Logs: Clear Old Logs ──
  const handleClearOldLogs = async () => {
    if (!confirm("Are you sure you want to delete email logs older than 30 days?")) return;
    setClearingLogs(true);
    try {
      const res = await fetch("/api/email-logs?olderThanDays=30", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Deleted ${data.deleted} old log(s)`);
        fetchEmailLogs();
      } else {
        toast.error(data.error || "Failed to clear logs");
      }
    } catch {
      toast.error("Failed to clear logs");
    } finally {
      setClearingLogs(false);
    }
  };

  // ── Password Reset: Handle Action ──
  const handlePasswordReset = async () => {
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
    }

    setResetPasswordLoading(true);
    try {
      const body: Record<string, any> = {
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
      const data = await res.json();
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
  };

  // ── Open Reset Password Dialog ──
  const openResetPasswordDialog = (member: TeamMember) => {
    setResetPasswordUser(member);
    setResetPasswordAction("send_link");
    setResetPasswordNewPwd("");
    setResetPasswordConfirmPwd("");
    setShowResetPwd(false);
    setShowResetPwdConfirm(false);
    setResetPasswordOpen(true);
  };

  const roleBadgeColors: Record<string, string> = {
    SUPER_ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    ADMIN: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    DEVELOPER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    CLIENT: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  };

  const emailTypeLabels: Record<string, string> = {
    OTP: "OTP",
    PASSWORD_CHANGE: "Password Change",
    EMAIL_CHANGE: "Email Change",
    RESET_LINK: "Reset Link",
    DIRECT_RESET: "Direct Reset",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Manage your account and application settings</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Profile</CardTitle>
          </div>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <div className="flex gap-2">
                <Input value={session?.user?.email || ""} disabled className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => { setChangeEmailOpen(true); setOtpSent(false); setNewEmailAddress(""); setEmailChangePassword(""); setOtpCode(""); }}>
                  <Mail className="h-4 w-4 mr-1" /> Change
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Role</Label>
            <Badge variant="secondary">{userRole.replace("_", " ")}</Badge>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password - OTP Flow */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Change Password</CardTitle>
          </div>
          <CardDescription>Update your password securely with email verification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!passwordOtpSent ? (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">New Password</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      tabIndex={-1}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={handlePasswordSendOtp} disabled={changingPassword}>
                {changingPassword ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending OTP...</>
                ) : (
                  <><Mail className="h-4 w-4 mr-1" /> Send OTP</>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">OTP Sent</p>
                    <p className="text-[11px] text-green-600 dark:text-green-400">
                      An OTP has been sent to your email. Enter it below to confirm the password change.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">OTP Code *</Label>
                <Input
                  value={passwordOtpCode}
                  onChange={(e) => setPasswordOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                />
                <p className="text-[11px] text-muted-foreground">Check your email inbox. OTP expires in 10 minutes.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPasswordOtpSent(false);
                    setPasswordOtpCode("");
                  }}
                >
                  Back
                </Button>
                <Button size="sm" onClick={handlePasswordVerifyOtp} disabled={changingPassword}>
                  {changingPassword ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Verifying...</>
                  ) : (
                    <><Shield className="h-4 w-4 mr-1" /> Verify & Change Password</>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Appearance</CardTitle>
          </div>
          <CardDescription>Customize how TrishulHub looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block">Theme</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-2" /> Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-2" /> Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="flex-1"
              >
                <Monitor className="h-4 w-4 mr-2" /> System
              </Button>
              <Button
                variant={theme === "bluelight" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("bluelight")}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-2" /> Blue Light
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription>Configure how you receive notifications <span className="text-[10px] text-muted-foreground">(Coming soon — settings are not yet persisted)</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Receive email updates for important events</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Budget Alerts</p>
              <p className="text-xs text-muted-foreground">Get notified at 50%, 75%, and 90% budget usage</p>
            </div>
            <Switch checked={budgetAlerts} onCheckedChange={setBudgetAlerts} />
          </div>
        </CardContent>
      </Card>

      {/* Agent Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Agent Configuration</CardTitle>
          </div>
          <CardDescription>Configure how AI agents operate <span className="text-[10px] text-muted-foreground">(Coming soon — settings are not yet persisted)</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require Approval</p>
              <p className="text-xs text-muted-foreground">All agent outputs must be approved before being applied</p>
            </div>
            <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} />
          </div>
          <Separator />
          <div className="space-y-1">
            <Label className="text-xs">Auto-downgrade Threshold</Label>
            <Input type="number" defaultValue="80" className="w-24" />
            <p className="text-xs text-muted-foreground">Percentage of budget at which to switch to free models</p>
          </div>
        </CardContent>
      </Card>

      {/* Team Management - SUPER_ADMIN only */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Team Management</CardTitle>
                  <CardDescription>Manage team members, roles, and access</CardDescription>
                </div>
              </div>
              <Button size="sm" onClick={() => setAddUserOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> Add User
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {teamLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
                <p className="text-sm text-muted-foreground">No team members found</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Role</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate max-w-[120px]">{member.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[180px]">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          {editingUserId === member.id ? (
                            <div className="flex items-center gap-1">
                              <Select
                                value={editRoleValue}
                                onValueChange={(val) => setEditRoleValue(val)}
                              >
                                <SelectTrigger className="h-7 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                                  <SelectItem value="ADMIN">Admin</SelectItem>
                                  <SelectItem value="DEVELOPER">Developer</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={editRoleLoading}
                                onClick={() => handleUpdateRole(member.id, editRoleValue)}
                              >
                                {editRoleLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => setEditingUserId(null)}
                              >
                                <XCircle className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            </div>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={`text-[10px] cursor-pointer ${roleBadgeColors[member.role] || ""}`}
                              onClick={() => {
                                if (member.role !== "SUPER_ADMIN") {
                                  setEditingUserId(member.id);
                                  setEditRoleValue(member.role);
                                }
                              }}
                            >
                              {member.role.replace("_", " ")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={member.isActive}
                              onCheckedChange={() => handleToggleActive(member.id, member.isActive, member.role)}
                              disabled={member.role === "SUPER_ADMIN"}
                            />
                            <span className={`text-xs ${member.isActive ? "text-green-600" : "text-muted-foreground"}`}>
                              {member.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {member.role !== "SUPER_ADMIN" && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingUserId(member.id);
                                  setEditRoleValue(member.role);
                                }}
                                title="Change role"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openResetPasswordDialog(member)}
                                title="Reset password"
                              >
                                <Key className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SMTP Configuration - SUPER_ADMIN only */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">SMTP Configuration</CardTitle>
                  <CardDescription>Configure email servers for OTP delivery. Max 2 servers (primary + failover).</CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => { setSmtpEditId(null); setSmtpForm({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: "TrishulHub", secure: false, isPrimary: true }); setSmtpDialogOpen(true); }}
                disabled={smtpConfigs.length >= 2}
              >
                <Plus className="h-4 w-4 mr-1" /> Add SMTP
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {smtpLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (<Skeleton key={i} className="h-20 w-full rounded-lg" />))}
              </div>
            ) : smtpConfigs.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <Server className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
                <p className="text-sm text-muted-foreground">No SMTP servers configured</p>
                <p className="text-xs text-muted-foreground mt-1">Add a Brevo or other SMTP server to enable email verification</p>
              </div>
            ) : (
              <div className="space-y-3">
                {smtpConfigs.map((config) => (
                  <div key={config.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${config.isPrimary ? "bg-green-100 dark:bg-green-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                        <Server className={`h-4 w-4 ${config.isPrimary ? "text-green-600" : "text-blue-600"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{config.host}:{config.port}</span>
                          <Badge variant={config.isPrimary ? "default" : "secondary"} className="text-[10px]">
                            {config.isPrimary ? "Primary" : "Failover"}
                          </Badge>
                          {!config.isActive && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{config.username} &middot; From: {config.fromEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditSmtp(config)} title="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteSmtp(config.id)} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Email Logs - SUPER_ADMIN only */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Email Logs</CardTitle>
                  <CardDescription>Audit trail of all email activity</CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearOldLogs}
                disabled={clearingLogs}
              >
                {clearingLogs ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Clearing...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-1" /> Clear Old Logs</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={emailLogTypeFilter} onValueChange={setEmailLogTypeFilter}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="OTP">OTP</SelectItem>
                    <SelectItem value="PASSWORD_CHANGE">Password Change</SelectItem>
                    <SelectItem value="EMAIL_CHANGE">Email Change</SelectItem>
                    <SelectItem value="RESET_LINK">Reset Link</SelectItem>
                    <SelectItem value="DIRECT_RESET">Direct Reset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Select value={emailLogStatusFilter} onValueChange={setEmailLogStatusFilter}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {emailLogsTotal} log{emailLogsTotal !== 1 ? "s" : ""} found
              </span>
            </div>

            {/* Logs Table */}
            {emailLogsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : emailLogs.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <Mail className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
                <p className="text-sm text-muted-foreground">No email logs found</p>
                <p className="text-xs text-muted-foreground mt-1">Email activity will appear here when emails are sent</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">To</TableHead>
                      <TableHead className="text-xs">Subject</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">SMTP</TableHead>
                      <TableHead className="text-xs">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emailLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {emailTypeLabels[log.type] || log.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {log.to}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[180px]" title={log.subject}>
                          {log.subject}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              log.status === "SENT"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                : log.status === "FAILED"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                : ""
                            }`}
                          >
                            {log.status}
                          </Badge>
                          {log.status === "FAILED" && log.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[120px]" title={log.error}>
                              {log.error}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {log.smtpHost || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {getRelativeTime(log.createdAt)}
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
      )}

      {/* System Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">System Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Platform</span>
              <span>TrishulHub AI Agent Dashboard</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Framework</span>
              <span>Next.js 16</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add New User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email *</Label>
              <Input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password *</Label>
              <div className="relative">
                <Input
                  type={showNewUserPassword ? "text" : "password"}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                  tabIndex={-1}
                >
                  {showNewUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="DEVELOPER">Developer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEV">Development</SelectItem>
                    <SelectItem value="SALES">Sales</SelectItem>
                    <SelectItem value="FINANCE">Finance</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="CONTENT">Content</SelectItem>
                    <SelectItem value="SUPPORT">Support</SelectItem>
                    <SelectItem value="MANAGEMENT">Management</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={addUserLoading}>
              {addUserLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" /> Add User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Change Dialog */}
      <Dialog open={changeEmailOpen} onOpenChange={setChangeEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Change Email Address
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">Current email</p>
              <p className="text-sm font-medium">{session?.user?.email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New Email Address *</Label>
              <Input
                type="email"
                value={newEmailAddress}
                onChange={(e) => setNewEmailAddress(e.target.value)}
                placeholder="new-email@example.com"
                disabled={otpSent}
              />
              <p className="text-[11px] text-muted-foreground">Disposable/temporary emails are not allowed</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Current Password *</Label>
              <div className="relative">
                <Input
                  type={showEmailChangePassword ? "text" : "password"}
                  value={emailChangePassword}
                  onChange={(e) => setEmailChangePassword(e.target.value)}
                  placeholder="Confirm your current password"
                  disabled={otpSent}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowEmailChangePassword(!showEmailChangePassword)}
                  tabIndex={-1}
                >
                  {showEmailChangePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {otpSent && (
              <div className="space-y-1">
                <Label className="text-xs">OTP Code *</Label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                />
                <p className="text-[11px] text-muted-foreground">Check your new email inbox. OTP expires in 10 minutes.</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setChangeEmailOpen(false);
              setOtpSent(false);
              setNewEmailAddress("");
              setEmailChangePassword("");
              setOtpCode("");
            }}>
              Cancel
            </Button>
            {!otpSent ? (
              <Button onClick={handleSendOTP} disabled={emailChangeLoading}>
                {emailChangeLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                Send OTP
              </Button>
            ) : (
              <Button onClick={handleVerifyOTP} disabled={emailChangeLoading}>
                {emailChangeLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Verify & Change Email
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SMTP Config Dialog */}
      <Dialog open={smtpDialogOpen} onOpenChange={setSmtpDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              {smtpEditId ? "Edit SMTP Configuration" : "Add SMTP Configuration"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Brevo SMTP Settings</p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">Host: smtp-relay.brevo.com &middot; Port: 587 &middot; SSL/TLS: OFF (uses STARTTLS) &middot; Username: your login email &middot; Password: your SMTP key</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">SMTP Host *</Label>
                <Input
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                  placeholder="smtp-relay.brevo.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Port</Label>
                <Input
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 587 })}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Username *</Label>
                <Input
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                  placeholder="your-email@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{smtpEditId ? "New Password (leave blank to keep)" : "Password *"}</Label>
                <Input
                  type="password"
                  value={smtpForm.password}
                  onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                  placeholder={smtpEditId ? "Leave blank to keep current" : "SMTP key/password"}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">From Email *</Label>
                <Input
                  type="email"
                  value={smtpForm.fromEmail}
                  onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })}
                  placeholder="noreply@yourdomain.com"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From Name</Label>
                <Input
                  value={smtpForm.fromName}
                  onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })}
                  placeholder="TrishulHub"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.secure}
                  onCheckedChange={(val) => setSmtpForm({ ...smtpForm, secure: val, port: val ? 465 : 587 })}
                />
                <div>
                  <Label className="text-xs">SSL/TLS (Implicit)</Label>
                  <p className="text-[10px] text-muted-foreground">{smtpForm.secure ? "Port 465 - Direct SSL" : "Port 587 - STARTTLS auto-upgrade"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.isPrimary}
                  onCheckedChange={(val) => setSmtpForm({ ...smtpForm, isPrimary: val })}
                />
                <Label className="text-xs">Primary Server</Label>
              </div>
            </div>
          </div>
          <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-[11px] text-amber-700 dark:text-amber-300"><strong>Tip:</strong> Click "Test" first to verify your SMTP connection before adding.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleTestSmtp()} disabled={smtpTesting}>
              {smtpTesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}
              Test
            </Button>
            <Button variant="outline" onClick={() => setSmtpDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSmtp} disabled={smtpSaving}>
              {smtpSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {smtpEditId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog (SUPER_ADMIN) */}
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
                <p className="text-sm font-medium">{resetPasswordUser.name}</p>
                <p className="text-xs text-muted-foreground">{resetPasswordUser.email}</p>
              </div>

              {/* Action selection */}
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
                      <span className="text-sm font-medium">Direct Reset</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Set a new password for the user directly
                    </p>
                  </button>
                </div>
              </div>

              {/* Direct Reset fields */}
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
                    <div className="relative">
                      <Input
                        type={showResetPwd ? "text" : "password"}
                        value={resetPasswordNewPwd}
                        onChange={(e) => setResetPasswordNewPwd(e.target.value)}
                        placeholder="Min. 8 characters"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowResetPwd(!showResetPwd)}
                        tabIndex={-1}
                      >
                        {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowResetPwdConfirm(!showResetPwdConfirm)}
                        tabIndex={-1}
                      >
                        {showResetPwdConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
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
                <><Key className="h-4 w-4 mr-1" /> Reset Password</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
