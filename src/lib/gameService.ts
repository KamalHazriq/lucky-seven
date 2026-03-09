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

// ─── Create Game ────────────────────────────────────────────────
export async function createGame(
  displayName: string,
  maxPlayers: number,
  settings?: Partial<GameSettings>,
): Promise<string> {
  const user = await ensureAuth()
  const gameId = nanoid(8)
  const joinCode = nanoid(6).toUpperCase()
  const seed = nanoid(12)

  const gameSettings: GameSettings = {
    powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
    jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
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
    const deck = shuffleDeck(buildDeck(jokerCount), game.seed)
    const playerCount = game.playerOrder.length
    const cardsNeeded = playerCount * 3

    for (let i = 0; i < playerCount; i++) {
      const pid = game.playerOrder[i]
      const hand = deck.slice(i * 3, i * 3 + 3)
      tx.set(privateRef(gameId, pid), {
        hand,
        drawnCard: null,
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
    tx.update(privateRef(gameId, user.uid), { drawnCard: drawn })
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

    tx.update(privateRef(gameId, user.uid), { drawnCard: game.discardTop })
    tx.update(gameRef(gameId), {
      discardTop: null,
      turnPhase: 'action',
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: arrayUnion(logEntry(`${pName} took from discard`)),
    })
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
      known: newKnown,
    })

    tx.update(gameRef(gameId), buildEndTurnUpdates(
      game, user.uid, oldCard,
      `${pd.displayName} swapped card #${slotIndex + 1}`,
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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null })
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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, known: newKnown })
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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, known: newKnown })
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

    tx.update(privateRef(gameId, user.uid), { drawnCard: null })

    const discardCard = priv.drawnCard
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, `${pd.displayName} used ${rankKey} as swap`),
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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null })

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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null })

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
    tx.update(privateRef(gameId, user.uid), { drawnCard: null })

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
