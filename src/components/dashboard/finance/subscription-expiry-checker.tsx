"use client";

import { useEffect, useRef } from "react";
import { safeText } from "@/lib/utils";

interface SubscriptionInput {
  id: string;
  service: string;
  endDate: string | null;
  status: string;
}

interface SubscriptionExpiryCheckerProps {
  subscriptions: SubscriptionInput[];
}

/**
 * Format a date to "15 Jun 2025" style.
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
 * SubscriptionExpiryChecker runs on mount and checks every active subscription.
 * If any subscription has an end date within 30 days, it creates a WARNING
 * notification via POST /api/notifications.
 *
 * Uses sessionStorage to ensure each notification is only sent once per day
 * to avoid spamming on every page load / re-render.
 */
export function SubscriptionExpiryChecker({
  subscriptions,
}: SubscriptionExpiryCheckerProps) {
  const hasChecked = useRef(false);

  useEffect(() => {
    // Guard against double-invocation in Strict Mode
    if (hasChecked.current) return;
    hasChecked.current = true;

    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const checkAndNotify = async () => {
      const promises = subscriptions.map(async (sub) => {
        // Only consider active subscriptions with an end date
        if (sub.status !== "ACTIVE" || !sub.endDate) return;

        const now = new Date();
        const end = new Date(sub.endDate);
        now.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        const diffMs = end.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Only notify when within 30 days (including today)
        if (daysRemaining > 30 || daysRemaining < 0) return;

        // Check sessionStorage flag to avoid duplicate notifications
        const storageKey = `trishulhub_sub_expiry_notif_sent_${sub.id}_${today}`;
        try {
          if (sessionStorage.getItem(storageKey)) return;
        } catch {
          // sessionStorage may be unavailable (e.g. in incognito with quota exceeded)
          return;
        }

        const formattedDate = formatDate(sub.endDate);
        const daysLabel =
          daysRemaining === 1
            ? "1 day"
            : `${daysRemaining} days`;

        const title = safeText("Subscription Expiring Soon", "");
        const message = safeText(
          `${sub.service} expires in ${daysLabel} on ${formattedDate}`,
          ""
        );

        try {
          const res = await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              message,
              type: "WARNING",
              link: "/dashboard/finance",
            }),
          });

          if (res.ok) {
            sessionStorage.setItem(storageKey, "sent");
          }
        } catch (err) {
          // Silently fail — notification is non-critical UX enhancement
          console.warn(
            "[SubscriptionExpiryChecker] Failed to create notification:",
            err instanceof Error ? err.message : err
          );
        }
      });

      await Promise.allSettled(promises);
    };

    checkAndNotify();
  }, []);

  // This is a side-effect-only component — renders nothing
  return null;
}
