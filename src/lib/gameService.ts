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
  increment,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore'
import { db, ensureAuth } from './firebase'
import { buildDeck, shuffleDeck, scoreHand } from './deck'
import type {
  GameDoc,
  PlayerDoc,
  PrivatePlayerDoc,
  Card,
  LogEntry,
  PlayerScore,
  GameSettings,
  LockInfo,
  PowerEffectType,
  PowerRankKey,
  ChatMessage,
} from './types'
import { DEFAULT_GAME_SETTINGS, EMPTY_LOCK_INFO, getCardRankKey } from './types'
import { nanoid } from 'nanoid'
import seedrandom from 'seedrandom'

// ─── Refs ───────────────────────────────────────────────────────
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

function boundLog(log: LogEntry[], newEntry: LogEntry): LogEntry[] {
  const updated = [...log, newEntry]
  return updated.length > 50 ? updated.slice(-50) : updated
}

// ─── Turn advancement with ending-round logic ──────────────────
function advanceTurn(game: GameDoc, currentPlayerId: string): {
  nextPlayerId: string
  shouldFinish: boolean
} {
  const idx = game.playerOrder.indexOf(currentPlayerId)
  const nextIdx = (idx + 1) % game.playerOrder.length

  if (game.status === 'ending' && game.endRoundStartSeatIndex !== null) {
    if (nextIdx === game.endRoundStartSeatIndex) {
      return { nextPlayerId: game.playerOrder[nextIdx], shouldFinish: true }
    }
  }

  return { nextPlayerId: game.playerOrder[nextIdx], shouldFinish: false }
}

// Helper to build end-of-turn game updates
function buildEndTurnUpdates(
  game: GameDoc,
  currentPlayerId: string,
  discardCard: Card,
  logMsg: string,
): Record<string, unknown> {
  const { nextPlayerId, shouldFinish } = advanceTurn(game, currentPlayerId)

  const updates: Record<string, unknown> = {
    discardTop: discardCard,
    currentTurnPlayerId: shouldFinish ? null : nextPlayerId,
    turnPhase: shouldFinish ? null : 'draw',
    actionVersion: game.actionVersion + 1,
    lastActionAt: Date.now(),
    log: arrayUnion(logEntry(logMsg)),
  }

  if (shouldFinish) {
    updates.status = 'finished'
  } else if (game.drawPileCount === 0 && game.status !== 'ending') {
    updates.status = 'finished'
    updates.currentTurnPlayerId = null
    updates.turnPhase = null
  }

  return updates
}

const EMPTY_LOCKED_BY: [LockInfo, LockInfo, LockInfo] = [EMPTY_LOCK_INFO, EMPTY_LOCK_INFO, EMPTY_LOCK_INFO]

// ─── Unique join code helper ────────────────────────────────────
async function generateUniqueJoinCode(maxAttempts = 5): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = nanoid(6).toUpperCase()
    const q = query(
      collection(db, 'games'),
      where('joinCode', '==', code),
      where('status', '==', 'lobby'),
    )
    const snap = await getDocs(q)
    if (snap.empty) return code
  }
  throw new Error('Unable to generate unique join code. Please try again.')
}

