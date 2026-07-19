"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Eye, EyeOff, LogOut, Mail, Shield, X } from "lucide-react";
import { toast } from "sonner";
import LoadingScreen from "@/components/ui/loading-screen";
import Link from "next/link";
import { TurnstileCaptcha } from "@/components/auth/turnstile-captcha";

// Session expiry reason messages
const sessionReasonMessages: Record<string, { title: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  timeout: {
    title: "Session Expired",
    description: "Your session has expired. Please sign in again.",
    icon: Clock,
  },
  kicked: {
    title: "Signed Out",
    description: "You have been signed out because your account was logged in on another device. You can be logged in on up to 2 devices at a time — the oldest session is removed when a 3rd device connects.",
    icon: LogOut,
  },
  email_changed: {
    title: "Email Changed",
    description: "Your email was changed successfully. Please sign in again with your new email address.",
    icon: Mail,
  },
  password_changed: {
    title: "Password Changed",
    description: "Your password was changed successfully. Please sign in again with your new password.",
    icon: Shield,
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showReasonBanner, setShowReasonBanner] = useState(true);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [setupLogs, setSetupLogs] = useState<string[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const sessionReason = searchParams.get("reason");

  // SECURITY: Validate callbackUrl — must be a relative path to prevent open redirects
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const callbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//") && !rawCallbackUrl.startsWith("/\\")
    ? rawCallbackUrl
    : "/dashboard";

  function getRedirectUrl(role: string | undefined, callbackUrl: string) {
    if (role === "CLIENT") {
      return "/portal";
    }
    return callbackUrl || "/dashboard";
  }

  // If already logged in, redirect
  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const role = session.user?.role;
    router.replace(getRedirectUrl(role, callbackUrl));
  }, [status, session, router, callbackUrl]);

  // Auth challenge (CAPTCHA) — IP-based, no email oracle
  useEffect(() => {
    fetch("/api/auth/challenge")
      .then((r) => r.json())
      .then((data) => {
        if (data.siteKey) setSiteKey(data.siteKey);
        if (data.captchaRequired) setCaptchaRequired(true);
      })
      .catch(() => {});
  }, []);

  // Setup UI: only when explicitly requested (?setup=1) — public GET no longer reveals empty DB
  useEffect(() => {
    if (searchParams.get("setup") !== "1") {
      setDbReady(true);
      return;
    }
    setDbReady(false);
  }, [searchParams]);

  // Show toast for session reason on mount
  useEffect(() => {
    if (sessionReason && sessionReasonMessages[sessionReason]) {
      const msg = sessionReasonMessages[sessionReason];
      const IconComp = msg.icon;
      toast(`${msg.title}: ${msg.description}`, {
        duration: 8000,
        icon: <IconComp className="h-4 w-4" />,
      });
    }
  }, [sessionReason]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "authenticated" && session) {
    return <LoadingScreen message="Redirecting..." />;
  }

  const handleSetup = async () => {
    setSeeding(true);
    setSetupLogs(["Starting setup..."]);
    try {
      const res = await fetch("/api/setup", { method: "POST", credentials: 'include' });
      const data = await res.json();

      if (data.logs) setSetupLogs(data.logs);

      if (data.status === "success") {
        toast.success("Database set up successfully! You can now sign in.");
        setDbReady(true);
      } else if (data.status === "already_setup") {
        toast.success("Database already set up! You can sign in.");
        setDbReady(true);
      } else if (data.error) {
        toast.error("Setup failed: " + data.error);
      }
    } catch (err: unknown) {
      toast.error("Failed to set up database. Please try again.");
      const msg = err instanceof Error ? err.message : "Unknown";
      setSetupLogs(prev => [...prev, "Network error: " + msg]);
    } finally {
      setSeeding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        captchaToken: captchaToken || "",
        redirect: false,
      });

      if (result?.error) {
        const nextFails = failCount + 1;
        setFailCount(nextFails);
        if (siteKey && nextFails >= 3) setCaptchaRequired(true);
        toast.error("Invalid email or password.");
        setCaptchaToken(null);
        setLoading(false);
      } else {
        toast.success("Login successful!");
        setLoading(false);
        try {
          const sessionRes = await fetch("/api/auth/session");
          const sessionData = await sessionRes.json();
          const role = sessionData?.user?.role as string | undefined;
          window.location.href = getRedirectUrl(role, callbackUrl);
        } catch {
          window.location.href = callbackUrl || "/dashboard";
        }
      }
    } catch {
      toast.error("Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Animated gradient mesh background */}
      <div className="login-bg-mesh" aria-hidden="true">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
      </div>

      {/* Grid pattern overlay */}
      <div className="login-grid-pattern" aria-hidden="true" />

      {/* Bottom gradient fade */}
      <div className="login-bottom-fade" aria-hidden="true" />

      {/* Session reason overlay banner — fixed position, does NOT push content */}
      {showReasonBanner && sessionReason && sessionReasonMessages[sessionReason] && (
        <div className="fixed top-0 left-0 right-0 z-50 login-reason-banner">
          <div className="flex items-center justify-center gap-2 py-2.5 px-4 text-xs max-w-3xl mx-auto">
            {(() => {
              const IconComp = sessionReasonMessages[sessionReason].icon;
              return <IconComp className="h-3.5 w-3.5 shrink-0" />;
            })()}
            <span className="font-medium">{sessionReasonMessages[sessionReason].title}:</span>
            <span className="opacity-80 line-clamp-2">{sessionReasonMessages[sessionReason].description}</span>
            <button
              onClick={() => setShowReasonBanner(false)}
              className="ml-2 shrink-0 opacity-60 hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="login-content">
        <div className="login-card-area">
          {/* Brand Header */}
          <div className="login-brand animate-login-fade-up">
            <div className="login-logo-wrap">
              <div className="login-logo-glow" />
              <Image
                src="/200px.png"
                alt="TrishulHub"
                fill
                className="login-logo-img"
                priority
                sizes="140px"
              />
            </div>
            <div className="login-brand-text">
              <h1 className="login-title">TrishulHub</h1>
              <p className="login-subtitle">Technology</p>
            </div>
          </div>

          {/* Setup / seed UI — only when database explicitly needs setup */}
          {dbReady === false && (
            <Card className="login-setup-card animate-login-scale-in" style={{ animationDelay: '200ms' }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-orange-700 dark:text-orange-400 text-base">First Time Setup</CardTitle>
                <CardDescription className="text-orange-600 dark:text-orange-300 text-xs">
                  Database needs to be set up before you can sign in.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white h-10 text-sm font-semibold"
                  onClick={handleSetup}
                  disabled={seeding}
                >
                  {seeding ? "Setting up..." : "Seed Database"}
                </Button>
                <p className="text-[11px] text-orange-500 text-center">
                  Creates database, tables, users, clients, projects, and sample data
                </p>
                {setupLogs.length > 0 && (
                  <div className="mt-1 p-2 bg-white/50 dark:bg-black/20 rounded text-[11px] font-mono max-h-32 overflow-y-auto space-y-0.5">
                    {setupLogs.map((log, i) => (
                      <div key={i} className="text-orange-700 dark:text-orange-300">{log}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Login Card */}
          <Card className="login-main-card animate-login-scale-in" style={{ animationDelay: '300ms' }}>
            <CardHeader className="pb-3 pt-5 px-5">
              <CardTitle className="login-card-heading">Sign In</CardTitle>
              <CardDescription className="login-card-desc">Enter your credentials to access the dashboard</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                  <div className="login-input-wrap">
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="login-input h-10 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                  <div className="login-input-wrap">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      data-lpignore="true"
                      data-form-type="other"
                      className="login-input h-10 text-sm pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="login-eye-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                {(captchaRequired || (siteKey && failCount >= 3)) && siteKey && (
                  <TurnstileCaptcha siteKey={siteKey} onToken={setCaptchaToken} />
                )}
                <p className="text-[11px] text-muted-foreground text-right">
                  <Link href="/forgot-password" className="underline underline-offset-2 hover:text-foreground">
                    Forgot password?
                  </Link>
                </p>
                <Button
                  type="submit"
                  className="login-submit-btn w-full h-10 text-sm font-semibold"
                  disabled={loading || Boolean(captchaRequired && siteKey && !captchaToken)}
                >
                  {loading ? (
                    <span className="login-loading-wrap">
                      <span className="login-loading-spinner" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* DB status check runs in background — do not surface as primary UI when ready/unknown */}
          {dbReady === null && (
            <p className="login-db-status sr-only" aria-live="polite">
              Checking database status
            </p>
          )}
        </div>
      </div>
    </div>
  );
}