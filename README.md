# Lucky Seven™ — Online Multiplayer Card Game

A real-time multiplayer card game for 2-8 players, built by Kamal Hazriq. Hosted on GitHub Pages with Supabase as the backend. Lowest score wins — and Sevens are worth zero!

## Game Rules

- **Deck**: 52 standard cards + 2 Jokers = 54 cards
- **Deal**: 3 cards face-down per player. You cannot look at your own cards (unless you peek)
- **On your turn**:
  1. **Draw** from the draw pile (only you see it) OR take the top discard card (visible to all)
  2. **Swap** the drawn card with one of your 3 face-down cards, **discard** it, or **use its power**
- **Scoring**: Ace=1, 2-6=face value, **7=0**, 8-10=face value, J/Q/K/Joker=10
- **Winner**: Lowest score wins. Tiebreaker: most 7s.

### Power Cards

| Card | Power | Effect |
|------|-------|--------|
| **Jack** | Peek | Secretly look at one of your own face-down cards |
| **Queen** | Swap | Swap any two unlocked cards between any players |
| **King** | Lock | Lock any unlocked card — it cannot be swapped |
| **10** | Key | Unlock a locked card |
| **Joker** | Chaos | Randomly shuffle another player's unlocked cards |

When you use a power card, it gets discarded after the effect resolves. You can always choose to swap or discard a power card instead of using its ability.

### Lock Mechanics

- Locked cards show a red lock icon and **cannot** be swapped (by you, Queen, or Joker).
- A Joker's Chaos only shuffles the target player's **unlocked** cards.
- Use a 10 (Key) to unlock any locked card.

### Ending the Game

The game ends when the **pile of cards reaches 0** or when the pile is fully finished.
Once this happens, all players reveal their cards and the scores are calculated.
The player with the **lowest total score wins**.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Row Level Security + Realtime + Anonymous Auth)
- **Animations**: Motion (motion/react)
- **Hosting**: GitHub Pages (static)

## Setup

### 1. Create a Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to **Authentication > Providers** and ensure **Anonymous Sign-ins** is enabled
4. Note your project URL and anon key from **Settings > API**

### 2. Run Database Migrations

Apply the SQL migrations in order from the `supabase/migrations/` directory:

```bash
# Using Supabase CLI (recommended)
supabase link --project-ref your-project-ref
supabase db push
```

Or manually run each migration file (`00001_create_tables.sql` through `00009_remaining_rpcs.sql`) in the **SQL Editor** in your Supabase dashboard.

### 3. Seed Dev Config (Optional)

If you want dev mode access, insert a row into the `dev_config` table:

```sql
INSERT INTO dev_config (id, code, owner_code) VALUES (1, 'your-shared-code', 'your-owner-code');
```

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in your Supabase values in `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run Locally

```bash
npm install
npm run dev
```

Open http://localhost:5173/lucky-seven/

### 6. Deploy to GitHub Pages (Automatic via GitHub Actions)

Deployment is fully automated. Every push to `main` triggers a GitHub Actions workflow that builds and deploys to GitHub Pages.

**One-time setup:**

1. Go to your GitHub repo **Settings > Pages**
2. Under "Build and deployment", set **Source** to **GitHub Actions**
3. Go to **Settings > Secrets and variables > Actions**
4. Add these **Repository secrets**:

| Secret Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

After setup, every `git push origin main` will auto-deploy. You can also trigger a manual deploy from the **Actions** tab using "Run workflow".

**Your live URL will be:** `https://<your-username>.github.io/lucky-seven/`

> **Note:** The app uses `HashRouter` so all routes work correctly on GitHub Pages without a custom 404 page. URLs look like `https://user.github.io/lucky-seven/#/game/abc123`.

## Project Structure

