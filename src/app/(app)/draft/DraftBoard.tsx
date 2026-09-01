"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { DraftOrderRow, Player, Profile, RosterPick } from "@/lib/types";
import { subscribeToDraft } from "@/lib/realtime";
import { getRosterPicksClient } from "@/lib/db/roster";
import { getDraftOrderClient } from "@/lib/db/draftOrder";
import { computeCurrentPick } from "@/components/draft/draftLogic";
import { DraftOrderStrip } from "@/components/draft/DraftOrderStrip";
import { PlayerPool } from "@/components/draft/PlayerPool";
import { TeamRosters } from "@/components/draft/TeamRosters";
import { draftPlayer } from "@/app/(app)/draft/actions";

export interface DraftBoardProps {
  stageId: number;
  initialDraftOrder: DraftOrderRow[];
  initialPicks: RosterPick[];
  managers: Profile[];
  allPlayers: Player[];
  currentUserId: string | null;
}

/**
 * Client orchestrator for the live draft room: owns the draft_order /
 * roster_picks state, subscribes to realtime changes on both tables (see
 * src/lib/realtime.ts subscribeToDraft), and renders the on-the-clock
 * strip, the available player pool, and every manager's roster-in-progress.
 */
export function DraftBoard({
  stageId,
  initialDraftOrder,
  initialPicks,
  managers,
  allPlayers,
  currentUserId,
}: DraftBoardProps) {
  const [draftOrder, setDraftOrder] = useState(initialDraftOrder);
  const [picks, setPicks] = useState(initialPicks);
  const [error, setError] = useState<string | null>(null);
  const [draftingPlayerId, setDraftingPlayerId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshPicks = useCallback(async () => {
    try {
      const fresh = await getRosterPicksClient(stageId);
      setPicks(fresh);
    } catch {
      // Realtime refresh best-effort — a stale view will self-correct on
      // the next event or page reload.
    }
  }, [stageId]);

  const refreshDraftOrder = useCallback(async () => {
    try {
      const fresh = await getDraftOrderClient(stageId);
      setDraftOrder(fresh);
    } catch {
      // Best-effort, see refreshPicks.
    }
  }, [stageId]);

  useEffect(() => {
    const unsubscribe = subscribeToDraft(stageId, {
      onRosterPickChange: () => {
        refreshPicks();
      },
      onDraftOrderChange: () => {
        refreshDraftOrder();
      },
    });
    return unsubscribe;
  }, [stageId, refreshPicks, refreshDraftOrder]);

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of allPlayers) map.set(p.id, p);
    return map;
  }, [allPlayers]);

  const takenIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);
  const pool = useMemo(
    () => allPlayers.filter((p) => !takenIds.has(p.id)),
    [allPlayers, takenIds],
  );

  const { pickNumber: currentPickNumber, managerId: onTheClockId } = useMemo(
    () => computeCurrentPick(draftOrder, picks.length),
    [draftOrder, picks.length],
  );

  const isMyTurn = currentUserId !== null && onTheClockId === currentUserId;

  const myPicks = useMemo(
    () => picks.filter((p) => p.manager_id === currentUserId),
    [picks, currentUserId],
  );

  const handleDraft = useCallback(
    (player: Player) => {
      setError(null);
      setDraftingPlayerId(player.id);
      startTransition(async () => {
        const result = await draftPlayer({
          stageId,
          playerId: player.id,
          slotPosition: player.position,
        });
        setDraftingPlayerId(null);
        if (!result.ok) {
          setError(result.error ?? "Could not draft that player.");
        } else {
          // Optimistic local refresh in addition to the realtime event, so
          // the drafter sees their own pick instantly.
          refreshPicks();
        }
      });
    },
    [stageId, refreshPicks],
  );

  return (
    <div className="flex flex-col gap-4">
      <DraftOrderStrip
        draftOrder={draftOrder}
        managers={managers}
        currentPickNumber={currentPickNumber}
        currentUserId={currentUserId}
      />

      {error ? (
        <div className="border-2 border-retro-red bg-field-light px-3 py-2 font-mono text-lg text-retro-red">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <PlayerPool
          players={pool}
          isMyTurn={isMyTurn && !isPending}
          myPicks={myPicks}
          myManagerId={currentUserId}
          onDraft={handleDraft}
          draftingPlayerId={draftingPlayerId}
        />
        <TeamRosters
          managers={managers}
          picks={picks}
          playersById={playersById}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
