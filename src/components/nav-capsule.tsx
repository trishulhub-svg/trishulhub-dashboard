"use client"

import { useRef, type PointerEvent } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import type { CapsulePos } from "@/hooks/use-nav-shell"

type NavCapsuleProps = {
  pos: CapsulePos
  onOpen: () => void
  onMove: (pos: CapsulePos) => void
  size?: number
}

export function NavCapsule({ pos, onOpen, onMove, size = 56 }: NavCapsuleProps) {
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
  })

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return
    const state = dragRef.current
    state.pointerId = event.pointerId
    state.startX = event.clientX
    state.startY = event.clientY
    state.origX = pos.x
    state.origY = pos.y
    state.moved = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) < 8) return
    state.moved = true
    event.preventDefault()
    event.currentTarget.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
  }

  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    event.currentTarget.style.transform = ""
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    state.pointerId = -1
    if (state.moved) {
      onMove({ x: state.origX + dx, y: state.origY + dy })
      return
    }
    onOpen()
  }

  return (
    <button
      type="button"
      className={cn("th-nav-capsule")}
      style={{ left: pos.x, top: pos.y, width: size, height: size }}
      aria-label="Open menu. Drag to move."
      title="Drag to move · tap to open"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
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