// ─── Create Game ────────────────────────────────────────────────
export async function createGame(
  displayName: string,
  maxPlayers: number,
  settings?: Partial<GameSettings>,
): Promise<string> {
  const user = await ensureAuth()
  const gameId = nanoid(8)
  const joinCode = await generateUniqueJoinCode()
  const seed = nanoid(12)

  const gameSettings: GameSettings = {
    powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
    jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
    deckSize: settings?.deckSize ?? DEFAULT_GAME_SETTINGS.deckSize,
  }

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
    endRoundStartSeatIndex: null,
    log: [logEntry(`Game created by ${displayName}`)],
    turnPhase: null,
    playerOrder: [user.uid],
    joinCode,
    actionVersion: 0,
    lastActionAt: Date.now(),
    settings: gameSettings,
    spentPowerCardIds: {},
  }

  const playerData: PlayerDoc = {
    displayName,
    seatIndex: 0,
    connected: true,
    locks: [false, false, false],
    lockedBy: [...EMPTY_LOCKED_BY],
  }

  const privateData: PrivatePlayerDoc = {
    hand: [],
    drawnCard: null,
    drawnCardSource: null,
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
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'lobby') throw new Error('Game already started')
    if (game.playerOrder.includes(user.uid)) return
    if (game.playerOrder.length >= game.maxPlayers) throw new Error('Game is full')

    tx.update(gameRef(gameId), {
      playerOrder: [...game.playerOrder, user.uid],
      log: boundLog(game.log, logEntry(`${displayName} joined`)),
    })

    tx.set(playerRef(gameId, user.uid), {
      displayName,
      seatIndex: game.playerOrder.length,
      connected: true,
      locks: [false, false, false],
      lockedBy: [...EMPTY_LOCKED_BY],
    } satisfies PlayerDoc)

    tx.set(privateRef(gameId, user.uid), {
      hand: [],
      drawnCard: null,
      drawnCardSource: null,
      known: {},
    } satisfies PrivatePlayerDoc)
  })
}

// ─── Start Game ─────────────────────────────────────────────────
export async function startGame(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.hostId !== user.uid) throw new Error('Only host can start')
    if (game.status !== 'lobby') throw new Error('Game already started')
    if (game.playerOrder.length < 2) throw new Error('Need at least 2 players')

    const jokerCount = game.settings?.jokerCount ?? 2
    const deckSize = game.settings?.deckSize ?? 1
    const deck = shuffleDeck(buildDeck(jokerCount, deckSize, game.seed), game.seed)
    const playerCount = game.playerOrder.length
    const cardsNeeded = playerCount * 3

    for (let i = 0; i < playerCount; i++) {
      const pid = game.playerOrder[i]
      const hand = deck.slice(i * 3, i * 3 + 3)
      tx.set(privateRef(gameId, pid), {
        hand,
        drawnCard: null,
        drawnCardSource: null,
        known: {},
      } satisfies PrivatePlayerDoc)
      // Reset locks
      tx.update(playerRef(gameId, pid), {
        locks: [false, false, false],
        lockedBy: [...EMPTY_LOCKED_BY],
      })
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
      actionVersion: 1,
      lastActionAt: Date.now(),
      endCalledBy: null,
      endRoundStartSeatIndex: null,
      spentPowerCardIds: {},
      log: boundLog(game.log, logEntry('Game started! Cards dealt.')),
    })
  })
}

// ─── Draw from Pile ─────────────────────────────────────────────
export async function drawFromPile(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const pileSnap = await tx.get(drawPileRef(gameId))
    const pile = pileSnap.data()?.cards as Card[]
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName
    await tx.get(privateRef(gameId, user.uid))

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'draw') throw new Error('Already drew a card')
    if (game.status !== 'active' && game.status !== 'ending') throw new Error('Game not active')
    if (!pile || pile.length === 0) throw new Error('Draw pile is empty')

    const drawn = pile[0]
    const newPile = pile.slice(1)

    tx.update(drawPileRef(gameId), { cards: newPile })
    tx.update(privateRef(gameId, user.uid), { drawnCard: drawn, drawnCardSource: 'pile' })
    tx.update(gameRef(gameId), {
      drawPileCount: newPile.length,
      turnPhase: 'action',
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: arrayUnion(logEntry(`${pName} drew from the pile`)),
    })
  })
}

// ─── Take from Discard ──────────────────────────────────────────
export async function takeFromDiscard(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'draw') throw new Error('Already drew a card')
    if (game.status !== 'active' && game.status !== 'ending') throw new Error('Game not active')
    if (!game.discardTop) throw new Error('No discard card')

    tx.update(privateRef(gameId, user.uid), { drawnCard: game.discardTop, drawnCardSource: 'discard' })
    tx.update(gameRef(gameId), {
      discardTop: null,
      turnPhase: 'action',
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: arrayUnion(logEntry(`${pName} took from discard`)),
    })
  })
}

