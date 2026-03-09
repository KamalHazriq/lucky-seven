import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  runTransaction,
  onSnapshot,
  arrayUnion,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db, ensureAuth } from './firebase'
import { buildDeck, shuffleDeck, scoreHand } from './deck'
import type { GameDoc, PlayerDoc, PrivatePlayerDoc, Card, LogEntry, PlayerScore } from './types'
import { nanoid } from 'nanoid'

function gameRef(gameId: string) {
  return doc(db, 'games', gameId)
}
function playerRef(gameId: string, playerId: string) {
  return doc(db, 'games', gameId, 'players', playerId)
}
function privateRef(gameId: string, playerId: string) {
  return doc(db, 'games', gameId, 'private', playerId)
}
function drawPileRef(gameId: string) {
  return doc(db, 'games', gameId, 'internal', 'drawPile')
}

function logEntry(msg: string): LogEntry {
  return { ts: Date.now(), msg }
}

// ─── Create Game ────────────────────────────────────────────────
export async function createGame(displayName: string, maxPlayers: number): Promise<string> {
  const user = await ensureAuth()
  const gameId = nanoid(8)
  const joinCode = nanoid(6).toUpperCase()
  const seed = nanoid(12)

  const gameData: GameDoc = {
    status: 'lobby',
    hostId: user.uid,
    createdAt: Date.now(),
    maxPlayers,
    currentTurnPlayerId: null,
    drawPileCount: 0,
    discardTop: null,
    seed,
    endCalledBy: null,
    log: [logEntry(`Game created by ${displayName}`)],
    turnPhase: null,
    playerOrder: [user.uid],
    joinCode,
  }

  const playerData: PlayerDoc = {
    displayName,
    seatIndex: 0,
    connected: true,
  }

  const privateData: PrivatePlayerDoc = {
    hand: [],
    drawnCard: null,
    known: {},
  }

  await setDoc(gameRef(gameId), gameData)
  await setDoc(playerRef(gameId, user.uid), playerData)
  await setDoc(privateRef(gameId, user.uid), privateData)

  return gameId
}

// ─── Join Game ──────────────────────────────────────────────────
export async function joinGame(gameId: string, displayName: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'lobby') throw new Error('Game already started')
    if (game.playerOrder.includes(user.uid)) return
    if (game.playerOrder.length >= game.maxPlayers) throw new Error('Game is full')

    // ── ALL WRITES AFTER ──
    tx.update(gameRef(gameId), {
      playerOrder: [...game.playerOrder, user.uid],
      log: [...game.log, logEntry(`${displayName} joined`)].slice(-50),
    })

    tx.set(playerRef(gameId, user.uid), {
      displayName,
      seatIndex: game.playerOrder.length,
      connected: true,
    } satisfies PlayerDoc)

    tx.set(privateRef(gameId, user.uid), {
      hand: [],
      drawnCard: null,
      known: {},
    } satisfies PrivatePlayerDoc)
  })
}

// ─── Start Game ─────────────────────────────────────────────────
// The host deals cards. Since the host CANNOT read other players' private
// docs (security rules), we use tx.set() to overwrite them directly.
// No prior read of private docs is needed — we're setting fresh data.
export async function startGame(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ── (only the game doc, which is public)
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.hostId !== user.uid) throw new Error('Only host can start')
    if (game.status !== 'lobby') throw new Error('Game already started')
    if (game.playerOrder.length < 2) throw new Error('Need at least 2 players')

    // ── ALL WRITES AFTER ──
    const deck = shuffleDeck(buildDeck(), game.seed)
    const playerCount = game.playerOrder.length
    const cardsNeeded = playerCount * 3

    // Deal 3 cards to each player using set() — no read needed
    for (let i = 0; i < playerCount; i++) {
      const pid = game.playerOrder[i]
      const hand = deck.slice(i * 3, i * 3 + 3)
      tx.set(privateRef(gameId, pid), {
        hand,
        drawnCard: null,
        known: {},
      } satisfies PrivatePlayerDoc)
    }

    const remaining = deck.slice(cardsNeeded)
    const discardCard = remaining.shift()!

    tx.set(drawPileRef(gameId), { cards: remaining })

    tx.update(gameRef(gameId), {
      status: 'active',
      drawPileCount: remaining.length,
      discardTop: discardCard,
      currentTurnPlayerId: game.playerOrder[0],
      turnPhase: 'draw',
      log: [...game.log, logEntry('Game started! Cards dealt.')].slice(-50),
    })
  })
}

