"use client";

// Demo Projects page — wraps the shared ProjectsBoard with isDemoView=true so
// it shows only demo projects (filtered server-side via ?isDemo=true) and:
//   • title reads "Demo Projects"
//   • a DEMO badge appears in the header
//   • new projects created from this page default to isDemo=true
//
// Demo projects work exactly like regular projects — same infrastructure,
// members, credentials, etc. — so the detail page at /dashboard/projects/[projectId]
// is reused. Clicking a card navigates there directly.
//
// This is a thin wrapper around ProjectsBoard (see ../projects/page.tsx) so any
// UX improvements made to the projects board automatically apply here too.

import { Suspense } from "react";
import { ProjectsBoard } from "@/app/dashboard/projects/page";

export default function DemoProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading demo projects…</div>}>
      <ProjectsBoard isDemoView />
    </Suspense>
  );
}
