"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStageById } from "@/lib/db/stages";
import { getDraftOrder } from "@/lib/db/draftOrder";
import { getRosterPicks } from "@/lib/db/roster";
import type { Player, Position } from "@/lib/types";
import {
  computeCurrentPick,
  isPlayerDraftable,
  isSlotFull,
  reasonPlayerBlocked,
} from "@/components/draft/draftLogic";

export interface DraftActionResult {
  ok: boolean;
  error?: string;
}

export interface DraftPlayerInput {
  stageId: number;
  playerId: string;
  slotPosition: Position;
}

/**
 * Drafts a player onto the signed-in manager's roster for a stage.
 *
 * Runs as the logged-in user (RLS applies), and re-validates every rule
 * server-side before attempting the insert — a client can't be trusted to
 * have fresh data, and the client-side checks in the draft board are only
 * for instant UI feedback:
 *   1. stage.status === 'draft_open'
 *   2. it is this user's turn (recomputed from draft_order + live pick
 *      count, not trusted from the client)
 *   3. slotPosition matches the player's actual position
 *   4. player is draftable (not on_bye, not a hard-out status)
 *   5. the manager's slot for that position isn't already full
 *
 * The DB is still the final backstop: roster_picks_stage_player_unique
 * (exclusive pool) and the enforce_roster_limits() trigger (roster caps)
 * catch any race the above misses — those Postgres errors are translated
 * into friendly messages below.
 */
export async function draftPlayer(
  input: DraftPlayerInput,
): Promise<DraftActionResult> {
  const { stageId, playerId, slotPosition } = input;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to draft." };
  }

  const stage = await getStageById(stageId);
  if (!stage) {
    return { ok: false, error: "Stage not found." };
  }
  if (stage.status !== "draft_open") {
    return { ok: false, error: "The draft is not open for this stage." };
  }

  const [draftOrder, picks] = await Promise.all([
    getDraftOrder(stageId),
    getRosterPicks(stageId),
  ]);

  const { pickNumber, managerId: onTheClockId } = computeCurrentPick(
    draftOrder,
    picks.length,
  );

  if (pickNumber === null) {
    return { ok: false, error: "The draft is already complete for this stage." };
  }
  if (onTheClockId !== user.id) {
    return { ok: false, error: "It is not your turn to pick." };
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();

  if (playerError) {
    return { ok: false, error: `Could not load player: ${playerError.message}` };
  }
  if (!player) {
    return { ok: false, error: "Player not found." };
  }

  const typedPlayer = player as Player;

  if (typedPlayer.position !== slotPosition) {
    return { ok: false, error: "Slot position must match the player's position." };
  }

  const blockedReason = reasonPlayerBlocked(typedPlayer);
  if (!isPlayerDraftable(typedPlayer) && blockedReason) {
    return { ok: false, error: blockedReason };
  }

  if (picks.some((p) => p.player_id === playerId)) {
    return { ok: false, error: "That player was just taken." };
  }

  if (isSlotFull(picks, user.id, slotPosition)) {
    return { ok: false, error: `Your ${slotPosition} slot is already full.` };
  }

  const { error: insertError } = await supabase.from("roster_picks").insert({
    stage_id: stageId,
    manager_id: user.id,
    player_id: playerId,
    slot_position: slotPosition,
    pick_number: pickNumber,
  });

  if (insertError) {
    return { ok: false, error: friendlyInsertError(insertError.message) };
  }

  revalidatePath("/draft");
  revalidatePath("/my-roster");
  return { ok: true };
}

/**
 * Removes the signed-in manager's own most recent pick in a stage, while
 * the draft is still open. RLS (roster_picks_delete_own_while_open)
 * already restricts this to the caller's own rows and only while
 * draft_open — this action just picks the right row (the manager's
 * highest pick_number) and revalidates.
 */
export async function undoPick(stageId: number): Promise<DraftActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const stage = await getStageById(stageId);
  if (!stage) {
    return { ok: false, error: "Stage not found." };
  }
  if (stage.status !== "draft_open") {
    return { ok: false, error: "The draft is not open for this stage." };
  }

  const { data: myPicks, error: myPicksError } = await supabase
    .from("roster_picks")
    .select("*")
    .eq("stage_id", stageId)
    .eq("manager_id", user.id)
    .order("pick_number", { ascending: false })
    .limit(1);

  if (myPicksError) {
    return { ok: false, error: myPicksError.message };
  }
  if (!myPicks || myPicks.length === 0) {
    return { ok: false, error: "You have no picks to undo." };
  }

  const { error: deleteError } = await supabase
    .from("roster_picks")
    .delete()
    .eq("id", myPicks[0].id);

  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  revalidatePath("/draft");
  revalidatePath("/my-roster");
  return { ok: true };
}

function friendlyInsertError(message: string): string {
  if (message.includes("roster_picks_stage_player_unique")) {
    return "That player was just taken.";
  }
  if (message.includes("Roster limit exceeded")) {
    return message.includes("already holds 6 players")
      ? "Your roster is already full."
      : "That position slot is already full.";
  }
  return `Could not draft player: ${message}`;
}
