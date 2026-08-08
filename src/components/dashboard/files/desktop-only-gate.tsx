"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

/** Soft client gate — Files are intended for PC / desktop browser only. */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setMobile(/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua));
  }, []);

  if (mobile) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center space-y-3">
        <Monitor className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">Files is desktop-only</h1>
        <p className="text-sm text-muted-foreground">
          Open Files from a PC / desktop browser. Mobile access is blocked for security and Google Drive editing.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
