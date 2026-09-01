import { PixelPanel } from "@/components/ui/PixelPanel";
import { StandingsTable, type StandingsRow } from "@/components/standings/StandingsTable";
import { StagePicker } from "@/components/standings/StagePicker";
import { BoxScore, type ManagerBoxScore } from "@/components/standings/BoxScore";
import { getStagePlayerStats } from "@/components/standings/queries";
import {
  getManagers,
  getPlayers,
  getRosterPicks,
  getStages,
  getWeeklyResults,
} from "@/lib/db";
import { computePoints } from "@/lib/scoring";
import type { Profile } from "@/lib/types";

/**
 * Stage-by-stage history / box-score view: pick a stage, see its final
 * standings (weekly_results) and every manager's roster with per-player TDs
 * and points for that stage (roster_picks x player_stage_stats).
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { stage?: string };
}) {
  const [stages, managers] = await Promise.all([getStages(), getManagers()]);

  if (stages.length === 0) {
    return (
      <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
        <h1 className="font-pixel text-lg text-retro-yellow">History</h1>
        <p className="font-mono text-lg text-retro-offwhite/80">No stages set up yet.</p>
      </PixelPanel>
    );
  }

  const finalizedStages = stages.filter((s) => s.status === "finalized");
  const defaultStage =
    finalizedStages[finalizedStages.length - 1] ?? stages[stages.length - 1];

  const requestedId = searchParams.stage ? Number(searchParams.stage) : NaN;
  const selectedStage =
    stages.find((s) => s.id === requestedId) ?? defaultStage;

  const nameByManagerId = new Map<string, string>(
    managers.map((m: Profile) => [m.id, m.display_name ?? "Manager"]),
  );

  const [results, picks, stats, players] = await Promise.all([
    getWeeklyResults(selectedStage.id),
    getRosterPicks(selectedStage.id),
    getStagePlayerStats(selectedStage.id),
    getPlayers(),
  ]);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const statsByPlayerId = new Map(stats.map((s) => [s.player_id, s]));
  const rankByManagerId = new Map(results.map((r) => [r.manager_id, r.rank]));

  const standingsRows: StandingsRow[] = results.map((r) => ({
    managerId: r.manager_id,
    name: nameByManagerId.get(r.manager_id) ?? "Manager",
    rank: r.rank,
    points: r.total_points,
    tds: r.total_tds,
  }));

  const boxScoresByManager = new Map<string, ManagerBoxScore>();
  for (const pick of picks) {
    const box = boxScoresByManager.get(pick.manager_id) ?? {
      managerId: pick.manager_id,
      managerName: nameByManagerId.get(pick.manager_id) ?? "Manager",
      rank: rankByManagerId.get(pick.manager_id) ?? null,
      totalPoints: 0,
      players: [],
    };

    const player = playerById.get(pick.player_id);
    const stat = statsByPlayerId.get(pick.player_id);
    const points = stat
      ? computePoints({ passTd: stat.pass_td, rushTd: stat.rush_td, recTd: stat.rec_td })
      : 0;
    const tds = stat ? stat.pass_td + stat.rush_td + stat.rec_td : 0;

    box.players.push({
      playerId: pick.player_id,
      name: player?.name ?? "Unknown player",
      position: pick.slot_position,
      tds,
      points,
    });
    box.totalPoints += points;
    boxScoresByManager.set(pick.manager_id, box);
  }

  const boxScores = Array.from(boxScoresByManager.values()).sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank;
    return b.totalPoints - a.totalPoints;
  });

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel raised className="flex flex-col gap-4">
        <h1 className="font-pixel text-lg text-retro-yellow">History</h1>
        <StagePicker stages={stages} selectedStageId={selectedStage.id} />
      </PixelPanel>

      <PixelPanel raised className="flex flex-col gap-4">
        <h2 className="font-pixel text-base text-retro-yellow">
          {selectedStage.name} — Final Standings
        </h2>
        {selectedStage.status !== "finalized" ? (
          <p className="font-mono text-retro-offwhite/70">
            This stage hasn&apos;t been finalized yet — no official results.
          </p>
        ) : (
          <StandingsTable rows={standingsRows} />
        )}
      </PixelPanel>

      <div className="flex flex-col gap-4">
        <h2 className="font-pixel text-base text-retro-yellow">Box Scores</h2>
        {boxScores.length === 0 ? (
          <PixelPanel className="text-center py-8">
            <p className="font-mono text-lg text-retro-offwhite/80">
              No roster was drafted for this stage.
            </p>
          </PixelPanel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {boxScores.map((box) => (
              <BoxScore key={box.managerId} box={box} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
