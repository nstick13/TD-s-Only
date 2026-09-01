// Shared "current stage" resolution used by sync-schedule and sync-scores.
//
// Selection rule (see supabase/functions/README.md for the long version):
//   1. If the caller's POST body includes `stage_id`, use that stage as-is
//      (no status filtering — an explicit request always wins, e.g. a
//      commissioner manually re-running a past week).
//   2. Otherwise, prefer the lowest-`ordinal` stage whose status is
//      'draft_open' or 'locked' (i.e. the stage currently "in progress").
//   3. If none of those exist (e.g. before Week 1 opens, or right after
//      Week 18/postseason finalizes and nothing new has opened yet), fall
//      back to the lowest-`ordinal` stage with status 'upcoming'.
//   4. If neither query returns a row, there is genuinely no sensible
//      target stage (e.g. the whole season is finalized) — throw, and the
//      caller logs a sync_log error rather than guessing.
export interface StageRow {
  id: number;
  name: string;
  ordinal: number;
  espn_season_type: number;
  espn_week_num: number;
  status: string;
  first_kickoff_at: string | null;
}

// deno-lint-ignore no-explicit-any
export async function resolveStage(
  supabase: any,
  requestedStageId?: number | string | null,
): Promise<StageRow> {
  if (requestedStageId !== undefined && requestedStageId !== null) {
    const { data, error } = await supabase
      .from("stages")
      .select("*")
      .eq("id", requestedStageId)
      .maybeSingle();
    if (error) throw new Error(`stage lookup failed: ${error.message}`);
    if (!data) throw new Error(`no stage found with id=${requestedStageId}`);
    return data as StageRow;
  }

  const { data: inProgress, error: e1 } = await supabase
    .from("stages")
    .select("*")
    .in("status", ["draft_open", "locked"])
    .order("ordinal", { ascending: true })
    .limit(1);
  if (e1) throw new Error(`stage lookup failed: ${e1.message}`);
  if (inProgress && inProgress.length > 0) return inProgress[0] as StageRow;

  const { data: upcoming, error: e2 } = await supabase
    .from("stages")
    .select("*")
    .eq("status", "upcoming")
    .order("ordinal", { ascending: true })
    .limit(1);
  if (e2) throw new Error(`stage lookup failed: ${e2.message}`);
  if (upcoming && upcoming.length > 0) return upcoming[0] as StageRow;

  throw new Error(
    "no target stage found: no draft_open/locked stage and no upcoming stage remain",
  );
}
