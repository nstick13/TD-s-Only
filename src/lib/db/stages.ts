import { createClient } from "@/lib/supabase/server";
import type { Stage } from "@/lib/types";

/** All stages, ordered by ordinal (the DB-driven source of truth — never hardcode a stage list). */
export async function getStages(): Promise<Stage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stages")
    .select("*")
    .order("ordinal", { ascending: true });

  if (error) throw new Error(`getStages: ${error.message}`);
  return data as Stage[];
}

/** A single stage by id. */
export async function getStageById(id: number): Promise<Stage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getStageById: ${error.message}`);
  return data as Stage | null;
}

/**
 * The "current" stage for dashboard/nav purposes: the stage that is
 * draft_open or locked (i.e. actively in progress), preferring draft_open;
 * falling back to the lowest-ordinal stage that isn't finalized yet
 * (upcoming); or null if every stage is finalized (season over).
 */
export async function getCurrentStage(): Promise<Stage | null> {
  const stages = await getStages();
  if (stages.length === 0) return null;

  const draftOpen = stages.find((s) => s.status === "draft_open");
  if (draftOpen) return draftOpen;

  const locked = stages.find((s) => s.status === "locked");
  if (locked) return locked;

  const upcoming = stages
    .filter((s) => s.status !== "finalized")
    .sort((a, b) => a.ordinal - b.ordinal)[0];

  return upcoming ?? null;
}
