/** Shared authenticated fetch helpers — reduces per-page boilerplate. */

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Json = Record<string, unknown> | unknown[] | null

export async function apiFetch<T = Json>(
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  })

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/login"
    throw new ApiError("Unauthorized", 401)
  }

  const data = (await res.json().catch(() => null)) as T & { error?: string }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`
    throw new ApiError(msg.slice(0, 200), res.status)
  }
  return data
}
