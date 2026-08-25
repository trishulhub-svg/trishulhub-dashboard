"use client"

import { useRef, type PointerEvent } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"
import type { CapsulePos } from "@/hooks/use-nav-shell"

type NavCapsuleProps = {
  pos: CapsulePos
  onOpen: () => void
  onMove: (pos: CapsulePos) => void
  size?: number
}

const EDGE = 8
const DRAG_THRESHOLD = 10
const TAP_RADIUS = 16
const LONG_PRESS_MS = 450
const TIP_MS = 2800

type DragState = {
  pointerId: number
  startX: number
  startY: number
  origX: number
  origY: number
  dx: number
  dy: number
  moved: boolean
  startTime: number
  longPressTimer: number | null
  longPressFired: boolean
  tipTimer: number | null
}

export function NavCapsule({ pos, onOpen, onMove, size = 56 }: NavCapsuleProps) {
  const dragRef = useRef<DragState>({
    pointerId: -1,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    dx: 0,
    dy: 0,
    moved: false,
    startTime: 0,
    longPressTimer: null,
    longPressFired: false,
    tipTimer: null,
  })

  const clampToViewport = (x: number, y: number) => {
    const maxX = Math.max(EDGE, window.innerWidth - size - EDGE)
    const maxY = Math.max(EDGE, window.innerHeight - size - EDGE)
    return {
      x: Math.min(maxX, Math.max(EDGE, x)),
      y: Math.min(maxY, Math.max(EDGE, y)),
    }
  }

  const clearLongPress = () => {
    const s = dragRef.current
    if (s.longPressTimer !== null) {
      window.clearTimeout(s.longPressTimer)
      s.longPressTimer = null
    }
  }

  const clearTipTimer = () => {
    const s = dragRef.current
    if (s.tipTimer !== null) {
      window.clearTimeout(s.tipTimer)
      s.tipTimer = null
    }
  }

  const hideTip = (el: HTMLButtonElement) => {
    clearTipTimer()
    el.dataset.tip = "false"
  }

  const toggleTip = (el: HTMLButtonElement) => {
    if (el.dataset.tip === "true") {
      hideTip(el)
      return
    }
    el.dataset.tip = "true"
    clearTipTimer()
    dragRef.current.tipTimer = window.setTimeout(() => {
      el.dataset.tip = "false"
      dragRef.current.tipTimer = null
    }, TIP_MS)
  }

  const restore = (el: HTMLButtonElement, x: number, y: number) => {
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.dataset.dragging = "false"
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const state = dragRef.current
    const el = event.currentTarget
    const pointerId = event.pointerId
    state.pointerId = pointerId
    state.startX = event.clientX
    state.startY = event.clientY
    state.origX = pos.x
    state.origY = pos.y
    state.dx = 0
    state.dy = 0
    state.moved = false
    state.startTime = Date.now()
    state.longPressFired = false
    clearLongPress()
    if (event.pointerType !== "mouse") {
      // Touch-and-hold opens the menu; a quick tap only shows the hint.
      state.longPressTimer = window.setTimeout(() => {
        const s = dragRef.current
        if (s.pointerId !== pointerId || s.moved) return
        s.longPressFired = true
        s.pointerId = -1
        s.longPressTimer = null
        restore(el, pos.x, pos.y)
        hideTip(el)
        onOpen()
      }, LONG_PRESS_MS)
    }
    try {
      el.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    const justStarted = !state.moved
    state.moved = true
    state.dx = dx
    state.dy = dy
    if (justStarted) {
      clearLongPress()
      haptic("select")
      event.currentTarget.dataset.dragging = "true"
      hideTip(event.currentTarget)
    }
    event.preventDefault()
    // Track the finger 1:1 in real time. left/top are instant (no CSS
    // transition or animation pins them), so the capsule never lags or
    // jumps at release.
    const next = clampToViewport(state.origX + dx, state.origY + dy)
    event.currentTarget.style.left = `${next.x}px`
    event.currentTarget.style.top = `${next.y}px`
  }

  const endDrag = (event: PointerEvent<HTMLButtonElement>, commitMove: boolean) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return
    const pointerId = state.pointerId
    const { moved, dx, dy, origX, origY, longPressFired } = state
    clearLongPress()
    state.pointerId = -1
    state.moved = false
    try {
      event.currentTarget.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    const el = event.currentTarget
    if (longPressFired) return // menu already opened via touch-and-hold
    if (moved) {
      if (commitMove && Math.hypot(dx, dy) >= TAP_RADIUS) {
        const next = clampToViewport(origX + dx, origY + dy)
        // The element already sits at `next`; React commits the same value,
        // so there is no snap-back or jump on release.
        onMove(next)
        el.dataset.dragging = "false"
      } else if (commitMove) {
        // Tiny jitter on a tap: snap back and show the hint bubble.
        restore(el, origX, origY)
        toggleTip(el)
      } else {
        restore(el, origX, origY)
      }
      return
    }
    restore(el, origX, origY)
    // Single click/tap (no drag) opens the menu on every device.
    onOpen()
  }

  return (
    <button
      type="button"
      className={cn("th-nav-capsule")}
      style={{ left: pos.x, top: pos.y, width: size, height: size }}
      aria-label="Open menu. Click or tap to open. Drag to move."
      data-tip-side={pos.y < 120 ? "bottom" : "top"}
      data-dragging="false"
      data-tip="false"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onLostPointerCapture={(e) => endDrag(e, true)}
    >
      <span className="th-nav-capsule-ring" aria-hidden />
      <span className="th-nav-capsule-mark">
        <Image
          src="/logo-mark.png"
          alt=""
          width={28}
          height={28}
          className="object-contain"
          data-no-warm
        />
      </span>
    </button>
  )
}
