"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Demo project detail — redirects to the main project detail page.
// Demo projects use the same infrastructure, members, and credentials systems
// as regular projects, so we reuse /dashboard/projects/[projectId] for the
// detail view (which renders a "DEMO PROJECT" banner when isDemo is true).
export default function DemoProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();

  useEffect(() => {
    const projectId = typeof params?.projectId === "string" ? params.projectId : "";
    if (projectId) {
      router.replace(`/dashboard/projects/${projectId}`);
    }
  }, [params?.projectId, router]);

  return null;
}
