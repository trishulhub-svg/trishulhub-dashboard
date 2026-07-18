# Hold list — review later

Updated 2026-07-18 after P3 orphan wipe (Agent/Task/Meeting/Protocol/Chat).

## Removed permanently (P3)

Dropped from DB via `auto-migrate` (DROP TABLE IF EXISTS) and removed from project-delete orphan SQL:

`Agent`, `AgentRoleConfig`, `AgentAutonomyConfig`, `AgentAutonomousPrompt`, `AgentActivityLog`, `AgentConversation`, `UserAgentAccess`, `CrossAgentMessage`, `ApiUsageLog`, `Chat`, `ChatMessage`, `Task`, `TaskGitConfig`, `LarkTaskMapping`, `Meeting`, `MeetingAttendee`, `PersonalTimetableTask`, `TimetableSettings`, `ProjectAttachment`, `ScheduledTask`, `_TaskToProject`, `_MeetingToProject`, `ApiKey`, `LeaveRequest`, `ProtocolVersion`, `ProtocolInvite`, `ProtocolAccessLog`, `UserProtocolAccess`, `TrainingDocument`, `TrainingTest`, `TestAttempt`, `FileMetadata`, `FilePermission`, `Contract`.

**Kept:** current Training QR (`TrainingQr*`, `TrainingAssignment`), `VaultSecret`, `UserCredential`, `Leave`, `Approval`, etc.

## Still intentional

| Item | Notes |
|---|---|
| `agentation` SUPER_ADMIN FAB | Temporary visual feedback tool — owner will remove later |
| Workspace theatrical live feed | Intentional team vibe |
| TimeEntry `agentSessionId` / `AGENT_OTP` columns | Harmless legacy columns on live time rows; not separate Agent tables |
| Attendance vs TimeEntry | Dual presence — revisit later if needed |
| `/api/health` | Ops probe |

## Encryption note (not a UI page)

There is **no** “Encryption Key” settings screen anymore. Secrets still need a server env var:

- **`ENCRYPTION_KEY`** on Vercel — locks **API Keys** vault, Access Hub passwords, My Details KYC, SMTP passwords
- Optional: `CREDENTIAL_ENCRYPTION_KEY` or DB `AppSetting.credentialEncryptionKey` for project credentials

If missing, vault writes fail closed (by design).
