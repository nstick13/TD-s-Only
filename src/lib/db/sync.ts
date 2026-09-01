import { createClient } from "@/lib/supabase/server";
import type { SyncLog, SyncSource } from "@/lib/types";

/** Per-source sync status: the newest sync_log row for each source, keyed by source. Backs the "loud staleness" UI (see StalenessBanner). */
export type SyncStatusMap = Partial<Record<SyncSource, SyncLog>>;

/**
 * The latest sync_log row per source (players/schedule/scores/locks).
 * Fetches recent rows ordered newest-first and keeps the first one seen
 * per source, so a single query covers all sources without N round trips.
 */
export async function getSyncStatus(): Promise<SyncStatusMap> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sync_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`getSyncStatus: ${error.message}`);

  const result: SyncStatusMap = {};
  for (const row of (data ?? []) as SyncLog[]) {
    const source = row.source as SyncSource;
    if (!result[source]) result[source] = row;
  }
  return result;
}
