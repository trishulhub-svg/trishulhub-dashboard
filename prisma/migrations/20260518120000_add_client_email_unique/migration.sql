-- Add unique constraint on Client.email
-- Note: If duplicate emails exist, this will fail. Run deduplication first.
CREATE UNIQUE INDEX IF NOT EXISTS "Client_email_key" ON "Client"("email");
