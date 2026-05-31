"use client";

import { Badge } from "@/components/ui/badge";
import { safeText } from "@/lib/utils";

interface SubscriptionExpiryBadgeProps {
  endDate: string | null;
  status: string;
  showExpiryDate?: boolean;
}

/**
 * Format a date string into a human-readable form like "15 Jun 2025".
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Calculate the number of days remaining between now and the given end date.
 * Negative means already expired.
 */
function getDaysRemaining(endDate: string): number {
  const now = new Date();
  const end = new Date(endDate);
  // Strip time portions so we compare calendar dates
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns the status label + colour class for a given subscription status.
 */
function getStatusInfo(status: string): { label: string; className: string } {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" };
    case "STOPPED":
      return { label: "Stopped", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" };
    case "CANCELLED":
      return { label: "Cancelled", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" };
    case "COMPLETED":
      return { label: "Completed", className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" };
    default:
      return { label: safeText(status, ""), className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" };
  }
}

/**
 * SubscriptionExpiryBadge displays a colour-coded Badge reflecting the
 * subscription's expiry state (expired, expiring soon, active, or inactive).
 *
 * Layout: Status badge on top, expiry date text below it.
 * - Active with >90 days: Green "Active" badge + "Expiry: 15 Jun 2025" below
 * - Active with ≤90 days: Amber "Active" badge + "Expiring in X days · 15 Jun 2025" below
 * - Active with ≤30 days: Red "Active" badge + "Expiring in X days · 15 Jun 2025" below
 * - Expired: Red "Active" badge + "Expired on 15 Jun 2025" below
 * - No endDate: Green "Active" badge only (no date line)
 * - Stopped/Cancelled: Status badge + "Expiry: {date}" below if endDate exists
 * - Completed: Status badge only
 */
export function SubscriptionExpiryBadge({
  endDate,
  status,
}: SubscriptionExpiryBadgeProps) {
  const safeStatus = safeText(status, "");
  const { label: statusLabel, className: statusColor } = getStatusInfo(safeStatus);

  // ── No end date → ongoing subscription with no expiry info ──────────
  if (!endDate) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className={`text-[10px] ${statusColor}`}>
          {safeText(statusLabel, "")}
        </Badge>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining(endDate);
  const formattedDate = formatDate(endDate);

  // ── Expired ──────────────────────────────────────────────────────────
  if (daysRemaining < 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {safeText(statusLabel, "")}
        </Badge>
        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
          Expired on {safeText(formattedDate, "")}
        </span>
      </div>
    );
  }

  // ── Expiring within 30 days ──────────────────────────────────────
  if (daysRemaining <= 30 && safeStatus === "ACTIVE") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {safeText(statusLabel, "")}
        </Badge>
        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
          Expiring in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} &middot; {safeText(formattedDate, "")}
        </span>
      </div>
    );
  }

  // ── Expiring within 90 days ──────────────────────────────────────
  if (daysRemaining <= 90 && safeStatus === "ACTIVE") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {safeText(statusLabel, "")}
        </Badge>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          Expiring in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} &middot; {safeText(formattedDate, "")}
        </span>
      </div>
    );
  }

  // ── Active with plenty of time remaining OR non-active with endDate ──
  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={`text-[10px] ${statusColor}`}>
        {safeText(statusLabel, "")}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        Expiry: {safeText(formattedDate, "")}
      </span>
    </div>
  );
}
