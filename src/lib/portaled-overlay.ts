/**
 * Portaled selects / menus / comboboxes render on document.body.
 * Dialogs and sheets treat those clicks as "outside" and close, or sit
 * above the list (z-index). Use this to keep the floating layer usable.
 */
const PORTALED_FLOATING_SELECTOR = [
  "[data-slot=select-content]",
  "[data-slot=select-item]",
  "[data-radix-select-viewport]",
  "[data-radix-popper-content-wrapper]",
  "[data-slot=popover-content]",
  "[data-slot=dropdown-menu-content]",
  "[data-slot=dropdown-menu-sub-content]",
  "[data-slot=tooltip-content]",
  "[role=listbox]",
  "[role=menu]",
].join(",")

export function isPortaledFloatingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(PORTALED_FLOATING_SELECTOR))
}

export function preventOutsideIfPortaled(event: {
  target: EventTarget | null
  preventDefault: () => void
}): void {
  if (isPortaledFloatingTarget(event.target)) event.preventDefault()
}