// ─── Cancel Draw (undo draw choice) ─────────────────────────────
export async function cancelDraw(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Not in action phase')
    if (!priv.drawnCard) throw new Error('No drawn card to cancel')

    const source = priv.drawnCardSource ?? null
    if (!source) throw new Error('Cannot determine draw source')

    // Section 6: Pile draws cannot be undone — only discard draws can be cancelled
    if (source === 'pile') {
      throw new Error('Cannot undo a draw from the pile. You must swap, discard, or use a power.')
    }

    const cardToReturn = priv.drawnCard

    if (source === 'discard') {
      // Put card back on discard pile
      tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
      tx.update(gameRef(gameId), {
        discardTop: cardToReturn,
        turnPhase: 'draw',
        actionVersion: game.actionVersion + 1,
        lastActionAt: Date.now(),
      })
    }
  })
}

// ─── Swap with Slot ─────────────────────────────────────────────
export async function swapWithSlot(gameId: string, slotIndex: number): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    if (slotIndex < 0 || slotIndex >= priv.hand.length) throw new Error('Invalid slot')
    if (pd.locks[slotIndex]) throw new Error('That card is locked!')

    const oldCard = priv.hand[slotIndex]
    const newHand = [...priv.hand]
    newHand[slotIndex] = priv.drawnCard
    const newKnown = { ...priv.known }
    newKnown[String(slotIndex)] = priv.drawnCard

    tx.update(privateRef(gameId, user.uid), {
      hand: newHand,
      drawnCard: null,
      drawnCardSource: null,
      known: newKnown,
    })

    tx.update(gameRef(gameId), buildEndTurnUpdates(
      game, user.uid, oldCard,
      `${pd.displayName} swapped their card #${slotIndex + 1}`,
    ))
  })
}

// ─── Discard Drawn Card ─────────────────────────────────────────
export async function discardDrawn(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pName = (playerSnap.data() as PlayerDoc).displayName

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
    tx.update(gameRef(gameId), buildEndTurnUpdates(
      game, user.uid, discardCard,
      `${pName} discarded`,
    ))
  })
}

// ─── Power validation helper ────────────────────────────────────
function assertPowerEffect(
  game: GameDoc,
  card: Card,
  expectedEffect: PowerEffectType,
): PowerRankKey {
  const rankKey = getCardRankKey(card)
  if (!rankKey) throw new Error('This card has no power')
  const assignments = game.settings?.powerAssignments ?? DEFAULT_GAME_SETTINGS.powerAssignments
  const actual = assignments[rankKey]
  if (actual !== expectedEffect) {
    throw new Error(`This card's power is "${actual}", not "${expectedEffect}"`)
  }
  // Check if this specific card instance has already been used
  if (game.spentPowerCardIds?.[card.id]) {
    throw new Error('Power already used for this card.')
  }
  return rankKey
}

/** Returns Firestore update field to mark a card as spent */
function spentField(cardId: string): Record<string, boolean> {
  return { [`spentPowerCardIds.${cardId}`]: true }
}

// ─── Effect: peek_all_three_of_your_cards ───────────────────────
export async function usePeekAll(gameId: string): Promise<Record<number, Card>> {
  const user = await ensureAuth()
  const revealed: Record<number, Card> = {}

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'peek_all_three_of_your_cards')

    const newKnown = { ...priv.known }
    for (let i = 0; i < 3; i++) {
      if (!pd.locks[i]) {
        const card = priv.hand[i]
        newKnown[String(i)] = card
        revealed[i] = card
      }
    }

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null, known: newKnown })
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as peek_all`),
      ...spentField(discardCard.id),
    })
  })

  return revealed
}

// ─── Effect: peek_one_of_your_cards ─────────────────────────────
export async function usePeekOne(gameId: string, slotIndex: number): Promise<Card> {
  const user = await ensureAuth()
  let peekedCard: Card | null = null

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'peek_one_of_your_cards')
    if (pd.locks[slotIndex]) throw new Error('That card is locked!')

    peekedCard = priv.hand[slotIndex]
    const newKnown = { ...priv.known }
    newKnown[String(slotIndex)] = peekedCard

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null, known: newKnown })
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as peek_one`),
      ...spentField(discardCard.id),
    })
  })

  return peekedCard!
}

