"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (session) {
      if ((session.user as { role?: string })?.role === "CLIENT") {
        router.push("/portal");
      } else {
        router.push("/dashboard");
      }
    } else {
      router.push("/login");
    }
  }, [session, status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 4L28 20H24L28 44L20 24H24L20 4H24Z" fill="hsl(25, 80%, 50%)" stroke="hsl(25, 80%, 40%)" strokeWidth="1"/>
          </svg>
          <h1 className="text-3xl font-bold text-primary">TrishulHub</h1>
        </div>
        <p className="text-muted-foreground">AI Agent Dashboard</p>
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    </div>
  );
}
