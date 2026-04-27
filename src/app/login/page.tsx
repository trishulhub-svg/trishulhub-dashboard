"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  // If already logged in, redirect
  if (status === "authenticated" && session) {
    const role = (session.user as { role?: string })?.role;
    if (role === "CLIENT") {
      router.replace("/portal");
    } else {
      router.replace("/dashboard");
    }
    return null;
  }

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
      } else {
        toast.success("Login successful!");
        // Small delay to let session propagate
        setTimeout(() => {
          router.replace("/dashboard");
          router.refresh();
        }, 500);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
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

        <Button variant="outline" className="w-full" onClick={async () => {
          setLoading(true);
          try {
            await fetch("/api/seed", { method: "POST" });
            toast.success("Database seeded! You can now sign in.");
          } catch {
            toast.error("Failed to seed database");
          }
          setLoading(false);
        }} disabled={loading}>
          Seed Database (First Time Only)
        </Button>
      </div>
    </div>
  );
}
