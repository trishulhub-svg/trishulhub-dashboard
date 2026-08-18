"use client"

import React, { useCallback, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

const DRAFT_PREFIX = "th-form-draft:"

function draftStorageKey(scope: string) {
  return `${DRAFT_PREFIX}${scope}`
}

function snapshotFields(root: HTMLElement): Record<string, string> {
  const data: Record<string, string> = {}
  const fields = root.querySelectorAll("input, textarea, select")
  fields.forEach((el, i) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return
    }
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file" || el.type === "button" || el.type === "submit")) {
      return
    }
    const key = el.getAttribute("name") || el.id || `field-${i}`
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      data[key] = el.checked ? "1" : "0"
    } else {
      data[key] = el.value
    }
  })
  return data
}

function applySnapshot(root: HTMLElement, snapshot: Record<string, string>) {
  const fields = root.querySelectorAll("input, textarea, select")
  fields.forEach((el, i) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return
    }
    const key = el.getAttribute("name") || el.id || `field-${i}`
    if (!(key in snapshot)) return
    const value = snapshot[key]
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = value === "1"
    } else {
      const proto = Object.getPrototypeOf(el) as { value?: PropertyDescriptor }
      const desc = Object.getOwnPropertyDescriptor(proto, "value")
      if (desc?.set) desc.set.call(el, value)
      else el.value = value
    }
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

function isSaveButton(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  const btn = el.closest("button, [role='button']") as HTMLElement | null
  if (!btn) return false
  if (btn.dataset.formGuardSkip === "true") return false
  const type = (btn as HTMLButtonElement).type
  if (type === "reset") return false
  const text = (btn.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()
  if (!text) return false
  if (/(cancel|close|discard|delete|remove|back|got it)/.test(text)) return false
  return (
    type === "submit" ||
    /^(save|add|create|update|submit|add expense|add invoice|save changes|create invoice|add project|add client|add lead|add member)$/.test(text) ||
    /^(save|add|create|update)\b/.test(text)
  )
}

type PromptMode = "leave" | "save" | null

export function useFormGuard(opts: {
  enabled: boolean
  scope: string
  onRequestClose: () => void
}) {
  const { enabled, scope, onRequestClose } = opts
  const rootRef = useRef<HTMLElement | null>(null)
  const dirtyRef = useRef(false)
  const bypassSaveRef = useRef(false)
  const pendingSaveRef = useRef<HTMLElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [prompt, setPrompt] = useState<PromptMode>(null)
  const titleId = useId()

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setDirty(true)
  }, [])

  const restoreDraftIfAny = useCallback(() => {
    if (typeof window === "undefined" || !rootRef.current) return
    try {
      const raw = localStorage.getItem(draftStorageKey(scope))
      if (!raw) return
      const parsed = JSON.parse(raw) as { snapshot?: Record<string, string> }
      if (!parsed.snapshot) return
      applySnapshot(rootRef.current, parsed.snapshot)
      dirtyRef.current = true
      setDirty(true)
    } catch {
      /* ignore */
    }
  }, [scope])

  const saveDraft = useCallback(() => {
    if (typeof window === "undefined" || !rootRef.current) return
    try {
      localStorage.setItem(
        draftStorageKey(scope),
        JSON.stringify({ at: Date.now(), snapshot: snapshotFields(rootRef.current) })
      )
    } catch {
      /* ignore */
    }
  }, [scope])

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(draftStorageKey(scope))
    } catch {
      /* ignore */
    }
  }, [scope])

  const bindRoot = useCallback(
    (node: HTMLElement | null) => {
      rootRef.current = node
      if (node && enabled) {
        window.setTimeout(restoreDraftIfAny, 40)
      }
    },
    [enabled, restoreDraftIfAny]
  )

  const tryClose = useCallback(() => {
    if (!enabled || !dirtyRef.current) {
      clearDraft()
      onRequestClose()
      return false
    }
    setPrompt("leave")
    return true
  }, [clearDraft, enabled, onRequestClose])

  const confirmSave = useCallback(() => {
    setPrompt(null)
    clearDraft()
    dirtyRef.current = false
    setDirty(false)
    const target = pendingSaveRef.current
    pendingSaveRef.current = null
    if (target) {
      bypassSaveRef.current = true
      target.click()
      window.setTimeout(() => {
        bypassSaveRef.current = false
      }, 0)
    } else {
      const saveBtn = rootRef.current?.querySelector<HTMLElement>(
        "button[type='submit'], button:not([data-form-guard-skip])"
      )
      const candidates = rootRef.current
        ? Array.from(rootRef.current.querySelectorAll<HTMLElement>("button, [role='button']"))
        : []
      const found = candidates.find((el) => isSaveButton(el)) || saveBtn
      if (found) {
        bypassSaveRef.current = true
        found.click()
        window.setTimeout(() => {
          bypassSaveRef.current = false
        }, 0)
      }
    }
  }, [clearDraft])

  const confirmDraft = useCallback(() => {
    saveDraft()
    setPrompt(null)
    dirtyRef.current = false
    setDirty(false)
    pendingSaveRef.current = null
    onRequestClose()
  }, [onRequestClose, saveDraft])

  const confirmExit = useCallback(() => {
    clearDraft()
    setPrompt(null)
    dirtyRef.current = false
    setDirty(false)
    pendingSaveRef.current = null
    onRequestClose()
  }, [clearDraft, onRequestClose])

  const cancelPrompt = useCallback(() => {
    pendingSaveRef.current = null
    setPrompt(null)
  }, [])

  const onInteract = useCallback(
    (event: { preventDefault: () => void }) => {
      if (!enabled) return
      if (!dirtyRef.current) return
      event.preventDefault()
      setPrompt("leave")
    },
    [enabled]
  )

  const onSaveClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled || bypassSaveRef.current) return
      const target = event.target as HTMLElement
      if (!isSaveButton(target)) return
      event.preventDefault()
      event.stopPropagation()
      pendingSaveRef.current = (target.closest("button, [role='button']") as HTMLElement) || target
      setPrompt("save")
    },
    [enabled]
  )

  const promptUi =
    prompt && (
      <div
        className="absolute inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-sm rounded-2xl border bg-background p-4 shadow-xl space-y-3">
          <h3 id={titleId} className="text-base font-semibold">
            {prompt === "save" ? "Confirm save?" : "Unsaved changes"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {prompt === "save"
              ? "Save this form now, keep it as a draft, or go back and keep editing."
              : "You filled in some details. Confirm save, keep a draft, or exit without saving."}
          </p>
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={confirmSave} data-form-guard-skip="true">
              Confirm save
            </Button>
            <Button type="button" variant="secondary" onClick={confirmDraft} data-form-guard-skip="true">
              Save draft
            </Button>
            {prompt === "leave" ? (
              <Button type="button" variant="ghost" onClick={confirmExit} data-form-guard-skip="true">
                Exit without saving
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={cancelPrompt} data-form-guard-skip="true">
                Keep editing
              </Button>
            )}
          </div>
        </div>
      </div>
    )

  return {
    bindRoot,
    dirty,
    markDirty,
    tryClose,
    onInteract,
    onSaveClickCapture,
    promptUi,
    clearDraft,
  }
}
