import { getSyncStatus } from "@/lib/db/sync";
import { timeAgo, minutesAgo } from "@/lib/timeAgo";
import type { SyncLog, SyncSource } from "@/lib/types";

/**
 * Loud data-freshness banner — the spec's #1 bug fix. Server component:
 * reads getSyncStatus() itself and renders above {children} in the
 * authenticated app shell (src/app/(app)/layout.tsx) on every page, so
 * staleness/failure is never silently hidden from a manager mid-draft.
 */

// Staleness thresholds per source, in minutes. Scores need to be fresher
// (managers are watching live during games); players/schedule/locks are
// slower-moving and tolerate a longer gap before we shout about it.
const STALE_THRESHOLD_MINUTES: Record<SyncSource, number> = {
  players: 45,
  schedule: 45,
  scores: 20,
  locks: 45,
};

const SOURCE_LABEL: Record<SyncSource, string> = {
  players: "Player data",
  schedule: "Schedule",
  scores: "Scores",
  locks: "Lock status",
};

interface SourceState {
  source: SyncSource;
  log: SyncLog | undefined;
  isStale: boolean;
  isError: boolean;
}

export async function StalenessBanner() {
  const status = await getSyncStatus();
  const sources: SyncSource[] = ["players", "schedule", "scores", "locks"];

  const states: SourceState[] = sources.map((source) => {
    const log = status[source];
    const isError = log?.status === "error";
    const isStale = !!log && minutesAgo(log.ran_at) > STALE_THRESHOLD_MINUTES[source];
    return { source, log, isStale, isError };
  });

  const troubled = states.filter((s) => s.log && (s.isError || s.isStale));
  const known = states.filter((s) => s.log);

  if (known.length === 0) {
    // No sync job has ever run (expected pre-launch — the sync Edge
    // Functions haven't been built yet). Informational, not an alarm.
    return (
      <div className="font-mono text-sm text-center py-2 px-4 bg-field-light text-retro-offwhite/70 border-b-2 border-retro-offwhite/30">
        No sync data yet — player/score sync jobs haven&apos;t run.
      </div>
    );
  }

  if (troubled.length > 0) {
    return (
      <div
        role="alert"
        className="font-pixel text-[11px] sm:text-xs text-center py-3 px-4 bg-retro-red text-retro-offwhite border-b-4 border-black animate-pulse"
      >
        {troubled.map((s) => (
          <div key={s.source} className="py-0.5">
            {"⚠ "}
            {SOURCE_LABEL[s.source].toUpperCase()}{" "}
            {s.isError ? "SYNC FAILED" : "MAY BE STALE"}
            {" — last "}
            {s.isError ? "attempt" : "successful update"}{" "}
            {s.log ? timeAgo(s.log.ran_at) : "unknown"}
            {s.isError && s.log?.message ? ` (${s.log.message})` : ""}
          </div>
        ))}
      </div>
    );
  }

  // Everything present is fresh and last ran successfully — a calm line.
  const calm = known
    .map((s) => `${SOURCE_LABEL[s.source]} updated ${timeAgo(s.log!.ran_at)}`)
    .join(" • ");

  return (
    <div className="font-mono text-sm text-center py-2 px-4 bg-field-light text-retro-offwhite/80 border-b-2 border-retro-offwhite/30">
      {calm}
    </div>
  );
}
