/**
 * Lightweight haptic feedback for mobile interactions.
 * - Android / supported browsers: navigator.vibrate
 * - iOS: short low-frequency audio pulse (iOS Safari has no vibration API)
 * - Desktop: no-op
 */

let audioCtx: AudioContext | null = null

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

function pulse(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    audioCtx ??= new Ctor()
    const ctx = audioCtx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 150
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {
    /* haptics are best-effort */
  }
}

export type HapticKind = "tap" | "select" | "drop"

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: [12],
  select: [16],
  drop: [14, 40, 14],
}

export function haptic(kind: HapticKind = "tap"): void {
  if (typeof navigator === "undefined") return
  if ("vibrate" in navigator) {
    try {
      if (navigator.vibrate(PATTERNS[kind])) return
    } catch {
      /* fall through to pulse */
    }
  }
  if (isMobile()) pulse()
}
