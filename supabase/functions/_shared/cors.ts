// Shared CORS headers for Edge Functions.
//
// These sync jobs are invoked server-side (pg_cron / pg_net, or a manual
// curl from Ben) rather than from the browser, so CORS is mostly a no-op —
// but we still answer OPTIONS cleanly and tag every response so a future
// admin-UI "run sync now" button can call these directly without hitting a
// CORS wall.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
