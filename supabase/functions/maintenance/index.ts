/**
 * Lucky Seven — Maintenance Edge Function
 *
 * Triggers run_maintenance() RPC via Supabase service_role key.
 * Designed to be called by GitHub Actions cron or manually via curl.
 *
 * Auth: Requires MAINTENANCE_SECRET header to prevent unauthorized calls.
 *
 * Usage:
 *   curl -X POST https://<project>.supabase.co/functions/v1/maintenance \
 *     -H "Authorization: Bearer <ANON_KEY>" \
 *     -H "x-maintenance-secret: <MAINTENANCE_SECRET>"
 *
 * Query params (optional):
 *   ?chat_days=30&history_days=30&games_days=90
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAINTENANCE_SECRET = Deno.env.get("MAINTENANCE_SECRET") ?? "";

Deno.serve(async (req: Request) => {
  // ── Auth check ──────────────────────────────────────────────
  if (MAINTENANCE_SECRET) {
    const provided = req.headers.get("x-maintenance-secret") ?? "";
    if (provided !== MAINTENANCE_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // ── Parse optional params ───────────────────────────────────
  const url = new URL(req.url);
  const chatDays = parseInt(url.searchParams.get("chat_days") ?? "30", 10);
  const historyDays = parseInt(url.searchParams.get("history_days") ?? "30", 10);
  const gamesDays = parseInt(url.searchParams.get("games_days") ?? "90", 10);

  // ── Call RPC with service_role (bypasses RLS) ───────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc("run_maintenance", {
    p_chat_days: chatDays,
    p_history_days: historyDays,
    p_games_days: gamesDays,
  });

  if (error) {
    console.error("Maintenance RPC failed:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log("Maintenance completed:", JSON.stringify(data));
  return new Response(
    JSON.stringify(data),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
