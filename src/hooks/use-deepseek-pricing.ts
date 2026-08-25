"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  getDeepSeekPricingState,
  type DeepSeekPricingState,
} from "@/lib/deepseek-pricing"

function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * Live DeepSeek Peak/Off-Peak state.
 * - Recomputes on mount, every minute, on tab visibility, and on window focus
 *   (covers sleep/resume, DST changes, and long-open tabs).
 * - State is always derived from Asia/Shanghai; timezone is display-only.
 */
export function useDeepSeekPricing(profileCountry?: string | null): DeepSeekPricingState {
  const [state, setState] = useState<DeepSeekPricingState>(() =>
    getDeepSeekPricingState(new Date(), browserTimezone(), profileCountry)
  )
  const profileCountryRef = useRef(profileCountry)
  profileCountryRef.current = profileCountry

  const refresh = useCallback(() => {
    setState(getDeepSeekPricingState(new Date(), browserTimezone(), profileCountryRef.current))
  }, [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    const onFocus = () => refresh()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onFocus)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onFocus)
      clearInterval(timer)
    }
  }, [refresh])

  return state
}
