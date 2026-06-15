---
Task ID: 1
Agent: Main
Task: Fix Lark sync — all 4 interconnected issues

Work Log:
- Investigated full Lark sync flow: client.ts, sync.ts, auth.ts, types.ts, tasks/route.ts, lark/users/route.ts
- Found root cause of 400 error: invalid 'extra' field in Lark Task v2 API (fixed in previous session)
- Found fire-and-forget pattern caused silent failures with no audit trail
- Found lookupUserByEmail had user_id_type mismatch (open_id vs user_id)
- Found misleading scope warning (contact:contact.base:readonly → contact:contact.user.email:readonly)
- Made sync calls use `void` pattern instead of .catch() — runs concurrently but errors caught internally
- Added SKIPPED audit log when Lark is disabled (was silent return before)
- Removed 'extra' metadata from sync (was polluting Lark notes with JSON)
- Fixed batch_get_id to include user_id_type=open_id param
- Fixed misleading email scope warning message

Stage Summary:
- Lark sync now reliably logs to audit trail for all operations
- 400 error fully resolved
- Name-based matching works without email scope
- 4 files changed, committed as e234643

---
Task ID: 2
Agent: Main
Task: Optimize project/taskboard page load speed

Work Log:
- Analyzed project detail page: 3-5 separate API calls on mount
- Found each call runs ensureAllTables() + getAssignedProjectIds() + getServerSession() separately
- Created consolidated GET /api/projects/[projectId]/detail endpoint
- Returns project + tasks + members + websites in single response
- All DB queries run in parallel via Promise.all
- Updated project detail page to use single useQuery call
- Updated prefetch on projects list to use consolidated endpoint

Stage Summary:
- 3-5 HTTP round-trips → 1
- 3-5 ensureAllTables() → 1
- 3-5 RBAC checks → 1
- Estimated cold-start: ~5s → ~1s
- 3 files changed, committed as cb9c7bf

---
Task ID: 3
Agent: Main
Task: Build What's New changelog system

Work Log:
- Added ChangelogEntry and UserChangelogRead tables to auto-migrate
- Created GET/POST/PATCH /api/changelog API routes
- Built WhatsNewDialog component with Dialog, features/fixes lists
- Added to dashboard layout as global overlay
- Auto-shows 1.5s after login if unread entries exist
- Marks entries as read on dismiss
- Seeded initial v2.5.0 changelog entry

Stage Summary:
- Full changelog system deployed
- Admin can create entries via POST /api/changelog
- Per-user read tracking via UserChangelogRead table
- 4 files changed, committed as cb6295c
---
Task ID: 1
Agent: Main Agent
Task: Implement Lark project-based task grouping so tasks appear under project-named groups in users Lark Task Center

Work Log:
- Read and analyzed current Lark client.ts, sync.ts, auth.ts, types.ts
- Researched Lark Task v2 API tasklist capabilities (free tier) via subagent
- Key finding: tasklists ARE the groups in Lark Task Center; users must be added as tasklist members for visibility
- Added 3 new API functions to client.ts: addTaskListMember, removeTaskListMember, deleteTaskList
- Updated syncTaskToLark() to add assignee as tasklist member (editor role) after task creation
- Updated syncTaskUpdateToLark() to add new assignee as tasklist member on reassignment
- Added addProjectMemberToLarkTaskList() — adds user to Lark tasklist when added to project
- Added removeProjectMemberFromLarkTaskList() — removes user from Lark tasklist when removed from project
- Added cleanupOrphanedTaskList() — auto-deletes tasklist when no Lark-mapped members remain
- Updated getOrCreateProjectTaskList() to use exact project name (e.g. "UK STORE DEMO") with backward compat for old " Tasks" suffix
- Added delAppSetting() to db.ts
- Hooked into project members API route (POST/DELETE) with fire-and-forget Lark sync calls
- TypeScript compilation: zero errors
- Committed and pushed to GitHub

Stage Summary:
- 4 files modified: client.ts, sync.ts, db.ts, members/route.ts
- 284 lines added, 13 removed
- Lark tasks will now appear under project-named groups (e.g. "UK STORE DEMO") in users Lark Task Center
- Adding member to project = they see the project tasklist in Lark
- Removing member from project = tasklist disappears from their Lark (deleted entirely if no Lark members remain)

