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
    fetch("/api/seed")
      .then(r => r.json())
      .then(data => {
        if (data.skipped) {
          setDbReady(true);
        } else if (data.message && data.message.includes("success")) {
          setDbReady(true);
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    );
  }

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST", credentials: 'include' });
      const data = await res.json();
      if (data.skipped) {
        toast.success("Database already set up! You can sign in.");
        setDbReady(true);
      } else if (data.error) {
        toast.error("Setup failed: " + data.error);
      } else {
        toast.success("Database set up successfully! You can now sign in.");
        setDbReady(true);
      }
    } catch {
      toast.error("Failed to set up database. Please try again.");
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Image
              src="/512logo.png"
              alt="TrishulHub"
              width={56}
              height={56}
              className="rounded-xl"
              priority
            />
            <h1 className="text-3xl font-bold text-primary">TrishulHub</h1>
          </div>
          <h2 className="text-xl font-semibold">AI Agent Dashboard</h2>
          <p className="text-muted-foreground">Sign in to manage your AI agents and projects</p>
        </div>

        {/* Show setup button if database is not ready */}
        {dbReady === false && (
          <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="text-orange-700 dark:text-orange-400">First Time Setup</CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                The database needs to be set up before you can sign in. Click below to create the default admin user and sample data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                onClick={handleSeed}
                disabled={seeding}
              >
                {seeding ? "Setting up database..." : "Setup Database & Create Admin User"}
              </Button>
              <p className="text-xs text-orange-500 mt-2 text-center">
                This creates: 5 users, 7 AI agents, 3 clients, 3 projects, and sample data
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="taroon@trishulhub.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Always show setup link at bottom */}
        {dbReady === true && (
          <p className="text-center text-xs text-muted-foreground">
            First time? Visit{" "}
            <a href="/api/seed" className="underline text-primary hover:text-primary/80">
              /api/seed
            </a>{" "}
            to set up the database.
          </p>
        )}
      </div>
    </div>
  );
}
