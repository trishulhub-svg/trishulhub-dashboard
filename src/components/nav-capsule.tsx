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

export function NavCapsule({ pos, onOpen, onMove, size = 56 }: NavCapsuleProps) {
  const DRAG_THRESHOLD = 10
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
    event.currentTarget.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
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
    event.currentTarget.style.transform = ""
    event.currentTarget.dataset.dragging = "false"
    if (moved) {
      // A fast phone tap that jitters a few pixels is still a tap: open.
      const quickTap = event.pointerType !== "mouse" && Date.now() - startTime < 350
      if (quickTap) {
        onOpen()
      } else if (commitMove) {
        onMove({ x: origX + dx, y: origY + dy })
      }
      return
    }
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
