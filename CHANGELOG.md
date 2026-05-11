# Changelog

All notable changes to the TrishulHub Dashboard will be documented in this file.

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
