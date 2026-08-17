"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatStripItem = {
  key: string;
  label: string;
  value: ReactNode;
  hint?: string;
  accentClassName?: string;
  icon?: ReactNode;
};

type CollapsibleStatStripProps = {
  items: StatStripItem[];
  /** Default collapsed — expand on demand */
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  title?: string;
};

/**
 * Compact, collapsible summary strip — shared across Leaves / Finance (ponytail).
 * Collapsed by default so mobile isn't dominated by stat cards.
 */
export function CollapsibleStatStrip({
  items,
  defaultOpen = false,
  storageKey,
  className,
  title = "Summary",
}: CollapsibleStatStripProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined" || !storageKey) return defaultOpen;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  if (!items.length) return null;

  return (
    <section className={cn("liquid-glass-card rounded-xl border border-border/70 overflow-hidden", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-foreground/80">{title}</p>
          {!open && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {items
                .slice(0, 4)
                .map((i) => `${i.label}: ${typeof i.value === "string" || typeof i.value === "number" ? i.value : "…"}`)
                .join(" · ")}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "grid gap-2 px-3 pb-3",
            items.length >= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : items.length === 3
                ? "grid-cols-1 sm:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                "th-inset rounded-lg border border-border/60 px-3 py-2.5",
                item.accentClassName
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {item.label}
                  </p>
                  <div className="text-lg font-semibold tabular-nums tracking-tight mt-0.5">
                    {item.value}
                  </div>
                  {item.hint ? (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{item.hint}</p>
                  ) : null}
                </div>
                {item.icon ? (
                  <div className="shrink-0 text-muted-foreground/70 mt-0.5">{item.icon}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
