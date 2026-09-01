import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/db/profiles";
import { PixelPanel } from "@/components/ui/PixelPanel";

// TODO(commissioner-feature-agent): Build commissioner tools here — stage
// status transitions (upcoming -> draft_open -> locked -> finalized),
// draft_order generation, manual roster_picks corrections, sync_log /
// getSyncStatus() job monitoring and manual re-trigger, and manager_slot
// assignment (getProfiles()). All writes here rely on RLS's
// is_commissioner(uid) check — see docs/ARCHITECTURE.md "Roles model".
export default async function CommishPage() {
  const profile = await getMyProfile();

  // Belt-and-suspenders guard: the nav only shows this link to
  // commissioners, but the route itself must not trust that — RLS also
  // enforces this server-side on any writes this page ends up doing.
  if (!profile?.is_commissioner) {
    redirect("/");
  }

  return (
    <PixelPanel raised className="flex flex-col gap-3 items-center text-center py-12">
      <h1 className="font-pixel text-lg text-retro-yellow">Commish Tools</h1>
      <p className="font-mono text-lg text-retro-offwhite/80">Coming soon.</p>
    </PixelPanel>
  );
}
