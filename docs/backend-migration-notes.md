# Backend Migration Notes: Firebase to Supabase

## Current Architecture

### Firebase Services Used
- **Firestore** — all game state, player data, chat, history, analytics
- **Anonymous Auth** — auto-sign-in, no user accounts needed
- **No Cloud Functions** — all logic runs client-side via Firestore transactions

### Firestore Collection Structure

```
games/{gameId}                    ← GameDoc (game state, turn info, log)
  /players/{playerId}             ← PlayerDoc (name, seat, locks, color)
  /private/{playerId}             ← PrivatePlayerDoc (hand, drawn card, known cards)
  /internal/drawPile              ← { cards: Card[] }
  /reveals/{playerId}             ← PlayerScore (end-of-game hand reveal)
  /chat/{messageId}               ← ChatMessage
  /history/{entryId}              ← LogEntry { ts, msg }
  /summary/result                 ← Game analytics summary (written once at end)
  /devAccess/{uid}                ← DevAccessDoc (dev mode activation)

stats/global                      ← { gamesPlayed, totalVisits, lastGameAt }
config/devCode                    ← { code: string } (set via console)
feedback/{docId}                  ← User feedback submissions
```

### Active Listeners Per Page

| Page     | Listeners                                              | Notes                         |
|----------|--------------------------------------------------------|-------------------------------|
| Home     | 0 (getDoc for stats)                                   | Single read, no listener      |
| Lobby    | game doc + players collection + chat (optional)        | 2-3 listeners                 |
| Game     | game doc + players + private doc + chat (lazy mobile)  | 3-4 listeners                 |
| Results  | game doc + players + reveals collection                | 3 listeners                   |

### Transaction Pattern
All game actions use `runTransaction` to atomically read then write. No Cloud Functions.

---

## Supabase Migration Mapping

### Tables (from Firestore collections)

| Firestore Path                    | Supabase Table           | Notes                                    |
|-----------------------------------|--------------------------|------------------------------------------|
| `games/{gameId}`                  | `games`                  | Row per game. JSON column for `log`, `settings`, `spentPowerCardIds` |
| `games/{id}/players/{pid}`        | `game_players`           | FK to games. Row per player-in-game      |
| `games/{id}/private/{pid}`        | `player_private`         | FK to game_players. RLS: own row only    |
| `games/{id}/internal/drawPile`    | `draw_piles`             | FK to games. Single row per game         |
| `games/{id}/reveals/{pid}`        | `game_reveals`           | FK to games. Row per player at end       |
| `games/{id}/chat/{mid}`           | `game_chat`              | FK to games. Row per message             |
| `games/{id}/history/{eid}`        | `game_history`           | FK to games. Row per event               |
| `games/{id}/summary/result`       | `game_summaries`         | FK to games. Single row per game         |
| `stats/global`                    | `global_stats`           | Single row table                         |
| `feedback/{id}`                   | `feedback`               | Row per submission                       |

### Realtime Channels (from Firestore onSnapshot)

| Firestore Listener                   | Supabase Realtime                                |
|--------------------------------------|--------------------------------------------------|
| `onSnapshot(games/{id})`             | `supabase.channel('game:{id}').on('postgres_changes', ...)` on `games` table |
| `onSnapshot(games/{id}/players)`     | Channel on `game_players` filtered by `game_id`  |
| `onSnapshot(games/{id}/private/{p})` | Channel on `player_private` filtered by `game_id` + `player_id` |
| `onSnapshot(games/{id}/reveals)`     | Channel on `game_reveals` filtered by `game_id`  |
| `onSnapshot(games/{id}/chat)`        | Channel on `game_chat` filtered by `game_id`, ordered by `ts` |

### Transactions → RPC / Server Functions

Firestore transactions (read-then-write atomicity) would map to **Supabase RPC functions** (PL/pgSQL):

| Current Transaction        | Supabase Equivalent                          |
|----------------------------|----------------------------------------------|
| `drawFromPile`             | `rpc('draw_from_pile', { game_id, ... })`    |
| `takeFromDiscard`          | `rpc('take_from_discard', { game_id, ... })` |
| `swapWithSlot`             | `rpc('swap_with_slot', { game_id, ... })`    |
| `startGame`                | `rpc('start_game', { game_id })`             |
| All power card functions   | One RPC per power or a generic `rpc('use_power', ...)` |
| `callEnd`                  | `rpc('call_end', { game_id })`               |
| Vote kick operations       | `rpc('vote_kick', { game_id, action, ... })` |

