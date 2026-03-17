-- ============================================================
-- Lucky Seven — Migration 16: Player Stats
-- ============================================================
-- Adds total_players and unique_players to global_stats.
-- Updates get_global_stats to compute unique players from
-- game_players table (distinct auth UIDs).
-- ============================================================


-- ─── Add columns to global_stats ──────────────────────────────
ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS total_players INT NOT NULL DEFAULT 0;


-- ─── Drop + recreate get_global_stats with player counts ──────
DROP FUNCTION IF EXISTS public.get_global_stats();

CREATE OR REPLACE FUNCTION public.get_global_stats()
RETURNS TABLE (
  games_played    INT,
  total_visits    INT,
  last_game_at    BIGINT,
  games_finished  INT,
  total_players   INT,
  unique_players  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    gs.games_played,
    gs.total_visits,
    gs.last_game_at,
    gs.games_finished,
    gs.total_players,
    (SELECT count(DISTINCT player_id) FROM public.game_players) AS unique_players
  FROM public.global_stats gs
  WHERE gs.id = 1;
$$;


-- ─── Increment total_players in join_game RPC ─────────────────
-- We need to bump total_players every time someone joins.
-- Rather than modifying join_game directly, create a trigger
-- on game_players INSERT that increments the counter.
CREATE OR REPLACE FUNCTION public._increment_total_players()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.global_stats
    SET total_players = total_players + 1
    WHERE id = 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_total_players ON public.game_players;
CREATE TRIGGER trg_increment_total_players
  AFTER INSERT ON public.game_players
  FOR EACH ROW
  EXECUTE FUNCTION public._increment_total_players();
