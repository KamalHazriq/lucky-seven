-- ============================================================
-- Lucky Seven — Migration 7: Powers + Game Flow RPCs
-- ============================================================
-- Powers: peek_one, peek_all, peek_opponent, peek_all_opponent,
--         use_swap, use_lock, use_unlock, use_rearrange
-- Flow:   call_end, reveal_hand, skip_turn, leave_game
--
-- All SECURITY DEFINER + SET search_path = ''
-- All validate auth.uid(), game membership, turn, phase
-- ============================================================


-- ─── Helper: assert power effect ────────────────────────────
-- Validates that a drawn card has the expected power effect and
-- has not already been spent. Returns the rank key.
CREATE OR REPLACE FUNCTION public._assert_power_effect(
  p_settings          JSONB,     -- game.settings
  p_spent_ids         TEXT[],    -- game.spent_power_card_ids
  p_card              JSONB,     -- the drawn card
  p_expected_effect   TEXT       -- e.g. 'peek_one_of_your_cards'
)
RETURNS TEXT  -- rank key ('10','J','Q','K','JOKER')
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_is_joker  BOOLEAN;
  v_rank      TEXT;
  v_rank_key  TEXT;
  v_assignments JSONB;
  v_actual    TEXT;
  v_card_id   TEXT;
BEGIN
  v_is_joker := COALESCE((p_card->>'isJoker')::BOOLEAN, FALSE);
  v_rank := p_card->>'rank';

  IF v_is_joker THEN
    v_rank_key := 'JOKER';
  ELSIF v_rank = 'J' THEN v_rank_key := 'J';
  ELSIF v_rank = 'Q' THEN v_rank_key := 'Q';
  ELSIF v_rank = 'K' THEN v_rank_key := 'K';
  ELSIF v_rank = '10' THEN v_rank_key := '10';
  ELSE
    RAISE EXCEPTION 'This card has no power';
  END IF;

  v_assignments := COALESCE(
    p_settings->'powerAssignments',
    '{"10":"unlock_one_locked_card","J":"peek_all_three_of_your_cards","Q":"swap_one_to_one","K":"lock_one_card","JOKER":"rearrange_cards"}'::JSONB
  );
  v_actual := v_assignments->>v_rank_key;

  IF v_actual != p_expected_effect THEN
    RAISE EXCEPTION 'This card''s power is "%" not "%"', v_actual, p_expected_effect;
  END IF;

  v_card_id := p_card->>'id';
  IF v_card_id = ANY(p_spent_ids) THEN
    RAISE EXCEPTION 'Power already used for this card.';
  END IF;

  RETURN v_rank_key;
END;
$$;


