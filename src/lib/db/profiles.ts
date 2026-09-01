import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** All profiles (commissioner-facing lists, etc). */
export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*");

  if (error) throw new Error(`getProfiles: ${error.message}`);
  return data as Profile[];
}

/** The signed-in user's own profile, or null if not authenticated. */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`getMyProfile: ${error.message}`);
  return data as Profile | null;
}

/** The 8 (or fewer) roster managers: profiles with is_player = true, ordered by manager_slot. */
export async function getManagers(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_player", true)
    .order("manager_slot", { ascending: true });

  if (error) throw new Error(`getManagers: ${error.message}`);
  return data as Profile[];
}