// ─── Draw from Pile ─────────────────────────────────────────────
export async function drawFromPile(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const pileSnap = await tx.get(drawPileRef(gameId))
    const pile = pileSnap.data()?.cards as Card[]

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // Also read own private doc (needed before writing to it)
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const _priv = privSnap.data() as PrivatePlayerDoc

    // ── VALIDATE ──
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'draw') throw new Error('Already drew a card')
    if (game.status !== 'active') throw new Error('Game not active')
    if (!pile || pile.length === 0) throw new Error('Draw pile is empty')

    // ── ALL WRITES AFTER ──
    const drawn = pile[0]
    const newPile = pile.slice(1)

    tx.update(drawPileRef(gameId), { cards: newPile })
    tx.update(privateRef(gameId, user.uid), { drawnCard: drawn })
    tx.update(gameRef(gameId), {
      drawPileCount: newPile.length,
      turnPhase: 'action',
      log: arrayUnion(logEntry(`${pName} drew from the pile`)),
    })

    void _priv // satisfy lint
  })
}

// ─── Take from Discard ──────────────────────────────────────────
export async function takeFromDiscard(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // ── VALIDATE ──
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'draw') throw new Error('Already drew a card')
    if (game.status !== 'active') throw new Error('Game not active')
    if (!game.discardTop) throw new Error('No discard card')

    // ── ALL WRITES AFTER ──
    tx.update(privateRef(gameId, user.uid), { drawnCard: game.discardTop })
    tx.update(gameRef(gameId), {
      discardTop: null,
      turnPhase: 'action',
      log: arrayUnion(logEntry(`${pName} took from discard`)),
    })
  })
}

// ─── Swap with Slot ─────────────────────────────────────────────
export async function swapWithSlot(gameId: string, slotIndex: number): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // ── VALIDATE ──
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    if (slotIndex < 0 || slotIndex >= priv.hand.length) throw new Error('Invalid slot')

    // ── ALL WRITES AFTER ──
    const oldCard = priv.hand[slotIndex]
    const newHand = [...priv.hand]
    newHand[slotIndex] = priv.drawnCard

    const newKnown = { ...priv.known }
    newKnown[String(slotIndex)] = priv.drawnCard

    tx.update(privateRef(gameId, user.uid), {
      hand: newHand,
      drawnCard: null,
      known: newKnown,
    })

    const nextPlayer = getNextPlayer(game.playerOrder, user.uid)

    tx.update(gameRef(gameId), {
      discardTop: oldCard,
      currentTurnPlayerId: nextPlayer,
      turnPhase: 'draw',
      log: arrayUnion(logEntry(`${pName} swapped card #${slotIndex + 1}`)),
    })
  })
}

// ─── Discard Drawn Card ─────────────────────────────────────────
export async function discardDrawn(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // ── VALIDATE ──
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')

    // ── ALL WRITES AFTER ──
    const nextPlayer = getNextPlayer(game.playerOrder, user.uid)

    tx.update(privateRef(gameId, user.uid), { drawnCard: null })
    tx.update(gameRef(gameId), {
      discardTop: priv.drawnCard,
      currentTurnPlayerId: nextPlayer,
      turnPhase: 'draw',
      log: arrayUnion(logEntry(`${pName} discarded`)),
    })
  })
}

// ─── Use Jack Peek ──────────────────────────────────────────────
export async function useJackPeek(gameId: string, slotIndex: number): Promise<Card> {
  const user = await ensureAuth()
  let peekedCard: Card | null = null

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // ── VALIDATE ──
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    if (priv.drawnCard.rank !== 'J' || priv.drawnCard.isJoker) throw new Error('Drawn card is not a Jack')

    // ── ALL WRITES AFTER ──
    peekedCard = priv.hand[slotIndex]
    const newKnown = { ...priv.known }
    newKnown[String(slotIndex)] = peekedCard

    const nextPlayer = getNextPlayer(game.playerOrder, user.uid)

    tx.update(privateRef(gameId, user.uid), {
      drawnCard: null,
      known: newKnown,
    })

    tx.update(gameRef(gameId), {
      discardTop: priv.drawnCard,
      currentTurnPlayerId: nextPlayer,
      turnPhase: 'draw',
      log: arrayUnion(logEntry(`${pName} used Jack to peek at card #${slotIndex + 1}`)),
    })
  })

  return peekedCard!
}