```
src/
├── lib/
│   ├── supabase.ts             # Supabase client + anonymous auth
│   ├── supabaseGameService.ts  # All Supabase RPC operations
│   ├── supabaseMappers.ts      # snake_case ↔ camelCase mapping
│   ├── types.ts                # TypeScript interfaces + power types
│   ├── deck.ts                 # Card deck, shuffle, scoring logic
│   └── sfx.ts                  # WebAudio oscillator-based sound effects
├── hooks/
│   ├── useAuth.ts              # Supabase anonymous auth hook
│   ├── useGame.ts              # Real-time game state subscriptions
│   ├── useDevMode.ts           # Dev mode activation/subscriptions
│   ├── useGameHistory.ts       # Paginated game history (offset-based)
│   ├── useGlobalStats.ts       # Global stats (games played, visits)
│   ├── useTheme.ts             # Theme switcher (blue/dark/light)
│   └── useReducedMotion.ts     # Reduced motion preference (system/on/off)
├── components/
│   ├── CardView.tsx            # Card component (face-up/face-down, lock indicator)
│   ├── PlayerPanel.tsx         # Player's card area with lock state
│   ├── GameLog.tsx             # Action log feed
│   ├── GameSettings.tsx        # Toolbar settings (theme, motion, sound)
│   ├── DrawnCardModal.tsx      # Modal when you draw a card (swap/discard/power)
│   ├── FeedbackModal.tsx       # User feedback submission
│   ├── StagingSlot.tsx         # "In play" card staging area
│   └── HowToPlay.tsx          # Rules reference modal
├── pages/
│   ├── Home.tsx                # Create or join game
│   ├── Lobby.tsx               # Waiting room with join code
│   ├── Game.tsx                # Main game board with power flows
│   └── Results.tsx             # Final scores and winner
├── App.tsx                     # Router (HashRouter)
├── main.tsx                    # Entry point
└── index.css                   # Tailwind + theme CSS custom properties
supabase/
└── migrations/                 # SQL migrations (00001–00009)
.github/
└── workflows/
    └── deploy.yml              # GitHub Actions: build + deploy to Pages
```

## Database Architecture

All game state is stored in PostgreSQL via Supabase with Row Level Security (RLS) enforcing access control.

### Tables

| Table | Purpose |
|-------|---------|
| `games` | Game metadata, turn state, settings |
| `game_players` | Player info (name, seat, locks, connected) |
| `game_private_state` | Secret hand data (only readable by owner) |
| `game_internal` | Draw pile (not readable by normal clients) |
| `game_reveals` | End-game hand reveals |
| `game_history` | Action log entries |
| `game_chat` | Chat messages |
| `game_summary` | Post-game scores and stats |
| `dev_access` | Dev mode access grants |
| `dev_config` | Dev access codes (singleton) |
| `feedback` | User feedback submissions |
| `global_stats` | Games played / visit counters |

### Security Model

- **Anonymous Auth**: Players sign in automatically via Supabase Anonymous Auth — no account needed
- **SECURITY DEFINER RPCs**: All write operations go through PostgreSQL functions with `SECURITY DEFINER`, enforcing turn order, validation, and business rules server-side
- **Row Level Security**: `game_private_state` is only readable by `auth.uid() = player_id`; `game_internal` has zero normal client read access
- **Pessimistic locking**: RPCs use `SELECT ... FOR UPDATE` to prevent race conditions
- **Action versioning**: Every action increments `action_version` to prevent double-applies
- **No card leaking**: Only draw pile count and discard top are shown publicly. Other players' cards are face-down
- **Reveal pattern**: At game end, each player writes their own hand to `game_reveals` so results can be displayed without cross-player private reads

## Multi-Game Concurrency

Multiple games can run simultaneously without interference:

- **Game isolation**: All data is scoped by `game_id` foreign keys. There is zero shared mutable state between games.
- **Scoped subscriptions**: The `useGame` hook subscribes only to the specific `gameId` from the URL. Navigating between games cleanly unsubscribes/resubscribes.
- **Unique join codes**: 6-character alphanumeric codes (36^6 = ~2.2 billion possibilities). On creation, the code is verified to be unique among active lobby games.
- **Anonymous auth**: Each browser tab gets its own anonymous UID. A player can have multiple tabs open in different games simultaneously.
- **Real-time**: All updates use Supabase Realtime (Postgres Changes), not client polling.

### License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

You may view, study, and modify the code for personal or educational use.

Commercial use, redistribution for profit, or selling derivative works based on this project is strictly prohibited without permission from the author.
