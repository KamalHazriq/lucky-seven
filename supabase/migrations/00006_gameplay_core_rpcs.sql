-- ============================================================
-- Lucky Seven — Migration 6: Core Gameplay RPCs
-- ============================================================
-- 5 turn-loop actions: draw_from_pile, take_from_discard,
-- cancel_draw, swap_with_slot, discard_drawn.
--
-- Includes a shared helper for turn advancement that replicates
-- the advanceTurn + buildEndTurnUpdates logic from gameService.ts.
--
-- All SECURITY DEFINER + search_path = ''
-- All validate caller via auth.uid()
-- All use SELECT ... FOR UPDATE for concurrency safety
-- ============================================================


-- ─── Helper: bounded log append ─────────────────────────────
-- Keeps the in-game log capped at 50 entries (matches client).
CREATE OR REPLACE FUNCTION public._bounded_log_append(
  p_log     JSONB,
  p_ts      BIGINT,
  p_msg     TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN jsonb_array_length(p_log) >= 50
      THEN (
        -- Drop oldest entry (idx=1), keep rest, append new entry
        SELECT jsonb_agg(elem ORDER BY rn)
        FROM (
          SELECT elem, row_number() OVER () AS rn
          FROM jsonb_array_elements(p_log) WITH ORDINALITY AS t(elem, idx)
          WHERE t.idx > 1
          UNION ALL
          SELECT jsonb_build_object('ts', p_ts, 'msg', p_msg), 9999
        ) sub
      )
      ELSE p_log || jsonb_build_array(jsonb_build_object('ts', p_ts, 'msg', p_msg))
  END;
$$;


-- ─── Helper: advance turn + end-of-turn game updates ────────
-- Replicates advanceTurn + buildEndTurnUpdates from gameService.ts.
-- Called by swap_with_slot and discard_drawn.
-- Does NOT commit — caller must be inside a transaction.
CREATE OR REPLACE FUNCTION public._apply_end_turn(
  p_game_id          UUID,
  p_current_player   UUID,
  p_discard_card     JSONB,
  p_log_msg          TEXT,
  -- Current game state (passed in to avoid re-reading)
  p_status           TEXT,
  p_player_order     UUID[],
  p_end_round_start  INT,       -- nullable
  p_action_version   INT,
  p_draw_pile_count  INT,
  p_log              JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now           BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_idx           INT;
  v_next_idx      INT;
  v_next_pid      UUID;
  v_should_finish BOOLEAN := FALSE;
  v_new_status    TEXT := p_status;
  v_new_turn_pid  UUID;
  v_new_phase     TEXT := 'draw';
  v_new_turn_start BIGINT;
  v_new_log       JSONB;
BEGIN
  -- Find current player index (1-based in Postgres arrays)
  v_idx := array_position(p_player_order, p_current_player);
  v_next_idx := (v_idx % array_length(p_player_order, 1)) + 1;
  v_next_pid := p_player_order[v_next_idx];

  -- Check ending-round completion
  IF p_status = 'ending' AND p_end_round_start IS NOT NULL THEN
    -- endRoundStartSeatIndex is 0-based, v_next_idx is 1-based
    IF (v_next_idx - 1) = p_end_round_start THEN
      v_should_finish := TRUE;
    END IF;
  END IF;

  -- Build log
  v_new_log := public._bounded_log_append(p_log, v_now, p_log_msg);

  IF v_should_finish THEN
    v_new_status := 'finished';
    v_new_turn_pid := NULL;
    v_new_phase := NULL;
    v_new_turn_start := 0;
  ELSIF p_draw_pile_count = 0 AND p_status != 'ending' THEN
    -- Draw pile exhausted → game over
    v_new_status := 'finished';
    v_new_turn_pid := NULL;
    v_new_phase := NULL;
    v_new_turn_start := 0;
  ELSE
    v_new_turn_pid := v_next_pid;
    v_new_turn_start := v_now;
  END IF;

  UPDATE public.games SET
    discard_top = p_discard_card,
    status = v_new_status,
    current_turn_player_id = v_new_turn_pid,
    turn_phase = v_new_phase,
    action_version = p_action_version + 1,
    last_action_at = v_now,
    turn_start_at = v_new_turn_start,
    log = v_new_log
  WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 1) draw_from_pile
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.draw_from_pile(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_pile      JSONB;
  v_drawn     JSONB;
  v_new_pile  JSONB;
  v_pname     TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock game row
  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  -- Validate turn
  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'draw' THEN
    RAISE EXCEPTION 'Already drew a card';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  -- Lock and read draw pile
  SELECT draw_pile INTO v_pile
    FROM public.game_internal WHERE game_id = p_game_id FOR UPDATE;
  IF v_pile IS NULL OR jsonb_array_length(v_pile) = 0 THEN
    RAISE EXCEPTION 'Draw pile is empty';
  END IF;

  -- Pop first card
  v_drawn := v_pile->0;
  v_new_pile := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::JSONB)
    FROM jsonb_array_elements(v_pile) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > 1
  );

  -- Update draw pile
  UPDATE public.game_internal SET draw_pile = v_new_pile
    WHERE game_id = p_game_id;

  -- Update actor's private state
  UPDATE public.game_private_state SET
    drawn_card = v_drawn,
    drawn_card_source = 'pile'
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Reset AFK strikes
  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  -- Update game state
  UPDATE public.games SET
    draw_pile_count = jsonb_array_length(v_new_pile),
    turn_phase = 'action',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' drew from the pile')
  WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 2) take_from_discard
-- ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.take_from_discard(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_now   BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game  public.games%ROWTYPE;
  v_pname TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'draw' THEN
    RAISE EXCEPTION 'Already drew a card';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;
  IF v_game.discard_top IS NULL THEN
    RAISE EXCEPTION 'No discard card';
  END IF;

  -- Move discard top to actor's private drawn card
  UPDATE public.game_private_state SET
    drawn_card = v_game.discard_top,
    drawn_card_source = 'discard'
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Reset AFK strikes
  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  -- Update game: clear discard, advance to action phase
  UPDATE public.games SET
    discard_top = NULL,
    turn_phase = 'action',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' took from discard')
  WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 3) cancel_draw
-- ═════════════════════════════════════════════════════════════
-- Only discard-sourced draws can be cancelled. Pile draws cannot.
CREATE OR REPLACE FUNCTION public.cancel_draw(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_now    BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game   public.games%ROWTYPE;
  v_priv   public.game_private_state%ROWTYPE;
  v_pname  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Not in action phase';
  END IF;

  -- Read actor's private state
  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card to cancel';
  END IF;
  IF v_priv.drawn_card_source IS NULL THEN
    RAISE EXCEPTION 'Cannot determine draw source';
  END IF;
  IF v_priv.drawn_card_source = 'pile' THEN
    RAISE EXCEPTION 'Cannot undo a draw from the pile. You must swap, discard, or use a power.';
  END IF;

  -- Return card to discard
  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  UPDATE public.game_private_state SET
    drawn_card = NULL,
    drawn_card_source = NULL
  WHERE game_id = p_game_id AND player_id = v_uid;

  UPDATE public.games SET
    discard_top = v_priv.drawn_card,
    turn_phase = 'draw',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' returned the card to discard')
  WHERE id = p_game_id;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 4) swap_with_slot
-- ═════════════════════════════════════════════════════════════
-- Swaps drawnCard with hand[slot]. Old card becomes discard.
-- Advances turn via _apply_end_turn helper.
CREATE OR REPLACE FUNCTION public.swap_with_slot(
  p_game_id    UUID,
  p_slot_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_locks    BOOLEAN[];
  v_pname    TEXT;
  v_old_card JSONB;
  v_new_hand JSONB;
  v_new_known JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Must draw first';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  -- Read actor's private state
  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card';
  END IF;

  -- Validate slot index
  IF p_slot_index < 0 OR p_slot_index >= jsonb_array_length(v_priv.hand) THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  -- Check lock status
  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  -- Postgres arrays are 1-indexed
  IF v_locks[p_slot_index + 1] THEN
    RAISE EXCEPTION 'That card is locked!';
  END IF;

  -- Perform the swap
  v_old_card := v_priv.hand->p_slot_index;

  -- Build new hand: replace element at slot_index
  SELECT jsonb_agg(
    CASE WHEN idx = p_slot_index + 1 THEN v_priv.drawn_card ELSE elem END
  ) INTO v_new_hand
  FROM jsonb_array_elements(v_priv.hand) WITH ORDINALITY AS t(elem, idx);

  -- Update known map: record what we placed in this slot
  v_new_known := v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_priv.drawn_card);

  -- Update private state
  UPDATE public.game_private_state SET
    hand = v_new_hand,
    drawn_card = NULL,
    drawn_card_source = NULL,
    known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Reset AFK strikes
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  -- Advance turn (old card goes to discard)
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_old_card,
    v_pname || ' swapped their card #' || (p_slot_index + 1)::TEXT,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index,
    v_game.action_version, v_game.draw_pile_count,
    v_game.log
  );
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 5) discard_drawn
-- ═════════════════════════════════════════════════════════════
-- Discards the drawn card without swapping. Advances turn.
CREATE OR REPLACE FUNCTION public.discard_drawn(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_game   public.games%ROWTYPE;
  v_priv   public.game_private_state%ROWTYPE;
  v_pname  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Must draw first';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card';
  END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  -- Clear drawn card
  UPDATE public.game_private_state SET
    drawn_card = NULL,
    drawn_card_source = NULL
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Reset AFK strikes
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  -- Advance turn (drawn card goes to discard)
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card,
    v_pname || ' discarded',
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index,
    v_game.action_version, v_game.draw_pile_count,
    v_game.log
  );
END;
$$;
