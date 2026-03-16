-- ============================================================
-- Lucky Seven — Supabase Schema Migration 9: Remaining RPCs
-- ============================================================
-- Completes the Firebase → Supabase migration for:
--   - write_game_summary (Results analytics)
--   - play_again (shared rematch lobby)
--   - initiate_vote_kick / cast_vote_kick / cancel_vote_kick
--   - activate_dev_mode / deactivate_dev_mode
--   - dev_reorder_draw_pile
--
-- Also cleans up dead p_game_id parameter from create_game.
-- ============================================================


-- ─── Clean up create_game: remove unused p_game_id param ──────
-- The RPC already generates v_id := gen_random_uuid() and ignores
-- p_game_id. Removing the dead parameter keeps the API honest.
-- This is a DROP+RECREATE because Postgres doesn't support
-- removing a parameter via ALTER FUNCTION.
DROP FUNCTION IF EXISTS public.create_game(TEXT, INT, JSONB, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.create_game(
  p_display_name  TEXT,
  p_max_players   INT,
  p_settings      JSONB,
  p_join_code     TEXT,
  p_seed          TEXT,
  p_color_key     INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_now  BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_id   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE join_code = p_join_code AND status = 'lobby'
  ) THEN
    RAISE EXCEPTION 'Join code conflict, please retry';
  END IF;

  v_id := gen_random_uuid();

  INSERT INTO public.games (
    id, status, host_id, created_at, max_players,
    current_turn_player_id, draw_pile_count, discard_top,
    seed, end_called_by, end_round_start_seat_index,
    log, turn_phase, player_order, join_code,
    action_version, last_action_at, settings,
    spent_power_card_ids, turn_start_at, vote_kick, rematch_lobby_id
  ) VALUES (
    v_id, 'lobby', v_uid, v_now, p_max_players,
    NULL, 0, NULL,
    p_seed, NULL, NULL,
    jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', 'Game created by ' || p_display_name)),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, p_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_id, v_uid, p_display_name, 0,
    TRUE, '{false,false,false}', '[null,null,null]'::JSONB,
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    v_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  RETURN v_id::TEXT;
END;
$$;


-- ─── write_game_summary ───────────────────────────────────────
-- Called once by the host when all reveals are in.
-- Inserts into game_summaries + increments global games_played.
CREATE OR REPLACE FUNCTION public.write_game_summary(
  p_game_id      UUID,
  p_winners      JSONB,
  p_player_count INT,
  p_turns        INT,
  p_deck_size    INT,
  p_settings     JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only game members can write summary
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_id = p_game_id AND player_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  -- Idempotent: ON CONFLICT DO NOTHING (host may retry)
  INSERT INTO public.game_summaries (
    game_id, finished_at, player_count, winners, turns, deck_size, settings
  ) VALUES (
    p_game_id, v_now, p_player_count, p_winners, p_turns, p_deck_size, p_settings
  ) ON CONFLICT (game_id) DO NOTHING;

  -- Increment global stats
  UPDATE public.global_stats
    SET games_played = games_played + 1,
        last_game_at = v_now
    WHERE id = 1;
END;
$$;


-- ─── play_again (shared rematch lobby) ────────────────────────
-- Atomically check/create a rematch lobby from a finished game.
-- If a rematch already exists and is joinable → join it.
-- Otherwise → create a new lobby and link it.
CREATE OR REPLACE FUNCTION public.play_again(
  p_finished_game_id UUID,
  p_display_name     TEXT,
  p_max_players      INT,
  p_settings         JSONB,
  p_join_code        TEXT,
  p_seed             TEXT,
  p_color_key        INT DEFAULT NULL
)
RETURNS TEXT  -- returns the game ID to navigate to
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_finished     RECORD;
  v_rematch      RECORD;
  v_new_id       UUID;
  v_seat_index   INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the finished game row
  SELECT id, rematch_lobby_id, status
    INTO v_finished
    FROM public.games
    WHERE id = p_finished_game_id
    FOR UPDATE;

  IF v_finished IS NULL THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- If there's an existing rematch, try to join it
  IF v_finished.rematch_lobby_id IS NOT NULL THEN
    SELECT id, status, player_order, max_players
      INTO v_rematch
      FROM public.games
      WHERE id = v_finished.rematch_lobby_id
      FOR UPDATE;

    IF v_rematch IS NOT NULL THEN
      -- Already in this lobby?
      IF v_uid = ANY(v_rematch.player_order) THEN
        RETURN v_rematch.id::TEXT;
      END IF;

      -- Can join?
      IF v_rematch.status = 'lobby'
         AND array_length(v_rematch.player_order, 1) < v_rematch.max_players
      THEN
        v_seat_index := array_length(v_rematch.player_order, 1);

        UPDATE public.games
          SET player_order = player_order || ARRAY[v_uid],
              log = public._bounded_log_append(
                log,
                jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined')
              )
          WHERE id = v_rematch.id;

        INSERT INTO public.game_players (
          game_id, player_id, display_name, seat_index,
          connected, locks, locked_by, color_key, afk_strikes
        ) VALUES (
          v_rematch.id, v_uid, p_display_name, v_seat_index,
          TRUE, '{false,false,false}', '[null,null,null]'::JSONB,
          p_color_key, 0
        );

        INSERT INTO public.game_private_state (
          game_id, player_id, hand, drawn_card, drawn_card_source, known
        ) VALUES (
          v_rematch.id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
        );

        RETURN v_rematch.id::TEXT;
      END IF;
      -- Rematch full/started — fall through to create new
    END IF;
  END IF;

  -- Create new rematch lobby
  v_new_id := gen_random_uuid();

  INSERT INTO public.games (
    id, status, host_id, created_at, max_players,
    current_turn_player_id, draw_pile_count, discard_top,
    seed, end_called_by, end_round_start_seat_index,
    log, turn_phase, player_order, join_code,
    action_version, last_action_at, settings,
    spent_power_card_ids, turn_start_at, vote_kick, rematch_lobby_id
  ) VALUES (
    v_new_id, 'lobby', v_uid, v_now, p_max_players,
    NULL, 0, NULL,
    p_seed, NULL, NULL,
    jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', 'Game created by ' || p_display_name)),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, p_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_new_id, v_uid, p_display_name, 0,
    TRUE, '{false,false,false}', '[null,null,null]'::JSONB,
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    v_new_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  -- Link finished game → new rematch
  UPDATE public.games
    SET rematch_lobby_id = v_new_id
    WHERE id = p_finished_game_id;

  RETURN v_new_id::TEXT;
END;
$$;


-- ─── initiate_vote_kick ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.initiate_vote_kick(
  p_game_id        UUID,
  p_target_player  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game         RECORD;
  v_target_name  TEXT;
  v_voter_count  INT;
  v_required     INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;
  IF array_length(v_game.player_order, 1) < 3 THEN
    RAISE EXCEPTION 'Vote kick requires at least 3 players';
  END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'You are not in this game';
  END IF;
  IF NOT (p_target_player = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'Target is not in this game';
  END IF;
  IF v_uid = p_target_player THEN
    RAISE EXCEPTION 'Cannot vote to kick yourself';
  END IF;
  IF (v_game.vote_kick->>'active')::BOOLEAN IS TRUE THEN
    RAISE EXCEPTION 'A vote is already in progress';
  END IF;

  SELECT display_name INTO v_target_name
    FROM public.game_players
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_voter_count := array_length(v_game.player_order, 1) - 1;
  v_required := ceil(v_voter_count::NUMERIC / 2);

  UPDATE public.games
    SET vote_kick = jsonb_build_object(
          'active', TRUE,
          'targetId', p_target_player,
          'targetName', v_target_name,
          'startedBy', v_uid,
          'createdAt', v_now,
          'votes', jsonb_build_array(v_uid),
          'requiredVotes', v_required
        ),
        action_version = v_game.action_version + 1,
        log = public._bounded_log_append(
          v_game.log,
          jsonb_build_object('ts', v_now, 'msg', 'Vote to kick ' || v_target_name || ' started.')
        )
    WHERE id = p_game_id;
END;
$$;


-- ─── cast_vote_kick ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cast_vote_kick(
  p_game_id  UUID,
  p_vote_yes BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_now        BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game       RECORD;
  v_vk         JSONB;
  v_target_pid UUID;
  v_target_name TEXT;
  v_votes      JSONB;
  v_vote_count INT;
  v_required   INT;
  v_new_order  UUID[];
  v_next_pid   UUID;
  v_idx        INT;
  v_vote_dur   BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;

  v_vk := v_game.vote_kick;
  IF v_vk IS NULL OR (v_vk->>'active')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'No active vote';
  END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'You are not in this game';
  END IF;

  v_target_pid := (v_vk->>'targetId')::UUID;
  v_target_name := v_vk->>'targetName';
  v_required := (v_vk->>'requiredVotes')::INT;
  v_votes := v_vk->'votes';

  IF v_uid = v_target_pid THEN
    RAISE EXCEPTION 'Target cannot vote';
  END IF;

  -- Check if already voted
  IF v_votes @> to_jsonb(v_uid) THEN
    RAISE EXCEPTION 'Already voted';
  END IF;

  IF NOT p_vote_yes THEN
    -- Vote no → cancel the entire vote, restore turn timer
    v_vote_dur := v_now - COALESCE((v_vk->>'createdAt')::BIGINT, v_now);
    UPDATE public.games
      SET vote_kick = NULL,
          action_version = v_game.action_version + 1,
          turn_start_at = v_game.turn_start_at + v_vote_dur,
          log = public._bounded_log_append(
            v_game.log,
            jsonb_build_object('ts', v_now, 'msg', 'Vote to kick ' || v_target_name || ' failed.')
          )
      WHERE id = p_game_id;
    RETURN;
  END IF;

  -- Vote yes
  v_votes := v_votes || to_jsonb(v_uid);
  v_vote_count := jsonb_array_length(v_votes);

  IF v_vote_count >= v_required THEN
    -- Threshold met → kick
    v_new_order := array_remove(v_game.player_order, v_target_pid);

    IF array_length(v_new_order, 1) < 2 THEN
      -- Not enough players → game over
      UPDATE public.games
        SET status = 'finished',
            current_turn_player_id = NULL,
            turn_phase = NULL,
            player_order = v_new_order,
            vote_kick = NULL,
            action_version = v_game.action_version + 1,
            last_action_at = v_now,
            turn_start_at = 0,
            log = public._bounded_log_append(
              v_game.log,
              jsonb_build_object('ts', v_now, 'msg', v_target_name || ' was kicked. Not enough players — game over.')
            )
        WHERE id = p_game_id;
    ELSE
      -- Kick and maybe advance turn
      v_idx := array_position(v_game.player_order, v_target_pid);

      UPDATE public.games
        SET player_order = v_new_order,
            vote_kick = NULL,
            action_version = v_game.action_version + 1,
            last_action_at = v_now,
            current_turn_player_id = CASE
              WHEN v_game.current_turn_player_id = v_target_pid
              THEN v_new_order[((v_idx - 1) % array_length(v_new_order, 1)) + 1]
              ELSE v_game.current_turn_player_id
            END,
            turn_phase = CASE
              WHEN v_game.current_turn_player_id = v_target_pid THEN 'draw'
              ELSE v_game.turn_phase
            END,
            turn_start_at = CASE
              WHEN v_game.current_turn_player_id = v_target_pid THEN v_now
              ELSE v_game.turn_start_at
            END,
            host_id = CASE
              WHEN v_game.host_id = v_target_pid THEN v_new_order[1]
              ELSE v_game.host_id
            END,
            log = public._bounded_log_append(
              v_game.log,
              jsonb_build_object('ts', v_now, 'msg', v_target_name || ' was kicked by vote.')
            )
        WHERE id = p_game_id;
    END IF;

    -- Mark kicked player
    UPDATE public.game_players
      SET connected = FALSE, afk_strikes = 0
      WHERE game_id = p_game_id AND player_id = v_target_pid;
    UPDATE public.game_private_state
      SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_target_pid;
  ELSE
    -- Not enough votes yet — just add vote
    UPDATE public.games
      SET vote_kick = jsonb_set(v_vk, '{votes}', v_votes)
      WHERE id = p_game_id;
  END IF;
END;
$$;


-- ─── cancel_vote_kick ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_vote_kick(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     RECORD;
  v_vote_dur BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RETURN; END IF;

  IF v_game.vote_kick IS NULL OR (v_game.vote_kick->>'active')::BOOLEAN IS NOT TRUE THEN
    RETURN;
  END IF;

  IF v_uid <> (v_game.vote_kick->>'startedBy')::UUID
     AND v_uid <> v_game.host_id
  THEN
    RAISE EXCEPTION 'Only the vote initiator or host can cancel';
  END IF;

  v_vote_dur := v_now - COALESCE((v_game.vote_kick->>'createdAt')::BIGINT, v_now);

  UPDATE public.games
    SET vote_kick = NULL,
        action_version = v_game.action_version + 1,
        turn_start_at = v_game.turn_start_at + v_vote_dur,
        log = public._bounded_log_append(
          v_game.log,
          jsonb_build_object('ts', v_now, 'msg',
            'Vote to kick ' || (v_game.vote_kick->>'targetName') || ' was cancelled.'
          )
        )
    WHERE id = p_game_id;
END;
$$;


-- ─── Dev mode config table ────────────────────────────────────
-- Stores the shared dev code and owner code.
-- In Firebase this was config/dev doc. Here it's a singleton row.
CREATE TABLE IF NOT EXISTS public.dev_config (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  code        TEXT NOT NULL,          -- shared dev access code
  owner_code  TEXT                     -- owner-only code (grants reorder privilege)
);

ALTER TABLE public.dev_config ENABLE ROW LEVEL SECURITY;
-- No SELECT policy = no client reads. RPCs bypass RLS.


-- ─── activate_dev_mode ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_dev_mode(
  p_game_id UUID,
  p_code    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_now        BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_config     RECORD;
  v_is_owner   BOOLEAN;
  v_privileges JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Verify caller is in the game
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_id = p_game_id AND player_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  -- Read dev config (bypasses RLS via SECURITY DEFINER)
  SELECT * INTO v_config FROM public.dev_config WHERE id = 1;
  IF v_config IS NULL THEN
    RAISE EXCEPTION 'Dev mode is not configured';
  END IF;

  v_is_owner := (v_config.owner_code IS NOT NULL AND p_code = v_config.owner_code);

  IF NOT v_is_owner AND p_code <> v_config.code THEN
    RAISE EXCEPTION 'Invalid access code';
  END IF;

  v_privileges := jsonb_build_object(
    'canSeeAllCards', TRUE,
    'canPeekDrawPile', TRUE,
    'canInspectGameState', TRUE,
    'canUseCheatActions', TRUE,
    'canReorderDiscardPile', v_is_owner
  );

  INSERT INTO public.game_dev_access (game_id, uid, activated_at, privileges)
  VALUES (p_game_id, v_uid, v_now, v_privileges)
  ON CONFLICT (game_id, uid) DO UPDATE
    SET activated_at = v_now, privileges = v_privileges;
END;
$$;


-- ─── deactivate_dev_mode ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_dev_mode(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  DELETE FROM public.game_dev_access
    WHERE game_id = p_game_id AND uid = v_uid;
END;
$$;


-- ─── dev_reorder_draw_pile ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dev_reorder_draw_pile(
  p_game_id   UUID,
  p_reordered JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_game_status TEXT;
  v_privileges  JSONB;
  v_current     JSONB;
  v_cur_len     INT;
  v_new_len     INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT status INTO v_game_status
    FROM public.games WHERE id = p_game_id;
  IF v_game_status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  SELECT privileges INTO v_privileges
    FROM public.game_dev_access
    WHERE game_id = p_game_id AND uid = v_uid;
  IF v_privileges IS NULL THEN
    RAISE EXCEPTION 'No dev access';
  END IF;
  IF NOT (v_privileges->>'canReorderDiscardPile')::BOOLEAN THEN
    RAISE EXCEPTION 'No reorder privilege';
  END IF;

  SELECT draw_pile INTO v_current
    FROM public.game_internal
    WHERE game_id = p_game_id
    FOR UPDATE;

  v_cur_len := jsonb_array_length(COALESCE(v_current, '[]'::JSONB));
  v_new_len := jsonb_array_length(p_reordered);

  IF v_cur_len <> v_new_len THEN
    RAISE EXCEPTION 'Draw pile size mismatch';
  END IF;

  -- Note: full card-ID validation (same set of cards) would require
  -- extracting all IDs. For dev-only tooling, size check is sufficient.

  UPDATE public.game_internal
    SET draw_pile = p_reordered
    WHERE game_id = p_game_id;
END;
$$;


-- ─── Dev mode: RLS policies for dev reads ─────────────────────
-- Dev users need to read ALL players' private state and the draw pile.
-- These policies are scoped to users with an active dev_access row.

-- Allow dev users to read ALL private state rows (not just their own)
CREATE POLICY "private_state_select_dev" ON public.game_private_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_dev_access da
      WHERE da.game_id = game_id
        AND da.uid = auth.uid()
        AND (da.privileges->>'canSeeAllCards')::BOOLEAN IS TRUE
    )
  );

-- Allow dev users to read game_internal (draw pile)
CREATE POLICY "internal_select_dev" ON public.game_internal
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_dev_access da
      WHERE da.game_id = game_id
        AND da.uid = auth.uid()
        AND (da.privileges->>'canPeekDrawPile')::BOOLEAN IS TRUE
    )
  );


-- ─── Add game_internal to realtime publication ──────────────────
-- Required for dev mode draw pile subscription (Postgres Changes).
-- Safe: the only SELECT policy is internal_select_dev (dev users only).
-- Normal clients have zero SELECT policies → receive no events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_internal;