// ─── Effect: swap_one_to_one ────────────────────────────────────
export async function useSwap(
  gameId: string,
  targetA: { playerId: string; slotIndex: number },
  targetB: { playerId: string; slotIndex: number },
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // ALL READS FIRST
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

    const playerASnap = await tx.get(playerRef(gameId, targetA.playerId))
    const playerAData = playerASnap.data() as PlayerDoc
    const playerBSnap = await tx.get(playerRef(gameId, targetB.playerId))
    const playerBData = playerBSnap.data() as PlayerDoc

    const privASnap = await tx.get(privateRef(gameId, targetA.playerId))
    const privA = privASnap.data() as PrivatePlayerDoc
    const privBSnap = await tx.get(privateRef(gameId, targetB.playerId))
    const privB = privBSnap.data() as PrivatePlayerDoc

    // VALIDATE
    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'swap_one_to_one')
    if (playerAData.locks[targetA.slotIndex]) throw new Error('Card A is locked')
    if (playerBData.locks[targetB.slotIndex]) throw new Error('Card B is locked')

    // ALL WRITES
    const cardA = privA.hand[targetA.slotIndex]
    const cardB = privB.hand[targetB.slotIndex]

    if (targetA.playerId === targetB.playerId) {
      const newHand = [...privA.hand]
      newHand[targetA.slotIndex] = cardB
      newHand[targetB.slotIndex] = cardA
      const newKnown = { ...privA.known }
      const kA = newKnown[String(targetA.slotIndex)]
      const kB = newKnown[String(targetB.slotIndex)]
      if (kA) newKnown[String(targetB.slotIndex)] = kA; else delete newKnown[String(targetB.slotIndex)]
      if (kB) newKnown[String(targetA.slotIndex)] = kB; else delete newKnown[String(targetA.slotIndex)]
      tx.update(privateRef(gameId, targetA.playerId), { hand: newHand, known: newKnown })
    } else {
      const newHandA = [...privA.hand]
      newHandA[targetA.slotIndex] = cardB
      const newKnownA = { ...privA.known }
      delete newKnownA[String(targetA.slotIndex)]

      const newHandB = [...privB.hand]
      newHandB[targetB.slotIndex] = cardA
      const newKnownB = { ...privB.known }
      delete newKnownB[String(targetB.slotIndex)]

      tx.update(privateRef(gameId, targetA.playerId), { hand: newHandA, known: newKnownA })
      tx.update(privateRef(gameId, targetB.playerId), { hand: newHandB, known: newKnownB })
    }

    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })

    const discardCard = priv.drawnCard
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as swap: ${playerAData.displayName}'s #${targetA.slotIndex + 1} ↔ ${playerBData.displayName}'s #${targetB.slotIndex + 1}`),
      ...spentField(discardCard.id),
    })
  })
}

// ─── Effect: lock_one_card ──────────────────────────────────────
export async function useLock(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc
    const targetPlayerSnap = await tx.get(playerRef(gameId, targetPlayerId))
    const targetPD = targetPlayerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'lock_one_card')
    if (targetPD.locks[slotIndex]) throw new Error('Already locked')

    const newLocks: [boolean, boolean, boolean] = [...targetPD.locks] as [boolean, boolean, boolean]
    newLocks[slotIndex] = true

    const newLockedBy = [...(targetPD.lockedBy ?? EMPTY_LOCKED_BY)] as [LockInfo, LockInfo, LockInfo]
    newLockedBy[slotIndex] = { lockerId: user.uid, lockerName: pd.displayName }

    tx.update(playerRef(gameId, targetPlayerId), { locks: newLocks, lockedBy: newLockedBy })

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })

    const targetName = targetPlayerId === user.uid ? 'their own' : `${targetPD.displayName}'s`
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as lock on ${targetName} card #${slotIndex + 1}`),
      ...spentField(discardCard.id),
    })
  })
}

