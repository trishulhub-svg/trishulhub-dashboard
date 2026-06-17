---
Task ID: 1
Agent: Main Agent
Task: Lark Event Subscription guidance + Push code to GitHub + Fix and improve task system

Work Log:
- Analyzed user's Lark developer console screenshot (1010) - confirmed Event Subscription page is on "Not configured" state
- Provided step-by-step guide for configuring Request URL and subscribing to 4 task events
- Discovered ~2764 lines of Lark integration code from previous session was never committed/pushed
- Committed all existing Lark code (commit d84c3b6) and pushed to GitHub
- Fixed Task API GET to include larkTaskId from LarkTaskMapping join (both admin and non-admin paths)
- Fixed notification links from /dashboard/projects/todos to /dashboard/tasks (4 instances)
- Rewrote Task Board UI page with: user dropdown for assignee, edit task dialog, delete task button, deadline date picker, created by/created at display
- TypeScript check passed with zero errors
- Committed and pushed improvements (commit 446173b)

Stage Summary:
- Vercel deployment triggered from 2 commits pushed to GitHub
- Full Lark 2-way task sync system is now deployed: API client, webhook, user mapping, sync engine
- Task Board at /dashboard/tasks has professional Kanban UI with full CRUD
- User can now configure Lark webhook URL after Vercel deployment completes
- Key files: src/lib/lark/*, src/app/api/lark/*, src/app/dashboard/tasks/page.tsx, src/app/dashboard/lark/users/page.tsx
