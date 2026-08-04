/**
 * Shared PKT (Pakistan Standard Time, UTC+5:00) date utilities.
 * Uses Intl.DateTimeFormat for timezone-safe date computation.
 */

/** Get today's date in PKT timezone as YYYY-MM-DD string */
export function pktToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

/** Get a date string in PKT timezone from a JS Date object */
export function toPktDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(date);
}

/** Format a date for display in PKT timezone */
export function pktFormatted(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", ...options }).format(date);
}

/** Get current PKT timestamp as ISO string (for display/logging) */
export function pktNow(): string {
  return new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}
