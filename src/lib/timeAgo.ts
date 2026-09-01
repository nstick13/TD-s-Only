/**
 * Formats a past ISO timestamp as a short relative "Xm ago" / "Xh ago"
 * string, for the sync-status / staleness UI. No external dependency —
 * intentionally coarse (minutes/hours/days), this is not a full i18n
 * relative-time formatter.
 */
export function timeAgo(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  const diffMs = now.getTime() - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Minutes elapsed since an ISO timestamp — used to compare against staleness thresholds. */
export function minutesAgo(isoTimestamp: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(isoTimestamp).getTime()) / 60_000);
}
