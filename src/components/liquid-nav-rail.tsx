"use client"

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/haptics"

type ItemRect = {
  key: string
  top: number
  left: number
  width: number
  height: number
  midY: number
}

type IndicatorFrame = {
  top: number
  left: number
  width: number
  height: number
  opacity: number
  scale: number
}

const SPRING =
  "transform 0.52s cubic-bezier(0.32, 0.72, 0, 1), width 0.44s cubic-bezier(0.32, 0.72, 0, 1), height 0.44s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease, scale 0.38s cubic-bezier(0.32, 0.72, 0, 1)"

const SCRUB_MOVE_PX = 5

function escapeAttr(value: string) {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

function smoothstep(t: number) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  )
}

function isFinePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  )
}

function holdDelayMs() {
  return isCoarsePointer() ? 175 : 130
}

function frameForKey(rects: ItemRect[], key: string): IndicatorFrame | null {
  const item = rects.find((r) => r.key === key)
  if (!item) return null
  return {
    top: item.top,
    left: item.left,
    width: item.width,
    height: item.height,
    opacity: 1,
    scale: 1,
  }
}

/** WhatsApp-style: pill morphs + stretches while scrubbing between rows */
function frameAtPointerY(
  rects: ItemRect[],
  pointerY: number,
  containerTop: number,
  scrubbing: boolean,
  pulse = 0
): { frame: IndicatorFrame; key: string } | null {
  if (rects.length === 0) return null

  const y = pointerY - containerTop
  const breathe = scrubbing ? 1 + Math.sin(pulse) * 0.035 : 1
  const stretchBoost = scrubbing ? 1 + Math.sin(pulse * 1.4) * 0.12 : 1

  if (y <= rects[0].midY) {
    const f = frameForKey(rects, rects[0].key)!
    const stretch = scrubbing ? 6 * stretchBoost : 0
    return {
      frame: {
        ...f,
        top: f.top - stretch * 0.2,
        height: f.height + stretch,
        scale: scrubbing ? 1.03 * breathe : 1,
      },
      key: rects[0].key,
    }
  }

  const last = rects[rects.length - 1]
  if (y >= last.midY) {
    const f = frameForKey(rects, last.key)!
    const stretch = scrubbing ? 6 * stretchBoost : 0
    return {
      frame: {
        ...f,
        top: f.top - stretch * 0.2,
        height: f.height + stretch,
        scale: scrubbing ? 1.03 * breathe : 1,
      },
      key: last.key,
    }
  }

  for (let i = 0; i < rects.length - 1; i++) {
    const a = rects[i]
    const b = rects[i + 1]
    if (y < a.midY || y > b.midY) continue

    const span = b.midY - a.midY || 1
    const t = smoothstep((y - a.midY) / span)
    const morph = Math.sin(t * Math.PI)
    const stretch = scrubbing ? morph * Math.min(18, span * 0.42) * stretchBoost : 0

    const frame: IndicatorFrame = {
      top: a.top + (b.top - a.top) * t - stretch * 0.28,
      left: a.left + (b.left - a.left) * t,
      width: a.width + (b.width - a.width) * t + (scrubbing ? morph * 4 : 0),
      height: a.height + (b.height - a.height) * t + stretch,
      opacity: 1,
      scale: scrubbing ? (1.02 + morph * 0.05) * breathe : 1,
    }

    const key = t < 0.5 ? a.key : b.key
    return { frame, key }
  }

  let nearest = rects[0]
  let best = Infinity
  for (const r of rects) {
    const d = Math.abs(y - r.midY)
    if (d < best) {
      best = d
      nearest = r
    }
  }
  const f = frameForKey(rects, nearest.key)!
  const stretch = scrubbing ? 6 * stretchBoost : 0
  return {
    frame: {
      ...f,
      top: f.top - stretch * 0.2,
      height: f.height + stretch,
      scale: scrubbing ? 1.03 * breathe : 1,
    },
    key: nearest.key,
  }
}

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = node
  while (el && el !== document.body) {
    const style = getComputedStyle(el)
    const { overflowY } = style
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return el
    }
    if (el.hasAttribute("data-slot") && el.getAttribute("data-slot") === "scroll-area-viewport") {
      return el
    }
    el = el.parentElement
  }
  return null
}

type LiquidNavRailProps = {
  activeKey: string
  onActivate?: (key: string) => void
  className?: string
  children: React.ReactNode
}

