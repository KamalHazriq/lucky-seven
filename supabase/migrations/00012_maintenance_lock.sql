-- ============================================================
-- Lucky Seven — Migration 12: Advisory Lock Helpers
-- ============================================================
-- Prevents concurrent maintenance runs via Postgres advisory
-- locks. Lock key 777 (lucky seven!).
-- ============================================================

-- Fixed advisory lock key for maintenance
-- pg_try_advisory_lock returns TRUE if acquired, FALSE if already held.


-- ─── _acquire_maintenance_lock ────────────────────────────────
CREATE OR REPLACE FUNCTION public._acquire_maintenance_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 777 = lucky seven maintenance lock
  RETURN pg_try_advisory_lock(777);
END;
$$;


-- ─── _release_maintenance_lock ────────────────────────────────
CREATE OR REPLACE FUNCTION public._release_maintenance_lock()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_unlock(777);
END;
$$;
