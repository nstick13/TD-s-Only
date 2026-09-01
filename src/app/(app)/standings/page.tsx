import { PixelPanel } from "@/components/ui/PixelPanel";
import { Badge } from "@/components/ui/Badge";
import { StandingsTable, type StandingsRow } from "@/components/standings/StandingsTable";
import { getStagePlayerStats } from "@/components/standings/queries";
import {
  getAllWeeklyResults,
  getCurrentStage,
  getManagers,
  getRosterPicks,
  getStages,
  getWeeklyResults,
} from "@/lib/db";
import { computePoints } from "@/lib/scoring";
import type { Profile, WeeklyResult } from "@/lib/types";

/**
 * Season-long leaderboard aggregated from every finalized stage's
 * weekly_results, plus the current stage's standings (final if that stage
 * is finalized, otherwise a locally-computed live snapshot).
 */
export default async function StandingsPage() {
  const [stages, allResults, managers, currentStage] = await Promise.all([
    getStages(),
    getAllWeeklyResults(),
    getManagers(),
    getCurrentStage(),
  ]);

  const nameByManagerId = new Map<string, string>(
    managers.map((m: Profile) => [m.id, m.display_name ?? "Manager"]),
  );

  const finalizedStageIds = new Set(
    stages.filter((s) => s.status === "finalized").map((s) => s.id),
  );
  const finalizedResults = allResults.filter(
    (r) => finalizedStageIds.has(r.stage_id) && r.finalized_at,
  );

  const seasonRows = buildSeasonLeaderboard(finalizedResults, nameByManagerId);

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel raised className="flex flex-col gap-4">
        <h1 className="font-pixel text-lg text-retro-yellow">Season Standings</h1>
        {seasonRows.length === 0 ? (
          <PixelPanel className="text-center py-8">
            <p className="font-mono text-lg text-retro-offwhite/80">
              Season hasn&apos;t started — check back once the first stage finalizes.
            </p>
          </PixelPanel>
        ) : (
          <StandingsTable rows={seasonRows} pointsLabel="SEASON PTS" />
        )}
      </PixelPanel>

      <CurrentStagePanel currentStage={currentStage} nameByManagerId={nameByManagerId} />
    </div>
  );
}

function buildSeasonLeaderboard(
  results: WeeklyResult[],
  nameByManagerId: Map<string, string>,
): StandingsRow[] {
  interface Agg {
    points: number;
    tds: number;
    weeks: number;
    wins: number;
    bestRank: number | null;
  }

  const agg = new Map<string, Agg>();
  for (const r of results) {
    const entry = agg.get(r.manager_id) ?? {
      points: 0,
      tds: 0,
      weeks: 0,
      wins: 0,
      bestRank: null,
    };
    entry.points += r.total_points;
    entry.tds += r.total_tds;
    entry.weeks += 1;
    if (r.rank === 1) entry.wins += 1;
    if (r.rank != null && (entry.bestRank == null || r.rank < entry.bestRank)) {
      entry.bestRank = r.rank;
    }
    agg.set(r.manager_id, entry);
  }

  const rows: StandingsRow[] = Array.from(agg.entries()).map(([managerId, entry]) => ({
    managerId,
    name: nameByManagerId.get(managerId) ?? "Manager",
    rank: null,
    points: entry.points,
    tds: entry.tds,
    detail: `${entry.wins} win${entry.wins === 1 ? "" : "s"} in ${entry.weeks} week${
      entry.weeks === 1 ? "" : "s"
    }${entry.bestRank ? ` · best: #${entry.bestRank}` : ""}`,
  }));

  rows.sort((a, b) => b.points - a.points);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return rows;
}

async function CurrentStagePanel({
  currentStage,
  nameByManagerId,
}: {
  currentStage: Awaited<ReturnType<typeof getCurrentStage>>;
  nameByManagerId: Map<string, string>;
}) {
  if (!currentStage) {
    return (
      <PixelPanel raised className="text-center py-8">
        <p className="font-mono text-lg text-retro-offwhite/80">
          Season complete — every stage has been finalized.
        </p>
      </PixelPanel>
    );
  }

  if (currentStage.status === "finalized") {
    const results = await getWeeklyResults(currentStage.id);
    const rows: StandingsRow[] = results.map((r) => ({
      managerId: r.manager_id,
      name: nameByManagerId.get(r.manager_id) ?? "Manager",
      rank: r.rank,
      points: r.total_points,
      tds: r.total_tds,
    }));

    return (
      <PixelPanel raised className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-pixel text-base text-retro-yellow">{currentStage.name}</h2>
          <Badge status="Active" className="!bg-retro-green">
            Final
          </Badge>
        </div>
        <StandingsTable rows={rows} />
      </PixelPanel>
    );
  }

  if (currentStage.status === "upcoming") {
    return (
      <PixelPanel raised className="text-center py-8">
        <h2 className="font-pixel text-base text-retro-yellow mb-3">{currentStage.name}</h2>
        <p className="font-mono text-lg text-retro-offwhite/80">
          Draft hasn&apos;t opened for this stage yet.
        </p>
      </PixelPanel>
    );
  }

  // draft_open or locked: compute live standings from roster_picks x player_stage_stats.
  const [picks, stats] = await Promise.all([
    getRosterPicks(currentStage.id),
    getStagePlayerStats(currentStage.id),
  ]);

  if (picks.length === 0) {
    return (
      <PixelPanel raised className="text-center py-8">
        <h2 className="font-pixel text-base text-retro-yellow mb-3">{currentStage.name}</h2>
        <p className="font-mono text-lg text-retro-offwhite/80">
          No rosters drafted for this stage yet.
        </p>
      </PixelPanel>
    );
  }

  const statsByPlayerId = new Map(stats.map((s) => [s.player_id, s]));

  interface LiveAgg {
    points: number;
    tds: number;
  }
  const liveAgg = new Map<string, LiveAgg>();
  for (const pick of picks) {
    const entry = liveAgg.get(pick.manager_id) ?? { points: 0, tds: 0 };
    const stat = statsByPlayerId.get(pick.player_id);
    if (stat) {
      entry.points += computePoints({
        passTd: stat.pass_td,
        rushTd: stat.rush_td,
        recTd: stat.rec_td,
      });
      entry.tds += stat.pass_td + stat.rush_td + stat.rec_td;
    }
    liveAgg.set(pick.manager_id, entry);
  }

  const rows: StandingsRow[] = Array.from(liveAgg.entries()).map(([managerId, entry]) => ({
    managerId,
    name: nameByManagerId.get(managerId) ?? "Manager",
    rank: null,
    points: Math.round(entry.points * 10) / 10,
    tds: entry.tds,
  }));
  rows.sort((a, b) => b.points - a.points);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return (
    <PixelPanel raised className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-pixel text-base text-retro-yellow">{currentStage.name}</h2>
        <Badge status="Questionable" className="!bg-retro-yellow animate-pulse">
          Live / In Progress
        </Badge>
      </div>
      <p className="font-mono text-sm text-retro-offwhite/60">
        Not yet final — points update as ESPN stats sync in.
      </p>
      <StandingsTable rows={rows} live />
    </PixelPanel>
  );
}
