"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Shield, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingScreen from "@/components/ui/loading-screen";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setError("No reset token provided. Please request a new password reset link.");
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`/api/password-reset?token=${token}`);
        const data = await res.json();
        if (data.valid) {
          setValid(true);
          setUserName(data.userName || "User");
        } else {
          setValid(false);
          setError(data.error || "Invalid or expired reset link");
        }
      } catch {
        setError("Failed to validate reset link");
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    // Client-side complexity check (mirrors server validation)
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one letter and one number");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setResetting(true);
    setError("");
    try {
      const res = await fetch("/api/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to reset password");
      }
    } catch {
      setError("Failed to reset password. Please try again.");
    } finally {
      setResetting(false);
    }
  };

  if (validating) {
    return <LoadingScreen message="Validating reset link..." />;
  }

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-green-500/[0.03] blur-3xl" />
        </div>
        <Card className="relative w-full max-w-md animate-[fade-in_0.5s_ease-out]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-green-500/10 blur-xl animate-pulse" />
              <CheckCircle2 className="relative h-14 w-14 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Password Reset Successful!</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              Your password has been reset. You can now log in with your new password.
            </p>
            <Button onClick={() => router.push("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-red-500/[0.03] blur-3xl" />
        </div>
        <Card className="relative w-full max-w-md animate-[fade-in_0.5s_ease-out]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-red-500/10 blur-xl" />
              <XCircle className="relative h-14 w-14 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Invalid Reset Link</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">{error}</p>
            <Button variant="outline" onClick={() => router.push("/login")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <Card className="relative w-full max-w-md animate-[fade-in_0.5s_ease-out]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="relative h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl" />
              <Shield className="relative h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl">Reset Your Password</CardTitle>
          <CardDescription>
            Hello {userName}, please set your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">New Password *</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                placeholder="Min. 8 chars, letters + numbers"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirm New Password *</Label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                placeholder="Confirm your new password"
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
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <Button className="w-full" onClick={handleReset} disabled={resetting}>
            {resetting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resetting...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
