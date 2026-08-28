# TrishulHub — Full System Map

> Durable reference produced from a full deep-dive (2026-08-26). Use this as the
> source of truth before touching any module. When the codebase changes, update
> this file (and run `graphify update .` for the graph).

## 1. Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind 4 + shadcn/ui, lucide-react, framer-motion
- **Database:** Turso (libSQL) via Prisma + @prisma/adapter-libsql (`src/lib/db.ts`). Local SQLite fallback for dev only.
- **Auth:** next-auth v4 — **Credentials provider + JWT strategy** (no email provider). JWT in cookie; per-user page ACL.
- **Deploy:** Vercel (Hobby), GitHub `main` → auto-deploy. Live: `https://app.trishulhub.com` (`.in` redirects).
- **External integrations:**
  - Google Drive (Files module; service-account or OAuth, root folder `Trishulhub Files`) — `src/lib/file-drive.ts`, `file-drive-acl.ts`, `file-google-email.ts`
  - Brevo SMTP (system-wide email; config in `SmtpConfig`, SUPER_ADMIN-managed) — `src/lib/email.ts`
  - Exchange-rate API (finance), GPU monitor URLs (user-configured tunnels), DeepSeek API (workspace pricing)
- **Env vars (Vercel):** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` (64-char hex; fallback derives from NEXTAUTH_SECRET), Drive config + SMTP config stored in DB.

## 2. Roles & Access

**Roles (`User.role`):** `SUPER_ADMIN`, `ADMIN`, `HR`, `PROJECT_MANAGER`, `DEVELOPER`, `CLIENT`.
**Departments:** MANAGEMENT, ENGINEERING, DESIGN, MARKETING, SALES, FINANCE, OPERATIONS, DEV, HR, CONTENT, SUPPORT.

- **RBAC helpers** — `src/lib/rbac.ts`: `isAdmin`, `canAccessFinance`, `canManageApprovals`, `canViewAuditTrail`, `isAdminOrProjectManager`, `getAccessibleDepartments`, etc. Each API route checks its own role helper.
- **Per-user page ACL** — `src/lib/nav-pages.ts`: `pageAccessMode` (`OFF|ALLOW|RESTRICT`) + `pageAccessPages` (JSON list). Enforced in dashboard layout + nav visibility.
- **Middleware** — `src/middleware.ts`: role routing (CLIENT → `/portal`, DEV → training/my, removed paths → 410), session checks, security headers.
- **SUPER_ADMIN-only:** SMTP settings + test, email logs, API keys, audit trail, file settings, vault.

## 3. App Structure

- `src/app/dashboard/*` — **39 staff pages**
- `src/app/portal/*` — **5 client pages** (home, invoices, projects, project detail, support)
- `src/app/login`, `src/app/reset-password`
- `src/app/api/*` — **104 route handlers** across ~44 modules
- `src/components/*` — 58 components · `src/lib/*` — 56 modules · `src/hooks/*` — 9 hooks
- `src/middleware.ts` — edge middleware
- `prisma/schema.prisma` — **55 models**

## 4. Data Model (55 models — grouped)

- **Core:** `User`
- **Finance:** `Expense`, `ExpenseCategory`, `Invoice`, `Payment`, `Subscription`, `SmtpConfig`, `EmailLog`
- **Projects:** `Project`, `ProjectMember`, `ProjectMilestone`, `ProjectMilestoneAssignee`, `ProjectMethod`, `ProjectInfrastructure`, `ProjectInfraItem`, `ProjectInfraMemberAccess`, `ProjectWebsite`, `ProjectCredential`, `Client`, `ClientWebsite`
- **CRM:** `Lead`, `LeadEmail`, `Deal`, `Contact`
- **HR/People:** `TimeEntry`, `Attendance`, `Leave`, `LeaveBalance`, `Availability`, `AvailabilityOverride`, `AvailabilityDateRange`, `TrainingQr`, `TrainingQrRequest`, `TrainingAssignment`
- **Files/Drive:** `FileNode`, `FileItem`, `FileAccessGrant`
- **Auth/Security:** `EmailVerification`, `PasswordChange`, `PasswordReset`, `ActiveSession`, `AuditLog`, `AppSetting`
- **Vault/Credentials:** `VaultSecret`, `UserCredential`, `UserDetail`
- **Docx Sign:** `DocxDocument`, `DocxAssignment`
- **Support:** `SupportTicket`, `TicketMessage`, `TeamSupportTicket`, `TeamSupportMessage`
- **Notifications:** `Notification`, `NotificationPreference`
- **Misc:** `Approval`

## 5. Business Modules (end-to-end)

### Workspace (`/dashboard/workspace`)
Live AI ops feed (DeepSeek v4 Flash plus Codex Sol/Luna/Terra activity lines and real system telemetry), Cloud Systems Telemetry monitor (up to 3 URLs in System→GPU, 3s poll, shared `useGpuStatus` + `gpu-metrics`; CPU performance, memory, battery, network, uptime, and Codex/Node/Tunnel runtime details), DeepSeek peak/off-peak badge (Asia/Shanghai canonical), clock-in hero, long-horizon projects, ambient visuals. Header cloud indicator (Cloud Active/Stopped/Off) + popup monitor on every page.

### Finance (`/dashboard/finance` + sub-pages)
Hub (overview + reports tabs + quick-nav), **Subscriptions** (recurring costs, INR conversion, expiry checker), **Expenses**, **Invoices** (create/send/track, PDF, payments), **P&L** (month/year, newest-first + order controller, Save-to-Drive PDF/XLSX/DOCX). Reports pipeline `src/lib/finance-report.ts` auto-saves to Drive under **Finance Reports → YYYY-MM** + Files. Currency helpers: `src/lib/currency.ts` (exchange fallbacks), `money.ts` (server), `format.ts` (display).

### Files / Google Drive (`/dashboard/files*`)
Drive-backed tree with departments, per-module folders auto-created, access grants (`FileAccessGrant`), review flow (`/files/review`), settings (`/files/settings`), mobile access. ACL in `file-drive-acl.ts`, Drive ops in `file-drive.ts`.

### Time Tracking (`/dashboard/time-tracking`)
Clock in/out (project/activity/training), attendance, session integrity (`clock-integrity.ts`), admin-end, activity catalog, live header indicator (`useClockedInStatus`, 45s poll).

### Training (`/dashboard/training*`)
Assignments (assigner→assignee), QR verification (`TrainingQr`), buzz email, learning prefs, due-date logic.

### Projects (`/dashboard/projects*`)
Milestones + assignees, infrastructure + items + member access, methods, websites, members, credentials (encrypted), client links, kanban collision handling, access control.

### CRM (`/dashboard/crm`, `/clients`)
Leads (pipeline), deals, contacts, clients + client websites.

### HR / People (`/leaves`, `availability`, `approvals`, `my-details`)
Leaves + balances, availability (weekly/overrides/date-ranges; PM read-only), approvals, personal details.

### Audit Trail (`/dashboard/audit-trail`)
`src/lib/audit-log.ts` — logs actions (action/entity/page/IP); viewable/exportable by role.

### Notifications
`Notification` + `NotificationPreference`; header sheet; unread badge from `/api/bootstrap/shell` (single consolidated poll).

### Docx Sign (`/dashboard/docx-sign*`)
DOCX→PDF, assignments, authorized-person + acceptor signatures, signing links (`/docx-sign/sign/[id]`).

### Support (`/dashboard/support*`, `/portal/support`)
Internal + client tickets, messages, email notifications.

### Credentials / Vault (`/access-hub`, `/api-keys`, `/vault-secrets`)
Encrypted secrets (AES-256-GCM): `UserCredential`, `ProjectCredential`, `VaultSecret`, `UserDetail`. Role-gated reveal.

### SMTP / Email (system-wide)
Config in `SmtpConfig` (encrypted password; SUPER_ADMIN via `/dashboard/smtp`). `src/lib/email.ts` → `sendEmailWithFailover` (primary→failover, CRLF-stripped, logs to `EmailLog`). Callers: password reset/change, email change, invoice send, training buzz, user-details, support. Observability: `/dashboard/email-logs`.

## 6. Security Posture

- No hardcoded secrets in `src/` (audited 2026-08-26).
- All API routes authenticate (only NextAuth route is unauthenticated by design).
- Rate limiting, input validation (`validations.ts`), SSRF protection (`ssrf.ts`), AES-256-GCM encryption, audit logs, security headers.
- Upgrades applied: `next` 16.3.3, `next-auth` 4.24.15 (audit: 8 prod vulns, 0 critical).
- Low-risk remaining (do NOT upgrade blindly): `nodemailer` 7→9 (admin-controlled config + CRLF stripping), `sharp` 0.34→0.35 (test image uploads), `xlsx` (no npm fix; write-only), `prisma` advisory (no clean fix).

## 7. Testing & Known Debt

- **Tests:** 3 files / 46 tests (`deepseek-pricing` 27, `availability-pm-access` 15, `money-approvals` 4). Finance/cloud/GPU features need more coverage.
- **Lint:** ~119 pre-existing ESLint errors; key: `react-hooks/rules-of-hooks` in `dashboard/workspace/page.tsx` (24) + `finance/page.tsx` (2) — latent (layout gates page mount), refactor carefully.
- **Graph:** current with `main`; archived at `C:\Users\shivam\.graphify\archive\trishulhub-svg\trishulhub-dashboard\` (graph.json, graph.html, GRAPH_TREE.html, Obsidian vault `obsidian/`).

## 8. Common Workflows

- **Push/deploy:** edit → `tsc --noEmit` → `vitest run` → `next build` (needs Turso env) → commit → `git push <token-url> main` → Vercel auto-deploys → verify live.
- **DB changes:** edit `prisma/schema.prisma` → `prisma generate` → push schema (Turso).
- **Graph:** after meaningful changes, `graphify update .` then re-archive.
