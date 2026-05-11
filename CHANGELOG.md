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

## [Prior Sessions] — Previous Fixes

- `fa4fff0`: fix: bulletproof v7 — complete rebuild with safeText() on EVERY rendered value (React #310 fix)
- `776ab33`: fix: remove ALL Radix Select from projects pages + add loading.tsx (v5)
- `7dd41be`: feat: add ZAI Protocol v2.1 — standardized development pipeline with persistent state
