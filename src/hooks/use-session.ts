"use client";

import { useSession as useNextAuthSession } from "next-auth/react";

export function useSession() {
  const session = useNextAuthSession();
  return {
    ...session,
    user: session.data?.user
      ? {
          ...session.data.user,
          role: session.data.user.role || "DEVELOPER",
          id: session.data.user.id || "",
        }
      : null,
  };
}
