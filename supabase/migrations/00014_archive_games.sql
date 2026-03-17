-- ============================================================
-- Lucky Seven — Migration 14: Archive Finished Games
-- ============================================================
-- Snapshots and removes finished games older than p_days.
-- The CASCADE on games(id) automatically cleans up:
--   game_players, game_private_state, game_internal,
--   game_reveals, game_history, game_chat_messages,
--   game_summaries, game_dev_access
--
-- IMPORTANT: We snapshot the game + summary into a JSONB blob
-- before deleting. This preserves all data for future analysis.
-- ============================================================


CREATE OR REPLACE FUNCTION public.archive_and_prune_finished_games(
  p_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size  INT := 500;   -- games have many child rows, keep batch small
  v_cutoff_ms   BIGINT;
  v_total       INT := 0;
  v_batch_count INT;
  v_batch_ids   UUID[];
  v_game        RECORD;
BEGIN
  v_cutoff_ms := (extract(epoch FROM (now() - (p_days || ' days')::INTERVAL)) * 1000)::BIGINT;

  LOOP
    -- Find finished games older than cutoff
    SELECT array_agg(id)
    INTO   v_batch_ids
    FROM (
      SELECT id FROM public.games
      WHERE  status = 'finished'
        AND  created_at < v_cutoff_ms
      LIMIT  v_batch_size
    ) sub;

    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
      EXIT;
    END IF;

    v_batch_count := array_length(v_batch_ids, 1);

    -- Snapshot each game into the archive
    INSERT INTO public.archive_games_snapshot (
      game_id, status, created_at, finished_at, player_count, snapshot
    )
    SELECT
      g.id,
      g.status,
      g.created_at,
      gs.finished_at,
      coalesce(array_length(g.player_order, 1), 0),
      jsonb_build_object(
        'game',      row_to_json(g),
        'summary',   (SELECT row_to_json(s) FROM public.game_summaries s WHERE s.game_id = g.id),
        'players',   (SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::JSONB)
                      FROM public.game_players p WHERE p.game_id = g.id),
        'reveals',   (SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::JSONB)
                      FROM public.game_reveals r WHERE r.game_id = g.id)
      )
    FROM   public.games g
    LEFT JOIN public.game_summaries gs ON gs.game_id = g.id
    WHERE  g.id = ANY(v_batch_ids)
    ON CONFLICT (game_id) DO NOTHING;

    -- Delete games — CASCADE removes all child table rows
    DELETE FROM public.games
    WHERE  id = ANY(v_batch_ids);

    v_total := v_total + v_batch_count;

    IF v_batch_count < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task',    'archive_and_prune_finished_games',
    'cutoff_days', p_days,
    'games_archived', v_total
  );
END;
$$;
