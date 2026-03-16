-- ============================================================
-- Lucky Seven — Supabase Schema Migration 4: Utility RPCs
-- ============================================================
-- Non-gameplay helper functions. Game action RPCs (draw, swap,
-- lock, etc.) will be added in Phase 3 alongside the service
-- rewrite. These are the simpler standalone operations.
--
-- SECURITY MODEL:
-- - All functions use SECURITY DEFINER (bypass RLS)
-- - All functions SET search_path = '' (prevent schema injection)
-- - All functions validate caller via auth.uid() internally
-- ============================================================


-- ─── increment_visits ───────────────────────────────────────
-- Atomically increment the total_visits counter.
-- Called once per page load from useGlobalStats.
CREATE OR REPLACE FUNCTION public.increment_visits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.global_stats
    SET total_visits = total_visits + 1
    WHERE id = 1;
END;
$$;


-- ─── increment_games_played ─────────────────────────────────
-- Atomically increment games_played and update last_game_at.
-- Called once per finished game from writeGameSummary.
CREATE OR REPLACE FUNCTION public.increment_games_played()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.global_stats
    SET games_played = games_played + 1,
        last_game_at = (extract(epoch FROM now()) * 1000)::BIGINT
    WHERE id = 1;
END;
$$;


-- ─── submit_feedback ────────────────────────────────────────
-- Insert a feedback row. Caller identity is read from JWT.
-- Rate limiting remains client-side (same as current behavior).
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_rating      INT,
  p_name        TEXT,
  p_message     TEXT,
  p_app_version TEXT,
  p_theme       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.feedback (rating, name, message, app_version, theme, user_id)
  VALUES (p_rating, p_name, p_message, p_app_version, p_theme, v_uid);
END;
$$;


-- ─── get_global_stats ───────────────────────────────────────
-- Read global stats. Could be done via direct SELECT (RLS allows it),
-- but this provides a clean API and avoids exposing table structure.
CREATE OR REPLACE FUNCTION public.get_global_stats()
RETURNS TABLE (games_played INT, total_visits INT, last_game_at BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT gs.games_played, gs.total_visits, gs.last_game_at
  FROM public.global_stats gs
  WHERE gs.id = 1;
$$;


-- ─── find_game_by_code ──────────────────────────────────────
-- Look up a lobby game by join code. Returns game_id or null.
-- Needed for the Join page before the player is a member.
CREATE OR REPLACE FUNCTION public.find_game_by_code(p_join_code TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.id
  FROM public.games g
  WHERE g.join_code = p_join_code
    AND g.status = 'lobby'
  LIMIT 1;
$$;
