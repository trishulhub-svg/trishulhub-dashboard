"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { SmtpSettingsPanel } from "@/components/dashboard/smtp-settings-panel";
import { Skeleton } from "@/components/ui/skeleton";

export default function SmtpSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || role !== "SUPER_ADMIN") {
      router.replace("/dashboard/settings");
    }
  }, [status, session, role, router]);

  if (status === "loading" || role !== "SUPER_ADMIN") {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="SMTP"
        description="Email server configuration for OTP and system mail"
      />
      <SmtpSettingsPanel />
    </div>
  );
}
