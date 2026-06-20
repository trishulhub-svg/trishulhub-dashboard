"use client";

// Demo project detail page — renders the SAME full project detail page as
// /dashboard/projects/[projectId], but served from /dashboard/demo/[projectId].
//
// This ensures demo projects are fully managed from the demo section without
// redirecting to /dashboard/projects. The detail page detects isDemo from
// the project data and shows the "DEMO PROJECT" banner.
//
// All capabilities are identical: credentials, infrastructure, tokens,
// members, websites, etc.

import ProjectDetailPage from "@/app/dashboard/projects/[projectId]/page";

export default function DemoProjectDetailPage() {
  return <ProjectDetailPage />;
}
