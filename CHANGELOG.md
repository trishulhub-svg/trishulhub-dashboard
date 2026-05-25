# Changelog

All notable changes to the TrishulHub Dashboard will be documented in this file.

## [2026-05-12] — Clients Enhancement Fix (ZAI Protocol)

### Fixed
- **CLI-041 [CRITICAL]**: Build error `'websites' does not exist in type 'ClientInclude'` — Added `ClientWebsite` model to Prisma schema with proper relation (`id`, `url`, `label`, `isPrimary`, `createdAt`, `clientId`). Changed Client.websites from `String @default("[]")` to `ClientWebsite[]` one-to-many relation.
- **CLI-042 [HIGH]**: Frontend `ClientRow.websites` typed as `string | null` but API returns `primaryWebsite: { id, url, label, isPrimary } | null` — Updated TypeScript interface to match API response.
- **CLI-043 [HIGH]**: Form submit sent `websites` as `["url1", "url2"]` (string array) but API Zod validation expects `[{ url, label, isPrimary }]` — Fixed both create and update branches to transform string array to proper object array.
- **CLI-044 [HIGH]**: `handleEdit` called `JSON.parse(client.websites)` on a relation object — Now reads from `client.primaryWebsite.url` directly.
- **CLI-045 [HIGH]**: Detail drawer `JSON.parse(detailClient.websites)` on a relation array — Now iterates `detailClient.websites.map(w => w.url)` directly.
- **CLI-046 [MEDIUM]**: `ClientDetail` interface missing `websites`, `deals`, `contacts` fields — Added proper TypeScript declarations.

### Schema Changes
- Added `ClientWebsite` model (one-to-many with `Client`)
- Columns: `id`, `url`, `label`, `isPrimary`, `createdAt`, `clientId`
- Cascading delete: deleting a client removes all their websites
- Index on `clientId` for query performance

### Commits
- `76fd619`: fix: [Clients] Batch 1 — Add ClientWebsite model to Prisma schema
- `b1caab2`: fix: [Clients] Batch 2 — Fix frontend type mismatches for ClientWebsite relation
- `472537e`: fix: [Clients] Batch 3 — Auto-migrate ClientWebsite table for Turso production

### Root Cause
The `ClientWebsite` model was added to the Prisma schema but `prisma db push` only synced the **local SQLite** database. The production Turso database (accessed via `@prisma/adapter-libsql`) did not have the `ClientWebsite` table, causing all client queries with `include: { websites: true }` to fail. Fixed by adding the table to the project's `auto-migrate.ts` system which auto-creates missing tables on first API request.

---

## [2025-05-12] — Clients Page Audit Fix (ZAI Protocol)

### Fixed
- **CLI-031 [HIGH]**: Website field now included in API search OR clause — searching by URL now finds matching clients
- **CLI-032 [HIGH]**: Smart date search implemented — type `today`, `this week`, `this month`, month names (`january`, `feb`), year (`2025`), `last 7 days`, or date formats (`2025-01-15`, `15/01/2025`) in the search box. API supports `dateFrom`/`dateTo` query params with proper end-of-day handling.
- **CLI-033 [HIGH]**: Stats cards (Total Clients, Active, Revenue, Invoices) now use aggregate data from the API across ALL matching clients, not just the current page slice. Fixed incorrect counts when 50+ clients exist.
- **CLI-034 [HIGH]**: Empty state now differentiates between "no results from filters" (shows "Clear Filters" button) and "truly no clients" (shows "Add your first client" button)
- **CLI-035 [HIGH]**: Edit button (Pencil icon) added to the client detail drawer header — no need to close the drawer and find the client in the table to edit
- **CLI-036 [HIGH]**: Pagination controls added below the table — "Showing X to Y of Z" with Previous/Next buttons when there are more than 50 clients
- **CLI-037 [MEDIUM]**: Loading skeleton grid breakpoints now match the actual stats section (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)
- **CLI-038 [MEDIUM]**: `loading.tsx` now shows 4 stat skeletons instead of 3, matching the actual 4-card layout
- **CLI-040 [MEDIUM]**: Search placeholder updated to mention all searchable fields: "Search by name, email, phone, company, or website..."

### Added
- **Date Quick-Filter Buttons**: One-click buttons (Today, This Week, This Month, This Year) below the search bar for fast date filtering
- **API Aggregate Stats**: GET `/api/clients` now returns a `stats` object with `total`, `active`, `revenue`, and `invoices` aggregated across all matching clients

