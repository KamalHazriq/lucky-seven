-- ============================================================
-- Lucky Seven — Migration 15: run_maintenance() Orchestrator
-- ============================================================
-- Single entry point that:
--   1. Acquires advisory lock (prevents concurrent runs)
--   2. Logs start to maintenance_runs
--   3. Calls each prune/archive function
--   4. Logs completion with JSON summary
--   5. Releases lock
--
-- Call via: SELECT run_maintenance();
-- Or with custom retention: SELECT run_maintenance(7, 7, 30);
-- ============================================================


CREATE OR REPLACE FUNCTION public.run_maintenance(
  p_chat_days    INT DEFAULT 30,
  p_history_days INT DEFAULT 30,
  p_games_days   INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id   UUID;
  v_started  TIMESTAMPTZ := now();
  v_result   JSONB;
  v_chat     JSONB;
  v_history  JSONB;
  v_games    JSONB;
  v_locked   BOOLEAN;
BEGIN
  -- ① Acquire advisory lock
  v_locked := public._acquire_maintenance_lock();
  IF NOT v_locked THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'Another maintenance run is already in progress (advisory lock 777 held)'
    );
  END IF;

  -- ② Log start
  INSERT INTO public.maintenance_runs (started_at, status)
  VALUES (v_started, 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- ③ Run each task
    v_chat    := public.prune_old_chat_messages(p_chat_days);
    v_history := public.prune_old_game_history(p_history_days);
    v_games   := public.archive_and_prune_finished_games(p_games_days);

    -- ④ Build summary
    v_result := jsonb_build_object(
      'status',       'completed',
      'run_id',       v_run_id,
      'started_at',   v_started,
      'finished_at',  now(),
      'duration_ms',  (extract(epoch FROM (now() - v_started)) * 1000)::INT,
      'chat',         v_chat,
      'history',      v_history,
      'games',        v_games
    );

    -- ⑤ Log success
    UPDATE public.maintenance_runs
    SET    finished_at = now(),
           status      = 'completed',
           summary     = v_result
    WHERE  id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    -- Log failure
    UPDATE public.maintenance_runs
    SET    finished_at   = now(),
           status        = 'failed',
           error_detail  = SQLERRM
    WHERE  id = v_run_id;

    v_result := jsonb_build_object(
      'status', 'failed',
      'run_id', v_run_id,
      'error',  SQLERRM
    );
  END;

  -- ⑥ Always release lock
  PERFORM public._release_maintenance_lock();

  RETURN v_result;
END;
$$;


-- ─── Convenience: prune_analytics_events ──────────────────────
-- Analytics events accumulate fast. Prune old ones separately.
CREATE OR REPLACE FUNCTION public.prune_analytics_events(
  p_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size INT := 10000;
  v_cutoff     TIMESTAMPTZ;
  v_total      INT := 0;
  v_deleted    INT;
BEGIN
  v_cutoff := now() - (p_days || ' days')::INTERVAL;

  LOOP
    DELETE FROM public.analytics_events
    WHERE  id IN (
      SELECT id FROM public.analytics_events
      WHERE  created_at < v_cutoff
      LIMIT  v_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    IF v_deleted < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task', 'prune_analytics_events',
    'cutoff_days', p_days,
    'rows_deleted', v_total
  );
END;
$$;
