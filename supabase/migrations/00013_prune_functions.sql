-- ============================================================
-- Lucky Seven — Migration 13: Prune Functions
-- ============================================================
-- Batch-delete old chat messages and game history rows.
-- Always archive before deleting (INSERT → DELETE pattern).
--
-- BATCH SIZE: 5000 rows per loop iteration.
-- To increase: change v_batch_size. Safe up to ~50k for small
-- rows. Monitor pg_stat_activity lock wait time if increasing.
-- ============================================================


-- ─── prune_old_chat_messages ──────────────────────────────────
-- Archives and deletes chat messages older than p_days.
-- Uses epoch-ms timestamps (ts column) for comparison.
CREATE OR REPLACE FUNCTION public.prune_old_chat_messages(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size  INT := 5000;
  v_cutoff_ms   BIGINT;
  v_total       INT := 0;
  v_batch_count INT;
  v_batch_ids   TEXT[];
BEGIN
  -- Convert days to epoch milliseconds
  v_cutoff_ms := (extract(epoch FROM (now() - (p_days || ' days')::INTERVAL)) * 1000)::BIGINT;

  LOOP
    -- Grab a batch of IDs to process
    SELECT array_agg(id)
    INTO   v_batch_ids
    FROM (
      SELECT id FROM public.game_chat_messages
      WHERE ts < v_cutoff_ms
      LIMIT v_batch_size
    ) sub;

    -- Exit if nothing left
    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
      EXIT;
    END IF;

    v_batch_count := array_length(v_batch_ids, 1);

    -- Archive first
    INSERT INTO public.archive_game_chat_messages (id, game_id, user_id, display_name, seat_index, text, ts)
    SELECT id, game_id, user_id, display_name, seat_index, text, ts
    FROM   public.game_chat_messages
    WHERE  id = ANY(v_batch_ids)
    ON CONFLICT (id) DO NOTHING;

    -- Then delete
    DELETE FROM public.game_chat_messages
    WHERE  id = ANY(v_batch_ids);

    v_total := v_total + v_batch_count;

    -- Safety: if batch was smaller than limit, we're done
    IF v_batch_count < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task',    'prune_old_chat_messages',
    'cutoff_days', p_days,
    'rows_archived', v_total
  );
END;
$$;


-- ─── prune_old_game_history ───────────────────────────────────
-- Archives and deletes game_history rows older than p_days.
CREATE OR REPLACE FUNCTION public.prune_old_game_history(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size  INT := 5000;
  v_cutoff_ms   BIGINT;
  v_total       INT := 0;
  v_batch_count INT;
  v_batch_ids   UUID[];
BEGIN
  v_cutoff_ms := (extract(epoch FROM (now() - (p_days || ' days')::INTERVAL)) * 1000)::BIGINT;

  LOOP
    SELECT array_agg(id)
    INTO   v_batch_ids
    FROM (
      SELECT id FROM public.game_history
      WHERE ts < v_cutoff_ms
      LIMIT v_batch_size
    ) sub;

    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
      EXIT;
    END IF;

    v_batch_count := array_length(v_batch_ids, 1);

    -- Archive
    INSERT INTO public.archive_game_history (id, game_id, ts, msg)
    SELECT id, game_id, ts, msg
    FROM   public.game_history
    WHERE  id = ANY(v_batch_ids)
    ON CONFLICT (id) DO NOTHING;

    -- Delete
    DELETE FROM public.game_history
    WHERE  id = ANY(v_batch_ids);

    v_total := v_total + v_batch_count;

    IF v_batch_count < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task',    'prune_old_game_history',
    'cutoff_days', p_days,
    'rows_archived', v_total
  );
END;
$$;
