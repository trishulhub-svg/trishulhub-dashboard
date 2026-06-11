---
Task ID: 1
Agent: Main Agent
Task: Build Lark 2-way task sync system for TrishulHub

Work Log:
- Created `/src/lib/lark/` directory with 5 core library files: types.ts, auth.ts, client.ts, sync.ts, webhook.ts
- Added 3 new tables to auto-migrate.ts: LarkUserMapping, LarkTaskMapping, LarkSyncLog (with indexes)
- Created 4 API routes: /api/lark/settings, /api/lark/users, /api/lark/webhook, /api/lark/sync
- Modified /api/tasks/route.ts to trigger Lark sync on task create, update, and delete (fire-and-forget)
- Added Lark Integration settings card to Access Hub page (app ID, app secret, encrypt key, enable/disable toggle, connection test)
- Created Lark User Mapping page at /dashboard/lark/users (auto-match by email, manual unmap, stats)
- Created global Task Board page at /dashboard/tasks (Kanban board for all tasks across projects)
- Updated navigation: separated "Tasks" into its own nav group with "My Todos" and "Task Board" items
- Updated middleware to protect /dashboard/lark/* as admin-only
- Added Lark icons (Bird, Kanban) to layout imports

Stage Summary:
- Full Lark 2-way task sync infrastructure built and wired
- User mapping via email auto-match (LarkUserMapping table)
- Task status mapping: 5 TrishulHub statuses → 3 Lark statuses (TODO/IN_PROGRESS/DONE)
- Task priority mapping: 4 levels → 3 Lark levels (NORMAL/HIGH/URGENT)
- Webhook handler for receiving Lark events (task created/updated/deleted/completed)
- Project-based task list auto-creation in Lark (one task list per project)
- Lark settings stored encrypted in AppSetting table
- User needs to: (1) enable API scopes in Lark Developer Console, (2) save credentials in Access Hub, (3) auto-match users, (4) configure webhook URL