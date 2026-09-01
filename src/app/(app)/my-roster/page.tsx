import { PixelPanel } from "@/components/ui/PixelPanel";

// TODO(draft-feature-agent): Build the signed-in manager's roster view
// here — getMyRoster(stageId) joined against getPlayers()/getPlayerPool
// for player names, grouped by slot_position (QB1/RB2/WR2/TE1), plus
// per-player points from getWeeklyResults / player_stage_stats once a
// stage is locked/finalized.
export default function MyRosterPage() {
  return (
    <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
      <h1 className="font-pixel text-lg text-retro-yellow">My Roster</h1>
      <p className="font-mono text-lg text-retro-offwhite/80">Coming soon.</p>
    </PixelPanel>
  );
}
