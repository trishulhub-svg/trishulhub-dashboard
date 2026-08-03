"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/** Settings section card — collapsible on all devices; header stays tap-friendly. */
export function SettingsSection({
  icon,
  title,
  description,
  defaultOpen = false,
  children,
  collapsible = true,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <Card className="th-surface overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted-foreground shrink-0">{icon}</span>
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="th-surface overflow-hidden py-0 gap-0">
        <CollapsibleTrigger className="w-full text-left group">
          <CardHeader className="py-4 sm:py-5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground shrink-0">{icon}</span>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">{title}</CardTitle>
                {description ? (
                  <CardDescription className="mt-0.5">{description}</CardDescription>
                ) : null}
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pb-5 sm:pb-6 pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
