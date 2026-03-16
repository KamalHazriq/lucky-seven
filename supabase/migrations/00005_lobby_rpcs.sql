-- ============================================================
-- Lucky Seven — Migration 5: Lobby RPCs
-- ============================================================
-- create_game, join_game, start_game, leave_lobby,
-- update_game_settings, update_player_profile
--
-- All SECURITY DEFINER + search_path = ''
-- All validate caller via auth.uid()
-- ============================================================


-- ─── create_game ────────────────────────────────────────────
-- Creates a new game + host player row + empty private state.
-- Returns the new game id.
CREATE OR REPLACE FUNCTION public.create_game(
  p_display_name  TEXT,
  p_max_players   INT,
  p_settings      JSONB,
  p_game_id       TEXT,       -- nanoid(8) generated client-side
  p_join_code     TEXT,       -- nanoid(6) generated client-side
  p_seed          TEXT,       -- nanoid(12) for deterministic shuffle
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

  -- Check join code uniqueness among active lobbies
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
    TRUE, '{false,false,false}',
    '[null,null,null]'::JSONB,
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    v_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  -- History entry
  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (v_id, v_now, 'Game created by ' || p_display_name);

  RETURN v_id::TEXT;
END;
$$;


-- ─── join_game ──────────────────────────────────────────────
-- Adds a player to a lobby game. Validates capacity, name
-- uniqueness, and color uniqueness within a row-locked txn.
CREATE OR REPLACE FUNCTION public.join_game(
  p_game_id      UUID,
  p_display_name TEXT,
  p_color_key    INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_seat      INT;
  v_name_lower TEXT;
  v_assigned_color INT;
  v_taken_colors INT[];
  v_available  INT[];
  v_i INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the game row for the duration of this transaction
  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;
  -- Already in the game? Silently succeed.
  IF v_uid = ANY(v_game.player_order) THEN
    RETURN;
  END IF;
  IF array_length(v_game.player_order, 1) >= v_game.max_players THEN
    RAISE EXCEPTION 'Game is full';
  END IF;

  -- Check name uniqueness (case-insensitive)
  v_name_lower := lower(p_display_name);
  IF EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_id = p_game_id AND lower(display_name) = v_name_lower
      AND connected = TRUE
  ) THEN
    RAISE EXCEPTION 'Name already taken in this lobby';
  END IF;

  -- Check color uniqueness if provided
  IF p_color_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.game_players
      WHERE game_id = p_game_id AND color_key = p_color_key
        AND connected = TRUE
    ) THEN
      RAISE EXCEPTION 'Color already taken';
    END IF;
    v_assigned_color := p_color_key;
  ELSE
    -- Auto-assign a random untaken color
    SELECT array_agg(gp.color_key) INTO v_taken_colors
      FROM public.game_players gp
      WHERE gp.game_id = p_game_id AND gp.color_key IS NOT NULL
        AND gp.connected = TRUE;

    v_available := '{}';
    FOR v_i IN 0..15 LOOP
      IF v_taken_colors IS NULL OR NOT (v_i = ANY(v_taken_colors)) THEN
        v_available := v_available || v_i;
      END IF;
    END LOOP;

    IF array_length(v_available, 1) > 0 THEN
      v_assigned_color := v_available[1 + floor(random() * array_length(v_available, 1))::INT];
    END IF;
  END IF;

  v_seat := array_length(v_game.player_order, 1);  -- next seat index

  -- Update game: add to player_order, append log
  UPDATE public.games SET
    player_order = player_order || v_uid,
    log = CASE
      WHEN jsonb_array_length(log) >= 50
        THEN (log - 0) || jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined'))
        ELSE log || jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined'))
    END
  WHERE id = p_game_id;

  -- Insert player
  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    p_game_id, v_uid, p_display_name, v_seat,
    TRUE, '{false,false,false}',
    '[null,null,null]'::JSONB,
    v_assigned_color, 0
  );

  -- Insert empty private state
  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    p_game_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );
END;
$$;