export function LiquidNavRail({
  activeKey,
  onActivate,
  className,
  children,
}: LiquidNavRailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const rectsRef = useRef<ItemRect[]>([])
  const previewKeyRef = useRef<string | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const scrubRafRef = useRef<number | null>(null)
  const scrubPointerRef = useRef({ x: 0, y: 0 })
  const pulseRef = useRef(0)
  const scrollParentRef = useRef<HTMLElement | null>(null)
  const scrollLockRef = useRef<string | null>(null)
  const docHandlersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(
    null
  )

  const dragRef = useRef({
    scrubbing: false,
    tracking: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    anchorKey: activeKey,
  })

  const [scrubbing, setScrubbing] = useState(false)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [animateIndicator, setAnimateIndicator] = useState(true)

  const displayKey = previewKey ?? activeKey

  useEffect(() => {
    previewKeyRef.current = previewKey
  }, [previewKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    for (const el of container.querySelectorAll<HTMLElement>("[data-liquid-nav-key]")) {
      el.classList.remove("th-liquid-nav-item--preview")
    }
    if (!previewKey) return
    const el = container.querySelector<HTMLElement>(
      `[data-liquid-nav-key="${escapeAttr(previewKey)}"]`
    )
    if (el && !el.classList.contains("th-sidebar-link-active")) {
      el.classList.add("th-liquid-nav-item--preview")
    }
  }, [previewKey, activeKey, children])

  const getItemElements = useCallback(() => {
    const container = containerRef.current
    if (!container) return [] as HTMLElement[]
    return Array.from(container.querySelectorAll<HTMLElement>("[data-liquid-nav-key]")).filter(
      (el) => el.closest(".th-liquid-nav-rail") === container
    )
  }, [])

  const measureRects = useCallback(() => {
    const container = containerRef.current
    if (!container) return [] as ItemRect[]
    const cRect = container.getBoundingClientRect()
    return getItemElements()
      .map((el) => {
        const key = el.dataset.liquidNavKey
        if (!key) return null
        const r = el.getBoundingClientRect()
        const top = r.top - cRect.top
        return {
          key,
          top,
          left: r.left - cRect.left,
          width: r.width,
          height: r.height,
          midY: top + r.height / 2,
        }
      })
      .filter((r): r is ItemRect => r !== null && r.height > 4)
  }, [getItemElements])

  const applyFrame = useCallback((frame: IndicatorFrame, animate: boolean) => {
    const el = indicatorRef.current
    if (!el) return
    el.style.transition = animate ? SPRING : "none"
    el.style.opacity = String(frame.opacity)
    el.style.width = `${frame.width}px`
    el.style.height = `${frame.height}px`
    el.style.transform = `translate3d(${frame.left}px, ${frame.top}px, 0) scale(${frame.scale})`
  }, [])

  const snapToKey = useCallback(
    (key: string, animate: boolean, scrub = false) => {
      rectsRef.current = measureRects()
      const hit = frameForKey(rectsRef.current, key)
      if (hit) {
        applyFrame({ ...hit, scale: scrub ? 1.03 : 1 }, animate)
      }
    },
    [applyFrame, measureRects]
  )

  const stopScrubLoop = useCallback(() => {
    if (scrubRafRef.current !== null) {
      cancelAnimationFrame(scrubRafRef.current)
      scrubRafRef.current = null
    }
  }, [])

  const lockScrollParent = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const parent = findScrollParent(container.parentElement) ?? findScrollParent(container)
    scrollParentRef.current = parent
    if (!parent || scrollLockRef.current !== null) return
    scrollLockRef.current = parent.style.overscrollBehavior
    parent.style.overscrollBehavior = "contain"
  }, [])

  const unlockScrollParent = useCallback(() => {
    const parent = scrollParentRef.current
    if (parent && scrollLockRef.current !== null) {
      parent.style.overscrollBehavior = scrollLockRef.current
    }
    scrollLockRef.current = null
    scrollParentRef.current = null
  }, [])

  const autoScrollNearEdges = useCallback((clientY: number) => {
    const parent = scrollParentRef.current
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const edge = 64
    const maxStep = 22
    if (clientY < rect.top + edge) {
      const t = Math.max(0, 1 - (clientY - rect.top) / edge)
      parent.scrollTop -= Math.max(6, maxStep * t)
    } else if (clientY > rect.bottom - edge) {
      const t = Math.max(0, 1 - (rect.bottom - clientY) / edge)
      parent.scrollTop += Math.max(6, maxStep * t)
    }
  }, [])

  const paintScrubFrame = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current
      if (!container) return
      autoScrollNearEdges(clientY)
      rectsRef.current = measureRects()
      const cRect = container.getBoundingClientRect()
      pulseRef.current += 0.11
      const hit = frameAtPointerY(
        rectsRef.current,
        clientY,
        cRect.top,
        true,
        pulseRef.current
      )
      if (!hit) return
      applyFrame(hit.frame, false)
      if (hit.key !== previewKeyRef.current) {
        previewKeyRef.current = hit.key
        setPreviewKey(hit.key)
      }
    },
    [applyFrame, autoScrollNearEdges, measureRects]
  )

  const startScrubLoop = useCallback(() => {
    stopScrubLoop()
    const tick = () => {
      if (!dragRef.current.scrubbing) return
      paintScrubFrame(scrubPointerRef.current.x, scrubPointerRef.current.y)
      scrubRafRef.current = requestAnimationFrame(tick)
    }
    scrubRafRef.current = requestAnimationFrame(tick)
  }, [paintScrubFrame, stopScrubLoop])

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const beginScrub = useCallback(
    (pointerId: number) => {
      const state = dragRef.current
      if (state.scrubbing) return
      state.scrubbing = true
      pulseRef.current = 0
      setScrubbing(true)
      setAnimateIndicator(false)
      lockScrollParent()
      rectsRef.current = measureRects()
      try {
        containerRef.current?.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      if (indicatorRef.current) {
        indicatorRef.current.classList.add("th-liquid-nav-indicator--scrub")
      }
      haptic("select")
      startScrubLoop()
    },
    [lockScrollParent, measureRects, startScrubLoop]
  )

  const updateScrub = useCallback(
    (clientX: number, clientY: number) => {
      scrubPointerRef.current = { x: clientX, y: clientY }
      paintScrubFrame(clientX, clientY)
    },
    [paintScrubFrame]
  )

  const detachDocumentPointerHandlers = useCallback(() => {
    const handlers = docHandlersRef.current
    if (!handlers) return
    document.removeEventListener("pointermove", handlers.move, true)
    document.removeEventListener("pointerup", handlers.up, true)
    document.removeEventListener("pointercancel", handlers.up, true)
    docHandlersRef.current = null
  }, [])

  const finishPointerSession = useCallback(
    (event: PointerEvent | React.PointerEvent) => {
      const state = dragRef.current
      if (!state.tracking || state.pointerId !== event.pointerId) return

      clearHoldTimer()
      stopScrubLoop()
      detachDocumentPointerHandlers()

      const chosenKey = previewKeyRef.current ?? state.anchorKey
      const moved =
        Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > SCRUB_MOVE_PX

      if (state.scrubbing && chosenKey && chosenKey !== activeKey && onActivate) {
        onActivate(chosenKey)
        haptic("tap")
      }

      if (state.scrubbing || state.tracking) {
        try {
          containerRef.current?.releasePointerCapture(event.pointerId)
        } catch {
          /* ignore */
        }
      }

      indicatorRef.current?.classList.remove("th-liquid-nav-indicator--scrub")
      unlockScrollParent()

      const wasScrubbing = state.scrubbing
      state.scrubbing = false
      state.tracking = false
      state.pointerId = -1
      setScrubbing(false)
      setPreviewKey(null)
      previewKeyRef.current = null
      setAnimateIndicator(true)

      if (chosenKey) snapToKey(chosenKey, true)

      const blockTap =
        wasScrubbing &&
        (moved || (chosenKey !== activeKey && chosenKey !== state.anchorKey))
      if (blockTap) {
        const container = containerRef.current
        const blockClick = (e: Event) => {
          e.preventDefault()
          e.stopPropagation()
          container?.removeEventListener("click", blockClick, true)
        }
        container?.addEventListener("click", blockClick, true)
        window.setTimeout(() => {
          container?.removeEventListener("click", blockClick, true)
        }, 450)
        event.preventDefault()
      }
    },
    [
      activeKey,
      clearHoldTimer,
      detachDocumentPointerHandlers,
      onActivate,
      snapToKey,
      stopScrubLoop,
      unlockScrollParent,
    ]
  )

  const handleTrackedPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = dragRef.current
      if (!state.tracking || state.pointerId !== event.pointerId) return

      if (event.pointerType === "mouse" && isFinePointer()) {
        const el = (event.target as HTMLElement | null)?.closest?.("[data-liquid-nav-key]")
        if (el instanceof HTMLElement && el.dataset.liquidNavKey) {
          setPreviewKey(el.dataset.liquidNavKey)
        }
        return
      }

      if (event.pointerType === "touch" || event.pointerType === "pen") {
        const dx = event.clientX - state.startX
        const dy = event.clientY - state.startY
        if (!state.scrubbing && Math.hypot(dx, dy) > SCRUB_MOVE_PX) {
          clearHoldTimer()
          beginScrub(event.pointerId)
        }
        if (state.scrubbing) {
          event.preventDefault()
          updateScrub(event.clientX, event.clientY)
        }
      }
    },
    [beginScrub, clearHoldTimer, updateScrub]
  )

  const attachDocumentPointerHandlers = useCallback(
    (pointerId: number) => {
      detachDocumentPointerHandlers()
      const up = (event: PointerEvent) => finishPointerSession(event)
      docHandlersRef.current = { move: handleTrackedPointerMove, up }
      document.addEventListener("pointermove", handleTrackedPointerMove, {
        capture: true,
        passive: false,
      })
      document.addEventListener("pointerup", up, { capture: true })
      document.addEventListener("pointercancel", up, { capture: true })
      void pointerId
    },
    [detachDocumentPointerHandlers, finishPointerSession, handleTrackedPointerMove]
  )

  useLayoutEffect(() => {
    if (scrubbing) return
    snapToKey(displayKey, true)
  }, [displayKey, scrubbing, snapToKey, children, activeKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scrollParent = findScrollParent(container)
    const refresh = () => {
      if (!scrubbing) snapToKey(displayKey, false)
    }
    const ro = new ResizeObserver(refresh)
    ro.observe(container)
    scrollParent?.addEventListener("scroll", refresh, { passive: true })
    window.addEventListener("resize", refresh)

    return () => {
      ro.disconnect()
      scrollParent?.removeEventListener("scroll", refresh)
      window.removeEventListener("resize", refresh)
    }
  }, [displayKey, scrubbing, snapToKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onTouchMove = (event: TouchEvent) => {
      if (!dragRef.current.scrubbing) return
      event.preventDefault()
    }

    container.addEventListener("touchmove", onTouchMove, { passive: false })
    return () => container.removeEventListener("touchmove", onTouchMove)
  }, [])

  useEffect(
    () => () => {
      stopScrubLoop()
      detachDocumentPointerHandlers()
      unlockScrollParent()
    },
    [detachDocumentPointerHandlers, stopScrubLoop, unlockScrollParent]
  )

  const handleMouseLeave = () => {
    if (!dragRef.current.tracking && !dragRef.current.scrubbing) {
      setPreviewKey(null)
    }
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    const isMouseDesktop = event.pointerType === "mouse" && isFinePointer()
    if (isMouseDesktop) return

    const container = containerRef.current
    if (!container) return

    const target = event.target as HTMLElement
    if (!target.closest("[data-liquid-nav-key]")) return

    rectsRef.current = measureRects()
    const cRect = container.getBoundingClientRect()
    const hit = frameAtPointerY(rectsRef.current, event.clientY, cRect.top, false)
    const anchorKey = hit?.key ?? activeKey

    dragRef.current = {
      scrubbing: false,
      tracking: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      anchorKey,
    }

    setPreviewKey(anchorKey)
    previewKeyRef.current = anchorKey
    applyFrame(
      hit?.frame ??
        frameForKey(rectsRef.current, anchorKey) ?? {
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          opacity: 0,
          scale: 1,
        },
      false
    )

    try {
      container.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }

    attachDocumentPointerHandlers(event.pointerId)

    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      if (!dragRef.current.tracking || dragRef.current.pointerId !== event.pointerId) return
      beginScrub(event.pointerId)
      updateScrub(event.clientX, event.clientY)
    }, holdDelayMs())
  }

  const handlePointerMoveHover = (event: React.PointerEvent) => {
    if (!isFinePointer() || event.pointerType !== "mouse") return
    if (dragRef.current.tracking || dragRef.current.scrubbing) return
    const el = (event.target as HTMLElement).closest("[data-liquid-nav-key]")
    if (el instanceof HTMLElement && el.dataset.liquidNavKey) {
      setPreviewKey(el.dataset.liquidNavKey)
    }
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    finishPointerSession(event)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "th-liquid-nav-rail relative",
        scrubbing && "th-liquid-nav-rail--scrubbing",
        className
      )}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMoveHover}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-active-key={activeKey}
      data-preview-key={previewKey ?? undefined}
    >
      <div
        ref={indicatorRef}
        className={cn(
          "th-liquid-nav-indicator",
          animateIndicator && "th-liquid-nav-indicator--spring"
        )}
        aria-hidden
        style={{
          opacity: 0,
          transformOrigin: "center center",
          willChange: "transform, width, height",
        }}
      />
      {children}
    </div>
  )
}

export function liquidNavKey(key: string) {
  return { "data-liquid-nav-key": key } as const
}

export function liquidNavItemClass(isActive: boolean) {
  return cn(isActive && "th-sidebar-link-active th-rail-active")
}
