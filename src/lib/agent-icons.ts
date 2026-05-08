"use client";

import {
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon, Bot,
} from "lucide-react";
import type { AgentType } from "@/lib/types";

/**
 * Maps agent type to its lucide-react icon component.
 * Shared across agents list page and agent detail page.
 * Kept separate from types.ts because lucide-react is client-only.
 */
export const AGENT_ICON_COMPONENTS: Record<AgentType, React.ComponentType<{ className?: string }>> = {
  DEV: Code2,
  CLIENT_HUNTER: Crosshair,
  FINANCE: DollarSign,
  PROJECT_MANAGER: ClipboardList,
  HR: Users,
  CONTENT: PenTool,
  SUPPORT: HeadphonesIcon,
};

/** Fallback icon for unknown agent types */
export const AgentIconFallback = Bot;
