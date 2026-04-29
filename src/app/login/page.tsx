"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("taroon@trishulhub.in");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [setupLogs, setSetupLogs] = useState<string[]>([]);
  const router = useRouter();
  const { data: session, status } = useSession();

  // If already logged in, redirect
  useEffect(() => {
    if (status === "authenticated" && session) {
      const role = (session.user as { role?: string })?.role;
      if (role === "CLIENT") {
        router.replace("/portal");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [status, session, router]);

  // Check if database has users
  useEffect(() => {
    fetch("/api/setup")
      .then(r => r.json())
      .then(data => {
        if (data.status === "already_setup" || data.status === "success") {
          setDbReady(true);
        } else if (data.status === "error" && data.logs) {
          setDbReady(false);
        } else {
          setDbReady(false);
        }
      })
      .catch(() => {
        setDbReady(false);
      });
  }, []);

  // Show loading spinner while checking session
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-5">
        <Image
          src="/200px.png"
          alt="TrishulHub"
          width={120}
          height={48}
          className="rounded-lg"
          priority
        />
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    );
  }

  // Don't render the login form if already authenticated
  if (status === "authenticated" && session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-5">
        <Image
          src="/200px.png"
          alt="TrishulHub"
          width={120}
          height={48}
          className="rounded-lg"
          priority
        />
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    );
  }

  const handleSetup = async () => {
    setSeeding(true);
    setSetupLogs(["Starting setup..."]);
    try {
      const res = await fetch("/api/setup", { method: "POST", credentials: 'include' });
      const data = await res.json();

      if (data.logs) {
        setSetupLogs(data.logs);
      }

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
    }
    setSeeding(false);
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
        setTimeout(() => {
          router.refresh();
        }, 300);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header - BIGGER and bolder for PWA feel */}
        <div className="text-center space-y-5">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-40">
              <Image
                src="/200px.png"
                alt="TrishulHub"
                fill
                className="rounded-xl object-contain"
                priority
                sizes="160px"
              />
            </div>
            <div>
              <h1 className="text-4xl font-black text-primary tracking-tight">TrishulHub</h1>
              <p className="text-base font-semibold text-foreground mt-1">AI Agent Dashboard</p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">Sign in to manage your AI agents and projects</p>
        </div>

        {/* Show setup button if database is not ready */}
        {dbReady === false && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="text-orange-700 dark:text-orange-400">First Time Setup</CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                The database needs to be set up before you can sign in. Click the button below — it will create the database, tables, and default admin user automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white h-11 text-base font-semibold"
                onClick={handleSetup}
                disabled={seeding}
              >
                {seeding ? "Setting up database... (please wait)" : "Setup Database & Create Admin User"}
              </Button>
              <p className="text-xs text-orange-500 text-center">
                This creates: database file, all tables, 5 users, 7 AI agents, 3 clients, 3 projects, and sample data
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
                  placeholder="taroon@trishulhub.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 text-base"
                />
              </div>
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
