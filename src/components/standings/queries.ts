import { createClient } from "@/lib/supabase/server";
import type { PlayerStageStats } from "@/lib/types";

/**
 * Local query helpers for the standings/history views. `player_stage_stats`
 * has no accessor in src/lib/db/ yet, and per-file instructions say to add
 * queries we need locally rather than editing the shared db/ barrel.
 */

/** Raw TD stats for every player with a stat row in a given stage. */
export async function getStagePlayerStats(stageId: number): Promise<PlayerStageStats[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("player_stage_stats")
    .select("*")
    .eq("stage_id", stageId);

  if (error) throw new Error(`getStagePlayerStats: ${error.message}`);
  return data as PlayerStageStats[];
}
