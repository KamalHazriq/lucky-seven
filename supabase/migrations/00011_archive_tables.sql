-- ============================================================
-- Lucky Seven — Migration 11: Archive Tables
-- ============================================================
-- Archive tables for data retention. Rows are moved here before
-- deletion from hot tables. Safe rollback = just INSERT back.
--
-- Also: maintenance_runs log table for observability.
-- ============================================================


-- ─── archive_game_chat_messages ───────────────────────────────
-- Mirrors game_chat_messages but with archived_at timestamp.
CREATE TABLE IF NOT EXISTS public.archive_game_chat_messages (
  id            TEXT NOT NULL,
  game_id       UUID NOT NULL,
  user_id       UUID NOT NULL,
  display_name  TEXT NOT NULL,
  seat_index    INT NOT NULL,
  text          TEXT NOT NULL,
  ts            BIGINT NOT NULL,
  archived_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_archive_chat_game
  ON public.archive_game_chat_messages (game_id);
CREATE INDEX IF NOT EXISTS idx_archive_chat_archived_at
  ON public.archive_game_chat_messages (archived_at);


-- ─── archive_game_history ─────────────────────────────────────
-- Mirrors game_history but with archived_at timestamp.
CREATE TABLE IF NOT EXISTS public.archive_game_history (
  id          UUID NOT NULL,
  game_id     UUID NOT NULL,
  ts          BIGINT NOT NULL,
  msg         TEXT NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_archive_history_game
  ON public.archive_game_history (game_id);
CREATE INDEX IF NOT EXISTS idx_archive_history_archived_at
  ON public.archive_game_history (archived_at);


-- ─── archive_games_snapshot ───────────────────────────────────
-- Stores a JSON snapshot of the full game + child rows before
-- the game and all its ON DELETE CASCADE children are removed.
CREATE TABLE IF NOT EXISTS public.archive_games_snapshot (
  game_id      UUID PRIMARY KEY,
  status       TEXT NOT NULL,
  created_at   BIGINT NOT NULL,
  finished_at  BIGINT,
  player_count INT NOT NULL DEFAULT 0,
  snapshot     JSONB NOT NULL,          -- full game data blob
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_games_archived_at
  ON public.archive_games_snapshot (archived_at);
CREATE INDEX IF NOT EXISTS idx_archive_games_status
  ON public.archive_games_snapshot (status);


-- ─── maintenance_runs ─────────────────────────────────────────
-- Audit log for every maintenance execution.
CREATE TABLE IF NOT EXISTS public.maintenance_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'failed')),
  summary      JSONB,
  error_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_started
  ON public.maintenance_runs (started_at DESC);


-- ─── RLS: all archive/log tables are admin-only ───────────────
-- No client access. Only SECURITY DEFINER functions touch these.
ALTER TABLE public.archive_game_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_game_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_games_snapshot     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_runs           ENABLE ROW LEVEL SECURITY;
