// Next.js instrumentation — runs once when the server starts.
// Ensures all auto-migration tables/columns exist in the Turso database
// before any API route queries them. This prevents "no such column" errors
// on cold starts in serverless environments (Vercel).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runAutoMigrations } = await import("@/lib/auto-migrate")
    await runAutoMigrations()
  }
}
