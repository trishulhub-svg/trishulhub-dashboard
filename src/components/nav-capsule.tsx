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
const QUICK_TAP_RADIUS = 16

export function NavCapsule({ pos, onOpen, onMove, size = 56 }: NavCapsuleProps) {
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    dx: 0,
    dy: 0,
    moved: false,
    startTime: 0,
  })

  const clampToViewport = (x: number, y: number) => {
    const maxX = Math.max(EDGE, window.innerWidth - size - EDGE)
    const maxY = Math.max(EDGE, window.innerHeight - size - EDGE)
    return {
      x: Math.min(maxX, Math.max(EDGE, x)),
      y: Math.min(maxY, Math.max(EDGE, y)),
    }
  }

  const restore = (el: HTMLButtonElement, x: number, y: number) => {
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.dataset.dragging = "false"
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const state = dragRef.current
    state.pointerId = event.pointerId
    state.startX = event.clientX
    state.startY = event.clientY
    state.origX = pos.x
    state.origY = pos.y
    state.dx = 0
    state.dy = 0
    state.moved = false
    state.startTime = Date.now()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
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
      haptic("select")
      event.currentTarget.dataset.dragging = "true"
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
    const { moved, dx, dy, origX, origY, startTime } = state
    state.pointerId = -1
    state.moved = false
    try {
      event.currentTarget.releasePointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    const el = event.currentTarget
    if (moved) {
      // A fast phone tap that jitters only a few pixels is still a tap:
      // open the menu. Anything beyond that is a real drag and commits.
      const quickTap =
        event.pointerType !== "mouse" &&
        Date.now() - startTime < 350 &&
        Math.hypot(dx, dy) < QUICK_TAP_RADIUS
      if (quickTap) {
        restore(el, origX, origY)
        onOpen()
      } else if (commitMove) {
        const next = clampToViewport(origX + dx, origY + dy)
        // The element already sits at `next`; React commits the same value,
        // so there is no snap-back or jump on release.
        onMove(next)
        el.dataset.dragging = "false"
      } else {
        restore(el, origX, origY)
      }
      return
    }
    restore(el, origX, origY)
    // Phones open with a single tap; desktop keeps double-click.
    if (event.pointerType !== "mouse") onOpen()
  }

  return (
    <button
      type="button"
      className={cn("th-nav-capsule")}
      style={{ left: pos.x, top: pos.y, width: size, height: size }}
      aria-label="Open menu. Drag to move. Double-click to open."
      title="Drag to move · double-click to open"
      data-dragging="false"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onLostPointerCapture={(e) => endDrag(e, true)}
      onDoubleClick={onOpen}
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
