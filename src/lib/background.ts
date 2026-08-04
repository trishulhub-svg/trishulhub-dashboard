/**
 * Run work after the HTTP response is sent so Save/Submit buttons stay snappy.
 * Uses Next.js `after()` when available (keeps the work alive on Vercel).
 */
import { after } from "next/server"

export function runAfterResponse(task: () => Promise<void> | void): void {
  const run = async () => {
    try {
      await task()
    } catch (err: unknown) {
      console.error(
        "[background] task failed:",
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  try {
    after(run)
  } catch {
    // Fallback outside request context (tests / scripts)
    void run()
  }
}
