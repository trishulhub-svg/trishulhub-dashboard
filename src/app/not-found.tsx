"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass, Home } from "lucide-react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="liquid-glass-card max-w-md w-full text-center space-y-6 rounded-xl border p-8 sm:p-10">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Compass className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">404</p>
          <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => router.back()} variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Go Back
          </Button>
          <Button onClick={() => router.push("/dashboard")} className="gap-2">
            <Home className="h-4 w-4" /> Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
