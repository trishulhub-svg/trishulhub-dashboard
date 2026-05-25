# ZAI STATE — TrishulHub Dashboard

## Project Info
- **Repo:** https://github.com/trishulhub-svg/trishulhub-dashboard.git
- **Git:** Trishulhub / trishulhub-svg@user.noreply.github.com
- **Stack:** Next.js 16 + React 19, Prisma + Turso (libSQL), App Router, Tailwind CSS 4
- **Deploy:** Vercel (Production URL: https://agent.trishulhub.in)

## Database: Prisma + Turso
- **Provider:** sqlite with `relationMode = "prisma"` (no FK constraints in DB)
- **Local:** `DATABASE_URL=file:./db/turso.db`
- **Production:** Turso via `@prisma/adapter-libsql`
- **IMPORTANT:** `prisma db push` only works with `file:` URLs. Turso sync requires `scripts/sync-turso.ts`

### After ANY Schema Change, ALWAYS Run:
```
npm run db:sync-turso
```
This syncs ALL 50 models from Prisma schema to the remote Turso production database.
Without this, schema changes only apply locally and the production app will break.

## Coding Standards
- **safeText()/safeNumber():** Required on ALL rendered values (XSS prevention)
- **RBAC:** Revenue visible only to SUPER_ADMIN and ADMIN roles
- **Commit format:** `type: [Component] Description` (e.g., `fix: [Clients] Batch 1 — Description`)
- **Language:** English for code, match user's language for communication

## Current Feature Status
- [x] 6-status client system (ACTIVE, INACTIVE, ONBOARDING, PAUSED, COMPLETED, CHURNED)
- [x] Client: project type, dates, multiple websites, mediator contact
- [x] Client detail drawer with websites, projects, invoices, deals, contacts
- [x] Deal + Contact tables synced to Turso
- [x] All 50 Prisma models synced to Turso (zero schema drift)

## Known Patterns
- **Defensive API routes:** All GET handlers should have try/catch
- **JSON round-trip:** `JSON.parse(JSON.stringify(data))` before NextResponse.json()
- **No eager circular includes:** Project detail fetches tasks/members from separate endpoints
