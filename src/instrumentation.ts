// Next.js instrumentation — runs once when the server starts.
// Ensures all auto-migration tables/columns exist in the Turso database
// before any API route queries them. This prevents "no such column" errors
// on cold starts in serverless environments (Vercel).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { runAutoMigrations } = await import("@/lib/auto-migrate")
      const startTime = Date.now()

      // Prefer critical schema (tables/columns) completing before the timeout.
      // Full migrate can continue; 25s allows Turso ALTERs after cold deploy.
      const { ensureCriticalSchema } = await import("@/lib/auto-migrate")
      await Promise.race([
        (async () => {
          await ensureCriticalSchema()
          await runAutoMigrations()
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Migration timeout after 25s")), 25000)
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
