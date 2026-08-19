/**
 * Lightweight haptic feedback for mobile interactions.
 * - Android / supported browsers: navigator.vibrate
 * - iOS: short low-frequency audio pulse (iOS Safari has no vibration API)
 * - Desktop: no-op
 */

let audioCtx: AudioContext | null = null

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(
    typeof navigator !== "undefined" ? navigator.userAgent : ""
  )
}

function iosPulse(): void {
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
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.06)
  } catch {
    /* haptics are best-effort */
  }
}

export type HapticKind = "tap" | "select" | "drop"

export function haptic(kind: HapticKind = "tap"): void {
  if (typeof navigator === "undefined") return
  const duration = kind === "drop" ? 18 : kind === "select" ? 10 : 6
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(duration)
    } catch {
      /* ignore */
    }
    return
  }
  if (isIos()) iosPulse()
}
