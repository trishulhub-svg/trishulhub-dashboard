"use client"

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

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
  "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), width 0.26s cubic-bezier(0.32, 0.72, 0, 1), height 0.26s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease"

function escapeAttr(value: string) {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

function isFinePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  )
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

export function LiquidNavRail({ activeKey, className, children }: LiquidNavRailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const rectsRef = useRef<ItemRect[]>([])
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const displayKey = previewKey ?? activeKey

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
    (key: string, animate: boolean) => {
      rectsRef.current = measureRects()
      const hit = frameForKey(rectsRef.current, key)
      if (hit) applyFrame(hit, animate)
    },
    [applyFrame, measureRects]
  )

  // Move the pill to the active item whenever the active page changes.
  useLayoutEffect(() => {
    snapToKey(displayKey, true)
  }, [displayKey, children, activeKey, snapToKey])

  // Re-measure on resize/scroll so the pill tracks real item positions.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scrollParent = findScrollParent(container)
    const refresh = () => snapToKey(displayKey, false)
    const ro = new ResizeObserver(refresh)
    ro.observe(container)
    scrollParent?.addEventListener("scroll", refresh, { passive: true })
    window.addEventListener("resize", refresh)
    return () => {
      ro.disconnect()
      scrollParent?.removeEventListener("scroll", refresh)
      window.removeEventListener("resize", refresh)
    }
  }, [displayKey, snapToKey])

  // Desktop hover preview only — taps and scrolling are plain browser behaviour.
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isFinePointer()) return
    const el = (event.target as HTMLElement).closest("[data-liquid-nav-key]")
    if (el instanceof HTMLElement && el.dataset.liquidNavKey) {
      setPreviewKey(el.dataset.liquidNavKey)
    }
  }

  const handleMouseLeave = () => setPreviewKey(null)

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

  return (
    <div
      ref={containerRef}
      className={cn("th-liquid-nav-rail relative", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      data-active-key={activeKey}
      data-preview-key={previewKey ?? undefined}
    >
      <div
        ref={indicatorRef}
        className="th-liquid-nav-indicator th-liquid-nav-indicator--spring"
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