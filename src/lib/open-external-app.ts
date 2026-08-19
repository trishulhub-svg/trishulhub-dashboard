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
const QWEN_WEB_URL = "https://chat.qwen.ai/"
const QWEN_ANDROID_PACKAGE = "ai.qwenlm.chat.android"

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
  // Anchor click first — it keeps the user gesture, which Android Chrome
  // requires for intent:// launches. Starting with a hidden iframe can
  // consume that activation and silently block the real launch.
  try {
    const a = document.createElement("a")
    a.href = url
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    window.setTimeout(() => {
      try {
        document.body.removeChild(a)
      } catch {
        /* ignore */
      }
    }, 1200)
  } catch {
    /* ignore */
  }

  // Hidden-iframe fallback (helps a few iOS custom-scheme cases).
  try {
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
}

/**
 * Attempt app deep link(s), then open the web fallback only if the page is
 * still focused after a short delay (app likely not installed).
 */
export function openAppOrWeb(options: {
  deepLinks: string[]
  webUrl?: string
  sameTabUrl?: string
  timeoutMs?: number
  onNotInstalled?: () => void
}): void {
  const { deepLinks, webUrl, sameTabUrl, timeoutMs = 2200, onNotInstalled } = options
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
      if (sameTabUrl) {
        // Same-tab navigation is what triggers Android App Links, so the
        // installed app takes over instead of opening a browser tab.
        window.location.href = sameTabUrl
      } else if (webUrl) {
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
 * on desktop, onNotInstalled is called so the UI can ask to install it first.
 */
export function openCodexApp(onNotInstalled?: (app: "chatgpt" | "codex") => void): void {
  if (typeof window === "undefined") return
  const device = detectDevice()
  const isMobile = device === "ios" || device === "android"

  if (isMobile) {
    openAppOrWeb({
      deepLinks: chatGptDeepLinks(device, false),
      // chatgpt.com is a verified Android App Link: if the app is installed,
      // Android opens ChatGPT directly; otherwise the web app loads.
      sameTabUrl: "https://chatgpt.com/",
      timeoutMs: 1000,
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
      // Same-tab App Link navigation: installed app opens, otherwise the
      // ChatGPT login page loads in the browser.
      sameTabUrl: CHATGPT_LOGIN_URL,
      timeoutMs: 1000,
    })
    return
  }
  window.open(CHATGPT_LOGIN_URL, "_blank", "noopener,noreferrer")
}

/** QWEN workspace — Qwen Studio app on Android, native app / web elsewhere. */
export function openQwenWorkspace(): void {
  const device = detectDevice()

  if (device === "android") {
    openAppOrWeb({
      deepLinks: [
        `intent://chat.qwen.ai/#Intent;scheme=https;package=${QWEN_ANDROID_PACKAGE};end`,
      ],
      // Qwen Studio has no verified App Link, so fall back to the
      // package-based market launch: opens the app if installed, or the
      // Play Store listing so it can be installed.
      sameTabUrl: `market://launch?id=${QWEN_ANDROID_PACKAGE}`,
      timeoutMs: 1000,
    })
    return
  }

  // Custom scheme used by Qwen desktop/mobile apps (Windows/Mac/iOS)
  openAppOrWeb({
    deepLinks: ["qwen://chat", "qwen://"],
    webUrl: QWEN_WEB_URL,
    timeoutMs: 1400,
  })
}
