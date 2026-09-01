import { createClient } from "@/lib/supabase/server";
import type { WeeklyResult } from "@/lib/types";

/** Computed per-manager totals/standings for a single stage, ranked. */
export async function getWeeklyResults(stageId: number): Promise<WeeklyResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_results")
    .select("*")
    .eq("stage_id", stageId)
    .order("rank", { ascending: true });

  if (error) throw new Error(`getWeeklyResults: ${error.message}`);
  return data as WeeklyResult[];
}

/** Every weekly_results row across all stages (for season-long history/aggregate standings). */
export async function getAllWeeklyResults(): Promise<WeeklyResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_results")
    .select("*")
    .order("stage_id", { ascending: true });

  if (error) throw new Error(`getAllWeeklyResults: ${error.message}`);
  return data as WeeklyResult[];
}
