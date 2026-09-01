import { PixelPanel } from "@/components/ui/PixelPanel";

// TODO(standings-feature-agent): Build the league standings table here —
// getWeeklyResults(stageId) for the current stage's leaderboard, and
// getAllWeeklyResults()/getManagers() to compute season-long aggregate
// standings across every finalized stage.
export default function StandingsPage() {
  return (
    <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
      <h1 className="font-pixel text-lg text-retro-yellow">Standings</h1>
      <p className="font-mono text-lg text-retro-offwhite/80">Coming soon.</p>
    </PixelPanel>
  );
}
