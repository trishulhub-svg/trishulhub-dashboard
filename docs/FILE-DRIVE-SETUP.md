# Google Drive binding for Trishulhub Files

Use only your existing Workspace seat **info@trishulhub.in** (2TB). No extra cloud bill.

## Access model (what employees need)

| Action | Who authenticates | Google login needed? |
|---|---|---|
| Browse folders / create folders / upload in Trishulhub | **Service account** impersonating `info@trishulhub.in` | **No** |
| Trishulhub role / department file permissions | Our RBAC + FileAccessGrant | **No** |
| Open / edit a file in Google Docs / Drive | System auto-shares **that one file** to the user’s **personal Gmail**, then they edit in Google | **Yes — their personal Gmail only** |

Employees do **not** need a Workspace/`info@` login for day-to-day Files use. They stay signed into Trishulhub. Only when they click **Open** do we invite their personal Gmail as a writer on that file.

### Personal Gmail field

On **Team → Edit member**, set **Personal Gmail (file edit)** (`googleEditEmail`).

- Prefer a real `@gmail.com` (or any Google identity they already use).
- If blank, we fall back to their Trishulhub login email.
- They must be signed into that same Google account in the browser when the Docs tab opens.

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
| Trishulhub RBAC | Role toggles + custom user access + per-department grants. Restricted nodes are hidden inside the app. |
| Google Drive ACL | **Per file on Open only** — writer share to the user’s personal Gmail (`googleEditEmail` or login email). We do **not** share whole department trees for browsing. |
| Soft delete | Deletes move to Drive **Review** folder; Super Admin / Admin manage Review; deleter can restore own items. |
| Open / edit | Files open in Google Docs/Drive (`webViewLink`) after the auto-share step. |
| Desktop / browser | Files UI + APIs reject typical mobile app user-agents; use PC browser only. |
| Secrets | Service account JSON / refresh token encrypted at rest (`ENCRYPTION_KEY`). Super Admin can edit or delete the connection anytime. |

### Important for employees

- Keep **Personal Gmail (file edit)** accurate on each Team profile.
- They should use that Gmail in Chrome/Google when editing — not `info@trishulhub.in`.
- Department grants control what they see **inside Trishulhub**; Google only receives the specific file they open.

## What we do **not** need

- Extra Google Cloud storage products
- Per-employee Workspace Drive purchases for Files browse
- Storing file bytes on Turso/Vercel — metadata only; bytes stay in Drive
- Employees logging into the company Workspace account to use Files
