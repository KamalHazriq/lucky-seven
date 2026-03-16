-- ============================================================
-- Lucky Seven — Supabase Schema Migration 1: Tables
-- ============================================================
-- Maps the existing Firestore collections/subcollections to
-- a relational Postgres schema. Each table corresponds to a
-- Firestore document type from the original structure.
-- ============================================================

-- ─── games ──────────────────────────────────────────────────
-- Maps: Firestore games/{gameId}
-- Core game document — all public game state visible to players.
CREATE TABLE public.games (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status                      TEXT NOT NULL DEFAULT 'lobby'
                              CHECK (status IN ('lobby', 'active', 'ending', 'finished')),
  host_id                     UUID NOT NULL,
  created_at                  BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
  max_players                 INT NOT NULL DEFAULT 4,
  current_turn_player_id      UUID,
  draw_pile_count             INT NOT NULL DEFAULT 0,
  discard_top                 JSONB,                -- Card | null
  seed                        TEXT NOT NULL,
  end_called_by               UUID,
  end_round_start_seat_index  INT,
  log                         JSONB NOT NULL DEFAULT '[]'::JSONB,   -- LogEntry[]
  turn_phase                  TEXT CHECK (turn_phase IN ('draw', 'action')),
  player_order                UUID[] NOT NULL DEFAULT '{}',
  join_code                   TEXT NOT NULL,
  action_version              INT NOT NULL DEFAULT 0,
  last_action_at              BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
  settings                    JSONB NOT NULL,       -- GameSettings
  spent_power_card_ids        TEXT[] NOT NULL DEFAULT '{}',
  turn_start_at               BIGINT NOT NULL DEFAULT 0,
  vote_kick                   JSONB,                -- VoteKick | null
  rematch_lobby_id            UUID
);

-- Unique join code for lobby lookup
CREATE UNIQUE INDEX idx_games_join_code ON public.games (join_code)
  WHERE status = 'lobby';
-- Status filter for active game queries
CREATE INDEX idx_games_status ON public.games (status);

-- ─── game_players ───────────────────────────────────────────
-- Maps: Firestore games/{gameId}/players/{playerId}
-- Public player state visible to all players in the game.
CREATE TABLE public.game_players (
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL,
  display_name  TEXT NOT NULL,
  seat_index    INT NOT NULL,
  connected     BOOLEAN NOT NULL DEFAULT TRUE,
  locks         BOOLEAN[] NOT NULL DEFAULT '{false,false,false}',
  locked_by     JSONB NOT NULL DEFAULT '[null,null,null]'::JSONB,  -- [LockInfo, LockInfo, LockInfo]
  color_key     INT,
  afk_strikes   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX idx_game_players_game ON public.game_players (game_id);

-- ─── game_private_state ─────────────────────────────────────
-- Maps: Firestore games/{gameId}/private/{playerId}
-- SECURITY-CRITICAL: each player's hidden hand.
-- RLS ensures only the owning player can read their own row.
CREATE TABLE public.game_private_state (
  game_id            UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id          UUID NOT NULL,
  hand               JSONB NOT NULL DEFAULT '[]'::JSONB,   -- Card[]
  drawn_card         JSONB,                                 -- Card | null
  drawn_card_source  TEXT CHECK (drawn_card_source IN ('pile', 'discard')),
  known              JSONB NOT NULL DEFAULT '{}'::JSONB,    -- Record<string, Card>
  PRIMARY KEY (game_id, player_id)
);

-- ─── game_internal ──────────────────────────────────────────
-- Maps: Firestore games/{gameId}/internal/drawPile
-- The draw pile — NEVER readable by any client directly.
-- Only accessible via SECURITY DEFINER RPCs.
CREATE TABLE public.game_internal (
  game_id    UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  draw_pile  JSONB NOT NULL DEFAULT '[]'::JSONB  -- Card[]
);

-- ─── game_reveals ───────────────────────────────────────────
-- Maps: Firestore games/{gameId}/reveals/{playerId}
-- End-of-game hand reveals with scores.
CREATE TABLE public.game_reveals (
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL,
  display_name  TEXT NOT NULL,
  hand          JSONB NOT NULL DEFAULT '[]'::JSONB,  -- Card[]
  total         INT NOT NULL DEFAULT 0,
  sevens        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX idx_game_reveals_game ON public.game_reveals (game_id);

-- ─── game_history ───────────────────────────────────────────
-- Maps: Firestore games/{gameId}/history/{docId}
-- Persistent game event log (paginated reads).
CREATE TABLE public.game_history (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id   UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  ts        BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT,
  msg       TEXT NOT NULL
);

CREATE INDEX idx_game_history_game_ts ON public.game_history (game_id, ts DESC);

-- ─── game_chat_messages ─────────────────────────────────────
-- Maps: Firestore games/{gameId}/chat/{messageId}
-- In-game chat. Delivered via Broadcast for speed,
-- persisted here for history/reconnection.
CREATE TABLE public.game_chat_messages (
  id            TEXT PRIMARY KEY,       -- nanoid from client
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  display_name  TEXT NOT NULL,
  seat_index    INT NOT NULL,
  text          TEXT NOT NULL,
  ts            BIGINT NOT NULL
);

CREATE INDEX idx_chat_game_ts ON public.game_chat_messages (game_id, ts DESC);

-- ─── game_summaries ─────────────────────────────────────────
-- Maps: Firestore games/{gameId}/summary/result
-- One row per finished game — analytics/stats.
CREATE TABLE public.game_summaries (
  game_id       UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  finished_at   BIGINT NOT NULL,
  player_count  INT NOT NULL,
  winners       JSONB NOT NULL DEFAULT '[]'::JSONB,
  turns         INT NOT NULL DEFAULT 0,
  deck_size     INT NOT NULL DEFAULT 0,
  settings      JSONB NOT NULL
);

-- ─── game_dev_access ────────────────────────────────────────
-- Maps: Firestore games/{gameId}/devAccess/{uid}
-- Dev mode privileges per user per game.
CREATE TABLE public.game_dev_access (
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  uid           UUID NOT NULL,
  activated_at  BIGINT NOT NULL,
  privileges    JSONB NOT NULL,
  PRIMARY KEY (game_id, uid)
);

-- ─── feedback ───────────────────────────────────────────────
-- Maps: Firestore feedback/{docId}
-- User-submitted feedback. Not readable from client.
CREATE TABLE public.feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  name         TEXT NOT NULL DEFAULT '',
  message      TEXT NOT NULL,
  app_version  TEXT NOT NULL,
  theme        TEXT NOT NULL,
  user_id      UUID,
  created_at   BIGINT NOT NULL DEFAULT (extract(epoch FROM now()) * 1000)::BIGINT
);

-- ─── global_stats ───────────────────────────────────────────
-- Maps: Firestore stats/global
-- Singleton row — global counters.
CREATE TABLE public.global_stats (
  id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  games_played  INT NOT NULL DEFAULT 0,
  total_visits  INT NOT NULL DEFAULT 0,
  last_game_at  BIGINT
);

-- Seed the singleton row
INSERT INTO public.global_stats (id, games_played, total_visits) VALUES (1, 0, 0);
