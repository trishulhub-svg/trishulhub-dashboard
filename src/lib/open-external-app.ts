/**
 * Open native apps when possible; fall back to the web URL if the app
 * is not installed (or the deep link is ignored).
 *
 * Important: never open the web URL in the same breath as the protocol
 * attempt — that always looks like "it opens the previous (web) link".
 * We only open web after a delay IF the page never lost focus.
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

const CHATGPT_LOGIN_URL = "https://chatgpt.com/auth/login"
const CHATGPT_ANDROID_PACKAGE = "com.openai.chatgpt"

/**
 * Device-aware ChatGPT deep links.
 * - Android: package intent (reliable in Chrome; optional login fallback)
 * - iOS: chatgpt:// custom scheme
 */
function chatGptDeepLinks(device: DeviceKind, withLoginFallback: boolean): string[] {
  if (device === "android") {
    const fallback = withLoginFallback
      ? `;S.browser_fallback_url=${encodeURIComponent(CHATGPT_LOGIN_URL)}`
      : ""
    return [
      `intent://chatgpt.com/#Intent;scheme=https;package=${CHATGPT_ANDROID_PACKAGE}${fallback};end`,
    ]
  }
  return ["chatgpt://"]
}

function tryProtocolLaunch(url: string): void {
  try {
    // 1) Hidden iframe — common pattern for custom schemes
    const iframe = document.createElement("iframe")
    iframe.setAttribute("style", "display:none;width:0;height:0;border:0;position:absolute")
    iframe.src = url
    document.body.appendChild(iframe)
    window.setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* ignore */
      }
    }, 2500)
  } catch {
    /* ignore */
  }

  try {
    // 2) Synthetic <a> click — more reliable on desktop Chromium/Windows
    const a = document.createElement("a")
    a.href = url
    a.rel = "noopener noreferrer"
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    window.setTimeout(() => {
      try {
        document.body.removeChild(a)
      } catch {
        /* ignore */
      }
    }, 0)
  } catch {
    /* ignore */
  }
}

/**
 * Attempt app deep link(s), then open the web fallback only if the page is
 * still focused after a short delay (app likely not installed).
 */
export function openAppOrWeb(options: {
  deepLinks: string[]
  webUrl?: string
  timeoutMs?: number
  onNotInstalled?: () => void
}): void {
  const { deepLinks, webUrl, timeoutMs = 2200, onNotInstalled } = options
  if (typeof window === "undefined") return

  let appLikelyOpened = false
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer)
      fallbackTimer = null
    }
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("pagehide", markOpened)
    window.removeEventListener("blur", markOpened)
  }

  const markOpened = () => {
    appLikelyOpened = true
    cleanup()
  }

  const onVisibility = () => {
    if (document.hidden) markOpened()
  }

  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("pagehide", markOpened)
  window.addEventListener("blur", markOpened)

  for (const link of deepLinks) {
    if (link.startsWith("http://") || link.startsWith("https://")) {
      // Universal / HTTPS links — open in a new tab (no protocol race)
      window.open(link, "_blank", "noopener,noreferrer")
      cleanup()
      return
    }
    tryProtocolLaunch(link)
  }

  fallbackTimer = setTimeout(() => {
    // Still focused & visible → app did not take over → open web
    if (
      !appLikelyOpened &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    ) {
      if (webUrl) {
        window.open(webUrl, "_blank", "noopener,noreferrer")
      } else {
        onNotInstalled?.()
      }
    }
    cleanup()
  }, timeoutMs)
}

/**
 * Codex Workspace — opens the ChatGPT mobile app on phones/tablets and the
 * Codex desktop app on PCs. Only opens when the target app is installed;
 * otherwise onNotInstalled is called so the UI can ask to install it first.
 */
export function openCodexApp(onNotInstalled?: (app: "chatgpt" | "codex") => void): void {
  if (typeof window === "undefined") return
  const device = detectDevice()
  const isMobile = device === "ios" || device === "android"

  if (isMobile) {
    openAppOrWeb({
      deepLinks: chatGptDeepLinks(device, false),
      timeoutMs: 1400,
      onNotInstalled: () => onNotInstalled?.("chatgpt"),
    })
    return
  }

  // Codex Desktop registers the codex:// protocol (e.g. codex://threads/new).
  openAppOrWeb({
    deepLinks: ["codex://threads/new"],
    timeoutMs: 1400,
    onNotInstalled: () => onNotInstalled?.("codex"),
  })
}

/**
 * Research GPT — opens the ChatGPT mobile app on phones/tablets (falls back
 * to the login page if the app is not installed) and the ChatGPT login page
 * in a new tab on desktop.
 */
export function openResearchGpt(): void {
  if (typeof window === "undefined") return
  const device = detectDevice()
  if (device === "ios" || device === "android") {
    openAppOrWeb({
      deepLinks: chatGptDeepLinks(device, true),
      webUrl: CHATGPT_LOGIN_URL,
      timeoutMs: 1400,
    })
    return
  }
  window.open(CHATGPT_LOGIN_URL, "_blank", "noopener,noreferrer")
}

/** QWEN workspace — try native app / intent, then web. */
export function openQwenWorkspace(): void {
  const device = detectDevice()
  const webUrl = "https://chat.qwen.ai/"
  const deepLinks: string[] = []

  if (device === "android") {
    // Official Play package: com.tongyi.intl — Intent with browser fallback
    deepLinks.push(
      "intent://chat.qwen.ai/#Intent;scheme=https;package=com.tongyi.intl;S.browser_fallback_url=https%3A%2F%2Fchat.qwen.ai%2F;end"
    )
  }

  // Custom scheme used by Qwen desktop/mobile apps (Windows/Mac/iOS/Android)
  deepLinks.push("qwen://chat")
  deepLinks.push("qwen://")

  openAppOrWeb({ deepLinks, webUrl, timeoutMs: 1400 })
}
