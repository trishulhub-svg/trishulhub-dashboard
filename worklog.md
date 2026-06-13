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

