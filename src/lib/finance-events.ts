"use client"

import { useEffect } from "react"

export const FINANCE_CHANGED_EVENT = "th-finance-changed"

export function emitFinanceChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(FINANCE_CHANGED_EVENT))
}

export function useFinanceLiveRefresh(onChange: () => void) {
  useEffect(() => {
    const handler = () => onChange()
    window.addEventListener(FINANCE_CHANGED_EVENT, handler)
    return () => window.removeEventListener(FINANCE_CHANGED_EVENT, handler)
  }, [onChange])
}
