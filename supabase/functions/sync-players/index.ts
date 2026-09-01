// sync-players
//
// Pulls the full 32-team roster from ESPN and upserts QB/RB/WR/TE into
// `players`, including injury status (the athlete's `injuries[]` array on
// the SAME roster response — so this one job covers both the initial
// roster pull and the ongoing injury-status refresh; no separate job
// needed). Never falls back to stale/cached data on a bad fetch — a
// failure aborts the run and logs an 'error' sync_log row instead.
//
// Invoke: POST (no body needed).
import { getServiceClient, writeSyncLog } from "../_shared/db.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import {
  EspnAthlete,
  getTeamIndex,
  getTeamRoster,
  mapWithConcurrency,
} from "../_shared/espn.ts";

const KEEP_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const ROSTER_CONCURRENCY = 5;
// 32 teams x (QB/RB/WR/TE only) is comfortably >200 in practice (roughly
// 3 QB + 5-6 RB + 6-7 WR + 3 TE per team, times 32). Anything under this
// almost certainly means a partial/broken fetch, not a genuinely thin
// league-wide pool — treat it as a sync failure per the "loud staleness /
// never silently degrade" rule in docs/ARCHITECTURE.md.
const MIN_PLAUSIBLE_PLAYER_COUNT = 200;

interface PlayerRow {
  id: string;
  name: string;
  position: string;
  nfl_team: string;
  nfl_team_id: string;
  status: string;
  status_detail: string | null;
  updated_at: string;
  last_synced_at: string;
}

function normalizeStatus(
  athlete: EspnAthlete,
): { status: string; status_detail: string | null } {
  const injury = athlete.injuries?.[0];
  if (!injury || !injury.status) {
    return { status: "Active", status_detail: null };
  }

  const raw = injury.status.trim();
  const detail = injury.details?.detail ?? null;

  // Normalize ESPN's free-text injury status into our small enum-ish set.
  // ESPN uses values like "Questionable", "Doubtful", "Out",
  // "Injured Reserve" / "IR", "Physically Unable to Perform" / "PUP",
  // "Suspension", "Active". Anything unrecognized is passed through as-is
  // (status_detail preserves the original text either way) rather than
  // silently coerced to "Active".
  const lower = raw.toLowerCase();
  let status = raw;
  if (lower === "questionable") status = "Questionable";
  else if (lower === "doubtful") status = "Doubtful";
  else if (lower === "out") status = "Out";
  else if (lower.includes("injured reserve") || lower === "ir") status = "IR";
  else if (lower === "active") status = "Active";

  return { status, status_detail: detail ?? raw };
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = getServiceClient();
  const startedAt = Date.now();

  try {
    const teams = await getTeamIndex(); // throws if empty/malformed

    const { results: rosterResults, errors: rosterErrors } =
      await mapWithConcurrency(teams, ROSTER_CONCURRENCY, async (t) => {
        const categories = await getTeamRoster(t.team.id);
        return { team: t, categories };
      });

    // A handful of individual team-roster failures (transient ESPN
    // hiccups) shouldn't necessarily kill the whole run, but if we
    // couldn't get a large fraction of teams, treat the whole run as
    // unreliable rather than upserting a partial/skewed pool.
    if (rosterErrors.length > 0) {
      console.error(
        `sync-players: ${rosterErrors.length}/${teams.length} team roster fetches failed`,
        rosterErrors.map((e) => String(e.error)),
      );
    }
    if (rosterErrors.length > teams.length / 2) {
      const msg =
        `Aborting: ${rosterErrors.length}/${teams.length} team roster fetches failed — ` +
        `refusing to upsert a partial player pool.`;
      await writeSyncLog(supabase, "players", "error", msg, 0);
      return jsonResponse({ ok: false, error: msg }, 502);
    }

    const now = new Date().toISOString();
    const rows = new Map<string, PlayerRow>();

    for (const { team, categories } of rosterResults) {
      for (const category of categories) {
        for (const athlete of category.items ?? []) {
          const pos = athlete.position?.abbreviation ?? "";
          if (!KEEP_POSITIONS.has(pos)) continue;
          if (!athlete.id) continue;

          const name = athlete.fullName ?? athlete.displayName;
          if (!name) continue;

          const { status, status_detail } = normalizeStatus(athlete);

          rows.set(String(athlete.id), {
            id: String(athlete.id),
            name,
            position: pos,
            nfl_team: team.team.abbreviation ?? team.team.displayName,
            nfl_team_id: String(team.team.id),
            status,
            status_detail,
            updated_at: now,
            last_synced_at: now,
          });
        }
      }
    }

    const playerRows = Array.from(rows.values());

    if (playerRows.length < MIN_PLAUSIBLE_PLAYER_COUNT) {
      const msg =
        `Aborting: only parsed ${playerRows.length} QB/RB/WR/TE players across ` +
        `${teams.length} teams (${rosterResults.length} rosters fetched OK) — ` +
        `below the plausibility floor of ${MIN_PLAUSIBLE_PLAYER_COUNT}. Refusing to upsert.`;
      await writeSyncLog(supabase, "players", "error", msg, playerRows.length);
      return jsonResponse({ ok: false, error: msg }, 502);
    }

    // Upsert in chunks to keep request bodies reasonable.
    const CHUNK = 200;
    for (let i = 0; i < playerRows.length; i += CHUNK) {
      const chunk = playerRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("players")
        .upsert(chunk, { onConflict: "id" });
      if (error) {
        const msg = `Upsert failed at chunk ${i / CHUNK}: ${error.message}`;
        await writeSyncLog(supabase, "players", "error", msg, i);
        return jsonResponse({ ok: false, error: msg }, 500);
      }
    }

    const ms = Date.now() - startedAt;
    const msg = `Synced ${playerRows.length} players (QB/RB/WR/TE) across ${teams.length} teams in ${ms}ms` +
      (rosterErrors.length > 0
        ? ` (${rosterErrors.length} team roster fetches failed and were skipped)`
        : "");
    await writeSyncLog(supabase, "players", "success", msg, playerRows.length);

    return jsonResponse({
      ok: true,
      playerCount: playerRows.length,
      teamCount: teams.length,
      failedTeamRosterFetches: rosterErrors.length,
      ms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeSyncLog(supabase, "players", "error", msg, null);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
