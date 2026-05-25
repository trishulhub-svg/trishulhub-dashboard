import { useRouter } from "next/navigation"

/**
 * Handle 401 responses by redirecting to login.
 * Returns true if the response was a 401 (caller should abort).
 */
export function handleFetchError(res: Response, router: ReturnType<typeof useRouter>): boolean {
  if (res.status === 401) {
    router.push("/login")
    return true
  }
  return false
}