// ─── Call End ────────────────────────────────────────────────────
// When a player calls end, we can't read other players' private docs
// (security rules prevent it). Instead, each player reveals their hand
// by writing it to a shared results area. For MVP, we use a two-step approach:
// Step 1: Mark game as 'ending' so all clients know to reveal.
// Step 2: Each client writes their own hand to results.
// But for simplicity, we'll use a workaround: the internal/drawPile doc
// already has all the cards info, and the game doc has the seed.
// We can reconstruct all hands from the seed + action log.
//
// SIMPLER APPROACH: Since we store hands in private docs that only each
// player can read, for callEnd we'll mark the game finished and have
// each player's client write their own hand to a shared reveal doc.
export async function callEnd(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ── ALL READS FIRST ──
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    // Read own private state
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc

    // ── VALIDATE ──
    if (game.status !== 'active') throw new Error('Game not active')
    if (!game.playerOrder.includes(user.uid)) throw new Error('Not in game')

    // ── ALL WRITES AFTER ──
    tx.update(gameRef(gameId), {
      status: 'finished',
      endCalledBy: user.uid,
      currentTurnPlayerId: null,
      turnPhase: null,
      log: arrayUnion(logEntry(`${pName} called END! Revealing all cards...`)),
    })

    // Write own hand reveal
    const { total, sevens } = scoreHand(priv.hand)
    tx.set(doc(db, 'games', gameId, 'reveals', user.uid), {
      playerId: user.uid,
      displayName: pName,
      hand: priv.hand,
      total,
      sevens,
    })
  })
}

// ─── Reveal Hand (called by each player when game becomes finished) ──
export async function revealHand(gameId: string): Promise<void> {
  const user = await ensureAuth()

  // Read own private state directly (not in transaction)
  const privSnap = await getDoc(privateRef(gameId, user.uid))
  if (!privSnap.exists()) return
  const priv = privSnap.data() as PrivatePlayerDoc

  const playerSnap = await getDoc(playerRef(gameId, user.uid))
  if (!playerSnap.exists()) return
  const player = playerSnap.data() as PlayerDoc

  const { total, sevens } = scoreHand(priv.hand)

  await setDoc(doc(db, 'games', gameId, 'reveals', user.uid), {
    playerId: user.uid,
    displayName: player.displayName,
    hand: priv.hand,
    total,
    sevens,
  })
}

// ─── Get Results (reads from reveals subcollection) ─────────────
export async function getResults(gameId: string): Promise<PlayerScore[]> {
  const snap = await getDocs(collection(db, 'games', gameId, 'reveals'))
  const scores: PlayerScore[] = []
  snap.forEach((d) => {
    scores.push(d.data() as PlayerScore)
  })
  scores.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total
    return b.sevens - a.sevens
  })
  return scores
}

// ─── Helper: Next Player ────────────────────────────────────────
function getNextPlayer(playerOrder: string[], currentId: string): string {
  const idx = playerOrder.indexOf(currentId)
  return playerOrder[(idx + 1) % playerOrder.length]
}

// ─── Subscriptions ──────────────────────────────────────────────
export function subscribeGame(gameId: string, cb: (game: GameDoc) => void): Unsubscribe {
  return onSnapshot(gameRef(gameId), (snap) => {
    if (snap.exists()) cb(snap.data() as GameDoc)
  })
}

export function subscribePlayers(
  gameId: string,
  cb: (players: Record<string, PlayerDoc>) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'games', gameId, 'players'), (snap) => {
    const players: Record<string, PlayerDoc> = {}
    snap.forEach((d) => {
      players[d.id] = d.data() as PlayerDoc
    })
    cb(players)
  })
}

export function subscribePrivate(
  gameId: string,
  playerId: string,
  cb: (priv: PrivatePlayerDoc) => void
): Unsubscribe {
  return onSnapshot(privateRef(gameId, playerId), (snap) => {
    if (snap.exists()) cb(snap.data() as PrivatePlayerDoc)
  })
}

export function subscribeReveals(
  gameId: string,
  cb: (scores: PlayerScore[]) => void
): Unsubscribe {
  return onSnapshot(collection(db, 'games', gameId, 'reveals'), (snap) => {
    const scores: PlayerScore[] = []
    snap.forEach((d) => {
      scores.push(d.data() as PlayerScore)
    })
    scores.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total
      return b.sevens - a.sevens
    })
    cb(scores)
  })
}

export async function findGameByCode(joinCode: string): Promise<string | null> {
  const q = query(
    collection(db, 'games'),
    where('joinCode', '==', joinCode),
    where('status', '==', 'lobby'),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0].id
}

export async function updatePresence(gameId: string, connected: boolean): Promise<void> {
  const user = await ensureAuth()
  await updateDoc(playerRef(gameId, user.uid), { connected })
}
