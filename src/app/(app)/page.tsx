import Link from "next/link";
import { getCurrentStage } from "@/lib/db/stages";
import { getMyProfile } from "@/lib/db/profiles";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Badge } from "@/components/ui/Badge";

/**
 * Authenticated dashboard home. Shows the current stage + quick links.
 * Deep screens (live draft board, roster editor, standings table, season
 * history) are owned by other feature agents and live at their own
 * routes — this page stays intentionally light.
 */
export default async function DashboardPage() {
  const [stage, profile] = await Promise.all([getCurrentStage(), getMyProfile()]);

  const statusLabel: Record<string, string> = {
    upcoming: "Upcoming",
    draft_open: "Draft Open",
    locked: "Locked",
    finalized: "Finalized",
  };

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel raised className="flex flex-col gap-3">
        <h1 className="font-pixel text-lg text-retro-yellow">
          {profile?.display_name ? `Welcome back, ${profile.display_name}` : "Welcome"}
        </h1>

        {stage ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xl">{stage.name}</span>
            <Badge status={stage.status === "draft_open" ? "Active" : "Bye"}>
              {statusLabel[stage.status] ?? stage.status}
            </Badge>
          </div>
        ) : (
          <p className="font-mono text-lg text-retro-offwhite/70">
            No active stage — season not started or already complete.
          </p>
        )}
      </PixelPanel>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PixelPanel className="flex flex-col gap-3">
          <h2 className="font-pixel text-sm text-retro-yellow">Draft</h2>
          <p className="font-mono text-lg">
            {stage?.status === "draft_open"
              ? `Draft is live for ${stage.name}.`
              : "Jump into the live draft board when it's open."}
          </p>
          <Link href="/draft">
            <PixelButton className="w-full sm:w-auto">Go to Draft</PixelButton>
          </Link>
        </PixelPanel>

        <PixelPanel className="flex flex-col gap-3">
          <h2 className="font-pixel text-sm text-retro-yellow">My Roster</h2>
          <p className="font-mono text-lg">Review your drafted lineup for the current stage.</p>
          <Link href="/my-roster">
            <PixelButton variant="secondary" className="w-full sm:w-auto">
              View Roster
            </PixelButton>
          </Link>
        </PixelPanel>

        <PixelPanel className="flex flex-col gap-3">
          <h2 className="font-pixel text-sm text-retro-yellow">Standings</h2>
          <p className="font-mono text-lg">See how the league stacks up this stage.</p>
          <Link href="/standings">
            <PixelButton variant="secondary" className="w-full sm:w-auto">
              View Standings
            </PixelButton>
          </Link>
        </PixelPanel>

        <PixelPanel className="flex flex-col gap-3">
          <h2 className="font-pixel text-sm text-retro-yellow">History</h2>
          <p className="font-mono text-lg">Look back at past stages and results.</p>
          <Link href="/history">
            <PixelButton variant="secondary" className="w-full sm:w-auto">
              View History
            </PixelButton>
          </Link>
        </PixelPanel>
      </div>
    </div>
  );
}