// ─── Effect: unlock_one_locked_card ─────────────────────────────
export async function useUnlock(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc
    const targetPlayerSnap = await tx.get(playerRef(gameId, targetPlayerId))
    const targetPD = targetPlayerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'unlock_one_locked_card')

    // Graceful no-op: if the targeted slot isn't locked, still consume the
    // power card (discard it) and advance turn — power fizzles.
    const isActuallyLocked = targetPD.locks[slotIndex]

    if (isActuallyLocked) {
      const newLocks: [boolean, boolean, boolean] = [...targetPD.locks] as [boolean, boolean, boolean]
      newLocks[slotIndex] = false

      const newLockedBy = [...(targetPD.lockedBy ?? EMPTY_LOCKED_BY)] as [LockInfo, LockInfo, LockInfo]
      newLockedBy[slotIndex] = EMPTY_LOCK_INFO

      tx.update(playerRef(gameId, targetPlayerId), { locks: newLocks, lockedBy: newLockedBy })
    }

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })

    const logMsg = isActuallyLocked
      ? `${pd.displayName} used ${rankKey} as unlock on ${targetPlayerId === user.uid ? 'their own' : `${targetPD.displayName}'s`} card #${slotIndex + 1}`
      : `${pd.displayName} used ${rankKey} as unlock but no card was locked (power fizzled)`
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, logMsg),
      ...spentField(discardCard.id),
    })
  })
}

// ─── Effect: rearrange_cards ────────────────────────────────────
export async function useRearrange(
  gameId: string,
  targetPlayerId: string,
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const privSnap = await tx.get(privateRef(gameId, user.uid))
    const priv = privSnap.data() as PrivatePlayerDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc
    const targetPlayerSnap = await tx.get(playerRef(gameId, targetPlayerId))
    const targetPD = targetPlayerSnap.data() as PlayerDoc
    const targetPrivSnap = await tx.get(privateRef(gameId, targetPlayerId))
    const targetPriv = targetPrivSnap.data() as PrivatePlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'action') throw new Error('Must draw first')
    if (!priv.drawnCard) throw new Error('No drawn card')
    const rankKey = assertPowerEffect(game, priv.drawnCard, 'rearrange_cards')
    if (targetPlayerId === user.uid) throw new Error('Cannot rearrange your own cards')

    const locks = targetPD.locks
    const unlockedIndices = [0, 1, 2].filter((i) => !locks[i])

    if (unlockedIndices.length > 1) {
      const rng = seedrandom(`${game.actionVersion}-chaos`)
      const unlockedCards = unlockedIndices.map((i) => targetPriv.hand[i])
      for (let i = unlockedCards.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [unlockedCards[i], unlockedCards[j]] = [unlockedCards[j], unlockedCards[i]]
      }

      const newHand = [...targetPriv.hand]
      unlockedIndices.forEach((idx, i) => {
        newHand[idx] = unlockedCards[i]
      })

      const newKnown = { ...targetPriv.known }
      for (const idx of unlockedIndices) {
        delete newKnown[String(idx)]
      }

      tx.update(privateRef(gameId, targetPlayerId), { hand: newHand, known: newKnown })
    }

    const discardCard = priv.drawnCard
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })

    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as rearrange on ${targetPD.displayName}'s cards!`),
      ...spentField(discardCard.id),
    })
  })
}

// ─── Call End ────────────────────────────────────────────────────
export async function callEnd(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    const game = gameSnap.data() as GameDoc
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Only the current turn player can call End')
    if (game.status !== 'active') throw new Error('Game not active')

    const callerIdx = game.playerOrder.indexOf(user.uid)

    tx.update(gameRef(gameId), {
      status: 'ending',
      endCalledBy: user.uid,
      endRoundStartSeatIndex: callerIdx,
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: arrayUnion(logEntry(`${pd.displayName} called END! Finishing the round...`)),
    })
  })
}

