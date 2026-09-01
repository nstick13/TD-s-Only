import { PixelPanel } from "@/components/ui/PixelPanel";

// TODO(standings-feature-agent): Build season history here — getStages()
// filtered to status === 'finalized', with each stage's
// getWeeklyResults(stageId) and getRosterPicks(stageId) for a past-stage
// drill-down view.
export default function HistoryPage() {
  return (
    <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
      <h1 className="font-pixel text-lg text-retro-yellow">History</h1>
      <p className="font-mono text-lg text-retro-offwhite/80">Coming soon.</p>
    </PixelPanel>
  );
}
