"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { manualRosterEditAction } from "@/app/(app)/commish/actions";
import { POSITIONS, type Position } from "@/lib/roster";
import type { Stage, Profile, RosterPick, Player } from "@/lib/types";

interface RosterEditorProps {
  stages: Stage[];
  managers: Profile[];
}

/**
 * Manual roster correction — the deliberate post-lock injury-swap path.
 * Works in any stage status (commissioner RLS allows it); to swap a
 * player, remove the old one and add the replacement in the same save.
 */
export function RosterEditor({ stages, managers }: RosterEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.ordinal - b.ordinal),
    [stages],
  );

  const [stageId, setStageId] = useState<number | "">(sortedStages[0]?.id ?? "");
  const [managerId, setManagerId] = useState<string | "">(managers[0]?.id ?? "");
  const [roster, setRoster] = useState<RosterPick[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pool, setPool] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);

  const [removePlayerId, setRemovePlayerId] = useState<string>("");
  const [addPlayerId, setAddPlayerId] = useState<string>("");
  const [slotPosition, setSlotPosition] = useState<Position>("QB");

  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? id;

  useEffect(() => {
    // Full player index once, for looking up names on existing picks.
    const supabase = createClient();
    supabase
      .from("players")
      .select("*")
      .then(({ data, error }) => {
        if (!error && data) setPlayers(data as Player[]);
      });
  }, []);

  async function loadRosterAndPool(sid: number, mid: string) {
    setLoading(true);
    const supabase = createClient();

    const [myPicksRes, allPicksRes] = await Promise.all([
      supabase.from("roster_picks").select("*").eq("stage_id", sid).eq("manager_id", mid),
      supabase.from("roster_picks").select("player_id").eq("stage_id", sid),
    ]);
    if (!myPicksRes.error && myPicksRes.data) setRoster(myPicksRes.data as RosterPick[]);

    const takenIds = (allPicksRes.data ?? []).map((p) => p.player_id as string);
    let poolQuery = supabase.from("players").select("*").order("name", { ascending: true });
    if (takenIds.length > 0) {
      poolQuery = poolQuery.not("id", "in", `(${takenIds.map((id) => `"${id}"`).join(",")})`);
    }
    const { data: poolData, error: poolError } = await poolQuery;
    if (!poolError && poolData) setPool(poolData as Player[]);
    setLoading(false);
  }

  useEffect(() => {
    if (stageId === "" || managerId === "") {
      setRoster([]);
      setPool([]);
      return;
    }
    let cancelled = false;
    loadRosterAndPool(stageId, managerId).then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, managerId]);

  const poolForSlot = pool.filter((p) => p.position === slotPosition);

  function handleSave() {
    if (stageId === "" || managerId === "") return;
    if (!removePlayerId && !addPlayerId) {
      setMessage({ text: "Pick a player to remove and/or add first.", ok: false });
      return;
    }
    const currentStageId = stageId;
    const currentManagerId = managerId;
    setMessage(null);
    startTransition(async () => {
      const result = await manualRosterEditAction({
        stageId: currentStageId,
        managerId: currentManagerId,
        removePlayerId: removePlayerId || undefined,
        addPlayerId: addPlayerId || undefined,
        slotPosition: addPlayerId ? slotPosition : undefined,
      });
      setMessage({ text: result.message, ok: result.success });
      if (result.success) {
        setRemovePlayerId("");
        setAddPlayerId("");
        router.refresh();
        // Also refetch this component's own roster/pool immediately
        // rather than waiting on the parent server component re-render.
        void loadRosterAndPool(currentStageId, currentManagerId);
      }
    });
  }

  return (
    <PixelPanel raised className="flex flex-col gap-4">
      <h2 className="font-pixel text-sm text-retro-yellow">Manual Roster Edit</h2>
      <p className="font-mono text-sm text-retro-offwhite/70">
        Add/remove/swap a player on any manager&apos;s roster, in any stage — the
        post-lock injury-correction path. Works even after the draft locks.
      </p>

      <div className="flex flex-wrap gap-3">
        <select
          className="font-mono text-base bg-field border-2 border-retro-offwhite text-retro-offwhite px-2 py-2"
          value={stageId}
          onChange={(e) => setStageId(e.target.value ? Number(e.target.value) : "")}
        >
          {sortedStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="font-mono text-base bg-field border-2 border-retro-offwhite text-retro-offwhite px-2 py-2"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        >
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name ?? m.email ?? m.id}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="font-mono text-sm text-retro-offwhite/60">Loading roster...</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="font-pixel text-xs text-retro-offwhite">Current Roster</h3>
            {roster.length === 0 ? (
              <p className="font-mono text-sm text-retro-offwhite/60">No picks yet.</p>
            ) : (
              roster.map((pick) => (
                <label
                  key={pick.id}
                  className="flex items-center gap-2 font-mono text-base text-retro-offwhite"
                >
                  <input
                    type="radio"
                    name="removePlayer"
                    checked={removePlayerId === pick.player_id}
                    onChange={() => setRemovePlayerId(pick.player_id)}
                  />
                  <Badge status="Active" className="!bg-field !text-retro-offwhite !border-retro-offwhite">
                    {pick.slot_position}
                  </Badge>
                  {playerName(pick.player_id)}
                </label>
              ))
            )}
            {removePlayerId ? (
              <PixelButton
                variant="secondary"
                className="!px-2 !py-1 text-[10px] w-fit"
                onClick={() => setRemovePlayerId("")}
              >
                Clear selection
              </PixelButton>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-pixel text-xs text-retro-offwhite">Add Player</h3>
            <div className="flex gap-2">
              {POSITIONS.map((pos) => (
                <PixelButton
                  key={pos}
                  variant={slotPosition === pos ? "primary" : "secondary"}
                  className="!px-2 !py-1 text-[10px]"
                  onClick={() => {
                    setSlotPosition(pos);
                    setAddPlayerId("");
                  }}
                >
                  {pos}
                </PixelButton>
              ))}
            </div>
            <select
              className="font-mono text-base bg-field border-2 border-retro-offwhite text-retro-offwhite px-2 py-2"
              value={addPlayerId}
              onChange={(e) => setAddPlayerId(e.target.value)}
            >
              <option value="">— none —</option>
              {poolForSlot.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.nfl_team ?? "FA"})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <PixelButton
        onClick={handleSave}
        disabled={isPending || (!removePlayerId && !addPlayerId)}
        className="w-fit"
      >
        Save Roster Change
      </PixelButton>

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