-- ─── start_game ─────────────────────────────────────────────
-- Host-only. Receives the pre-shuffled deck (built client-side
-- using the stored seed + buildDeck/shuffleDeck). The RPC
-- deals hands, creates draw pile, and transitions to 'active'.
--
-- Why client-side deck? The deck building uses seedrandom + a
-- custom 1.5x deck algorithm in TypeScript. Replicating in
-- PL/pgSQL would be fragile. Since the seed is stored and
-- deterministic, any client can verify the shuffle.
CREATE OR REPLACE FUNCTION public.start_game(
  p_game_id  UUID,
  p_deck     JSONB     -- Card[] pre-shuffled by client
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_player_count INT;
  v_cards_needed INT;
  v_i           INT;
  v_pid         UUID;
  v_hand        JSONB;
  v_remaining   JSONB;
  v_log_entry   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.host_id != v_uid THEN
    RAISE EXCEPTION 'Only host can start';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;

  v_player_count := array_length(v_game.player_order, 1);
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 players';
  END IF;

  v_cards_needed := v_player_count * 3;

  -- Validate deck has enough cards
  IF jsonb_array_length(p_deck) < v_cards_needed THEN
    RAISE EXCEPTION 'Deck too small for player count';
  END IF;

  -- Deal 3 cards to each player
  FOR v_i IN 0..(v_player_count - 1) LOOP
    v_pid := v_game.player_order[v_i + 1];  -- Postgres arrays are 1-indexed
    -- Slice cards [i*3 .. i*3+2]
    v_hand := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
      WHERE t.idx > (v_i * 3) AND t.idx <= ((v_i + 1) * 3)
    );

    UPDATE public.game_private_state SET
      hand = v_hand,
      drawn_card = NULL,
      drawn_card_source = NULL,
      known = '{}'::JSONB
    WHERE game_id = p_game_id AND player_id = v_pid;

    -- Reset locks
    UPDATE public.game_players SET
      locks = '{false,false,false}',
      locked_by = '[null,null,null]'::JSONB
    WHERE game_id = p_game_id AND player_id = v_pid;
  END LOOP;

  -- Remaining cards become the draw pile
  v_remaining := (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > v_cards_needed
  );
  IF v_remaining IS NULL THEN
    v_remaining := '[]'::JSONB;
  END IF;

  -- Upsert game_internal (draw pile)
  INSERT INTO public.game_internal (game_id, draw_pile)
  VALUES (p_game_id, v_remaining)
  ON CONFLICT (game_id) DO UPDATE SET draw_pile = EXCLUDED.draw_pile;

  -- History entry
  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, 'Game started! Cards dealt.');

  -- Transition game to active
  v_log_entry := jsonb_build_object('ts', v_now, 'msg', 'Game started! Cards dealt.');

  UPDATE public.games SET
    status = 'active',
    draw_pile_count = jsonb_array_length(v_remaining),
    discard_top = NULL,
    current_turn_player_id = v_game.player_order[1],
    turn_phase = 'draw',
    action_version = 1,
    last_action_at = v_now,
    turn_start_at = v_now,
    end_called_by = NULL,
    end_round_start_seat_index = NULL,
    spent_power_card_ids = '{}',
    vote_kick = NULL,
    log = CASE
      WHEN jsonb_array_length(v_game.log) >= 50
        THEN (v_game.log - 0) || jsonb_build_array(v_log_entry)
        ELSE v_game.log || jsonb_build_array(v_log_entry)
    END
  WHERE id = p_game_id;
END;
$$;


-- ─── leave_lobby ────────────────────────────────────────────
-- Player leaves a lobby game. Host transfers if host leaves.
-- Last player → game marked finished.
CREATE OR REPLACE FUNCTION public.leave_lobby(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_new_order UUID[];
  v_log_entry JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Game has already started';
  END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN
    RETURN;  -- already gone
  END IF;

  v_new_order := array_remove(v_game.player_order, v_uid);

  IF array_length(v_new_order, 1) IS NULL OR array_length(v_new_order, 1) = 0 THEN
    -- Last player — abandon game
    v_log_entry := jsonb_build_object('ts', v_now, 'msg', 'All players left. Game abandoned.');

    UPDATE public.games SET
      status = 'finished',
      player_order = '{}',
      log = v_game.log || jsonb_build_array(v_log_entry)
    WHERE id = p_game_id;

    INSERT INTO public.game_history (game_id, ts, msg)
    VALUES (p_game_id, v_now, 'All players left. Game abandoned.');
  ELSE
    v_log_entry := jsonb_build_object('ts', v_now, 'msg', 'A player left the lobby');

    UPDATE public.games SET
      player_order = v_new_order,
      host_id = CASE
        WHEN v_game.host_id = v_uid THEN v_new_order[1]
        ELSE v_game.host_id
      END,
      log = v_game.log || jsonb_build_array(v_log_entry)
    WHERE id = p_game_id;

    INSERT INTO public.game_history (game_id, ts, msg)
    VALUES (p_game_id, v_now, 'A player left the lobby');
  END IF;

  -- Mark player disconnected (keep row for RLS consistency)
  UPDATE public.game_players SET connected = FALSE
    WHERE game_id = p_game_id AND player_id = v_uid;
END;
$$;


-- ─── update_game_settings ───────────────────────────────────
-- Host-only, lobby-only. Merges partial settings into existing.
CREATE OR REPLACE FUNCTION public.update_game_settings(
  p_game_id  UUID,
  p_settings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_game public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.host_id != v_uid THEN
    RAISE EXCEPTION 'Only the host can change settings';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Settings can only be changed in the lobby';
  END IF;

  UPDATE public.games SET
    settings = v_game.settings || p_settings
  WHERE id = p_game_id;
END;
$$;


-- ─── update_player_profile ──────────────────────────────────
-- Lobby name/color change with conflict checks.
CREATE OR REPLACE FUNCTION public.update_player_profile(
  p_game_id      UUID,
  p_display_name TEXT DEFAULT NULL,
  p_color_key    INT  DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_game       public.games%ROWTYPE;
  v_clean_name TEXT;
  v_updates    BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- Validate display name uniqueness
  IF p_display_name IS NOT NULL THEN
    v_clean_name := left(trim(p_display_name), 12);
    IF length(v_clean_name) = 0 THEN
      RAISE EXCEPTION 'Name cannot be empty';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.game_players
      WHERE game_id = p_game_id
        AND player_id != v_uid
        AND lower(display_name) = lower(v_clean_name)
        AND connected = TRUE
    ) THEN
      RAISE EXCEPTION 'Name already taken in this lobby';
    END IF;

    UPDATE public.game_players SET display_name = v_clean_name
      WHERE game_id = p_game_id AND player_id = v_uid;
    v_updates := TRUE;
  END IF;

  -- Validate color uniqueness
  IF p_color_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.game_players
      WHERE game_id = p_game_id
        AND player_id != v_uid
        AND color_key = p_color_key
        AND connected = TRUE
    ) THEN
      RAISE EXCEPTION 'Color already taken';
    END IF;

    UPDATE public.game_players SET color_key = p_color_key
      WHERE game_id = p_game_id AND player_id = v_uid;
    v_updates := TRUE;
  END IF;
END;
$$;
