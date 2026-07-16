# Hold list — review later (do not wipe without approval)

Saved 2026-07-16 after dead-code wipe (#26). Keep until product review.

## Product / models (still in use lightly or dual systems)

| Item | Notes |
|---|---|
| Contact / Deal models + client detail tabs | Read via `/api/clients/[id]`; no dedicated CRUD UI |
| Approval model + page | Lightly used (PATCH / counts); AI-era types remain |
| Attendance vs TimeEntry | Two presence systems |
| Leave vs unavailable date ranges | Overlapping “time off” concepts |
| Availability weekly / override / date-range | Three schedule layers |
| `Client.website` legacy field | Dual with `ClientWebsite` |
| `TimeEntry` AGENT_OTP / agentSessionId / clock methods | Legacy columns; display only |
| NotificationPreference unused toggles / quiet hours | Fields exist; not fully enforced in notify |
| UserDetail reserved enc IV/tag fields | Never written |
| Approvals UI `agent` / AI-era types | Cosmetic leftovers |
| Workspace fake AGENT/PROTOCOL feed lines | Visual only |

## Ops / deploy (intentional)

| Item | Notes |
|---|---|
| `/api/health` | External ops probe |
| Hostinger stack (`app.js`, Caddyfile, …) | Non-Vercel deploy path |
| Middleware redirects `/dashboard/agents`, `/training/setup` | Bookmark safety |
| `agentation` (SUPER_ADMIN visual tool) | Mounted in dashboard layout |

## DB cleanup (remote Turso — do not auto-drop)

Possible orphan tables from old migrations (may still exist in prod DB):
`Agent*`, `Chat*`, `ApiKey`, `LeaveRequest`, `Meeting*`, `Task`, `TrainingDocument` / `TrainingTest` / `TestAttempt`, `PersonalTimetableTask`, `TimetableSettings`, `ProtocolVersion` / `ProtocolInvite` / `UserProtocolAccess`, `ScheduledTask`, `FileMetadata`, `FilePermission`, `ProjectAttachment`, `ProtocolAccessLog`.

## Code leftovers (low priority trim)

| Item | Notes |
|---|---|
| Unused Zod schemas in `validations.ts` | Beyond deals/contacts already removed |
| Empty `vercel.json` | No crons |
| README agents routes | Outdated docs |
| Audit taxonomy “tasks” page label | Historical |

## RBAC policy decisions (hold — revisit when needed)

| Item | Notes |
|---|---|
| VIEWER role | No nav items; can still hit open routes + write leaves/time via API |
| Audit trail API vs page | `canViewAuditTrail` allows PM/DEV/VIEWER but middleware/nav is admin-only |
| Soft-delete / archive for projects | Hard DELETE still cascades invoices/expenses — product decision |
| DEVELOPER access to Projects page | Currently Admin/PM only (nav + middleware); members see via other surfaces |

---

When ready: reply with items to remove or keep permanently.