**Key difference**: Firestore transactions are client-side read-then-write. Supabase RPCs run server-side in Postgres, which is actually **more secure** (no client-side game logic manipulation).

### Auth Mapping

| Firebase                  | Supabase                                        |
|---------------------------|-------------------------------------------------|
| Anonymous Auth            | `supabase.auth.signInAnonymously()`             |
| `auth.currentUser.uid`    | `supabase.auth.getUser().data.user.id`          |
| `ensureAuth()`            | Similar wrapper around Supabase auth             |

Supabase has native anonymous auth support. The migration is straightforward.

### Row-Level Security (from Firestore Rules)

| Firestore Rule                           | Supabase RLS Policy                              |
|------------------------------------------|--------------------------------------------------|
| Game read: auth != null                  | `auth.uid() IS NOT NULL`                          |
| Player create: uid == playerId           | `auth.uid() = player_id`                          |
| Private read: auth != null (currently)   | Should tighten to `auth.uid() = player_id`        |
| Chat create: uid matches + text <= 300   | RLS + check constraint on text length             |

**Note**: Current Firestore rules for `/private/{pid}` allow any authenticated user to read — this should be tightened in Supabase to only allow the owning player.

---

## Firebase-Specific Code Locations

### Direct Firestore imports
- `src/lib/firebase.ts` — app init, db, auth, ensureAuth
- `src/lib/gameService.ts` — ALL game data operations (1700+ lines)
- `src/lib/devService.ts` — dev mode subscriptions
- `src/hooks/useGlobalStats.ts` — stats read + visit increment
- `src/hooks/useGame.ts` — core game/players/private subscriptions
- `src/hooks/useChat.ts` — chat subscription
- `src/hooks/useDevMode.ts` — dev mode subscriptions (via devService)
- `src/hooks/useGameHistory.ts` — history pagination
- `src/pages/Results.tsx` — reveals subscription + summary write

### Auth Assumptions (Anonymous Auth)
- `src/lib/firebase.ts:ensureAuth()` — auto anonymous sign-in
- `src/hooks/useAuth.ts` — listens to `onAuthStateChanged`
- All gameService functions call `ensureAuth()` before writes
- User identity is Firebase UID only — no email, no profile

---

## Cleanup Strategy

### Abandoned Lobbies
- Games with `status: 'lobby'` and `createdAt` older than 24 hours should be cleaned up
- Implementation: Scheduled Supabase function or Firebase scheduled Cloud Function (weekly)

### Old Games
- Games with `status: 'finished'` older than 30 days:
  - Keep `summary/result` subcollection (analytics)
  - Delete `chat`, `history`, `private`, `internal`, `reveals`, `players` subcollections
  - Optionally archive game doc to cold storage

### Chat Messages
- Already bounded by query (limit 50 per listener)
- Physical cleanup: delete messages older than 7 days for finished games

### History Subcollection
- Now reduced to important events only (powers, lifecycle, kicks)
- Physical cleanup: safe to delete for games older than 30 days

---

## What Would Still Be Hard to Migrate

1. **Client-side transactions** — The biggest effort. Every `runTransaction` call needs to become a server-side RPC function. There are ~20 transaction-based operations.

2. **Optimistic UI** — Firestore provides local-first caching via `onSnapshot`. Supabase realtime is server-first. Some UI may feel slower without optimistic updates.

3. **Offline support** — Firestore has built-in offline persistence. Supabase does not. For a multiplayer game this is less critical.

4. **Atomic subcollection writes** — Firestore transactions can atomically write to multiple subcollections. In Supabase, this maps naturally to multi-table SQL transactions within RPCs.

---

## Recommended Migration Order

1. Auth (simplest — Supabase anonymous auth is drop-in)
2. Read-only queries (stats, history pagination)
3. Simple writes (chat, feedback)
4. Game lifecycle RPCs (create, join, start)
5. Turn action RPCs (draw, swap, discard)
6. Power RPCs (peek, lock, unlock, chaos, swap power)
7. Real-time subscriptions (game doc, players, private)
8. Decommission Firestore
