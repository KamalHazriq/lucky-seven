-- ============================================================
-- Lucky Seven — Supabase Schema Migration 3: Realtime
-- ============================================================
-- Enable Supabase Realtime (Postgres Changes) on tables that
-- clients subscribe to. Tables NOT listed here are either
-- write-only (feedback) or accessed only via RPC (game_internal).
--
-- Hybrid strategy:
--   Postgres Changes → games, game_players, game_private_state,
--                       game_reveals, game_dev_access
--   Broadcast         → chat delivery, animations, sfx, toasts
--                       (sent by RPCs, no table subscription needed)
--   Presence          → player online/offline (client-side only)
-- ============================================================

-- Add tables to the supabase_realtime publication.
-- This enables Postgres Changes subscriptions on these tables.
-- RLS is enforced per-subscriber, so private_state only sends
-- events for the player's own row.

ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_private_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_reveals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_dev_access;

-- NOT added to realtime (intentional):
-- game_internal       → never exposed to clients
-- game_chat_messages  → delivered via Broadcast for speed
-- game_history        → read via paginated query, not realtime
-- game_summaries      → read once at game end
-- feedback            → write-only, no client reads
-- global_stats        → read once on page load
