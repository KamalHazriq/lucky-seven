-- ============================================================
-- Lucky Seven — Supabase Schema Migration 8: Chat RPC + Realtime
-- ============================================================
-- Adds send_chat_message RPC for chat writes, and adds
-- game_chat_messages to the realtime publication so
-- Postgres Changes can deliver chat in real time.
-- ============================================================


-- ─── Add chat messages to realtime publication ────────────────
-- Previously delivered via Broadcast; now using Postgres Changes
-- for simplicity. Latency is negligible for a card-game chat.
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_chat_messages;


-- ─── send_chat_message ────────────────────────────────────────
-- Insert a chat message. Caller identity validated via JWT.
-- Server sets the timestamp (prevents client clock shenanigans).
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_game_id       UUID,
  p_text          TEXT,
  p_display_name  TEXT,
  p_seat_index    INT,
  p_msg_id        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is a member of the game
  IF NOT EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_id = p_game_id AND player_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  INSERT INTO public.game_chat_messages (id, game_id, user_id, display_name, seat_index, text, ts)
  VALUES (
    p_msg_id,
    p_game_id,
    v_uid,
    p_display_name,
    p_seat_index,
    left(p_text, 300),  -- hard cap at 300 chars
    (extract(epoch FROM now()) * 1000)::BIGINT
  );
END;
$$;
