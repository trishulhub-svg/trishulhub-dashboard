# Worklog: Full Scan & Fix — `Record<string, unknown>` in Prisma Operations

**Task ID:** full-scan  
**Date:** 2025-01-XX  
**Scope:** `/home/z/my-project/src/app/api/`  
**Pattern:** Replace `Record<string, unknown>` passed to Prisma operations with proper Prisma types using `Parameters<typeof db.MODEL.operation>[0]["param"]`

---

## Summary

- **Total files scanned:** 35+
- **Files FIXED (Prisma-bound):** 20 files, 35 type annotations
- **Files SKIPPED (non-Prisma usage):** 15+ files (req.json() parsing, response building, validateRequest casts)

---

## Files FIXED

| # | File | Variable | Prisma Operation | Fix Applied |
|---|------|----------|----------------|-------------|
| 1 | `contacts/route.ts` | `where` | `db.contact.findMany`, `db.contact.count` | `Parameters<typeof db.contact.findMany>[0]["where"]` |
| 2 | `contacts/[id]/route.ts` | `sanitizedData` | `db.contact.update` | `Parameters<typeof db.contact.update>[0]["data"]` |
| 3 | `invoices/route.ts` (GET CLIENT) | `where` | `db.invoice.findMany`, `db.invoice.count` | `Parameters<typeof db.invoice.findMany>[0]["where"]` |
| 4 | `invoices/route.ts` (GET DEV) | `where` | `db.invoice.findMany`, `db.invoice.count` | `Parameters<typeof db.invoice.findMany>[0]["where"]` |
| 5 | `invoices/route.ts` (PATCH) | `sanitizedData` | `db.invoice.update` | `Parameters<typeof db.invoice.update>[0]["data"]` |
| 6 | `subscriptions/route.ts` | `where` | `db.subscription.findMany`, `db.subscription.count` | `Parameters<typeof db.subscription.findMany>[0]["where"]` |
| 7 | `subscriptions/[id]/route.ts` | `sanitizedData` | `db.subscription.update` | `Parameters<typeof db.subscription.update>[0]["data"]` |
| 8 | `deals/route.ts` | `where` | `db.deal.findMany`, `db.deal.count` | `Parameters<typeof db.deal.findMany>[0]["where"]` |
| 9 | `deals/[id]/route.ts` | `sanitizedData` | `db.deal.update` | `Parameters<typeof db.deal.update>[0]["data"]` |
| 10 | `files/route.ts` | `where` | `db.fileMetadata.findMany` | `Parameters<typeof db.fileMetadata.findMany>[0]["where"]` |
| 11 | `files/[id]/route.ts` | `updateData` | `db.fileMetadata.update` | `Parameters<typeof db.fileMetadata.update>[0]["data"]` |
| 12 | `expenses/route.ts` (GET) | `where` | `db.expense.findMany`, `db.expense.count` | `Parameters<typeof db.expense.findMany>[0]["where"]` |
| 13 | `expenses/route.ts` (PATCH) | `sanitizedData` | `tx.expense.update` | `Parameters<typeof db.expense.update>[0]["data"]` |
| 14 | `expenses/route.ts` (PUT) | `updateData` | `tx.expense.update` | `Parameters<typeof db.expense.update>[0]["data"]` |
| 15 | `expenses/stats/route.ts` | `where` | `db.expense.findMany` | `Parameters<typeof db.expense.findMany>[0]["where"]` |
| 16 | `contracts/route.ts` (PATCH) | `sanitized` | `db.contract.update` | `Parameters<typeof db.contract.update>[0]["data"]` |
| 17 | `time-tracking/route.ts` | `where` | `db.timeEntry.findMany` | `Parameters<typeof db.timeEntry.findMany>[0]["where"]` |
| 18 | `time-tracking/[id]/route.ts` (admin) | `updateData` | `db.timeEntry.update` | `Parameters<typeof db.timeEntry.update>[0]["data"]` |
| 19 | `time-tracking/[id]/route.ts` (normal) | `updateData` | `db.timeEntry.update` | `Parameters<typeof db.timeEntry.update>[0]["data"]` |
| 20 | `time-tracking/analytics/route.ts` | `where` | `db.timeEntry.findMany` | `Parameters<typeof db.timeEntry.findMany>[0]["where"]` |
| 21 | `team/route.ts` (leave PATCH) | `updatePayload` | `db.leaveRequest.update` | `Parameters<typeof db.leaveRequest.update>[0]["data"]` |
| 22 | `team/route.ts` (attendance) | `sanitizedAttData` | `db.attendance.update` | `Parameters<typeof db.attendance.update>[0]["data"]` |
| 23 | `team/route.ts` (user PATCH) | `updateData` | `db.user.update` | `Parameters<typeof db.user.update>[0]["data"]` |
| 24 | `support/route.ts` (PUT) | `sanitizedData` | `db.supportTicket.update` | `Parameters<typeof db.supportTicket.update>[0]["data"]` |
| 25 | `support/route.ts` (PATCH) | `sanitizedData` | `db.supportTicket.update` | `Parameters<typeof db.supportTicket.update>[0]["data"]` |
| 26 | `notification-preferences/route.ts` | `updateData` | `db.notificationPreference.upsert` | `Parameters<typeof db.notificationPreference.upsert>[0]["update"]` |
| 27 | `timetable/personal-tasks/route.ts` | `where` | `db.personalTimetableTask.findMany` | `Parameters<typeof db.personalTimetableTask.findMany>[0]["where"]` |
| 28 | `timetable/personal-tasks/[id]/route.ts` | `updateData` | `db.personalTimetableTask.update` | `Parameters<typeof db.personalTimetableTask.update>[0]["data"]` |
| 29 | `timetable/settings/route.ts` | `updateData` | `db.timetableSettings.upsert` | `Parameters<typeof db.timetableSettings.upsert>[0]["update"]` |
| 30 | `leads/route.ts` (_updateLead) | `sanitizedData` | `db.lead.update` | `Parameters<typeof db.lead.update>[0]["data"]` |
| 31 | `leads/route.ts` (GET) | `where` | `db.lead.findMany`, `db.lead.count` | `Parameters<typeof db.lead.findMany>[0]["where"]` |
| 32 | `leads/[id]/route.ts` | `sanitizedData` | `db.lead.update` | `Parameters<typeof db.lead.update>[0]["data"]` |
| 33 | `clients/route.ts` (GET) | `where` | `db.client.findMany`, `db.client.count` | `Parameters<typeof db.client.findMany>[0]["where"]` |
| 34 | `clients/route.ts` (stats) | `statsWhere` | `db.client.count`, `db.invoice.count/aggregate` | `Parameters<typeof db.client.findMany>[0]["where"]` |
| 35 | `clients/route.ts` | `buildDateFilter` return | Used in `where.createdAt` | Changed to `{ gte?: Date; lte?: Date } | null` |
| 36 | `clients/[id]/route.ts` | `sanitizedData` | `db.client.update` | `Parameters<typeof db.client.update>[0]["data"]` |

