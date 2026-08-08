# Google Drive binding for Trishulhub Files

Use only your existing Workspace seat **info@trishulhub.in** (2TB). No extra cloud bill.

## Recommended method: Service account + domain-wide delegation

Service accounts cannot store files in their own Drive quota. The app must **impersonate** `info@trishulhub.in` so files use that account’s 2TB.

### What to paste in Super Admin → Files → Drive connection

1. **Impersonate email** — `info@trishulhub.in`
2. **Service account JSON** — full JSON key from Google Cloud
3. **Root folder ID** (optional) — leave blank to auto-create `Trishulhub Files` in that Drive

### One-time Google setup (you do this once)

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project (free).
2. Enable **Google Drive API**.
3. **IAM → Service Accounts** → Create → Keys → Add key → JSON → download.
4. Copy the service account **Client ID** (numeric).
5. [Google Workspace Admin](https://admin.google.com/) (as Workspace admin for trishulhub.in):
   - Security → Access and data control → API controls → **Manage Domain Wide Delegation**
   - Add new → Client ID = service account client ID
   - OAuth scopes (exact):
     `https://www.googleapis.com/auth/drive`
6. In Trishulhub: Super Admin → Files → Settings → paste JSON + impersonate email → Save → Test connection.

### Alternate method: OAuth refresh token

If you cannot enable domain-wide delegation, use OAuth:

1. Cloud Console → OAuth client (Web) → Client ID + Secret
2. Authorize once as `info@trishulhub.in` (the settings page has a helper flow when mode = OAuth)
3. Store refresh token (encrypted in AppSetting)

Files still live in the info@ Drive quota.

## Security model (how we lock this down)

| Layer | Behavior |
|---|---|
| Trishulhub RBAC | Role toggles + custom user access + per-department grants. Restricted nodes are hidden. |
| Google Drive ACL | When a user gets department access, their **same Trishulhub login email** is shared on that Drive folder (reader/writer). Revoke access → unshare. |
| Soft delete | Deletes move to Drive **Review** folder; Super Admin / Admin manage Review; deleter can restore own items. |
| Open / edit | Files open in Google Docs/Drive (`webViewLink`) — editing happens in Google, not on our server. |
| Desktop / browser | Files UI + APIs reject typical mobile app user-agents; use PC browser only. |
| Secrets | Service account JSON / refresh token encrypted at rest (`ENCRYPTION_KEY`). Super Admin can edit or delete the connection anytime. |

### Important for employees

Sharing only works if the employee’s Trishulhub email is a real Google identity (Workspace `@trishulhub.in` or Google account). If login email ≠ Google account, Drive share invites will fail — keep Trishulhub emails aligned with Google accounts.

## What we do **not** need

- Extra Google Cloud storage products
- Per-employee Workspace Drive purchases (optional but recommended for clean sharing)
- Storing file bytes on Turso/Vercel — metadata only; bytes stay in Drive
