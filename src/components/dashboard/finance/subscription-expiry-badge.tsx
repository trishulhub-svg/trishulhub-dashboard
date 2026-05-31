"use client";

import { Badge } from "@/components/ui/badge";
import { safeText } from "@/lib/utils";

interface SubscriptionExpiryBadgeProps {
  endDate: string | null;
  status: string;
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
 * SubscriptionExpiryBadge displays a colour-coded Badge reflecting the
 * subscription's expiry state (expired, expiring soon, active, or inactive).
 *
 * • Expired  → RED   "Expired on {date}"
 * • ≤ 30 days → RED  "Expiring in {X} days"
 * • ≤ 90 days → AMBER "Expiring in {X} days"
 * • Otherwise → GREEN "Active · Expiry: {date}"
 * • No endDate → GREEN "Active" (ongoing)
 * • Stopped / Cancelled → AMBER status badge
 */
export function SubscriptionExpiryBadge({
  endDate,
  status,
}: SubscriptionExpiryBadgeProps) {
  const safeStatus = safeText(status, "");

  // ── Inactive statuses ────────────────────────────────────────────
  if (safeStatus === "STOPPED") {
    return (
      <Badge className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
        {safeText("Stopped", "")}
      </Badge>
    );
  }

  if (safeStatus === "CANCELLED") {
    return (
      <Badge className="text-[10px] bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
        {safeText("Cancelled", "")}
      </Badge>
    );
  }

  if (safeStatus === "COMPLETED") {
    return (
      <Badge className="text-[10px] bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
        {safeText("Completed", "")}
      </Badge>
    );
  }

  // ── No end date → ongoing active subscription ────────────────────
  if (!endDate) {
    return (
      <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        {safeText("Active", "")}
      </Badge>
    );
  }

  const daysRemaining = getDaysRemaining(endDate);
  const formattedDate = formatDate(endDate);

  // ── Expired ──────────────────────────────────────────────────────
  if (daysRemaining < 0) {
    return (
      <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
        {safeText(`Expired on ${formattedDate}`, "")}
      </Badge>
    );
  }

  // ── Expiring within 30 days ──────────────────────────────────────
  if (daysRemaining <= 30) {
    return (
      <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
        {safeText(`Expiring in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`, "")}
      </Badge>
    );
  }

  // ── Expiring within 90 days ──────────────────────────────────────
  if (daysRemaining <= 90) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        {safeText(`Expiring in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`, "")}
      </Badge>
    );
  }

  // ── Active with plenty of time remaining ─────────────────────────
  return (
    <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
      {safeText(`Active \u00b7 Expiry: ${formattedDate}`, "")}
    </Badge>
  );
}