// ─── Reveal Hand ────────────────────────────────────────────────
export async function revealHand(gameId: string): Promise<void> {
  const user = await ensureAuth()

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

// ─── Analytics: Game Summary (one write per finished game) ──────
export async function writeGameSummary(
  gameId: string,
  scores: PlayerScore[],
  game: GameDoc,
): Promise<void> {
  try {
    // Determine winners (min score, sevens tiebreaker)
    const minScore = scores.length > 0 ? scores[0].total : 0
    const tied = scores.filter((s) => s.total === minScore)
    const maxSevens = Math.max(...tied.map((s) => s.sevens), 0)
    const winners = tied
      .filter((s) => s.sevens === maxSevens)
      .map((s) => ({ id: s.playerId, name: s.displayName, score: s.total, sevens: s.sevens }))

    await setDoc(doc(db, 'games', gameId, 'summary', 'result'), {
      finishedAt: Date.now(),
      playerCount: game.playerOrder.length,
      winners,
      turns: game.actionVersion,
      deckSize: game.drawPileCount,
      settings: game.settings,
    })

    // Global stats counter (single doc, one write)
    await updateDoc(doc(db, 'stats', 'global'), {
      gamesPlayed: increment(1),
      lastGameAt: Date.now(),
    }).catch(async () => {
      // Doc may not exist yet — create it
      await setDoc(doc(db, 'stats', 'global'), { gamesPlayed: 1, lastGameAt: Date.now() })
    })
  } catch (e) {
    console.error('Analytics write failed (non-critical):', e)
  }
}

// ─── Presence (throttled) ─────────────────────────────────────────
let lastPresenceWrite = 0
const PRESENCE_THROTTLE_MS = 60_000 // 60 seconds

export async function updatePresenceThrottled(gameId: string, connected: boolean): Promise<void> {
  const now = Date.now()
  // Always allow disconnection writes; throttle connection writes
  if (connected && now - lastPresenceWrite < PRESENCE_THROTTLE_MS) return
  lastPresenceWrite = now
  const user = await ensureAuth()
  await updateDoc(playerRef(gameId, user.uid), { connected })
}

// ─── Feedback ───────────────────────────────────────────────────
export interface FeedbackData {
  rating: number // 1-5
  name: string
  message: string
  appVersion: string
  theme: string
}

export async function submitFeedback(data: FeedbackData): Promise<void> {
  const user = await ensureAuth()
  const feedbackId = nanoid(10)
  await setDoc(doc(db, 'feedback', feedbackId), {
    ...data,
    userId: user.uid,
    createdAt: Date.now(),
  })
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

// ─── Update Player Profile (Lobby) ─────────────────────────────
export async function updatePlayerProfile(
  gameId: string,
  updates: { displayName?: string; colorKey?: number },
): Promise<void> {
  const user = await ensureAuth()
  const clean: Record<string, unknown> = {}
  if (updates.displayName != null) {
    const name = updates.displayName.trim().slice(0, 12)
    if (name.length === 0) throw new Error('Name cannot be empty')
    clean.displayName = name
  }
  if (updates.colorKey != null) {
    clean.colorKey = updates.colorKey
  }
  if (Object.keys(clean).length > 0) {
    await updateDoc(playerRef(gameId, user.uid), clean)
  }
}

// ─── Chat ──────────────────────────────────────────────────────
const CHAT_MAX = 50 // max messages kept in view
const CHAT_THROTTLE_MS = 2000 // min interval between sends per user (1 msg / 2s)
let lastChatSend = 0

export async function sendChatMessage(
  gameId: string,
  text: string,
  displayName: string,
  seatIndex: number,
): Promise<void> {
  const now = Date.now()
  if (now - lastChatSend < CHAT_THROTTLE_MS) return // silently skip spam
  lastChatSend = now

  const user = await ensureAuth()
  const msgId = nanoid(10)
  await setDoc(doc(db, 'games', gameId, 'chat', msgId), {
    id: msgId,
    userId: user.uid,
    displayName,
    seatIndex,
    text: text.slice(0, 300), // hard cap at 300 chars (matches Firestore rules)
    ts: now,
  })
}

export function subscribeChat(
  gameId: string,
  cb: (messages: ChatMessage[]) => void,
): Unsubscribe {
  const chatQuery = query(
    collection(db, 'games', gameId, 'chat'),
    orderBy('ts', 'desc'),
    firestoreLimit(CHAT_MAX),
  )
  return onSnapshot(chatQuery, (snap) => {
    const msgs: ChatMessage[] = []
    snap.forEach((d) => msgs.push(d.data() as ChatMessage))
    // Reverse so oldest first (display order)
    msgs.reverse()
    cb(msgs)
  })
}