### Commit
- `22def63`: fix: [Clients] Batch 1-2 — Smart date search, pagination, aggregate stats, clear filters, edit in drawer, skeleton fixes

---

## [2025-05-12] — Dashboard Audit Fix (ZAI Protocol)

### Fixed
- **DASH-001 [HIGH]**: All stat cards (Active Projects, New Leads, Revenue, My Tasks, Open Tickets, Pending Tasks) are now clickable with navigation to their respective pages
- **DASH-002 [HIGH]**: Invoice items in "Recent Invoices" section are now clickable buttons navigating to `/dashboard/finance/invoices`
- **DASH-003 [MEDIUM]**: All stats values wrapped in `safeNumber()` to prevent NaN/undefined rendering
- **DASH-004 [MEDIUM]**: Stats object now uses safe default extraction instead of unsafe TypeScript `as` cast
- **DASH-005 [MEDIUM]**: Developer "My Tasks" section now displays real task data with status indicators, titles, and project names instead of a static placeholder
- **DASH-006 [LOW]**: API Usage Tracker now has a "View All" button linking to `/dashboard/api-keys`
- **DASH-007 [LOW]**: Project progress value cached to avoid redundant `safeNumber()` calls

### Commit
- `5fcee75`: fix: [Dashboard] Batch 1-3 — Make stat cards & invoices clickable, add safeNumber to all stats, show real tasks for developers

---

## [2025-05-12] — CRM Pipeline Audit Fix (ZAI Protocol)

### Fixed
- **CRM-001 [HIGH]**: All 4 stat cards (Total Leads, New This Week, Conversion Rate, Avg Score) are now clickable with cursor-pointer, hover shadow, and meaningful onClick actions
- **CRM-002 [HIGH]**: Score in lead detail panel is now editable inline — click the score badge to open an input field with Save/Cancel buttons
- **CRM-003 [MEDIUM]**: Kanban columns now sort leads by score descending (highest score at top) by default
- **CRM-004 [MEDIUM]**: All rendered lead values wrapped in `safeText()`/`safeNumber()` to prevent React #310 crashes
- **CRM-005 [MEDIUM]**: Delete button improved with proper dark mode contrast (`dark:text-red-400`, `dark:hover:bg-red-900/40`)
- **CRM-006 [LOW]**: Added sort-by dropdown (Newest First, Highest Score, Name A-Z) next to the search bar
- **CRM-007 [LOW]**: Added dedicated empty state when search returns no results, with "Clear Search" button
- **CRM-008 [LOW]**: Source badges now color-coded: AI_FOUND=purple, REFERRAL=blue, SOCIAL_MEDIA=pink, MANUAL=gray

### Commit
- `a5f4405`: fix: [CRM] Batch 1-3 — Clickable stats, inline score edit, sort by score, safeText/safeNumber, source colors, search empty state

---

## [2025-05-12] — CRM Smart Search + Lead Editing (ZAI Protocol)

### Added
- **Smart Search with Date Filtering**: Search box now supports smart queries — type `today`, `yesterday`, `this week`, `this month`, `last month`, any year (`2025`), month name (`january`, `feb`), or score filters (`score:80+`, `score:50-80`, `score:<30`). Phone number is now included in text search.
- **Date Quick-Filter Buttons**: One-click date filters (Today, Yesterday, This Week, This Month, Last Month) below the search bar
- **Full Lead Detail Editing**: "Edit" button in lead detail panel toggles edit mode — edit name, email, company, phone, website, source, and notes inline with validation
- **Source & Status Filter Dropdowns**: Filter leads by source (Manual, AI Found, Referral, Social Media) and status directly from the header
- **Clear All Filters**: Button appears when any filter is active to reset everything at once

### Commit
- `b70dcf6`: feat: [CRM] Smart search with date filters, full lead editing, source/status filter bar

---

## [Prior Sessions] — Previous Fixes

- `fa4fff0`: fix: bulletproof v7 — complete rebuild with safeText() on EVERY rendered value (React #310 fix)
- `776ab33`: fix: remove ALL Radix Select from projects pages + add loading.tsx (v5)
- `7dd41be`: feat: add ZAI Protocol v2.1 — standardized development pipeline with persistent state
