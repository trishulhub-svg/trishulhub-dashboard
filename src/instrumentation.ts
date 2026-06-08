// Next.js instrumentation — runs once when the server starts.
// Ensures all auto-migration tables/columns exist in the Turso database
// before any API route queries them. This prevents "no such column" errors
// on cold starts in serverless environments (Vercel).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runAutoMigrations } = await import("@/lib/auto-migrate")
      const startTime = Date.now()

      // Safety timeout: don't let migrations block the server startup for more than 10s.
      // If migrations hang (e.g., Turso connectivity issue), the timeout rejects and
      // the error is caught below, allowing the server to start anyway.
      await Promise.race([
        (async () => {
          await runAutoMigrations()
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Migration timeout after 10s")), 10000)
        ),
      ])

      const elapsed = Date.now() - startTime
      console.log(
        `[instrumentation] Auto-migrate completed successfully in ${elapsed}ms`,
      )
    } catch (error) {
      console.error(
        "[instrumentation] Auto-migrate failed during server startup:",
        error,
      )
      // Non-fatal — individual routes have their own migration fallback
    }
  }
}
