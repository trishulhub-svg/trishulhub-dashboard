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

## Server requirement (both methods)

Drive credentials are encrypted in the database. Production needs a valid:

```
ENCRYPTION_KEY=<64 hex characters>
```

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  
Set it in **Vercel → Project → Settings → Environment Variables**, then **redeploy**.  
If missing, Save connection fails and Test will say Drive is not connected.

## Recommended when org blocks SA JSON keys: OAuth

Use this if Google shows *“Organization Policy that blocks service account key creation”*.

### What to paste in Super Admin → Files → Settings

1. Mode: **OAuth (no SA key)**
2. Impersonate email: `info@trishulhub.in` (label only; OAuth uses the Google user who authorized)
3. OAuth Client ID
4. OAuth Client Secret
5. Refresh token
6. Root folder ID: leave blank → Save → Test connection

### One-time Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/) → project **Trishulhub Files** (a **project**, not the organization).
2. Enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → Internal → add scope  
   `https://www.googleapis.com/auth/drive`
4. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URI: `https://developers.google.com/oauthplayground`
   - Copy **Client ID** + **Client Secret**
5. Open [OAuth Playground](https://developers.google.com/oauthplayground) → gear → **Use your own OAuth credentials** → paste ID/Secret  
   → Drive API v3 → select `https://www.googleapis.com/auth/drive` → Authorize as **`info@trishulhub.in`**  
   → Exchange code → copy **Refresh token**
6. Paste all three in Trishulhub → Save → Test.

Files still live in the info@ Drive quota. No service account JSON required.

## Alternate method: Service account + domain-wide delegation

Only if your org allows downloading service account JSON keys.

1. Cloud Console project → Service account → Keys → JSON
2. Workspace Admin → Domain-wide delegation → SA Unique ID → scope  
   `https://www.googleapis.com/auth/drive`
3. Trishulhub mode **Service account** → paste JSON + impersonate `info@trishulhub.in` → Save → Test

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