**Bonus cleanups:**
- `expenses/route.ts`: Removed unnecessary `as Record<string, unknown>` casts on `where.date` (now properly typed)
- `expenses/stats/route.ts`: Same cleanup
- `support/route.ts`: Removed `as Record<string, string>` casts (now properly typed via Prisma type)

---

## Files SKIPPED (safe — not passed to Prisma)

| File | Reason |
|------|--------|
| `files/permissions/route.ts` | `body` used for req.json() parsing; individual fields destructured and cast |
| `files/sync/route.ts` | `body` used for req.json(); only `body.folderId` extracted |
| `timetable/complete-work-task/route.ts` | `body` used for req.json(); fields destructured for switch/case |
| `timetable/work-data/route.ts` | `results` array used for response building |
| `availability/schedule/route.ts` | `days` used for response building |
| `projects/route.ts` | Already fixed in previous pass |
| `projects/credentials/route.ts` | Already fixed in previous pass |
| `projects/[projectId]/websites/route.ts` | Already fixed in previous pass |
| `tasks/route.ts` | Already fixed in previous pass |
| `tasks/counts/route.ts` | Already fixed in previous pass |
| `team/route.ts` (`body`, `records`) | `body` for req.json(); `records` for response; `as Record<string, unknown>` casts for user name sorting |
| `support/route.ts` (`body`, `data`, `rest`) | `body`/`data` for req.json(); `rest` for field extraction |
| `notification-preferences/route.ts` (`body`) | `body` for req.json() |
| `leads/route.ts` (`body` for req.json()) | req.json() parsing only |
| `leads/[id]/route.ts` (validateRequest cast) | `body as Record<string, unknown>` passed to `validateRequest()`, not Prisma |
| `deals/[id]/route.ts` (validateRequest cast) | Same — passed to `validateRequest()` |
| `contacts/[id]/route.ts` (validateRequest cast) | Same — passed to `validateRequest()` |
| `subscriptions/[id]/route.ts` (validateRequest cast) | Same — passed to `validateRequest()` |
| `clients/[id]/route.ts` (`includeObj`, validateRequest cast) | `includeObj` already cast with `as Parameters<typeof db.client.findUnique>[0]["include"]`; validateRequest cast not Prisma |
| `contracts/route.ts` (POST `sanitizedData`) | Fields destructured individually into create data object; not passed as `data:` |

---

## Fix Pattern Used

```typescript
// For WHERE clauses (findMany, findFirst, count, aggregate, groupBy):
const where: Parameters<typeof db.MODEL.findMany>[0]["where"] = {}

// For DATA clauses (create, update):
const data: Parameters<typeof db.MODEL.update>[0]["data"] = {}

// For UPSERT:
const update: Parameters<typeof db.MODEL.upsert>[0]["update"] = {}
const create: Parameters<typeof db.MODEL.upsert>[0]["create"] = {}
```

---

## Status: ✅ COMPLETE
All `Record<string, unknown>` variables passed to Prisma operations have been replaced with proper Prisma types. All remaining `Record<string, unknown>` usages are safe (req.json() parsing, response building, or already-cast includes).
