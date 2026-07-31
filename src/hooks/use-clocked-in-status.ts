"use client"

import { useCallback, useEffect, useState } from "react"

export const TT_CLOCK_CHANGED_EVENT = "tt-clock-changed"

export type ActiveClockStatus = {
  active: boolean
  entryId?: string
  clockIn?: string
  label?: string
}

/** Notify the global header indicator that clock-in state may have changed. */
export function notifyClockStatusChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(TT_CLOCK_CHANGED_EVENT))
}

/**
 * Polls lean /api/time-tracking/active-me so every dashboard page can show
 * a clocked-in indicator. Refreshes on focus, visibility, and custom events.
 */
export function useClockedInStatus(enabled = true) {
  const [status, setStatus] = useState<ActiveClockStatus>({ active: false })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setStatus({ active: false })
      setLoading(false)
      return
    }
    try {
      const res = await fetch("/api/time-tracking/active-me", {
        credentials: "include",
        cache: "no-store",
        signal,
      })
      if (!res.ok) {
        if (res.status === 401) setStatus({ active: false })
        return
      }
      const data = await res.json()
      setStatus({
        active: Boolean(data?.active),
        entryId: typeof data?.entryId === "string" ? data.entryId : undefined,
        clockIn: typeof data?.clockIn === "string" ? data.clockIn : undefined,
        label: typeof data?.label === "string" ? data.label : undefined,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setStatus({ active: false })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    void refresh(controller.signal)

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 45_000)

    const onFocus = () => void refresh()
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const onClockChanged = () => void refresh()

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener(TT_CLOCK_CHANGED_EVENT, onClockChanged)

    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener(TT_CLOCK_CHANGED_EVENT, onClockChanged)
    }
  }, [enabled, refresh])

  return { status, loading, refresh }
}
