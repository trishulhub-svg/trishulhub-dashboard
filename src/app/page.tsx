"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    if (session) {
      const role = (session.user as { role?: string })?.role;
      if (role === "CLIENT") {
        router.replace("/portal");
      } else {
        router.replace("/dashboard");
      }
    } else {
      router.replace("/login");
    }
  }, [session, status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Image
            src="/200px.png"
            alt="TrishulHub"
            width={48}
            height={48}
            className="rounded-lg"
            priority
          />
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
