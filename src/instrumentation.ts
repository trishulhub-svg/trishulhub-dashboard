// Next.js instrumentation — runs once when the server starts.
// Ensures all auto-migration tables/columns exist in the Turso database
// before any API route queries them. This prevents "no such column" errors
// on cold starts in serverless environments (Vercel).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runAutoMigrations } = await import("@/lib/auto-migrate")
      const startTime = Date.now()
      let migrationTimedOut = false

      // Safety timeout: don't let migrations block the server startup for more than 10s.
      // If migrations hang (e.g., Turso connectivity issue), the server still starts
      // and individual routes will retry migrations on their own.
      await Promise.race([
        (async () => {
          await runAutoMigrations()
        })(),
        new Promise<void>((resolve) => {
          setTimeout(() => {
            migrationTimedOut = true
            resolve()
          }, 10000)
        }),
      ])

      const elapsed = Date.now() - startTime

      if (migrationTimedOut) {
        console.warn(
          `[instrumentation] Auto-migrate timed out after ${elapsed}ms — migrations may still be running in background`,
        )
      } else {
        console.log(
          `[instrumentation] Auto-migrate completed successfully in ${elapsed}ms`,
        )
      }
    } catch (error) {
      console.error(
        "[instrumentation] Auto-migrate failed during server startup:",
        error,
      )
      // Non-fatal — individual routes have their own migration fallback
    }
  }
}
