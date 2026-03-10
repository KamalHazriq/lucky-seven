# Lucky Seven™ — Online Multiplayer Card Game

A real-time multiplayer card game for 2-8 players, built by Kamal Hazriq. Hosted on GitHub Pages with Firebase as the backend. Lowest score wins — and Sevens are worth zero!

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
- **Backend**: Firebase (Firestore real-time database + Anonymous Auth)
- **Animations**: Framer Motion
- **Hosting**: GitHub Pages (static)

## Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (disable Google Analytics if you want)
3. Go to **Build > Firestore Database** and create a database (start in **test mode** for now)
4. Go to **Build > Authentication > Sign-in method** and enable **Anonymous** sign-in
5. Go to **Project Settings > General** and scroll to "Your apps"
6. Click **Add app** > **Web** (</>) and register your app
7. Copy the Firebase config values

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in your Firebase config values in `.env`:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### 3. Deploy Firestore Security Rules

Copy the contents of `firestore.rules` into your Firebase Console:

1. Go to **Firestore Database > Rules**
2. Replace the default rules with the contents of `firestore.rules`
3. Click **Publish**

Or use the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore  # select your project
firebase deploy --only firestore:rules
```

### 4. Create a Firestore Index

The join-by-code feature requires a composite index. Create it in Firebase Console:

1. Go to **Firestore Database > Indexes**
2. Click **Add Index** (Composite)
3. Collection: `games`
4. Fields: `joinCode` (Ascending), `status` (Ascending)
5. Query scope: Collection
6. Click **Create**

Alternatively, the first time you try to join a game by code, Firebase will show an error with a direct link to create the index automatically.

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
4. Add these **Repository secrets** (values from your `.env` file):

| Secret Name | Value |
|---|---|
| `VITE_FIREBASE_API_KEY` | Your Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Your sender ID |
| `VITE_FIREBASE_APP_ID` | Your Firebase app ID |

5. Go to **Firebase Console > Authentication > Settings > Authorized domains**
6. Add `<your-username>.github.io` to the authorized domains list

After setup, every `git push origin main` will auto-deploy. You can also trigger a manual deploy from the **Actions** tab using "Run workflow".

**Your live URL will be:** `https://<your-username>.github.io/lucky-seven/`

> **Note:** The app uses `HashRouter` so all routes work correctly on GitHub Pages without a custom 404 page. URLs look like `https://user.github.io/lucky-seven/#/game/abc123`.

## Project Structure

```
src/
├── lib/
│   ├── firebase.ts          # Firebase init + anonymous auth
│   ├── types.ts             # TypeScript interfaces + power types
│   ├── deck.ts              # Card deck, shuffle, scoring logic
│   ├── gameService.ts       # All Firestore operations (transactions)
│   └── sfx.ts               # WebAudio oscillator-based sound effects
├── hooks/
│   ├── useAuth.ts           # Firebase auth hook
│   ├── useGame.ts           # Real-time game state subscriptions
│   ├── useTheme.ts          # Theme switcher (blue/dark/light)
│   └── useReducedMotion.ts  # Reduced motion preference (system/on/off)
├── components/
│   ├── CardView.tsx          # Card component (face-up/face-down, lock indicator)
│   ├── PlayerPanel.tsx       # Player's card area with lock state
│   ├── GameLog.tsx           # Action log feed
│   ├── GameSettings.tsx      # Toolbar settings (theme, motion, sound)
│   ├── DrawnCardModal.tsx    # Modal when you draw a card (swap/discard/power)
│   ├── PeekModal.tsx         # Jack: select which card to peek
│   ├── PeekResultModal.tsx   # Jack: shows peeked card result
│   ├── QueenSwapModal.tsx    # Queen: select two cards to swap
│   ├── SlotPickerModal.tsx   # King/10: select a card slot to lock/unlock
│   ├── JokerChaosModal.tsx   # Joker: select target player for chaos
│   ├── Tooltip.tsx           # Reusable tooltip component
│   └── HowToPlay.tsx        # Rules reference modal
├── pages/
│   ├── Home.tsx              # Create or join game
│   ├── Lobby.tsx             # Waiting room with join code
│   ├── Game.tsx              # Main game board with power flows
│   └── Results.tsx           # Final scores and winner
├── App.tsx                   # Router (HashRouter)
├── main.tsx                  # Entry point
└── index.css                 # Tailwind + theme CSS custom properties
.github/
└── workflows/
    └── deploy.yml            # GitHub Actions: build + deploy to Pages
```

