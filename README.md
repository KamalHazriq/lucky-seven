# Lucky Seven - Online Multiplayer Card Game

A real-time multiplayer card game for 2-6 players, hosted on GitHub Pages with Firebase as the backend. Lowest score wins — and Sevens are worth zero!

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

### Ending the Game

Any player can call **"End Game"** on their turn. When called, every other player gets **one final turn** to finish the round, then all cards are revealed and scored.

The game also ends immediately if the draw pile runs out.

### Lock Mechanics

- Locked cards show a red lock icon and **cannot** be swapped (by you, Queen, or Joker).
- A Joker's Chaos only shuffles the target player's **unlocked** cards.
- Use a 10 (Key) to unlock any locked card.

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

### 6. Deploy to GitHub Pages

Update `vite.config.ts` base path if your repo name differs:

```ts
export default defineConfig({
  base: '/your-repo-name/',
  // ...
})
```

Also update the `basename` in `src/main.tsx` to match.

Then deploy:

```bash
npm run deploy
```

This builds the app and publishes to the `gh-pages` branch. Make sure GitHub Pages is configured to serve from the `gh-pages` branch in your repo settings.

## Project Structure

```
src/
├── lib/
│   ├── firebase.ts          # Firebase init + anonymous auth
│   ├── types.ts             # TypeScript interfaces + power types
│   ├── deck.ts              # Card deck, shuffle, scoring logic
│   └── gameService.ts       # All Firestore operations (transactions)
├── hooks/
│   ├── useAuth.ts           # Firebase auth hook
│   └── useGame.ts           # Real-time game state subscriptions
├── components/
│   ├── CardView.tsx          # Card component (face-up/face-down, lock indicator)
│   ├── PlayerPanel.tsx       # Player's card area with lock state
│   ├── GameLog.tsx           # Action log feed
│   ├── DrawnCardModal.tsx    # Modal when you draw a card (swap/discard/power)
│   ├── PeekModal.tsx         # Jack: select which card to peek
│   ├── PeekResultModal.tsx   # Jack: shows peeked card result
│   ├── QueenSwapModal.tsx    # Queen: select two cards to swap
│   ├── SlotPickerModal.tsx   # King/10: select a card slot to lock/unlock
│   ├── JokerChaosModal.tsx   # Joker: select target player for chaos
│   └── HowToPlay.tsx        # Rules reference modal
├── pages/
│   ├── Home.tsx              # Create or join game
│   ├── Lobby.tsx             # Waiting room with join code
│   ├── Game.tsx              # Main game board with power flows
│   └── Results.tsx           # Final scores and winner
├── App.tsx                   # Router
├── main.tsx                  # Entry point
└── index.css                 # Tailwind + custom styles
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
  │
  ├── players/{playerId}     (public: name, seat, connected, locks)
  ├── private/{playerId}     (secret: hand[], drawnCard, known{})
  ├── reveals/{playerId}     (end-game: each player reveals their hand)
  └── internal/
      └── drawPile           (cards array)
```

## Security Model

- **Anonymous Auth**: Players sign in automatically, no account needed
- **Turn validation**: Game actions use Firestore transactions to enforce turn order and rules
- **Action versioning**: Every action increments `actionVersion` to prevent double-applies
- **Private data**: Hand contents stored in `private/{playerId}` docs. Client-side only subscribes to own private doc. Cross-player reads happen within server-side Firestore transactions (for Queen swap and Joker chaos powers).
- **No card leaking in UI**: Only draw pile count and discard top are shown publicly. Other players' cards are face-down.
- **Reveal pattern**: At game end, each player writes their own hand to `reveals/{playerId}` so results can be displayed without cross-player private reads.
