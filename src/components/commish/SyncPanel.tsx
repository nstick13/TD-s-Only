"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PixelPanel } from "@/components/ui/PixelPanel";
import { PixelButton } from "@/components/ui/PixelButton";
import { timeAgo } from "@/lib/timeAgo";
import { triggerSyncAction } from "@/app/(app)/commish/actions";
import type { SyncStatusMap } from "@/lib/db/sync";
import type { SyncSource } from "@/lib/types";
import type { SyncSourceTrigger } from "@/app/(app)/commish/types";

interface SyncPanelProps {
  syncStatus: SyncStatusMap;
}

const SOURCE_LABEL: Record<SyncSource, string> = {
  players: "Players",
  schedule: "Schedule",
  scores: "Scores",
  locks: "Locks",
};

const TRIGGERABLE: SyncSourceTrigger[] = ["players", "scores"];

/**
 * Advanced: manual ESPN sync triggers + last-run status per source. Best
 * effort — if the Edge Functions aren't deployed yet, the trigger fails
 * gracefully with a clear message rather than throwing.
 */
export function SyncPanel({ syncStatus }: SyncPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingSource, setPendingSource] = useState<SyncSourceTrigger | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function handleTrigger(source: SyncSourceTrigger) {
    setMessage(null);
    setPendingSource(source);
    startTransition(async () => {
      const result = await triggerSyncAction(source);
      setMessage({ text: result.message, ok: result.success });
      setPendingSource(null);
      if (result.success) router.refresh();
    });
  }

  const sources: SyncSource[] = ["players", "schedule", "scores", "locks"];

  return (
    <PixelPanel raised className="flex flex-col gap-4">
      <h2 className="font-pixel text-sm text-retro-yellow">Advanced: ESPN Sync</h2>
      <p className="font-mono text-sm text-retro-offwhite/70">
        Manual re-triggers for the ESPN sync jobs. These normally run on a schedule
        (see supabase/functions/README.md) — use this only to force a refresh.
      </p>

      <div className="flex flex-col gap-1 font-mono text-sm text-retro-offwhite/80">
        {sources.map((source) => {
          const log = syncStatus[source];
          return (
            <div key={source} className="flex items-center gap-2">
              <span className="w-20">{SOURCE_LABEL[source]}:</span>
              {log ? (
                <span className={log.status === "error" ? "text-retro-red" : "text-retro-offwhite/80"}>
                  {log.status === "error" ? "FAILED" : "OK"} — {timeAgo(log.ran_at)}
                  {log.player_count != null ? ` (${log.player_count} players)` : ""}
                  {log.message ? ` — ${log.message}` : ""}
                </span>
              ) : (
                <span className="text-retro-offwhite/50">never run</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {TRIGGERABLE.map((source) => (
          <PixelButton
            key={source}
            variant="secondary"
            onClick={() => handleTrigger(source)}
            disabled={isPending}
          >
            {isPending && pendingSource === source ? "Syncing..." : `Sync ${SOURCE_LABEL[source]}`}
          </PixelButton>
        ))}
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
