// UK timezone helpers — all attendance uses UK time regardless of user location.
//
// Europe/London handles BST (UTC+1) and GMT (UTC+0) automatically via the
// Intl API, so we never hardcode offsets. These helpers are pure functions
// safe to use from any server route or server component.

/**
 * Convert any date to a UK-local midnight Date object.
 *
 * We use Intl with timeZone: "Europe/London" to format the date into the
 * UK calendar parts, then rebuild a fresh Date from those parts. The returned
 * Date is a local-midnight instance — useful for "today" determination and
 * for storing on TimeEntry.date so all entries on the same UK day group
 * together regardless of where the user is calling from.
 */
export function getUKDate(date: Date = new Date()): Date {
  const ukTime = new Date(date.toLocaleString("en-GB", { timeZone: "Europe/London" }));
  return new Date(ukTime.getFullYear(), ukTime.getMonth(), ukTime.getDate());
}

/**
 * Return the UK date as a YYYY-MM-DD string (ISO calendar date, no time).
 * Useful for grouping, logs, and comparisons.
 */
export function getUKDateString(date: Date = new Date()): string {
  return getUKDate(date).toISOString().split("T")[0]; // YYYY-MM-DD
}

/**
 * Return the UK time as HH:MM (24-hour, zero-padded).
 */
export function getUKTimeHHMM(date: Date = new Date()): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Return the UK weekday name (e.g. "Saturday").
 */
export function getUKDayName(date: Date = new Date()): string {
  return date.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long" });
}

/**
 * Return a greeting string based on the current UK local hour.
 * < 12 → "Good morning"
 * < 17 → "Good afternoon"
 * < 22 → "Good evening"
 * else → "Hello"
 */
export function getGreeting(date: Date = new Date()): string {
  const hour = parseInt(
    date.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }),
    10
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Hello";
}

/**
 * Return the end of the given UK day (23:59:59.999) as a Date.
 *
 * Used when auto-closing missed clock-outs from previous days — we close
 * them at the end of their UK day so the totalHours is bounded and the
 * entry is fully attributed to that day.
 *
 * Accepts a local-midnight Date (such as one returned by getUKDate()).
 */
export function getUKEndOfDay(ukDateMidnight: Date): Date {
  const end = new Date(ukDateMidnight);
  end.setHours(23, 59, 59, 999);
  return end;
}
