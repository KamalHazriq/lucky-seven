-- ============================================================
-- Lucky Seven — Supabase Schema Migration 2: Row Level Security
-- ============================================================
-- Every table has RLS enabled with explicit policies.
-- Principle: clients can SELECT where appropriate, but ALL
-- writes go through SECURITY DEFINER RPCs (migration 3).
-- ============================================================

-- ─── Enable RLS on all tables ───────────────────────────────
ALTER TABLE public.games              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_private_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_internal      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_reveals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_summaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_dev_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_stats       ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SELECT policies (who can read what)
-- ============================================================

-- ─── games: players in the game can read it ─────────────────
-- Also allow lobby lookup by join_code (needed before joining).
CREATE POLICY "games_select_by_member" ON public.games
  FOR SELECT TO authenticated
  USING (
    -- Player is a member of this game
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = id AND gp.player_id = auth.uid()
    )
    -- OR game is in lobby (needed for join-by-code lookup)
    OR status = 'lobby'
  );

-- ─── game_players: same-game members can read all players ───
CREATE POLICY "game_players_select_by_member" ON public.game_players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = game_id AND gp.player_id = auth.uid()
    )
    -- OR the game is in lobby (joining players need to see existing players)
    OR EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id AND g.status = 'lobby'
    )
  );

-- ─── game_private_state: ONLY own row ──────────────────────
-- This is the core security boundary for hidden cards.
CREATE POLICY "private_state_select_own" ON public.game_private_state
  FOR SELECT TO authenticated
  USING (player_id = auth.uid());

-- ─── game_internal: NO client reads ────────────────────────
-- Draw pile is never readable from the client.
-- (No SELECT policy = all reads denied.)
-- RPCs access it via SECURITY DEFINER which bypasses RLS.

-- ─── game_reveals: same-game members can read ──────────────
CREATE POLICY "reveals_select_by_member" ON public.game_reveals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = game_id AND gp.player_id = auth.uid()
    )
  );

-- ─── game_history: same-game members can read ──────────────
CREATE POLICY "history_select_by_member" ON public.game_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = game_id AND gp.player_id = auth.uid()
    )
  );

-- ─── game_chat_messages: same-game members can read ────────
CREATE POLICY "chat_select_by_member" ON public.game_chat_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = game_id AND gp.player_id = auth.uid()
    )
  );

-- ─── game_summaries: same-game members can read ────────────
CREATE POLICY "summaries_select_by_member" ON public.game_summaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.game_id = game_id AND gp.player_id = auth.uid()
    )
  );

-- ─── game_dev_access: only own row ─────────────────────────
CREATE POLICY "dev_access_select_own" ON public.game_dev_access
  FOR SELECT TO authenticated
  USING (uid = auth.uid());

-- ─── feedback: no client reads ─────────────────────────────
-- (No SELECT policy = all reads denied.)
-- Feedback is write-only from the client perspective.

-- ─── global_stats: anyone authenticated can read ────────────
CREATE POLICY "global_stats_select_public" ON public.global_stats
  FOR SELECT TO authenticated
  USING (TRUE);


-- ============================================================
-- WRITE policies: DENY all direct client writes
-- ============================================================
-- By enabling RLS and only creating SELECT policies above,
-- INSERT/UPDATE/DELETE are implicitly denied for the
-- authenticated role on all tables.
--
-- All mutations go through SECURITY DEFINER functions (RPCs)
-- which bypass RLS. Those functions validate the caller
-- internally using auth.uid().
--
-- This is intentional and more secure than Firestore rules:
-- - No client can directly INSERT/UPDATE/DELETE any row
-- - Every write is validated by server-side PL/pgSQL logic
-- - The attack surface is limited to the RPC function signatures
-- ============================================================
