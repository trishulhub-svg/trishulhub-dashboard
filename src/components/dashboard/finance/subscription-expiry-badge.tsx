"use client";

import { Badge } from "@/components/ui/badge";
import { safeText } from "@/lib/utils";

interface SubscriptionExpiryBadgeProps {
  endDate: string | null;
  status: string;
  startDate?: string | null;
  frequency?: string | null;
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
 * Compute the next billing date from startDate + frequency.
 * Returns null if unable to compute or if the subscription has expired.
 */
function getNextBillingDate(startDate: string, frequency: string, endDate?: string | null): Date | null {
  if (!startDate || !frequency) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // If subscription has expired (endDate in the past), no next billing
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (end < now) return null;
  }

  if (frequency === "MONTHLY") {
    // Find the next occurrence of the same day-of-month
    const day = start.getDate();
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next < now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, day);
    }
    // Handle months where the day doesn't exist (e.g., 31st in Feb)
    if (next.getDate() !== day) {
      next.setDate(0); // last day of the month
    }
    // Don't go past endDate
    if (endDate && next > new Date(endDate)) return null;
    return next;
  }

  if (frequency === "YEARLY") {
    const month = start.getMonth();
    const day = start.getDate();
    let next = new Date(now.getFullYear(), month, day);
    if (next < now) {
      next = new Date(now.getFullYear() + 1, month, day);
    }
    // Handle leap year issues
    if (next.getMonth() !== month) {
      next.setDate(0);
    }
    // Don't go past endDate
    if (endDate && next > new Date(endDate)) return null;
    return next;
  }

  return null;
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
 * For recurring (monthly/yearly) active subscriptions, also shows next billing date.
 */
export function SubscriptionExpiryBadge({
  endDate,
  status,
  startDate,
  frequency,
}: SubscriptionExpiryBadgeProps) {
  const safeStatus = safeText(status, "");
  const { label: statusLabel, className: statusColor } = getStatusInfo(safeStatus);

  // Compute next billing date for recurring subscriptions
  const nextBilling = (safeStatus === "ACTIVE" && startDate && frequency)
    ? getNextBillingDate(startDate, frequency, endDate)
    : null;

  // ── No end date ────────────────────────────────────────────────────────
  if (!endDate) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className={`text-[10px] ${statusColor}`}>
          {safeText(statusLabel, "")}
        </Badge>
        {nextBilling && (
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
            Next: {formatDate(nextBilling.toISOString())}
          </span>
        )}
      </div>
    );
  }

  const daysRemaining = getDaysRemaining(endDate);
  const formattedDate = formatDate(endDate);

  // ── Expired ────────────────────────────────────────────────────────────
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

  // ── Expiring within 30 days ───────────────────────────────────────
  if (daysRemaining <= 30 && safeStatus === "ACTIVE") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {safeText(statusLabel, "")}
        </Badge>
        <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
          Expiring in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} &middot; {safeText(formattedDate, "")}
        </span>
        {nextBilling && (
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
            Next billing: {formatDate(nextBilling.toISOString())}
          </span>
        )}
      </div>
    );
  }

  // ── Expiring within 90 days ───────────────────────────────────────
  if (daysRemaining <= 90 && safeStatus === "ACTIVE") {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {safeText(statusLabel, "")}
        </Badge>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          Expiring in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} &middot; {safeText(formattedDate, "")}
        </span>
        {nextBilling && (
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
            Next billing: {formatDate(nextBilling.toISOString())}
          </span>
        )}
      </div>
    );
  }

  // ── Active with plenty of time remaining OR non-active with endDate ─────
  return (
    <div className="flex flex-col gap-0.5">
      <Badge className={`text-[10px] ${statusColor}`}>
        {safeText(statusLabel, "")}
      </Badge>
      <span className="text-[10px] text-muted-foreground">
        Expiry: {safeText(formattedDate, "")}
      </span>
      {nextBilling && (
        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
          Next billing: {formatDate(nextBilling.toISOString())}
        </span>
      )}
    </div>
  );
}
