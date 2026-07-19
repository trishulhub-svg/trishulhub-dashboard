# Environment variables (names only — no real secrets)

## Server

| Name | Purpose |
|------|---------|
| `DATABASE_URL` | Prisma / SQLite fallback URL |
| `TURSO_DATABASE_URL` | Turso libSQL database URL |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `NEXTAUTH_URL` | Canonical app URL |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret |
| `SETUP_TOKEN` | Optional first-time seed token |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server secret (CAPTCHA) |
| `CREDENTIAL_ENCRYPTION_KEY` | Encrypt credentials / SMTP passwords at rest |
| `SMTP_*` / DB SmtpConfig | Outbound email (configured in app) |
| `VERCEL_TOKEN` | Optional deploy token |
| `CLOUDINARY_CLOUD_NAME` | Optional media |
| `CLOUDINARY_API_KEY` | Optional media |
| `CLOUDINARY_API_SECRET` | Optional media |

## Public (browser)

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key for login / forgot / reset CAPTCHA |

## Notes

- Never commit `.env*` values.
- CAPTCHA fallback activates after auth lockout thresholds when both Turnstile keys are set.
- Without Turnstile keys, rate limits still lock out abusive IPs/emails until the window resets.
