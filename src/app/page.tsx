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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-5">
      <div className="relative h-16 w-40">
        <Image
          src="/200px.png"
          alt="TrishulHub"
          fill
          className="rounded-lg object-contain"
          priority
          sizes="160px"
        />
      </div>
      <h1 className="text-4xl font-black text-primary tracking-tight">TrishulHub</h1>
      <p className="text-base font-medium text-muted-foreground">AI Agent Dashboard</p>
      <div className="flex items-center gap-2 mt-2">
        <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <div className="h-2.5 w-2.5 rounded-full bg-primary animate-bounce" />
      </div>
    </div>
  );
}
