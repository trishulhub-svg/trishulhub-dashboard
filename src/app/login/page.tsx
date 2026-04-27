"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
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
        router.push("/dashboard");
        router.refresh();
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
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M24 4L28 20H24L28 44L20 24H24L20 4H24Z" fill="hsl(25, 80%, 50%)" stroke="hsl(25, 80%, 40%)" strokeWidth="1"/>
            </svg>
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Button variant="outline" className="w-full" onClick={async () => { setLoading(true); await fetch("/api/seed", { method: "POST" }); toast.success("Database seeded! Use credentials below."); setLoading(false); }} disabled={loading}>
          Seed Database (First Time Only)
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Demo Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Super Admin:</span>
              <button
                onClick={() => { setEmail("taroon@trishulhub.in"); setPassword("password123"); }}
                className="text-primary hover:underline font-mono text-xs"
              >
                taroon@trishulhub.in
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Admin:</span>
              <button
                onClick={() => { setEmail("pruthvi@trishulhub.in"); setPassword("password123"); }}
                className="text-primary hover:underline font-mono text-xs"
              >
                pruthvi@trishulhub.in
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Developer:</span>
              <button
                onClick={() => { setEmail("kiran@trishulhub.in"); setPassword("password123"); }}
                className="text-primary hover:underline font-mono text-xs"
              >
                kiran@trishulhub.in
              </button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Developer:</span>
              <button
                onClick={() => { setEmail("akshat@trishulhub.in"); setPassword("password123"); }}
                className="text-primary hover:underline font-mono text-xs"
              >
                akshat@trishulhub.in
              </button>
            </div>
            <p className="text-xs text-muted-foreground pt-1">Password for all: password123</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
