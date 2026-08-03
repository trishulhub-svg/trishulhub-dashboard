"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Settings, User, Bell, Palette, Shield, Moon, Sun, Monitor,
  Loader2, CheckCircle2, Mail, AlertCircle,
  Eye, EyeOff, Upload, Camera, Trash2,
} from "lucide-react";
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
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const APP_VERSION = "1.0.0";
const APP_NAME = "TrishulHub";
const PREFS_FETCH_TIMEOUT_MS = 10000;
const QUIET_HOURS_DEBOUNCE_MS = 300;


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
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEmailChangePassword, setShowEmailChangePassword] = useState(false);

  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmailAddress, setNewEmailAddress] = useState("");
  const [emailChangePassword, setEmailChangePassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quietHoursDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsAbortRef = useRef<AbortController | null>(null);
  const prefsSnapshotRef = useRef<NotificationPrefs>(DEFAULT_PREFS);

  const userRole = session?.user?.role || "DEVELOPER";
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
      <SettingsSection
        icon={<Camera className="h-5 w-5" />}
        title="Profile Image"
        description="Upload a profile picture. PNG, JPEG, WebP, or GIF up to 2 MB."
        defaultOpen
      >

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
        
      </SettingsSection>

      {/* Profile */}
      <SettingsSection
        icon={<User className="h-5 w-5" />}
        title="Profile"
        description="Your personal information"
        defaultOpen
      >
        <div className="space-y-4">
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
        
        </div>
      </SettingsSection>

      {/* Change Password */}
      <SettingsSection
        icon={<Shield className="h-5 w-5" />}
        title="Change Password"
        description="Update your password securely with email verification"
      >
        <div className="space-y-4">
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
        
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection
        icon={<Palette className="h-5 w-5" />}
        title="Appearance"
        description={`Customize how ${APP_NAME} looks for you`}
        defaultOpen
      >
        <div className="space-y-4">
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
        
        </div>
      </SettingsSection>

      {/* Notification Preferences */}
      <SettingsSection
        icon={<Bell className="h-5 w-5" />}
        title="Notification Preferences"
        description="Choose which alerts appear in your notification bell"
      >
        <div className="space-y-6">
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
                <h3 className="text-sm font-medium">In-app alerts</h3>
                {[
                  { key: "approvalAlerts" as const, label: "Approvals & reviews", desc: "Leave decisions, approval requests, and detail reviews" },
                  { key: "emailNotifications" as const, label: "Email notifications", desc: "Also send important updates by email when available" },
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
        
        </div>
      </SettingsSection>

      {/* System Information */}
      <SettingsSection
        icon={<Settings className="h-5 w-5" />}
        title="System Information"
        collapsible={false}
      >

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
        
      </SettingsSection>

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

    </div>
  );
}
