"use client"

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"

type IndicatorRect = {
  top: number
  left: number
  width: number
  height: number
  opacity: number
}

const SPRING =
  "transform 0.44s cubic-bezier(0.32, 0.72, 0, 1), width 0.36s cubic-bezier(0.32, 0.72, 0, 1), height 0.36s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.22s ease"

type LiquidNavRailProps = {
  activeKey: string
  onActivate?: (key: string) => void
  className?: string
  children: React.ReactNode
}

function escapeAttr(value: string) {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

export function LiquidNavRail({
  activeKey,
  onActivate,
  className,
  children,
}: LiquidNavRailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({
    dragging: false,
    pointerId: -1,
    didDrag: false,
    startX: 0,
    startY: 0,
  })
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const previewKeyRef = useRef<string | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [indicator, setIndicator] = useState<IndicatorRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  })

  const displayKey = previewKey ?? activeKey

  useEffect(() => {
    previewKeyRef.current = previewKey
  }, [previewKey])

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }

  const beginDrag = (pointerId: number) => {
    const state = dragRef.current
    if (state.dragging) return
    state.dragging = true
    state.didDrag = true
    setDragging(true)
    try {
      containerRef.current?.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
  }

  const getItemElements = useCallback(() => {
    const container = containerRef.current
    if (!container) return []
    return Array.from(
      container.querySelectorAll<HTMLElement>("[data-liquid-nav-key]")
    )
  }, [])

  const measureKey = useCallback(
    (key: string, instant = false) => {
      const container = containerRef.current
      if (!container || !key) return
      const el = container.querySelector(
        `[data-liquid-nav-key="${escapeAttr(key)}"]`
      ) as HTMLElement | null
      if (!el) return
      const cRect = container.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      setIndicator({
        top: eRect.top - cRect.top + container.scrollTop,
        left: eRect.left - cRect.left + container.scrollLeft,
        width: eRect.width,
        height: eRect.height,
        opacity: 1,
      })
      if (instant && container) {
        container.style.setProperty("--th-liquid-snap", "1")
        requestAnimationFrame(() => {
          container?.style.removeProperty("--th-liquid-snap")
        })
      }
    },
    []
  )

  useLayoutEffect(() => {
    measureKey(displayKey)
  }, [displayKey, measureKey, children, activeKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const findScrollParent = (node: HTMLElement | null): HTMLElement => {
      let el: HTMLElement | null = node
      while (el && el !== document.body) {
        const { overflowY } = getComputedStyle(el)
        if (overflowY === "auto" || overflowY === "scroll") return el
        el = el.parentElement
      }
      return node ?? document.documentElement
    }

    const scrollParent = findScrollParent(container)
    const onScroll = () => measureKey(displayKey)
    const ro = new ResizeObserver(() => measureKey(displayKey))
    ro.observe(container)
    scrollParent.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)

    return () => {
      ro.disconnect()
      scrollParent.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [displayKey, measureKey])

  const findKeyAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const nodes = getItemElements()
      for (const node of nodes) {
        const r = node.getBoundingClientRect()
        if (
          clientX >= r.left &&
          clientX <= r.right &&
          clientY >= r.top &&
          clientY <= r.bottom
        ) {
          return node.dataset.liquidNavKey ?? null
        }
      }
      let best: { key: string; dist: number } | null = null
      for (const node of nodes) {
        const key = node.dataset.liquidNavKey
        if (!key) continue
        const r = node.getBoundingClientRect()
        const cy = (r.top + r.bottom) / 2
        const dist = Math.abs(clientY - cy)
        if (!best || dist < best.dist) best = { key, dist }
      }
      return best?.key ?? null
    },
    [getItemElements]
  )

  const isFinePointer = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches

  const handleMouseOver = (event: React.MouseEvent) => {
    if (!isFinePointer() || dragRef.current.dragging) return
    const el = (event.target as HTMLElement).closest("[data-liquid-nav-key]")
    if (el instanceof HTMLElement && el.dataset.liquidNavKey) {
      setPreviewKey(el.dataset.liquidNavKey)
    }
  }

  const handleMouseLeave = () => {
    if (!dragRef.current.dragging) setPreviewKey(null)
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && isFinePointer()) return
    dragRef.current = {
      dragging: false,
      pointerId: event.pointerId,
      didDrag: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    const key = findKeyAtPoint(event.clientX, event.clientY)
    if (key) setPreviewKey(key)
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      beginDrag(event.pointerId)
    }, 280)
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return

    if (event.pointerType === "touch" || event.pointerType === "pen") {
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      if (!state.dragging && Math.hypot(dx, dy) > 6) {
        clearHoldTimer()
        beginDrag(event.pointerId)
      }
      if (state.dragging) {
        const key = findKeyAtPoint(event.clientX, event.clientY)
        if (key) setPreviewKey(key)
      }
    }
  }

  const finishPointer = (event: React.PointerEvent) => {
    const state = dragRef.current
    if (state.pointerId !== event.pointerId) return

    clearHoldTimer()

    const chosenKey = previewKeyRef.current
    if (state.dragging && chosenKey && onActivate) {
      onActivate(chosenKey)
    }

    if (state.dragging) {
      try {
        containerRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }

    state.dragging = false
    state.pointerId = -1
    setDragging(false)
    setPreviewKey(null)

    if (state.didDrag) {
      const container = containerRef.current
      const blockClick = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
        container?.removeEventListener("click", blockClick, true)
      }
      container?.addEventListener("click", blockClick, true)
      window.setTimeout(() => {
        container?.removeEventListener("click", blockClick, true)
      }, 400)
      state.didDrag = false
      event.preventDefault()
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "th-liquid-nav-rail relative",
        dragging && "th-liquid-nav-rail--dragging",
        className
      )}
      onMouseOver={handleMouseOver}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      data-active-key={activeKey}
      data-preview-key={previewKey ?? undefined}
    >
      <div
        className="th-liquid-nav-indicator"
        aria-hidden
        style={{
          transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)`,
          width: indicator.width,
          height: indicator.height,
          opacity: indicator.opacity,
          transition: dragging
            ? "transform 0.08s linear, width 0.08s linear, height 0.08s linear"
            : SPRING,
        }}
      />
      {children}
    </div>
  )
}

/** Mark interactive nav rows inside a LiquidNavRail */
export function liquidNavKey(key: string) {
  return { "data-liquid-nav-key": key } as const
}

export function liquidNavItemClass(isActive: boolean) {
  return cn(isActive && "th-sidebar-link-active th-rail-active")
}
