/**
 * Open native apps when possible; fall back to the web URL if the app
 * is not installed (or the deep link is ignored).
 */

export type DeviceKind = "ios" | "android" | "mac" | "windows" | "other"

export function detectDevice(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): DeviceKind {
  const u = ua || ""
  if (/iPhone|iPad|iPod/i.test(u)) return "ios"
  if (/Android/i.test(u)) return "android"
  if (/Macintosh|Mac OS X/i.test(u) && !/Mobile/i.test(u)) return "mac"
  if (/Windows/i.test(u)) return "windows"
  return "other"
}

function tryDeepLink(url: string): void {
  try {
    // Hidden iframe is more reliable than location.href for custom schemes on mobile
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = url
    document.body.appendChild(iframe)
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* ignore */
      }
    }, 2000)
  } catch {
    try {
      window.location.href = url
    } catch {
      /* ignore */
    }
  }
}

/**
 * Attempt app deep link(s), then open the web fallback if the page is still
 * visible after a short delay (app likely not installed).
 */
export function openAppOrWeb(options: {
  deepLinks: string[]
  webUrl: string
  timeoutMs?: number
}): void {
  const { deepLinks, webUrl, timeoutMs = 1400 } = options
  if (typeof window === "undefined") return

  const started = Date.now()
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const cleanup = () => {
    cancelled = true
    if (fallbackTimer) clearTimeout(fallbackTimer)
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pagehide", onHide)
    window.removeEventListener("blur", onHide)
  }

  const onHide = () => {
    // App likely took focus — cancel web fallback
    cleanup()
  }

  const onVisibility = () => {
    if (document.hidden) onHide()
  }

  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", onHide)
  window.addEventListener("blur", onHide)

  for (const link of deepLinks) {
    if (link.startsWith("http://") || link.startsWith("https://")) {
      // Universal / intent HTTPS links — open directly in a new tab/window
      window.open(link, "_blank", "noopener,noreferrer")
      cleanup()
      return
    }
    tryDeepLink(link)
  }

  fallbackTimer = setTimeout(() => {
    if (cancelled) return
    // Still here → open web fallback
    if (Date.now() - started < timeoutMs + 500 && !document.hidden) {
      window.open(webUrl, "_blank", "noopener,noreferrer")
    }
    cleanup()
  }, timeoutMs)
}

/** Cursor Workspace — native app on iOS/Mac when available. */
export function openCursorWorkspace(): void {
  const device = detectDevice()
  const webUrl = "https://cursor.com/agents"
  const deepLinks: string[] = []

  if (device === "ios" || device === "mac") {
    // Official Cursor deeplink scheme (opens desktop/iOS app when installed)
    deepLinks.push("cursor://anysphere.cursor-deeplink/agents")
    deepLinks.push("cursor://agents")
  }

  if (deepLinks.length === 0) {
    window.open(webUrl, "_blank", "noopener,noreferrer")
    return
  }

  openAppOrWeb({ deepLinks, webUrl })
}

/** QWEN workspace — native app on iOS/Android/Mac when available. */
export function openQwenWorkspace(): void {
  const device = detectDevice()
  const webUrl = "https://chat.qwen.ai/"
  const deepLinks: string[] = []

  if (device === "ios") {
    deepLinks.push("qwen://")
    deepLinks.push("qwen://chat")
  } else if (device === "android") {
    // Official Play package: com.tongyi.intl — Intent with browser fallback
    deepLinks.push(
      "intent://chat.qwen.ai/#Intent;scheme=https;package=com.tongyi.intl;S.browser_fallback_url=https%3A%2F%2Fchat.qwen.ai%2F;end"
    )
    deepLinks.push("qwen://")
  } else if (device === "mac") {
    deepLinks.push("qwen://")
    deepLinks.push("qwen://chat")
  }

  if (deepLinks.length === 0) {
    window.open(webUrl, "_blank", "noopener,noreferrer")
    return
  }

  openAppOrWeb({ deepLinks, webUrl })
}