## Firestore Data Model

```
games/{gameId}
  ├── status: "lobby" | "active" | "ending" | "finished"
  ├── hostId, createdAt, maxPlayers, seed, joinCode
  ├── currentTurnPlayerId, turnPhase: "draw" | "action"
  ├── drawPileCount, discardTop (Card)
  ├── playerOrder: string[], log: LogEntry[]
  ├── endCalledBy, endRoundStartSeatIndex
  ├── actionVersion, lastActionAt
  ├── settings: { powerAssignments, jokerCount }
  ├── spentPowerCardIds: Record<cardId, true>
  │
  ├── players/{playerId}     (public: name, seat, connected, locks, lockedBy)
  ├── private/{playerId}     (secret: hand[], drawnCard, drawnCardSource, known{})
  ├── reveals/{playerId}     (end-game: each player reveals their hand)
  └── internal/
      └── drawPile           (cards array)
```

## Multi-Game Concurrency

Multiple games can run simultaneously without interference:

- **Game isolation**: All data lives under `games/{gameId}/` — each game has its own players, private hands, draw pile, and reveals subcollections. There is zero shared mutable state between games.
- **Scoped subscriptions**: The `useGame` hook subscribes only to the specific `gameId` from the URL. Navigating between games cleanly unsubscribes/resubscribes.
- **Unique join codes**: 6-character alphanumeric codes (36^6 = ~2.2 billion possibilities). On creation, the code is verified to be unique among active lobby games with automatic retry (up to 5 attempts).
- **Transaction safety**: All game-mutating operations (draw, swap, discard, powers, cancel draw, call end) use Firestore transactions scoped to a single `games/{gameId}` document tree, preventing race conditions.
- **Anonymous auth**: Each browser tab gets its own anonymous UID. A player can have multiple tabs open in different games simultaneously.

## Security Model

- **Anonymous Auth**: Players sign in automatically, no account needed
- **Turn validation**: Game actions use Firestore transactions to enforce turn order and rules
- **Action versioning**: Every action increments `actionVersion` to prevent double-applies
- **Private data**: Hand contents stored in `private/{playerId}` docs. Client-side only subscribes to own private doc. Cross-player reads happen within server-side Firestore transactions (for Queen swap and Joker chaos powers).
- **No card leaking in UI**: Only draw pile count and discard top are shown publicly. Other players' cards are face-down.
- **Reveal pattern**: At game end, each player writes their own hand to `reveals/{playerId}` so results can be displayed without cross-player private reads.

## Quota Notes (Firebase Free Tier)

Lucky Seven is designed to run comfortably within Firebase's free Spark plan.

### Write Budget per Game

| Action | Writes | Notes |
|--------|--------|-------|
| Turn action (draw/swap/discard/power) | 2-4 | Game doc + private doc(s) |
| Chat message | 1 | Single doc in `chat` subcollection |
| Presence update | 1 | Throttled to 1 write per 60 seconds |
| Game summary (on finish) | 2 | Summary doc + global stats counter |

**Typical 4-player game (~40 turns):** ~120-160 writes total.

### Safeguards

- **Bounded logs**: Game log capped at 50 entries; older entries pruned on each write.
- **Chat limit**: Query limited to last 50 messages (`orderBy ts desc, limit 50`).
- **Presence throttle**: Connection writes throttled to once per 60s. Disconnects always write immediately.
- **Lazy chat subscription**: Mobile users don't subscribe to chat until they open the panel. Desktop subscribes after first render (not on component mount).
- **Single discard top**: Only the current discard card is stored (no discard history array).
- **One summary per game**: Analytics written once by host when all players reveal.
- **No polling**: All real-time updates use Firestore `onSnapshot` listeners (server push), not client polling.

### Scaling Estimates (Spark Plan: 50K reads / 20K writes per day)

| Scale | Games/Day | Est. Writes/Day | Status |
|-------|-----------|-----------------|--------|
| ~50 games | 50 | ~8K | Comfortable on free tier |
| ~200 games | 200 | ~32K | Approaching limit, consider Blaze |
| ~500+ games | 500+ | ~80K+ | Requires Blaze (pay-as-you-go) |

### License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International License.

You may view, study, and modify the code for personal or educational use.

Commercial use, redistribution for profit, or selling derivative works based on this project is strictly prohibited without permission from the author.
