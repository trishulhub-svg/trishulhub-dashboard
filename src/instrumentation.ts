// Next.js instrumentation — runs once when the server starts.
// Ensures all auto-migration tables/columns exist in the Turso database
// before any API route queries them. This prevents "no such column" errors
// on cold starts in serverless environments (Vercel).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runAutoMigrations } = await import("@/lib/auto-migrate")
      // Safety timeout: don't let migrations block the server startup for more than 10s.
      // If migrations hang (e.g., Turso connectivity issue), the server still starts
      // and individual routes will retry migrations on their own.
      await Promise.race([
        runAutoMigrations(),
        new Promise<void>((resolve) => setTimeout(resolve, 10000)),
      ])
    } catch (err: any) {
      // Non-fatal: routes will handle their own migrations
      console.error("[instrumentation] Auto-migrate failed (non-fatal):", err?.message)
    }
  }
}
