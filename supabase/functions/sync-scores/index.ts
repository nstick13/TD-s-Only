// sync-scores
//
// For the current/target stage, lists that week's event ids from the
// scoreboard, then fetches EVERY game's summary endpoint and tallies
// pass_td / rush_td / rec_td per ESPN athlete id from the box score (see
// "Parsing approach" below for why box score over scoringPlays text).
// Upserts into player_stage_stats. THIS IS THE BUG FIX for the legacy
// prototype, which read only the scoreboard's `leaders` array (each game's
// top 1-3 performers per stat) and silently missed every other TD scorer.
//
// Parsing approach
// -----------------
// ESPN's summary?event={id} response includes `boxscore.players`, an array
// of one entry per team:
//   { team: {...}, statistics: [
//       { name: "passing",   labels: [...,"TD",...], athletes: [{athlete:{id}, stats:[...]}] },
//       { name: "rushing",   labels: [...,"TD",...], athletes: [...] },
//       { name: "receiving", labels: [...,"TD",...], athletes: [...] },
//       ...
//   ] }
// Each `statistics[].labels` array names the columns for that category and
// `athletes[].stats` is a same-length array of stringified values. We find
// the "TD" column index within each of the passing/rushing/receiving
// categories and read that athlete's count directly. This is a full box
// score — every athlete who recorded ANY stat in the category appears,
// not just leaders — so it inherently fixes the missed-TD bug: a passing
// TD is credited via the "passing" category (to the QB) and, separately,
// the actual receiver of that pass is credited via the "receiving"
// category, because both the QB and the receiver each have their own row
// with their own "TD" column in the box score. We do NOT need to
// text-parse individual `scoringPlays` entries to reconstruct "who threw
// it AND who caught it" from one play description — the box score already
// separates that by athlete and by category, which is more robust than a
// text/regex parse of play-by-play strings (whose format ESPN does not
// document and has changed over time). `scoringPlays` is left unparsed;
// if a human wants an extra cross-check, comparing
// sum(pass_td)+sum(rush_td)+sum(rec_td) against scoringPlays.length (minus
// any 2-point-conversion or defensive/special-teams TDs, which this league
// doesn't score) is the sanity check to run.
//
// This was NOT validated against a live ESPN response in this environment
// (outbound fetches to espn.com are blocked here) — it is built from the
// documented/observed shape used by several open-source ESPN API wrappers.
// Ben should sanity-check one real game's summary JSON against a known
// box score before relying on this in production; see README.md.
//
// Invoke: POST { "stage_id"?: number }
import { getServiceClient, writeSyncLog } from "../_shared/db.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  EspnBoxscoreStatCategory,
  getGameSummary,
  getScoreboard,
  mapWithConcurrency,
} from "../_shared/espn.ts";
import { resolveStage } from "../_shared/stage.ts";

const GAME_FETCH_CONCURRENCY = 4;

interface TdTally {
  pass_td: number;
  rush_td: number;
  rec_td: number;
}

function tdIndexFor(category: EspnBoxscoreStatCategory): number {
  return (category.labels ?? []).findIndex(
    (l) => (l ?? "").trim().toUpperCase() === "TD",
  );
}

function statToInt(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Tally pass/rush/rec TDs per athlete id from one game's boxscore.players. */
function tallyGame(
  teamPlayers: { statistics: EspnBoxscoreStatCategory[] }[],
  tallies: Map<string, TdTally>,
) {
  const CATEGORY_TO_FIELD: Record<string, keyof TdTally> = {
    passing: "pass_td",
    rushing: "rush_td",
    receiving: "rec_td",
  };

  for (const team of teamPlayers) {
    for (const category of team.statistics ?? []) {
      const field = CATEGORY_TO_FIELD[category.name];
      if (!field) continue;

      const tdIdx = tdIndexFor(category);
      if (tdIdx === -1) continue;

      for (const a of category.athletes ?? []) {
        const count = statToInt(a.stats?.[tdIdx]);
        if (count <= 0) continue;
        const id = String(a.athlete.id);
        const existing = tallies.get(id) ?? {
          pass_td: 0,
          rush_td: 0,
          rec_td: 0,
        };
        existing[field] += count;
        tallies.set(id, existing);
      }
    }
  }
}

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
    const scoreboard = await getScoreboard(
      stage.espn_season_type,
      stage.espn_week_num,
    );

    if (scoreboard.events.length === 0) {
      const msg =
        `Scoreboard for ${stage.name} returned zero events — nothing to sync.`;
      await writeSyncLog(supabase, "scores", "error", msg, null);
      return jsonResponse({ ok: false, error: msg }, 502);
    }

    const tallies = new Map<string, TdTally>();

    const { results, errors } = await mapWithConcurrency(
      scoreboard.events,
      GAME_FETCH_CONCURRENCY,
      async (event) => {
        const summary = await getGameSummary(event.id);
        const teamPlayers = summary.boxscore?.players;
        if (!teamPlayers || teamPlayers.length === 0) {
          throw new Error(
            `event ${event.id} summary missing boxscore.players`,
          );
        }
        tallyGame(teamPlayers, tallies);
        return event.id;
      },
    );

    if (errors.length > 0) {
      console.error(
        `sync-scores: ${errors.length}/${scoreboard.events.length} game summary fetches failed`,
        errors.map((e) => String(e.error)),
      );
    }

    // Only upsert players that already exist in our `players` table
    // (skip unknowns rather than violate the FK / invent player rows here
    // — sync-players is the source of truth for the player pool).
    const athleteIds = Array.from(tallies.keys());
    const knownIds = new Set<string>();
    const ID_CHUNK = 500;
    for (let i = 0; i < athleteIds.length; i += ID_CHUNK) {
      const chunk = athleteIds.slice(i, i + ID_CHUNK);
      const { data, error } = await supabase
        .from("players")
        .select("id")
        .in("id", chunk);
      if (error) throw new Error(`players lookup failed: ${error.message}`);
      for (const row of data ?? []) knownIds.add(row.id);
    }

    const now = new Date().toISOString();
    const rows = athleteIds
      .filter((id) => knownIds.has(id))
      .map((id) => {
        const t = tallies.get(id)!;
        return {
          stage_id: stage.id,
          player_id: id,
          pass_td: t.pass_td,
          rush_td: t.rush_td,
          rec_td: t.rec_td,
          updated_at: now,
        };
      });
    const skippedCount = athleteIds.length - rows.length;

    if (rows.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("player_stage_stats")
          .upsert(chunk, { onConflict: "stage_id,player_id" });
        if (error) {
          throw new Error(
            `player_stage_stats upsert failed at chunk ${i / CHUNK}: ${error.message}`,
          );
        }
      }
    }

    const status = errors.length > 0 ? "error" : "success";
    const msg =
      `Stage "${stage.name}": tallied TDs for ${athleteIds.length} athletes across ` +
      `${results.length}/${scoreboard.events.length} games ` +
      `(${skippedCount} skipped — not in players table). ` +
      (errors.length > 0
        ? `${errors.length} game summary fetch(es) FAILED — stats for those games are missing this run.`
        : "All games fetched successfully.");
    await writeSyncLog(supabase, "scores", status, msg, rows.length);

    return jsonResponse({
      ok: errors.length === 0,
      stageId: stage.id,
      stageName: stage.name,
      gamesOk: results.length,
      gamesFailed: errors.length,
      athletesTallied: athleteIds.length,
      playersUpserted: rows.length,
      skippedUnknownPlayers: skippedCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeSyncLog(supabase, "scores", "error", msg, null);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