-- ─── Helper: check is peek power ────────────────────────────
-- For opponent peek, the card must have peek_one or peek_all.
CREATE OR REPLACE FUNCTION public._assert_peek_power(
  p_settings   JSONB,
  p_spent_ids  TEXT[],
  p_card       JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_is_joker  BOOLEAN;
  v_rank      TEXT;
  v_rank_key  TEXT;
  v_assignments JSONB;
  v_actual    TEXT;
  v_card_id   TEXT;
BEGIN
  v_is_joker := COALESCE((p_card->>'isJoker')::BOOLEAN, FALSE);
  v_rank := p_card->>'rank';

  IF v_is_joker THEN v_rank_key := 'JOKER';
  ELSIF v_rank = 'J' THEN v_rank_key := 'J';
  ELSIF v_rank = 'Q' THEN v_rank_key := 'Q';
  ELSIF v_rank = 'K' THEN v_rank_key := 'K';
  ELSIF v_rank = '10' THEN v_rank_key := '10';
  ELSE RAISE EXCEPTION 'This card has no power';
  END IF;

  v_assignments := COALESCE(
    p_settings->'powerAssignments',
    '{"10":"unlock_one_locked_card","J":"peek_all_three_of_your_cards","Q":"swap_one_to_one","K":"lock_one_card","JOKER":"rearrange_cards"}'::JSONB
  );
  v_actual := v_assignments->>v_rank_key;

  IF v_actual NOT IN ('peek_one_of_your_cards', 'peek_all_three_of_your_cards') THEN
    RAISE EXCEPTION 'This card does not have a peek power';
  END IF;

  v_card_id := p_card->>'id';
  IF v_card_id = ANY(p_spent_ids) THEN
    RAISE EXCEPTION 'Power already used for this card.';
  END IF;

  RETURN v_rank_key;
END;
$$;


-- ─── Common preamble check (reusable pattern) ──────────────
-- Not a function — just a comment documenting the pattern used
-- in every power RPC below:
--   1. auth.uid() check
--   2. SELECT game FOR UPDATE
--   3. current_turn_player_id = caller
--   4. turn_phase = 'action'
--   5. status IN ('active','ending')
--   6. drawn_card IS NOT NULL


-- ═════════════════════════════════════════════════════════════
-- peek_all — peek all 3 of your own cards
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_peek_all(p_game_id UUID)
RETURNS JSONB  -- { "0": Card, "1": Card, "2": Card } (unlocked only)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_locks    BOOLEAN[];
  v_pname    TEXT;
  v_rank_key TEXT;
  v_revealed JSONB := '{}'::JSONB;
  v_new_known JSONB;
  v_card     JSONB;
  v_i        INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_all_three_of_your_cards'
  );

  -- Reveal unlocked cards, update known map
  v_new_known := v_priv.known;
  FOR v_i IN 0..2 LOOP
    IF NOT v_locks[v_i + 1] THEN  -- locks is 1-indexed in Postgres
      v_card := v_priv.hand->v_i;
      v_new_known := v_new_known || jsonb_build_object(v_i::TEXT, v_card);
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_card);
    END IF;
  END LOOP;

  -- Clear drawn card, update known
  UPDATE public.game_private_state SET
    drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- History
  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, v_pname || ' used ' || v_rank_key || ' as peek_all');

  -- Advance turn + mark spent
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card,
    v_pname || ' used ' || v_rank_key || ' as peek_all',
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_revealed;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- peek_one — peek one of your own cards
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_peek_one(
  p_game_id    UUID,
  p_slot_index INT
)
RETURNS JSONB  -- the peeked Card
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_locks    BOOLEAN[];
  v_pname    TEXT;
  v_rank_key TEXT;
  v_peeked   JSONB;
  v_new_known JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_one_of_your_cards'
  );

  IF v_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  v_peeked := v_priv.hand->p_slot_index;
  v_new_known := v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_peeked);

  UPDATE public.game_private_state SET
    drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, v_pname || ' used ' || v_rank_key || ' as peek_one');

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card,
    v_pname || ' used ' || v_rank_key || ' as peek_one',
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_peeked;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- peek_opponent — peek one opponent card
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_peek_opponent(
  p_game_id         UUID,
  p_target_player   UUID,
  p_slot_index      INT
)
RETURNS JSONB  -- { "card": Card, "playerName": text }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_target_priv  public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name  TEXT;
  v_peeked   JSONB;
  v_msg      TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  -- Validate peek-opponent settings
  IF NOT COALESCE((v_game.settings->>'peekAllowsOpponent')::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'Peek opponent is not enabled';
  END IF;
  v_rank_key := public._assert_peek_power(
    v_game.settings, v_game.spent_power_card_ids, v_priv.drawn_card
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot peek your own card — use Peek instead';
  END IF;

  -- Read target
  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_target_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_peeked := v_target_priv.hand->p_slot_index;

  -- Clear actor's drawn card
  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_opponent: ' || v_target_name || '''s #' || (p_slot_index + 1)::TEXT;

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('card', v_peeked, 'playerName', v_target_name);
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- peek_all_opponent — peek all 3 of opponent's cards (Jack)
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_peek_all_opponent(
  p_game_id       UUID,
  p_target_player UUID
)
RETURNS JSONB  -- { "cards": {slot: Card}, "playerName": text, "locks": [bool] }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_target_priv  public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name  TEXT;
  v_revealed JSONB := '{}'::JSONB;
  v_msg      TEXT;
  v_i        INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  IF NOT COALESCE((v_game.settings->>'peekAllowsOpponent')::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'Peek opponent is not enabled';
  END IF;
  -- Must specifically have peek_all power
  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_all_three_of_your_cards'
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot peek your own cards — use Peek All instead';
  END IF;

  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  FOR v_i IN 0..2 LOOP
    IF NOT v_target_locks[v_i + 1] THEN
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_target_priv.hand->v_i);
    END IF;
  END LOOP;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_all_opponent: ' || v_target_name || '''s cards';

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('cards', v_revealed, 'playerName', v_target_name, 'locks', to_jsonb(v_target_locks));
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- use_swap — Queen power: swap two players' cards
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_swap_power(
  p_game_id UUID,
  p_a_player UUID, p_a_slot INT,
  p_b_player UUID, p_b_slot INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_a_locks  BOOLEAN[];
  v_b_locks  BOOLEAN[];
  v_a_name   TEXT;
  v_b_name   TEXT;
  v_priv_a   public.game_private_state%ROWTYPE;
  v_priv_b   public.game_private_state%ROWTYPE;
  v_card_a   JSONB;
  v_card_b   JSONB;
  v_new_hand JSONB;
  v_new_known JSONB;
  v_new_hand_a JSONB;
  v_new_hand_b JSONB;
  v_new_known_a JSONB;
  v_new_known_b JSONB;
  v_msg      TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'swap_one_to_one'
  );

  -- Check locks
  SELECT locks, display_name INTO v_a_locks, v_a_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_a_player;
  SELECT locks, display_name INTO v_b_locks, v_b_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_b_player;
  IF v_a_locks[p_a_slot + 1] THEN RAISE EXCEPTION 'Card A is locked'; END IF;
  IF v_b_locks[p_b_slot + 1] THEN RAISE EXCEPTION 'Card B is locked'; END IF;

  -- Read private states
  SELECT * INTO v_priv_a FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_a_player FOR UPDATE;
  SELECT * INTO v_priv_b FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_b_player FOR UPDATE;

  v_card_a := v_priv_a.hand->p_a_slot;
  v_card_b := v_priv_b.hand->p_b_slot;

  IF p_a_player = p_b_player THEN
    -- Same player: swap two slots
    SELECT jsonb_agg(
      CASE
        WHEN idx = p_a_slot + 1 THEN v_card_b
        WHEN idx = p_b_slot + 1 THEN v_card_a
        ELSE elem
      END
    ) INTO v_new_hand
    FROM jsonb_array_elements(v_priv_a.hand) WITH ORDINALITY AS t(elem, idx);

    -- Swap known entries
    v_new_known := v_priv_a.known;
    -- If slot A was known, move to B; if B was known, move to A
    IF v_new_known ? p_a_slot::TEXT AND v_new_known ? p_b_slot::TEXT THEN
      v_new_known := (v_new_known - p_a_slot::TEXT - p_b_slot::TEXT)
        || jsonb_build_object(p_a_slot::TEXT, v_priv_a.known->p_b_slot::TEXT)
        || jsonb_build_object(p_b_slot::TEXT, v_priv_a.known->p_a_slot::TEXT);
    ELSIF v_new_known ? p_a_slot::TEXT THEN
      v_new_known := (v_new_known - p_a_slot::TEXT)
        || jsonb_build_object(p_b_slot::TEXT, v_priv_a.known->p_a_slot::TEXT);
    ELSIF v_new_known ? p_b_slot::TEXT THEN
      v_new_known := (v_new_known - p_b_slot::TEXT)
        || jsonb_build_object(p_a_slot::TEXT, v_priv_a.known->p_b_slot::TEXT);
    END IF;

    UPDATE public.game_private_state SET hand = v_new_hand, known = v_new_known
      WHERE game_id = p_game_id AND player_id = p_a_player;
  ELSE
    -- Different players: swap cross-player
    SELECT jsonb_agg(
      CASE WHEN idx = p_a_slot + 1 THEN v_card_b ELSE elem END
    ) INTO v_new_hand_a
    FROM jsonb_array_elements(v_priv_a.hand) WITH ORDINALITY AS t(elem, idx);
    v_new_known_a := v_priv_a.known - p_a_slot::TEXT;

    SELECT jsonb_agg(
      CASE WHEN idx = p_b_slot + 1 THEN v_card_a ELSE elem END
    ) INTO v_new_hand_b
    FROM jsonb_array_elements(v_priv_b.hand) WITH ORDINALITY AS t(elem, idx);
    v_new_known_b := v_priv_b.known - p_b_slot::TEXT;

    UPDATE public.game_private_state SET hand = v_new_hand_a, known = v_new_known_a
      WHERE game_id = p_game_id AND player_id = p_a_player;
    UPDATE public.game_private_state SET hand = v_new_hand_b, known = v_new_known_b
      WHERE game_id = p_game_id AND player_id = p_b_player;
  END IF;

  -- Clear actor's drawn card
  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as swap: ' || v_a_name || '''s #' || (p_a_slot+1)::TEXT || ' <-> ' || v_b_name || '''s #' || (p_b_slot+1)::TEXT;

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- use_lock — King power: lock a card
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_lock(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot_index    INT
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
  v_priv      public.game_private_state%ROWTYPE;
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_t_locks   BOOLEAN[];
  v_t_locked_by JSONB;
  v_t_name    TEXT;
  v_msg       TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'lock_one_card'
  );

  SELECT locks, locked_by, display_name INTO v_t_locks, v_t_locked_by, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_t_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'Already locked'; END IF;

  -- Set lock
  v_t_locks[p_slot_index + 1] := TRUE;
  v_t_locked_by := jsonb_set(v_t_locked_by, ARRAY[(p_slot_index)::TEXT],
    jsonb_build_object('lockerId', v_uid::TEXT, 'lockerName', v_pname));

  UPDATE public.game_players SET locks = v_t_locks, locked_by = v_t_locked_by
    WHERE game_id = p_game_id AND player_id = p_target_player;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as lock on '
    || CASE WHEN p_target_player = v_uid THEN 'their own' ELSE v_t_name || '''s' END
    || ' card #' || (p_slot_index + 1)::TEXT;

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- use_unlock — 10 power: unlock a card (fizzles if not locked)
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_unlock(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot_index    INT
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
  v_priv      public.game_private_state%ROWTYPE;
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_t_locks   BOOLEAN[];
  v_t_locked_by JSONB;
  v_t_name    TEXT;
  v_is_locked BOOLEAN;
  v_msg       TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'unlock_one_locked_card'
  );

  SELECT locks, locked_by, display_name INTO v_t_locks, v_t_locked_by, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;

  v_is_locked := v_t_locks[p_slot_index + 1];

  IF v_is_locked THEN
    v_t_locks[p_slot_index + 1] := FALSE;
    v_t_locked_by := jsonb_set(v_t_locked_by, ARRAY[(p_slot_index)::TEXT], 'null'::JSONB);
    UPDATE public.game_players SET locks = v_t_locks, locked_by = v_t_locked_by
      WHERE game_id = p_game_id AND player_id = p_target_player;
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  IF v_is_locked THEN
    v_msg := v_pname || ' used ' || v_rank_key || ' as unlock on '
      || CASE WHEN p_target_player = v_uid THEN 'their own' ELSE v_t_name || '''s' END
      || ' card #' || (p_slot_index + 1)::TEXT;
  ELSE
    v_msg := v_pname || ' used ' || v_rank_key || ' as unlock but no card was locked (power fizzled)';
  END IF;

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- use_rearrange — Joker power: shuffle opponent's unlocked cards
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.use_rearrange(
  p_game_id       UUID,
  p_target_player UUID
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
  v_priv      public.game_private_state%ROWTYPE;
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_t_locks   BOOLEAN[];
  v_t_name    TEXT;
  v_t_priv    public.game_private_state%ROWTYPE;
  v_unlocked  INT[];
  v_cards     JSONB[];
  v_temp      JSONB;
  v_j         INT;
  v_new_hand  JSONB;
  v_new_known JSONB;
  v_msg       TEXT;
  v_i         INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'rearrange_cards'
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot rearrange your own cards';
  END IF;

  SELECT locks, display_name INTO v_t_locks, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  SELECT * INTO v_t_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player FOR UPDATE;

  -- Find unlocked indices
  v_unlocked := '{}';
  FOR v_i IN 0..2 LOOP
    IF NOT v_t_locks[v_i + 1] THEN
      v_unlocked := v_unlocked || v_i;
    END IF;
  END LOOP;

  IF array_length(v_unlocked, 1) > 1 THEN
    -- Extract unlocked cards into array
    v_cards := '{}';
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_cards := v_cards || (v_t_priv.hand->(v_unlocked[v_i]));
    END LOOP;

    -- Fisher-Yates shuffle using random()
    -- Retry up to 10 times to avoid no-op shuffle
    FOR v_i IN REVERSE array_length(v_cards, 1)..2 LOOP
      v_j := 1 + floor(random() * v_i)::INT;
      v_temp := v_cards[v_i];
      v_cards[v_i] := v_cards[v_j];
      v_cards[v_j] := v_temp;
    END LOOP;

    -- Rebuild hand
    v_new_hand := v_t_priv.hand;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_hand := jsonb_set(v_new_hand, ARRAY[(v_unlocked[v_i])::TEXT], v_cards[v_i]);
    END LOOP;

    -- Clear known for shuffled slots
    v_new_known := v_t_priv.known;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_known := v_new_known - (v_unlocked[v_i])::TEXT;
    END LOOP;

    UPDATE public.game_private_state SET hand = v_new_hand, known = v_new_known
      WHERE game_id = p_game_id AND player_id = p_target_player;
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as rearrange on ' || v_t_name || '''s cards!';

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- call_end — trigger final round
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.call_end(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_now    BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game   public.games%ROWTYPE;
  v_pname  TEXT;
  v_idx    INT;
  v_msg    TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Only the current turn player can call End';
  END IF;
  IF v_game.status != 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_idx := array_position(v_game.player_order, v_uid) - 1;  -- 0-based seat index
  v_msg := v_pname || ' called END! Finishing the round...';

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  UPDATE public.games SET
    status = 'ending',
    end_called_by = v_uid,
    end_round_start_seat_index = v_idx,
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_msg)
  WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- reveal_hand — end-of-game hand reveal + score
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reveal_hand(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_priv   public.game_private_state%ROWTYPE;
  v_pname  TEXT;
  v_total  INT := 0;
  v_sevens INT := 0;
  v_card   JSONB;
  v_rank   TEXT;
  v_val    INT;
  v_i      INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  -- Score the hand: 7=0, A=1, 2-6=face, 8-9=face, 10/J/Q/K=10, Joker=0
  FOR v_i IN 0..jsonb_array_length(v_priv.hand)-1 LOOP
    v_card := v_priv.hand->v_i;
    IF COALESCE((v_card->>'isJoker')::BOOLEAN, FALSE) THEN
      -- Joker = 0
      v_val := 0;
    ELSE
      v_rank := v_card->>'rank';
      CASE v_rank
        WHEN '7' THEN v_val := 0; v_sevens := v_sevens + 1;
        WHEN 'A' THEN v_val := 1;
        WHEN '2' THEN v_val := 2;
        WHEN '3' THEN v_val := 3;
        WHEN '4' THEN v_val := 4;
        WHEN '5' THEN v_val := 5;
        WHEN '6' THEN v_val := 6;
        WHEN '8' THEN v_val := 8;
        WHEN '9' THEN v_val := 9;
        WHEN '10','J','Q','K' THEN v_val := 10;
        ELSE v_val := 0;
      END CASE;
    END IF;
    v_total := v_total + v_val;
  END LOOP;

  INSERT INTO public.game_reveals (game_id, player_id, display_name, hand, total, sevens)
  VALUES (p_game_id, v_uid, v_pname, v_priv.hand, v_total, v_sevens)
  ON CONFLICT (game_id, player_id) DO NOTHING;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- skip_turn — timer-expired auto-skip with AFK tracking
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.skip_turn(
  p_game_id               UUID,
  p_expected_action_version INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now        BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game       public.games%ROWTYPE;
  v_cur_pid    UUID;
  v_pd_name    TEXT;
  v_afk        INT;
  v_priv       public.game_private_state%ROWTYPE;
  v_next_idx   INT;
  v_next_pid   UUID;
  v_should_finish BOOLEAN := FALSE;
  v_new_order  UUID[];
  v_msg        TEXT;
  v_discard    JSONB;
BEGIN
  -- No auth.uid() check — skip_turn can be called by any client
  -- (the timer fires on all clients; actionVersion guard prevents double-skip)

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_game.action_version != p_expected_action_version THEN RETURN; END IF;
  IF v_game.current_turn_player_id IS NULL THEN RETURN; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RETURN; END IF;
  IF v_game.vote_kick IS NOT NULL AND (v_game.vote_kick->>'active')::BOOLEAN THEN RETURN; END IF;

  v_cur_pid := v_game.current_turn_player_id;

  SELECT display_name, afk_strikes INTO v_pd_name, v_afk
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_cur_pid;
  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_cur_pid;

  v_afk := COALESCE(v_afk, 0) + 1;

  -- Auto-discard drawn card if any
  v_discard := NULL;
  IF v_priv.drawn_card IS NOT NULL THEN
    v_discard := v_priv.drawn_card;
    UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
  END IF;

  -- Calculate next turn
  v_next_idx := (array_position(v_game.player_order, v_cur_pid) % array_length(v_game.player_order, 1)) + 1;
  v_next_pid := v_game.player_order[v_next_idx];
  IF v_game.status = 'ending' AND v_game.end_round_start_seat_index IS NOT NULL THEN
    IF (v_next_idx - 1) = v_game.end_round_start_seat_index THEN
      v_should_finish := TRUE;
    END IF;
  END IF;

  IF v_afk >= 2 THEN
    -- AFK kick
    v_new_order := array_remove(v_game.player_order, v_cur_pid);

    IF array_length(v_new_order, 1) IS NULL OR array_length(v_new_order, 1) < 2 THEN
      v_msg := v_pd_name || ' was AFK-kicked. Not enough players — game over.';
      INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);
      UPDATE public.games SET
        discard_top = COALESCE(v_discard, v_game.discard_top),
        status = 'finished',
        current_turn_player_id = NULL,
        turn_phase = NULL,
        player_order = v_new_order,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        turn_start_at = 0,
        log = public._bounded_log_append(v_game.log, v_now, v_msg)
      WHERE id = p_game_id;
    ELSE
      -- Kick but game continues
      v_next_idx := ((array_position(v_game.player_order, v_cur_pid) - 1) % array_length(v_new_order, 1)) + 1;
      v_next_pid := v_new_order[v_next_idx];
      v_msg := v_pd_name || ' was AFK-kicked (2 timeouts).';
      INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);
      UPDATE public.games SET
        discard_top = COALESCE(v_discard, v_game.discard_top),
        player_order = v_new_order,
        current_turn_player_id = v_next_pid,
        turn_phase = 'draw',
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        turn_start_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_cur_pid THEN v_new_order[1] ELSE v_game.host_id END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg)
      WHERE id = p_game_id;
    END IF;

    UPDATE public.game_players SET connected = FALSE, afk_strikes = 0
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
    UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
  ELSE
    -- First strike — just skip
    UPDATE public.game_players SET afk_strikes = v_afk
      WHERE game_id = p_game_id AND player_id = v_cur_pid;

    v_msg := v_pd_name || '''s turn was skipped (AFK).';

    UPDATE public.games SET
      discard_top = COALESCE(v_discard, v_game.discard_top),
      current_turn_player_id = CASE WHEN v_should_finish THEN NULL ELSE v_next_pid END,
      turn_phase = CASE WHEN v_should_finish THEN NULL ELSE 'draw' END,
      status = CASE WHEN v_should_finish THEN 'finished' ELSE v_game.status END,
      action_version = v_game.action_version + 1,
      last_action_at = v_now,
      turn_start_at = CASE WHEN v_should_finish THEN 0 ELSE v_now END,
      log = public._bounded_log_append(v_game.log, v_now, v_msg)
    WHERE id = p_game_id;
  END IF;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- leave_game — mid-game leave
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.leave_game(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_pname     TEXT;
  v_new_order UUID[];
  v_next_idx  INT;
  v_msg       TEXT;
  v_updates   JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RETURN; END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN RETURN; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_new_order := array_remove(v_game.player_order, v_uid);

  IF array_length(v_new_order, 1) IS NULL OR array_length(v_new_order, 1) < 2 THEN
    v_msg := v_pname || ' left. Not enough players — game over.';
    INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);
    UPDATE public.games SET
      status = 'finished',
      current_turn_player_id = NULL,
      turn_phase = NULL,
      player_order = v_new_order,
      action_version = v_game.action_version + 1,
      last_action_at = v_now,
      log = public._bounded_log_append(v_game.log, v_now, v_msg)
    WHERE id = p_game_id;
  ELSE
    v_msg := v_pname || ' left the game';
    INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

    -- If it was their turn, advance
    IF v_game.current_turn_player_id = v_uid THEN
      v_next_idx := ((array_position(v_game.player_order, v_uid) - 1) % array_length(v_new_order, 1)) + 1;
      UPDATE public.games SET
        player_order = v_new_order,
        current_turn_player_id = v_new_order[v_next_idx],
        turn_phase = 'draw',
        turn_start_at = v_now,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_uid THEN v_new_order[1] ELSE v_game.host_id END,
        vote_kick = CASE
          WHEN v_game.vote_kick IS NOT NULL AND (
            (v_game.vote_kick->>'targetId') = v_uid::TEXT OR
            (v_game.vote_kick->>'startedBy') = v_uid::TEXT
          ) THEN NULL
          ELSE v_game.vote_kick
        END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg)
      WHERE id = p_game_id;
    ELSE
      UPDATE public.games SET
        player_order = v_new_order,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_uid THEN v_new_order[1] ELSE v_game.host_id END,
        vote_kick = CASE
          WHEN v_game.vote_kick IS NOT NULL AND (
            (v_game.vote_kick->>'targetId') = v_uid::TEXT OR
            (v_game.vote_kick->>'startedBy') = v_uid::TEXT
          ) THEN NULL
          ELSE v_game.vote_kick
        END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg)
      WHERE id = p_game_id;
    END IF;
  END IF;

  UPDATE public.game_players SET connected = FALSE
    WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;
END;
$$;
