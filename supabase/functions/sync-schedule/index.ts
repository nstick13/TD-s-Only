// sync-schedule
//
// For the current/target stage (see _shared/stage.ts for the selection
// rule), fetches that week's scoreboard and:
//   (a) writes the earliest event kickoff time to stages.first_kickoff_at
//       — this is what apply-locks uses to auto-lock rosters.
//   (b) figures out which NFL teams have no game that week (a bye) and
//       sets players.on_bye accordingly for every player on that team.
//
// Invoke: POST { "stage_id"?: number }
import { getServiceClient, writeSyncLog } from "../_shared/db.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { getScoreboard, getTeamIndex } from "../_shared/espn.ts";
import { resolveStage } from "../_shared/stage.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = getServiceClient();

  let body: { stage_id?: number } = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = await req.json().catch(() => ({}));
    }
  } catch {
    body = {};
  }

  try {
    const stage = await resolveStage(supabase, body.stage_id);

    const [scoreboard, allTeams] = await Promise.all([
      getScoreboard(stage.espn_season_type, stage.espn_week_num),
      getTeamIndex(),
    ]);

    if (scoreboard.events.length === 0) {
      const msg =
        `Scoreboard for ${stage.name} (seasontype=${stage.espn_season_type}, ` +
        `week=${stage.espn_week_num}) returned zero events — refusing to write ` +
        `first_kickoff_at or bye flags off an empty week.`;
      await writeSyncLog(supabase, "schedule", "error", msg, null);
      return jsonResponse({ ok: false, error: msg }, 502);
    }

    // (a) earliest kickoff across all of this week's events.
    let earliest: string | null = null;
    const teamIdsWithGame = new Set<string>();
    for (const event of scoreboard.events) {
      if (!earliest || new Date(event.date) < new Date(earliest)) {
        earliest = event.date;
      }
      for (const comp of event.competitions ?? []) {
        for (const competitor of comp.competitors ?? []) {
          teamIdsWithGame.add(String(competitor.team.id));
        }
      }
    }

    if (earliest) {
      const { error } = await supabase
        .from("stages")
        .update({ first_kickoff_at: earliest })
        .eq("id", stage.id);
      if (error) throw new Error(`stages update failed: ${error.message}`);
    }

    // (b) bye teams = all 32 teams minus teams with a game this week.
    const allTeamIds = allTeams.map((t) => String(t.team.id));
    const byeTeamIds = allTeamIds.filter((id) => !teamIdsWithGame.has(id));

    if (byeTeamIds.length > 0) {
      const { error: byeErr } = await supabase
        .from("players")
        .update({ on_bye: true, updated_at: new Date().toISOString() })
        .in("nfl_team_id", byeTeamIds);
      if (byeErr) {
        throw new Error(`players on_bye=true update failed: ${byeErr.message}`);
      }
    }

    const activeTeamIds = allTeamIds.filter((id) => teamIdsWithGame.has(id));
    if (activeTeamIds.length > 0) {
      const { error: activeErr } = await supabase
        .from("players")
        .update({ on_bye: false, updated_at: new Date().toISOString() })
        .in("nfl_team_id", activeTeamIds);
      if (activeErr) {
        throw new Error(
          `players on_bye=false update failed: ${activeErr.message}`,
        );
      }
    }

    const msg =
      `Stage "${stage.name}": first_kickoff_at=${earliest}, ` +
      `${byeTeamIds.length} team(s) on bye (${byeTeamIds.join(", ") || "none"}), ` +
      `${scoreboard.events.length} games this week.`;
    await writeSyncLog(supabase, "schedule", "success", msg, null);

    return jsonResponse({
      ok: true,
      stageId: stage.id,
      stageName: stage.name,
      firstKickoffAt: earliest,
      byeTeamIds,
      gameCount: scoreboard.events.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeSyncLog(supabase, "schedule", "error", msg, null);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
