"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import LoadingScreen from "@/components/ui/loading-screen";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: if session never loads in 12s, bypass to login
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "loading") return;

    if (session) {
      const role = session.user?.role;
      if (role === "CLIENT") {
        router.replace("/portal");
      } else {
        router.replace("/dashboard");
      }
    } else {
      router.replace("/login");
    }
  }, [session, status, router]);

  if (timedOut) {
    return (
      <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Taking longer than expected...</p>
          <button
            onClick={() => window.location.href = "/login"}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return <LoadingScreen message="Redirecting..." />;
}
