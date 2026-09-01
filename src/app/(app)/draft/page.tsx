import { PixelPanel } from "@/components/ui/PixelPanel";

// TODO(draft-feature-agent): Build the live draft board here — snake pick
// order from getDraftOrder(stageId), available pool from
// getPlayerPool(stageId)/getPlayerPoolClient, realtime updates via
// subscribeToDraft(stageId, handlers) from src/lib/realtime.ts (channel
// draft:{stageId}), and pick submission writing to roster_picks (RLS only
// allows a manager to insert their own rows while stage.status ===
// 'draft_open' — see docs/ARCHITECTURE.md).
export default function DraftPage() {
  return (
    <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
      <h1 className="font-pixel text-lg text-retro-yellow">Draft</h1>
      <p className="font-mono text-lg text-retro-offwhite/80">Coming soon.</p>
    </PixelPanel>
  );
}
