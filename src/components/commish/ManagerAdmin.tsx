"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { updateManagerAction } from "@/app/(app)/commish/actions";
import type { Profile } from "@/lib/types";

interface ManagerAdminProps {
  profiles: Profile[];
}

const SLOT_OPTIONS = [null, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Manager admin: correct the 8 self-signups (manager_slot/is_player) and
 * flag commissioners. One row per profile, save button per row.
 */
export function ManagerAdmin({ profiles }: ManagerAdminProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const sorted = [...profiles].sort((a, b) => {
    if (a.manager_slot != null && b.manager_slot != null) return a.manager_slot - b.manager_slot;
    if (a.manager_slot != null) return -1;
    if (b.manager_slot != null) return 1;
    return (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? "");
  });

  const [drafts, setDrafts] = useState<Record<string, Partial<Profile>>>({});

  function patch(id: string, change: Partial<Profile>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
  }

  function valueFor<K extends keyof Profile>(profile: Profile, key: K): Profile[K] {
    return (drafts[profile.id]?.[key] ?? profile[key]) as Profile[K];
  }

  function handleSave(profile: Profile) {
    const draft = drafts[profile.id];
    if (!draft) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateManagerAction({
        profileId: profile.id,
        is_player: draft.is_player,
        is_commissioner: draft.is_commissioner,
        manager_slot: draft.manager_slot,
      });
      setMessage({ text: `${profile.display_name ?? profile.email}: ${result.message}`, ok: result.success });
      if (result.success) {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[profile.id];
          return next;
        });
        router.refresh();
      }
    });
  }

  return (
    <PixelPanel raised className="flex flex-col gap-4">
      <h2 className="font-pixel text-sm text-retro-yellow">Manager Admin</h2>
      <p className="font-mono text-sm text-retro-offwhite/70">
        Correct the 8 self-signups: assign/clear a manager_slot (1-8, unique), toggle
        is_player, and flag commissioners.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full font-mono text-base text-retro-offwhite border-collapse">
          <thead>
            <tr className="text-left border-b-2 border-retro-offwhite/40">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Slot</th>
              <th className="py-2 pr-3">Player</th>
              <th className="py-2 pr-3">Commissioner</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((profile) => {
              const dirty = !!drafts[profile.id];
              return (
                <tr key={profile.id} className="border-b-2 border-retro-offwhite/10">
                  <td className="py-2 pr-3">{profile.display_name ?? profile.email ?? profile.id}</td>
                  <td className="py-2 pr-3">
                    <select
                      className="bg-field border-2 border-retro-offwhite text-retro-offwhite px-1 py-1"
                      value={valueFor(profile, "manager_slot") ?? ""}
                      onChange={(e) =>
                        patch(profile.id, {
                          manager_slot: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      {SLOT_OPTIONS.map((slot) => (
                        <option key={slot ?? "none"} value={slot ?? ""}>
                          {slot ?? "—"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!valueFor(profile, "is_player")}
                      onChange={(e) => patch(profile.id, { is_player: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!valueFor(profile, "is_commissioner")}
                      onChange={(e) => patch(profile.id, { is_commissioner: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <PixelButton
                      variant="secondary"
                      className="!px-2 !py-1 text-[10px]"
                      onClick={() => handleSave(profile)}
                      disabled={isPending || !dirty}
                    >
                      Save
                    </PixelButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message ? (
        <p
          className={["font-mono text-sm", message.ok ? "text-retro-green" : "text-retro-red"].join(
            " ",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </PixelPanel>
  );
}