---
Task ID: 2
Agent: Main Agent
Task: Fix remove-member button visibility + Lark done-status circular sync bug

Work Log:
- Issue 1: Found remove button had opacity-0 + group-hover/member:opacity-100 (invisible until hover)
  - Removed opacity-0 and hover-only visibility
  - Button now always visible with subtle color (text-muted-foreground/50), turns red on hover
  - File: src/app/dashboard/projects/[projectId]/page.tsx line 711

- Issue 2: Investigated Lark "done → reverts" circular sync bug
  - Root cause: Lark webhook fires → handler fetches task from Lark API too quickly (stale read) → gets old status → overwrites TrishulHub → syncTaskUpdateToLark pushes old status back to Lark
  - Also: Lark retries events, causing duplicate processing
  - Fix 1: Circular sync guard (in-memory Map, 10s cooldown) — after webhook updates TH, prevents status push-back to Lark
  - Fix 2: Webhook event deduplication (30s window) using event_id from Lark header
  - Fix 3: 1s delay before fetching task from Lark API on webhook to let Lark settle
  - Fix 4: Clear completedAt when status moves away from DONE
  - Files: src/lib/lark/sync.ts, src/lib/lark/webhook.ts

- TypeScript: zero errors
- Committed and pushed: b0bc50d

Stage Summary:
- Remove member button now always visible (no longer hidden behind hover)
- Lark done-status reverts fixed with 3-layer protection: dedup + delay + circular guard

---
Task ID: 1
Agent: main
Task: Fix 5 issues - capsule restore, task board speed, no data in iframe, Lark sync

Work Log:
- Analyzed screenshot 1026: PC floating windows show project names but empty dark content areas
- Root cause for "no data": loading gate blocked entire page render until ALL 4 queries (project, tasks, members, teamUsers) finished. The slow teamUsers query (loads ALL users) was blocking the task board from rendering
- Root cause for capsule restore: event listeners on window capture phase fired for ALL capsules, plus onRestore/onPositionChange callback changes caused useEffect to re-register listeners every render
- Root cause for slow loading: Lark task ID lookup ran unconditionally on every GET, user name resolution was sequential with Lark lookup

Stage Summary:
- Fixed capsule restore: global restore lock + stopImmediatePropagation + stable callback refs
- Fixed "no data in iframe": removed loading gate, only session+project loading shows skeleton
- Sped up API: conditional Lark lookup, parallel user+Lark resolution, increased cache times
- Lark sync verified: already creates project-named groups, assigns per-user correctly
- Pushed to GitHub: commit a5aacd8

---
Task ID: 1
Agent: main
Task: Fix 5 remaining issues in TrishulHub Dashboard

Work Log:
- Read and analyzed floating-task-board.tsx, floating-board-provider.tsx, project detail page, tasks API route, Lark client/sync files
- Identified root cause of Issue 3 (PC empty task board): desktop floating window missing "flex" class - flex-col only sets flex-direction without display:flex, causing content area with flex-1 to have 0 height
- Fixed Issue 3 by adding "flex" to desktop className
- Identified Issue 1 (mobile capsule double display): CSS specificity conflict between Tailwind hidden/flex classes
- Fixed Issue 1 by replacing class-based show/hide with inline style display control (mobile: display:none/flex, desktop: visibility:hidden/visible)
- Implemented Issue 5 (Lark per-user task groups): Added getOrCreateUserProjectTaskList() function in client.ts, updated syncTaskToLark to use per-user task lists named "ProjectName — UserName"
- Optimized speed (Issues 2 & 4): Added 30s in-memory cache for Lark config, replaced raw SQL with Prisma query for LarkTaskMapping lookups
- Viewport maximumScale was already fixed to 1
- Committed and pushed to GitHub

Stage Summary:
- 5 files modified: floating-task-board.tsx, tasks/route.ts, lark/auth.ts, lark/client.ts, lark/sync.ts
- Pushed as commit 7d7602a to trishulhub-svg/trishulhub-dashboard main branch
- All TypeScript checks pass (pre-existing errors only in unrelated files/ directory)

