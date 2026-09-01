import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PixelButton } from "@/components/ui/PixelButton";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { ScoreDisplay } from "@/components/ui/ScoreDisplay";
import { Badge } from "@/components/ui/Badge";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { display_name: string | null; is_commissioner: boolean; is_player: boolean } | null =
    null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, is_commissioner, is_player")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="font-pixel text-2xl sm:text-4xl text-retro-yellow leading-relaxed">
          TD&apos;s Only League
        </h1>
        <p className="font-mono text-xl max-w-md text-retro-offwhite">
          Weekly redraft. Touchdowns only. Passing = 0.5, Rushing = 1.0,
          Receiving = 1.0.
        </p>
      </div>

      <PixelPanel raised className="flex flex-col items-center gap-4 max-w-sm w-full">
        {user ? (
          <>
            <p className="font-mono text-lg">
              Welcome back, {profile?.display_name ?? user.email}
            </p>
            <div className="flex gap-2 flex-wrap justify-center">
              <Badge status={profile?.is_commissioner ? "Active" : "Bye"}>
                {profile?.is_commissioner ? "Commissioner" : "Not commissioner"}
              </Badge>
              <Badge status={profile?.is_player ? "Active" : "Bye"}>
                {profile?.is_player ? "Player" : "Not on a roster"}
              </Badge>
            </div>
            <form action="/auth/sign-out" method="post">
              <PixelButton variant="secondary" type="submit">
                Sign Out
              </PixelButton>
            </form>
          </>
        ) : (
          <>
            <ScoreDisplay value="8" label="Managers" size="sm" />
            <div className="flex gap-3">
              <Link href="/login">
                <PixelButton variant="primary">Log In</PixelButton>
              </Link>
              <Link href="/signup">
                <PixelButton variant="secondary">Sign Up</PixelButton>
              </Link>
            </div>
          </>
        )}
      </PixelPanel>
    </main>
  );
}
