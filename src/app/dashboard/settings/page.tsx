"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Settings, User, Bell, Palette, Shield, Moon, Sun, Monitor,
  Loader2, CheckCircle2, Mail, Server, Plus, TestTube, AlertCircle,
  Eye, EyeOff, Upload, Camera, Pencil, Trash2,
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
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { safeArray } from "@/lib/utils";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const APP_VERSION = "1.0.0";
const APP_NAME = "TrishulHub";
const PREFS_FETCH_TIMEOUT_MS = 10000;
const QUIET_HOURS_DEBOUNCE_MS = 300;

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  passwordSet?: boolean;
}

interface NotificationPrefs {
  emailNotifications: boolean;
  budgetAlerts: boolean;
  meetingReminders: boolean;
  taskReminders: boolean;
  approvalAlerts: boolean;
  invoiceReminders: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

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

const roleBadgeColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  PROJECT_MANAGER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  DEVELOPER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CLIENT: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

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

const DEFAULT_PREFS: NotificationPrefs = {
  emailNotifications: true,
  budgetAlerts: true,
  meetingReminders: true,
  taskReminders: true,
  approvalAlerts: true,
  invoiceReminders: true,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};

export default function SettingsPage() {
  const { data: session, status, update: updateSession } = useSession();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(session?.user?.name || "");
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [passwordOtpCode, setPasswordOtpCode] = useState("");

  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmailAddress, setNewEmailAddress] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([]);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [smtpEditId, setSmtpEditId] = useState<string | null>(null);
  const [smtpForm, setSmtpForm] = useState({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: APP_NAME, secure: false, isPrimary: true });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpDeleteConfirm, setSmtpDeleteConfirm] = useState<string | null>(null);
  const [smtpDeleteLoading, setSmtpDeleteLoading] = useState(false);

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEmailChangePassword, setShowEmailChangePassword] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quietHoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsAbortRef = useRef<AbortController | null>(null);
  const prefsSnapshotRef = useRef<NotificationPrefs>(DEFAULT_PREFS);

  const userRole = session?.user?.role || "DEVELOPER";
  const isSuperAdmin = userRole === "SUPER_ADMIN";
  const isAdminOrAbove = userRole === "SUPER_ADMIN" || userRole === "ADMIN";

  const handlePasswordVerifyOtpRef = useRef<(() => void) | null>(null);
  const handleVerifyOTPRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    prefsSnapshotRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    if (passwordOtpSent && passwordOtpCode.length === 6 && !changingPassword) {
      handlePasswordVerifyOtpRef.current?.();
    }
  }, [passwordOtpCode, passwordOtpSent, changingPassword]);

  useEffect(() => {
    if (otpSent && otpCode.length === 6 && !emailChangeLoading) {
      handleVerifyOTPRef.current?.();
    }
  }, [otpCode, otpSent, emailChangeLoading]);

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  const isDirtyRef = useRef(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (quietHoursDebounceRef.current) clearTimeout(quietHoursDebounceRef.current);
      prefsAbortRef.current?.abort();
    };
  }, []);

  const fetchPrefs = useCallback(async () => {
    prefsAbortRef.current?.abort();
    const controller = new AbortController();
    prefsAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), PREFS_FETCH_TIMEOUT_MS);

    setPrefsLoading(true);
    setPrefsError(null);
    try {
      const res = await fetch("/api/notification-preferences", {
        credentials: "include",
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setPrefs({
          emailNotifications: data.emailNotifications ?? true,
          budgetAlerts: data.budgetAlerts ?? true,
          meetingReminders: data.meetingReminders ?? true,
          taskReminders: data.taskReminders ?? true,
          approvalAlerts: data.approvalAlerts ?? true,
          invoiceReminders: data.invoiceReminders ?? true,
          quietHoursEnabled: data.quietHoursEnabled ?? false,
          quietHoursStart: data.quietHoursStart || "22:00",
          quietHoursEnd: data.quietHoursEnd || "08:00",
        });
        setPrefsError(null);
      } else {
        setPrefsError("Failed to load notification preferences");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPrefsError("Timed out loading notification preferences");
      } else {
        console.error("[settings] Failed to fetch notification preferences:", err);
        setPrefsError("Failed to load notification preferences");
      }
    } finally {
      clearTimeout(timeoutId);
      setPrefsLoading(false);
    }
  }, []);

  const patchPrefs = useCallback(async (payload: Partial<NotificationPrefs>, rollback: NotificationPrefs) => {
    setPrefsSaving(true);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setPrefs(rollback);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save preference");
      }
    } catch {
      setPrefs(rollback);
      toast.error("Failed to save preference");
    } finally {
      setPrefsSaving(false);
    }
  }, []);

  const savePrefs = useCallback(async (key: keyof NotificationPrefs, value: boolean | string) => {
    const oldPrefs = prefsSnapshotRef.current;
    isDirtyRef.current = true;

    const next = { ...oldPrefs, [key]: value } as NotificationPrefs;
    setPrefs(next);

    // When enabling quiet hours, API requires start/end in the same PATCH
    if (key === "quietHoursEnabled" && value === true) {
      await patchPrefs(
        {
          quietHoursEnabled: true,
          quietHoursStart: oldPrefs.quietHoursStart,
          quietHoursEnd: oldPrefs.quietHoursEnd,
        },
        oldPrefs
      );
      return;
    }

    await patchPrefs({ [key]: value } as Partial<NotificationPrefs>, oldPrefs);
  }, [patchPrefs]);

  const handleQuietHoursTimeChange = useCallback((key: "quietHoursStart" | "quietHoursEnd", value: string) => {
    const oldPrefs = prefsSnapshotRef.current;
    isDirtyRef.current = true;
    setPrefs((prev) => ({ ...prev, [key]: value }));

    if (quietHoursDebounceRef.current) clearTimeout(quietHoursDebounceRef.current);
    quietHoursDebounceRef.current = setTimeout(() => {
      const snapshot = prefsSnapshotRef.current;
      const payload = { [key]: value } as Partial<NotificationPrefs>;
      // Prefer latest local value for the changed key
      payload[key] = value;
      patchPrefs(payload, { ...snapshot, [key]: oldPrefs[key] });
    }, QUIET_HOURS_DEBOUNCE_MS);
  }, [patchPrefs]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const fetchAvatar = useCallback(async () => {
    if (!session?.user?.id) return;
    setAvatarLoading(true);
    try {
      const res = await fetch("/api/team?type=me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setAvatar(typeof data.avatar === "string" ? data.avatar : null);
      }
    } catch (err) {
      console.error("[settings] Failed to fetch avatar:", err);
    } finally {
      setAvatarLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchAvatar();
  }, [fetchAvatar]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PNG, JPEG, WebP, or GIF image");
      return;
    }
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error("Image too large. Max size is 2 MB.");
      return;
    }

    setAvatarSaving(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAvatar(dataUrl);
        toast.success("Profile image updated");
      } else {
        toast.error(data.error || "Failed to upload profile image");
      }
    } catch (err) {
      console.error("[settings] Avatar upload failed:", err);
      toast.error("Failed to upload profile image");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAvatar(null);
        toast.success("Profile image removed");
      } else {
        toast.error(data.error || "Failed to remove profile image");
      }
    } catch (err) {
      console.error("[settings] Avatar remove failed:", err);
      toast.error("Failed to remove profile image");
    } finally {
      setAvatarSaving(false);
    }
  };

  const fetchSmtpConfigs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setSmtpLoading(true);
    try {
      const res = await fetch("/api/smtp", { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSmtpConfigs(safeArray(data));
      } else {
        toast.error("Failed to load SMTP configurations");
      }
    } catch (err) {
      console.error("[settings] Failed to fetch SMTP configs:", err);
    } finally {
      setSmtpLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchSmtpConfigs();
  }, [fetchSmtpConfigs]);

  const handleSave = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: session?.user?.id,
          name: name,
        }),
      });
      if (res.ok) {
        toast.success("Settings saved successfully!");
        await updateSession({ name: name });
        isDirtyRef.current = false;
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

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
    const complexityChecks = [
      /[A-Z]/.test(newPassword),
      /[a-z]/.test(newPassword),
      /[0-9]/.test(newPassword),
      /[^A-Za-z0-9]/.test(newPassword),
    ];
    if (complexityChecks.filter(Boolean).length < 3) {
      toast.error("Password must contain at least 3 of: uppercase letter, lowercase letter, number, special character");
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
      const data = await res.json().catch(() => ({}));
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
      const data = await res.json().catch(() => ({}));
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
  handlePasswordVerifyOtpRef.current = handlePasswordVerifyOtp;

  const handleResendPasswordOtp = async () => {
    setChangingPassword(true);
    try {
      const res = await fetch("/api/password-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "resend" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || "New OTP sent to your email");
      } else {
        toast.error(data.error || "Failed to resend OTP");
      }
    } catch {
      toast.error("Failed to resend OTP");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSendOTP = async () => {
    if (!newEmailAddress || !emailChangePassword) {
      toast.error("New email and current password are required");
      return;
    }
    if (!EMAIL_REGEX.test(newEmailAddress)) {
      toast.error("Please enter a valid email address");
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
      const data = await res.json().catch(() => ({}));
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || "Email changed successfully!");
        setChangeEmailOpen(false);
        setNewEmailAddress("");
        setEmailChangePassword("");
        setOtpCode("");
        setOtpSent(false);
        setTimeout(() => {
          signOut({ callbackUrl: "/login?reason=email_changed" });
        }, 1500);
      } else {
        toast.error(data.error || "OTP verification failed");
      }
    } catch {
      toast.error("OTP verification failed");
    } finally {
      setEmailChangeLoading(false);
    }
  };
  handleVerifyOTPRef.current = handleVerifyOTP;

  const handleResendEmailOtp = async () => {
    setEmailChangeLoading(true);
    try {
      const res = await fetch("/api/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newEmail: newEmailAddress, currentPassword: emailChangePassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || "New OTP sent to your new email");
      } else {
        toast.error(data.error || "Failed to resend OTP");
      }
    } catch {
      toast.error("Failed to resend OTP");
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const handleSaveSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username || !smtpForm.fromEmail) {
      toast.error("Host, username, and from email are required");
      return;
    }
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(smtpEditId ? "SMTP config updated" : "SMTP config added");
        setSmtpDialogOpen(false);
        setSmtpEditId(null);
        setSmtpForm({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: APP_NAME, secure: false, isPrimary: true });
        fetchSmtpConfigs();
      } else {
        toast.error(`${data.error || "Failed to save SMTP config"}`, { duration: 8000 });
      }
    } catch {
      console.error("[settings] SMTP save failed");
      toast.error("Network error saving SMTP. This may be a timeout - try clicking Add again.", { duration: 8000 });
    } finally {
      setSmtpSaving(false);
    }
  };

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
      const data = await res.json().catch(() => ({}));
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

  const handleDeleteSmtp = async (id: string) => {
    setSmtpDeleteLoading(true);
    try {
      const res = await fetch(`/api/smtp?id=${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast.success("SMTP config deleted");
        setSmtpDeleteConfirm(null);
        fetchSmtpConfigs();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete SMTP config");
    } finally {
      setSmtpDeleteLoading(false);
    }
  };

  const handleEditSmtp = (config: SmtpConfig) => {
    setSmtpEditId(config.id);
    setShowSmtpPassword(false);
    setSmtpForm({
      host: config.host,
      port: config.port,
      username: config.username,
      password: "",
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      secure: config.secure,
      isPrimary: config.isPrimary,
    });
    setSmtpDialogOpen(true);
  };

  if (status === "loading" || !session) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Settings" description="Manage your account and application settings" />

      {/* Profile Image */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Profile Image</CardTitle>
          </div>
          <CardDescription>Upload a profile picture. PNG, JPEG, WebP, or GIF up to 2 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Avatar className="h-20 w-20 border">
              {avatar ? (
                <AvatarImage src={avatar} alt={session?.user?.name || "Profile picture"} />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {(session?.user?.name || "U").split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={avatarSaving || avatarLoading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarSaving ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-1" /> {avatar ? "Change Image" : "Upload Image"}</>
                  )}
                </Button>
                {avatar && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={avatarSaving || avatarLoading}
                    onClick={handleAvatarRemove}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {avatarLoading ? "Loading current image..." :
                  avatar ? "Your profile image is shown to teammates and in the user menu." :
                  "No image uploaded yet. Your initials will be shown instead."}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarFileChange}
                className="hidden"
                aria-label="Upload profile image"
              />
            </div>
          </div>
        </CardContent>
      </Card>

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
              <Label className="text-xs" htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => { setName(e.target.value); isDirtyRef.current = true; }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    handleSave();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="profile-email">
                Email {isAdminOrAbove ? "" : <span className="text-muted-foreground">(read-only)</span>}
              </Label>
              <div className="flex gap-2">
                <Input id="profile-email" value={session?.user?.email || ""} disabled className="flex-1" />
                {isAdminOrAbove && (
                  <Button size="sm" variant="outline" onClick={() => { setChangeEmailOpen(true); setOtpSent(false); setNewEmailAddress(""); setEmailChangePassword(""); setOtpCode(""); }}>
                    <Mail className="h-4 w-4 mr-1" /> Change
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Role</Label>
            <Badge variant="secondary" className={roleBadgeColors[userRole] || ""}>{userRole.replace(/_/g, " ")}</Badge>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || name === session?.user?.name}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> :
             name === session?.user?.name ? "No Changes" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
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
                  <PasswordToggle visible={showCurrentPassword} onToggle={() => setShowCurrentPassword(!showCurrentPassword)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">New Password</Label>
                  <p className="text-[10px] text-muted-foreground">Min 8 chars, 3 of: uppercase, lowercase, number, special char</p>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <PasswordToggle visible={showNewPassword} onToggle={() => setShowNewPassword(!showNewPassword)} />
                  </div>
                  <PasswordStrengthMeter password={newPassword} />
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
                  <PasswordToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
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
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setPasswordOtpCode(val);
                  }}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">Check your email inbox. OTP expires in 10 minutes.</p>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    disabled={changingPassword}
                    onClick={handleResendPasswordOtp}
                  >
                    Resend OTP
                  </button>
                </div>
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

      {/* Appearance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Appearance</CardTitle>
          </div>
          <CardDescription>Customize how {APP_NAME} looks for you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs mb-2 block">Theme</Label>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTheme("light"); isDirtyRef.current = true; }}
                className="sm:flex-1 justify-center"
              >
                <Sun className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">Light</span>
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTheme("dark"); isDirtyRef.current = true; }}
                className="sm:flex-1 justify-center"
              >
                <Moon className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">Dark</span>
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTheme("system"); isDirtyRef.current = true; }}
                className="sm:flex-1 justify-center"
              >
                <Monitor className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">System</span>
              </Button>
              <Button
                variant={theme === "bluelight" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTheme("bluelight"); isDirtyRef.current = true; }}
                className="sm:flex-1 justify-center"
              >
                <Eye className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">Blue Light</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Notification Preferences</CardTitle>
          </div>
          <CardDescription>Configure how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {prefsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : prefsError ? (
            <div className="flex flex-col items-start gap-3 py-2">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{prefsError}</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => fetchPrefs()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Notification Types</h3>
                {[
                  { key: "emailNotifications" as const, label: "Email Notifications", desc: "Receive email for important updates" },
                  { key: "budgetAlerts" as const, label: "Budget Alerts", desc: "Get notified when expenses approach budget limits" },
                  { key: "taskReminders" as const, label: "Task Updates", desc: "Notifications when tasks are assigned or updated" },
                  { key: "approvalAlerts" as const, label: "Approval Requests", desc: "Alerts when approvals are pending" },
                  { key: "invoiceReminders" as const, label: "Invoice Updates", desc: "Notifications for invoice status changes" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={prefs[key]}
                      onCheckedChange={(checked) => savePrefs(key, checked)}
                    />
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Quiet Hours</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Enable Quiet Hours</Label>
                    <p className="text-xs text-muted-foreground">Pause notifications during specific hours</p>
                  </div>
                  <Switch
                    checked={prefs.quietHoursEnabled}
                    onCheckedChange={(checked) => savePrefs("quietHoursEnabled", checked)}
                  />
                </div>
                {prefs.quietHoursEnabled && (
                  <div className="flex items-center gap-4 ml-4">
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Input
                        type="time"
                        value={prefs.quietHoursStart}
                        onChange={(e) => handleQuietHoursTimeChange("quietHoursStart", e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <span className="text-muted-foreground mt-5">to</span>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Input
                        type="time"
                        value={prefs.quietHoursEnd}
                        onChange={(e) => handleQuietHoursTimeChange("quietHoursEnd", e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </div>
                )}
              </div>

              {prefsSaving && (
                <p className="text-xs text-muted-foreground">Saving...</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* SMTP Configuration - SUPER_ADMIN only */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">SMTP Configuration</CardTitle>
                  <CardDescription>Configure email servers for OTP delivery. Max 2 servers (primary + failover). Email delivery logs are under System → Email Logs.</CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => { setSmtpEditId(null); setSmtpForm({ host: "", port: 587, username: "", password: "", fromEmail: "", fromName: APP_NAME, secure: false, isPrimary: true }); setShowSmtpPassword(false); setSmtpDialogOpen(true); }}
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
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditSmtp(config)} title="Edit" aria-label="Edit SMTP config">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setSmtpDeleteConfirm(config.id)} title="Delete" aria-label="Delete SMTP config">
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

      {/* System Information */}
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
              <span>{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Platform</span>
              <span>TrishulHub Technology</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Framework</span>
              <span>Next.js 16</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Session</span>
              <span className="text-xs">{session?.user?.email}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Change Dialog */}
      <Dialog open={changeEmailOpen} onOpenChange={(open) => {
          setChangeEmailOpen(open);
          if (!open) {
            setOtpSent(false);
            setNewEmailAddress("");
            setEmailChangePassword("");
            setOtpCode("");
            setShowEmailChangePassword(false);
          }
        }}>
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
                <PasswordToggle visible={showEmailChangePassword} onToggle={() => setShowEmailChangePassword(!showEmailChangePassword)} />
              </div>
            </div>

            {otpSent && (
              <div className="space-y-1">
                <Label className="text-xs">OTP Code *</Label>
                <Input
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(val);
                  }}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">Check your new email inbox. OTP expires in 10 minutes.</p>
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    disabled={emailChangeLoading}
                    onClick={handleResendEmailOtp}
                  >
                    Resend OTP
                  </button>
                </div>
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
              <>
                <Button variant="outline" onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                }}>
                  Back
                </Button>
                <Button onClick={handleVerifyOTP} disabled={emailChangeLoading}>
                  {emailChangeLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Verify & Change Email
                </Button>
              </>
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
                <div className="relative">
                  <Input
                    type={showSmtpPassword ? "text" : "password"}
                    value={smtpForm.password}
                    onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                    placeholder={smtpEditId ? "Leave blank to keep current" : "SMTP key/password"}
                    className="pr-10"
                  />
                  <PasswordToggle visible={showSmtpPassword} onToggle={() => setShowSmtpPassword(!showSmtpPassword)} />
                </div>
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
                  placeholder={APP_NAME}
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
            <p className="text-[11px] text-amber-700 dark:text-amber-300"><strong>Tip:</strong> Click &quot;Test&quot; first to verify your SMTP connection before adding.</p>
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

      {/* SMTP Delete Confirmation Dialog */}
      <Dialog open={!!smtpDeleteConfirm} onOpenChange={(open) => !open && setSmtpDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete SMTP Configuration</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this SMTP configuration? Any emails using this server will fail until a new one is configured.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSmtpDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => smtpDeleteConfirm && handleDeleteSmtp(smtpDeleteConfirm)} disabled={smtpDeleteLoading}>
              {smtpDeleteLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Deleting...</> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
