"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { preventOutsideIfPortaled } from "@/lib/portaled-overlay"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  const isNavGlass = className?.includes("th-nav-overlay")
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[60]",
        isNavGlass ? "bg-black/40 z-[10050] duration-200" : "bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  overlayClassName,
  glassNav = false,
  onPointerDownOutside,
  onInteractOutside,
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  overlayClassName?: string
  glassNav?: boolean
}) {
  const isGlassNav = glassNav || Boolean(className?.includes("th-nav-drawer"))
  return (
    <SheetPortal>
      <SheetOverlay className={cn(isGlassNav && "th-nav-overlay", overlayClassName)} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-[70] flex flex-col gap-4",
          !isGlassNav &&
            "bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          !isGlassNav &&
            side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-[100vh] h-dvh max-h-[100vh] max-h-dvh w-3/4 border-l sm:max-w-sm",
          !isGlassNav &&
            side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-[100vh] h-dvh max-h-[100vh] max-h-dvh w-3/4 border-r sm:max-w-sm",
          !isGlassNav &&
            side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          !isGlassNav &&
            side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          isGlassNav &&
            "flex flex-col bg-card shadow-none border-0 !fixed right-auto bottom-auto z-[10100]",
          className
        )}
        {...props}
        onPointerDownOutside={(event) => {
          preventOutsideIfPortaled(event)
          onPointerDownOutside?.(event)
        }}
        onFocusOutside={(event) => {
          preventOutsideIfPortaled(event)
          onFocusOutside?.(event)
        }}
        onInteractOutside={(event) => {
          preventOutsideIfPortaled(event)
          onInteractOutside?.(event)
        }}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-3.5 right-3.5 z-10 flex size-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-foreground opacity-90 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
