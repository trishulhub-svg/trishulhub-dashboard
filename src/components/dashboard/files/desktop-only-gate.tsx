"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Monitor } from "lucide-react";
import { canUseFilesOnMobile } from "@/lib/rbac";

/**
 * Soft client gate for Files.
 * Mobile allowed for Admin + Super Admin only; other roles stay desktop-only.
 */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setMobile(/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua));
  }, []);

  const role = session?.user?.role || "";
  const allowMobile = canUseFilesOnMobile(role);

  if (mobile && !allowMobile) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center space-y-3">
        <Monitor className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">Files is desktop-only for your role</h1>
        <p className="text-sm text-muted-foreground">
          Open Files from a PC / desktop browser. Mobile access is currently limited to Admin and Super Admin.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
