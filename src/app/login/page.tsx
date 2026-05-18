"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Eye, EyeOff, LogOut, Mail, Shield } from "lucide-react";
import { toast } from "sonner";
import LoadingScreen from "@/components/ui/loading-screen";

// Session expiry reason messages
const sessionReasonMessages: Record<string, { title: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  timeout: {
    title: "Session Expired",
    description: "Your session has expired due to 15 minutes of inactivity. Please sign in again.",
    icon: Clock,
  },
  kicked: {
    title: "Signed Out",
    description: "You have been signed out because your account was logged in from another device. Only one device can be active at a time.",
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
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [setupLogs, setSetupLogs] = useState<string[]>([]);
  const router = useRouter();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const sessionReason = searchParams.get("reason");

  // SECURITY: Validate callbackUrl — must be a relative path to prevent open redirects
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const callbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")
    ? rawCallbackUrl
    : "/dashboard";

  // If already logged in, redirect
  useEffect(() => {
    if (status !== "authenticated" || !session) return;

    const role = session.user?.role;
    if (role === "CLIENT") {
      router.replace(callbackUrl.startsWith("/portal") ? callbackUrl : "/portal");
    } else {
      router.replace(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  // Check if database has users
  useEffect(() => {
    fetch("/api/setup")
      .then(r => r.json())
      .then(data => {
        setDbReady(
          data.status === "already_setup" || data.status === "success" || data.status === "error"
            ? true
            : data.status === "needs_setup"
              ? false
              : true // Unknown status — allow login attempt
        );
      })
      .catch(() => setDbReady(true)); // Network error — don't block login
  }, []);

  // While session is loading or authenticated+redirecting, show shared loading screen
  if (status === "loading" || (status === "authenticated" && session)) {
    return <LoadingScreen />;
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
    } catch (err: any) {
      toast.error("Failed to set up database. Please try again.");
      setSetupLogs(prev => [...prev, "Network error: " + (err.message || "Unknown")]);
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
        redirect: false,
      });

      if (result?.error) {
        toast.error("Invalid credentials. Please try again.");
        setLoading(false);
      } else {
        toast.success("Login successful!");
        setTimeout(() => router.refresh(), 300);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      <div className="relative w-full max-w-md space-y-6 animate-[fade-in_0.5s_ease-out]">
        {/* Brand Header */}
        <div className="text-center space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-16 w-40">
              <div className="absolute -inset-3 rounded-2xl bg-primary/5 blur-2xl animate-pulse" />
              <Image
                src="/200px.png"
                alt="TrishulHub"
                fill
                className="relative z-10 rounded-xl object-contain"
                priority
                sizes="160px"
              />
            </div>
            <div>
              <h1 className="text-4xl font-black text-primary tracking-tight">TrishulHub</h1>
              <p className="text-sm font-semibold text-muted-foreground mt-1">Project Management Dashboard</p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">Sign in to manage your projects, team, and workflow</p>
        </div>

        {/* Show setup button if database is not ready */}
        {dbReady === false && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="text-orange-700 dark:text-orange-400">First Time Setup</CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                The database needs to be set up before you can sign in. Click the button below to create the database, tables, and default admin user automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white h-11 text-base font-semibold"
                onClick={handleSetup}
                disabled={seeding}
              >
                {seeding ? "Setting up database..." : "Setup Database & Create Admin User"}
              </Button>
              <p className="text-xs text-orange-500 text-center">
                Creates: database, all tables, 5 users, 3 clients, 3 projects, and sample data
              </p>
              {setupLogs.length > 0 && (
                <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded text-xs font-mono max-h-40 overflow-y-auto space-y-1">
                  {setupLogs.map((log, i) => (
                    <div key={i} className="text-orange-700 dark:text-orange-300">{log}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Session expiry notification */}
        {sessionReason && sessionReasonMessages[sessionReason] && (
          <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                {(() => {
                  const IconComp = sessionReasonMessages[sessionReason].icon;
                  return <IconComp className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />;
                })()}
                <div>
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                    {sessionReasonMessages[sessionReason].title}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    {sessionReasonMessages[sessionReason].description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription className="text-sm">Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <div className="relative">
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
                    className="h-11 text-base pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                Contact your administrator to reset your password
              </p>
              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {dbReady === null && (
          <p className="text-center text-xs text-muted-foreground">Checking database status...</p>
        )}
      </div>
    </div>
  );
}
