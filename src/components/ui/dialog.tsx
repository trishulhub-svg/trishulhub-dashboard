"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { preventOutsideIfPortaled } from "@/lib/portaled-overlay"
import { useFormGuard } from "@/components/form-guard"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[190] bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  formGuard = true,
  formGuardKey,
  onPointerDownOutside,
  onFocusOutside,
  onInteractOutside,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  formGuard?: boolean
  formGuardKey?: string
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const scope =
    formGuardKey ||
    (typeof window !== "undefined" ? `dialog:${window.location.pathname}` : "dialog")
  const guard = useFormGuard({
    enabled: formGuard,
    scope,
    onRequestClose: () => closeRef.current?.click(),
  })

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "liquid-glass bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-[200] grid w-full max-w-[calc(100%-2rem)] max-h-[min(85dvh,40rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg relative",
          className
        )}
        {...props}
        ref={(node) => {
          guard.bindRoot(node)
        }}
        onPointerDownOutside={(event) => {
          preventOutsideIfPortaled(event)
          if (!event.defaultPrevented && formGuard) guard.onInteract(event)
          onPointerDownOutside?.(event)
        }}
        onFocusOutside={(event) => {
          preventOutsideIfPortaled(event)
          onFocusOutside?.(event)
        }}
        onInteractOutside={(event) => {
          preventOutsideIfPortaled(event)
          if (!event.defaultPrevented && formGuard) guard.onInteract(event)
          onInteractOutside?.(event)
        }}
        onEscapeKeyDown={(event) => {
          if (formGuard) guard.onInteract(event)
          onEscapeKeyDown?.(event)
        }}
        onInput={formGuard ? guard.markDirty : undefined}
        onChange={formGuard ? guard.markDirty : undefined}
        onClickCapture={formGuard ? guard.onSaveClickCapture : undefined}
      >
        <DialogPrimitive.Close ref={closeRef} className="hidden" tabIndex={-1} aria-hidden />
        {children}
        {showCloseButton && (
          <button
            type="button"
            data-form-guard-skip="true"
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            onClick={() => {
              if (formGuard && guard.tryClose()) return
              closeRef.current?.click()
            }}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </button>
        )}
        {formGuard && guard.promptUi}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
