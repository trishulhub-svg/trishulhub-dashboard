/** Client-side Learning landing preferences (per browser). */

const TOUR_DONE_KEY = "th.learning.tourDone"
const LANDING_KEY = "th.learning.landing"

export type LearningLanding = "my" | "qr"

export function isTourDone(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(TOUR_DONE_KEY) === "1"
  } catch {
    return false
  }
}

export function setTourDone(done = true) {
  if (typeof window === "undefined") return
  try {
    if (done) window.localStorage.setItem(TOUR_DONE_KEY, "1")
    else window.localStorage.removeItem(TOUR_DONE_KEY)
  } catch {
    /* ignore */
  }
}

export function getLearningLanding(): LearningLanding {
  if (typeof window === "undefined") return "my"
  try {
    return window.localStorage.getItem(LANDING_KEY) === "qr" ? "qr" : "my"
  } catch {
    return "my"
  }
}

export function setLearningLanding(landing: LearningLanding) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(LANDING_KEY, landing)
  } catch {
    /* ignore */
  }
}

export function resolveLearningPath(role: string | undefined): string {
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"
  // Admins land on QR management by default
  if (isAdmin) return "/dashboard/training/qr"
  // Staff: sticky preference — QR only if they chose "Back to QR setup"
  return getLearningLanding() === "qr"
    ? "/dashboard/training/qr"
    : "/dashboard/training/my"
}
