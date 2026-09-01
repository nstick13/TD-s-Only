// apply-locks
//
// Automates "rosters lock at first kickoff" server-side, independent of
// anyone having the app open. Finds every stage with status='draft_open'
// whose first_kickoff_at is set and has passed, and flips it to 'locked'.
// Idempotent: running it repeatedly with nothing newly due is a no-op
// (still logs a success row with locked=0).
//
// Invoke: POST (no body needed).
import { getServiceClient, writeSyncLog } from "../_shared/db.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const supabase = getServiceClient();

  try {
    const nowIso = new Date().toISOString();

    const { data: due, error: selErr } = await supabase
      .from("stages")
      .select("id, name, first_kickoff_at")
      .eq("status", "draft_open")
      .not("first_kickoff_at", "is", null)
      .lte("first_kickoff_at", nowIso);

    if (selErr) {
      throw new Error(`stages select failed: ${selErr.message}`);
    }

    if (!due || due.length === 0) {
      await writeSyncLog(
        supabase,
        "locks",
        "success",
        "No draft_open stages past their first_kickoff_at — nothing to lock.",
        null,
      );
      return jsonResponse({ ok: true, lockedCount: 0, lockedStages: [] });
    }

    const ids = due.map((s: { id: number }) => s.id);
    const { error: updErr } = await supabase
      .from("stages")
      .update({ status: "locked" })
      .in("id", ids)
      .eq("status", "draft_open"); // belt-and-suspenders re-check for idempotency under races

    if (updErr) {
      throw new Error(`stages lock update failed: ${updErr.message}`);
    }

    const names = due.map((s: { name: string }) => s.name).join(", ");
    const msg = `Locked ${due.length} stage(s): ${names}`;
    await writeSyncLog(supabase, "locks", "success", msg, null);

    return jsonResponse({
      ok: true,
      lockedCount: due.length,
      lockedStages: due.map((s: { id: number; name: string }) => ({
        id: s.id,
        name: s.name,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeSyncLog(supabase, "locks", "error", msg, null);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
