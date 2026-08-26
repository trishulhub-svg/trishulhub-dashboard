"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Cpu } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GpuMonitorSettings } from "@/components/dashboard/gpu-monitor-settings";
import { Skeleton } from "@/components/ui/skeleton";

export default function GpuMonitorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const canManageGpu = role === "SUPER_ADMIN" || role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || !canManageGpu) router.replace("/dashboard/settings");
  }, [status, session, canManageGpu, router]);

  if (status === "loading" || !canManageGpu) {
    return (
      <div className="max-w-4xl space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="GPU Monitor"
        description="Configure Trishul Cloud Process endpoints for live workspace performance data."
      />
      <GpuMonitorSettings />
    </div>
  );
}
