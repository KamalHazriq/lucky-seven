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
  startAfter,
  type Unsubscribe,
  type DocumentSnapshot,
  type Transaction,
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
  DevAccessDoc,
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

// ─── History Subcollection ──────────────────────────────────────
/** Write one event into games/{gameId}/history (inside a transaction). */
function txHistory(tx: Transaction, gameId: string, msg: string) {
  tx.set(doc(collection(db, 'games', gameId, 'history')), { ts: Date.now(), msg })
}

/** Write one history event outside a transaction (fire-and-forget). */
async function addHistory(gameId: string, msg: string) {
  try {
    await setDoc(doc(collection(db, 'games', gameId, 'history')), { ts: Date.now(), msg })
  } catch { /* non-critical */ }
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
  const now = Date.now()

  const updates: Record<string, unknown> = {
    discardTop: discardCard,
    currentTurnPlayerId: shouldFinish ? null : nextPlayerId,
    turnPhase: shouldFinish ? null : 'draw',
    actionVersion: game.actionVersion + 1,
    lastActionAt: now,
    turnStartAt: shouldFinish ? 0 : now,
    log: boundLog(game.log, logEntry(logMsg)),
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
    turnSeconds: settings?.turnSeconds ?? DEFAULT_GAME_SETTINGS.turnSeconds,
    peekAllowsOpponent: settings?.peekAllowsOpponent ?? DEFAULT_GAME_SETTINGS.peekAllowsOpponent,
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
    turnStartAt: 0,
    voteKick: null,
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
  addHistory(gameId, `Game created by ${displayName}`)

  return gameId
}

// ─── Join Game ──────────────────────────────────────────────────
export async function joinGame(
  gameId: string,
  displayName: string,
  colorKey?: number,
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'lobby') throw new Error('Game already started')
    if (game.playerOrder.includes(user.uid)) return
    if (game.playerOrder.length >= game.maxPlayers) throw new Error('Game is full')

    // Read existing players to validate uniqueness
    const playerSnaps = await Promise.all(
      game.playerOrder.map((pid) => tx.get(playerRef(gameId, pid))),
    )
    const existingPlayers = playerSnaps
      .filter((s) => s.exists())
      .map((s) => s.data() as PlayerDoc)

    // Check name uniqueness (case-insensitive)
    const nameLower = displayName.toLowerCase()
    const nameConflict = existingPlayers.find(
      (p) => p.displayName.toLowerCase() === nameLower,
    )
    if (nameConflict) throw new Error('Name already taken in this lobby')

    // Check color uniqueness if explicitly provided
    if (colorKey != null) {
      const colorConflict = existingPlayers.find((p) => p.colorKey === colorKey)
      if (colorConflict) throw new Error(`Color already taken by ${colorConflict.displayName}`)
    }

    // Auto-assign a random untaken color if none provided
    let assignedColorKey = colorKey
    if (assignedColorKey == null) {
      const takenKeys = new Set(
        existingPlayers.map((p) => p.colorKey).filter((k): k is number => k != null),
      )
      const available: number[] = []
      for (let i = 0; i < 16; i++) {
        if (!takenKeys.has(i)) available.push(i)
      }
      if (available.length > 0) {
        assignedColorKey = available[Math.floor(Math.random() * available.length)]
      }
    }

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
      ...(assignedColorKey != null ? { colorKey: assignedColorKey } : {}),
    } satisfies PlayerDoc)

    tx.set(privateRef(gameId, user.uid), {
      hand: [],
      drawnCard: null,
      drawnCardSource: null,
      known: {},
    } satisfies PrivatePlayerDoc)
  })
  // Join events are tracked in game.log only (not history subcollection) to reduce writes
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
    // No initial discard card — first move must be from draw pile

    tx.set(drawPileRef(gameId), { cards: remaining })

    txHistory(tx, gameId, 'Game started! Cards dealt.')
    tx.update(gameRef(gameId), {
      status: 'active',
      drawPileCount: remaining.length,
      discardTop: null,
      currentTurnPlayerId: game.playerOrder[0],
      turnPhase: 'draw',
      actionVersion: 1,
      lastActionAt: Date.now(),
      turnStartAt: Date.now(),
      endCalledBy: null,
      endRoundStartSeatIndex: null,
      spentPowerCardIds: {},
      voteKick: null,
      log: boundLog(game.log, logEntry('Game started! Cards dealt.')),
    })
  })
}

// ─── Update Game Settings (host-only, lobby only) ──────────────
export async function updateGameSettings(
  gameId: string,
  settings: Partial<GameSettings>,
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.hostId !== user.uid) throw new Error('Only the host can change settings')
    if (game.status !== 'lobby') throw new Error('Settings can only be changed in the lobby')

    tx.update(gameRef(gameId), {
      settings: { ...game.settings, ...settings },
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
    // Reset AFK strikes on action
    tx.update(playerRef(gameId, user.uid), { afkStrikes: 0 })
    // Skip history write for draw — high-frequency, already in bounded game.log
    tx.update(gameRef(gameId), {
      drawPileCount: newPile.length,
      turnPhase: 'action',
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: boundLog(game.log, logEntry(`${pName} drew from the pile`)),
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
    // Reset AFK strikes on action
    tx.update(playerRef(gameId, user.uid), { afkStrikes: 0 })
    // Skip history write for discard take — high-frequency, already in bounded game.log
    tx.update(gameRef(gameId), {
      discardTop: null,
      turnPhase: 'action',
      actionVersion: game.actionVersion + 1,
      lastActionAt: Date.now(),
      log: boundLog(game.log, logEntry(`${pName} took from discard`)),
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
    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc

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
      const cancelMsg = `${pd.displayName} returned the card to discard`
      tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
      tx.update(gameRef(gameId), {
        discardTop: cardToReturn,
        turnPhase: 'draw',
        actionVersion: game.actionVersion + 1,
        lastActionAt: Date.now(),
        log: boundLog(game.log, logEntry(cancelMsg)),
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

    const swapMsg = `${pd.displayName} swapped their card #${slotIndex + 1}`
    tx.update(gameRef(gameId), buildEndTurnUpdates(game, user.uid, oldCard, swapMsg))
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
    tx.update(gameRef(gameId), buildEndTurnUpdates(game, user.uid, discardCard, `${pName} discarded`))
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
    const peekAllMsg = `${pd.displayName} used ${rankKey} as peek_all`
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null, known: newKnown })
    txHistory(tx, gameId, peekAllMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, peekAllMsg),
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
    const peekOneMsg = `${pd.displayName} used ${rankKey} as peek_one`
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null, known: newKnown })
    txHistory(tx, gameId, peekOneMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, peekOneMsg),
      ...spentField(discardCard.id),
    })
  })

  return peekedCard!
}

// ─── Effect: peek opponent (extension of peek powers when peekAllowsOpponent) ─
export async function usePeekOpponent(
  gameId: string,
  targetPlayerId: string,
  slotIndex: number,
): Promise<{ card: Card; playerName: string }> {
  const user = await ensureAuth()
  let peekedCard: Card | null = null
  let targetName = ''

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

    // Validate: drawn card must be a peek power AND setting must allow opponent peek
    const settings = game.settings ?? DEFAULT_GAME_SETTINGS
    if (!settings.peekAllowsOpponent) throw new Error('Peek opponent is not enabled')
    const rankKey = getCardRankKey(priv.drawnCard)
    if (!rankKey) throw new Error('This card has no power')
    const effect = (settings.powerAssignments ?? DEFAULT_GAME_SETTINGS.powerAssignments)[rankKey]
    if (effect !== 'peek_one_of_your_cards' && effect !== 'peek_all_three_of_your_cards') {
      throw new Error('This card does not have a peek power')
    }
    if (game.spentPowerCardIds?.[priv.drawnCard.id]) throw new Error('Power already used for this card.')

    if (targetPlayerId === user.uid) throw new Error('Cannot peek your own card — use Peek instead')
    if (targetPD.locks[slotIndex]) throw new Error('That card is locked!')

    peekedCard = targetPriv.hand[slotIndex]
    targetName = targetPD.displayName

    const discardCard = priv.drawnCard
    const peekOpponentMsg = `${pd.displayName} used ${rankKey} as peek_opponent: ${targetPD.displayName}'s #${slotIndex + 1}`
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
    txHistory(tx, gameId, peekOpponentMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, peekOpponentMsg),
      ...spentField(discardCard.id),
    })
  })

  return { card: peekedCard!, playerName: targetName }
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
    const swapPowerMsg = `${pd.displayName} used ${rankKey} as swap: ${playerAData.displayName}'s #${targetA.slotIndex + 1} ↔ ${playerBData.displayName}'s #${targetB.slotIndex + 1}`
    txHistory(tx, gameId, swapPowerMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, swapPowerMsg),
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
    const lockMsg = `${pd.displayName} used ${rankKey} as lock on ${targetName} card #${slotIndex + 1}`
    txHistory(tx, gameId, lockMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, lockMsg),
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
    txHistory(tx, gameId, logMsg)
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
      // Use crypto-random seed so the shuffle is unpredictable and never a no-op
      const cryptoSeed = `${game.actionVersion}-chaos-${Date.now()}-${Math.random()}`
      const rng = seedrandom(cryptoSeed)
      const unlockedCards = unlockedIndices.map((i) => targetPriv.hand[i])
      // Fisher-Yates shuffle — retry if result is identical to original (prevent no-op)
      const original = [...unlockedCards]
      let attempts = 0
      do {
        for (let i = unlockedCards.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [unlockedCards[i], unlockedCards[j]] = [unlockedCards[j], unlockedCards[i]]
        }
        attempts++
      } while (
        attempts < 10 &&
        unlockedCards.every((c, i) => c.id === original[i].id)
      )

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
    const rearrangeMsg = `${pd.displayName} used ${rankKey} as rearrange on ${targetPD.displayName}'s cards!`
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
    txHistory(tx, gameId, rearrangeMsg)
    tx.update(gameRef(gameId), {
      ...buildEndTurnUpdates(game, user.uid, discardCard, rearrangeMsg),
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

    txHistory(tx, gameId, `${pd.displayName} called END! Finishing the round...`)
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

// ─── Leave Lobby (pre-game) ─────────────────────────────────────
export async function leaveLobby(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) return
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'lobby') throw new Error('Game has already started')
    if (!game.playerOrder.includes(user.uid)) return // already gone

    const newOrder = game.playerOrder.filter((pid) => pid !== user.uid)

    if (newOrder.length === 0) {
      // Last player — delete the game doc (or mark abandoned)
      txHistory(tx, gameId, 'All players left. Game abandoned.')
      tx.update(gameRef(gameId), {
        status: 'finished',
        playerOrder: [],
        log: arrayUnion(logEntry('All players left. Game abandoned.')),
      })
    } else {
      txHistory(tx, gameId, 'A player left the lobby')
      const updates: Record<string, unknown> = {
        playerOrder: newOrder,
        log: arrayUnion(logEntry(`A player left the lobby`)),
      }
      // If host leaves, transfer host to next player
      if (game.hostId === user.uid) {
        updates.hostId = newOrder[0]
      }
      tx.update(gameRef(gameId), updates)
    }

    // Mark player as disconnected (don't delete — keeps Firestore rules happy)
    tx.update(playerRef(gameId, user.uid), { connected: false })
  })
}

// ─── Leave Game (mid-game) ──────────────────────────────────────
export async function leaveGame(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) return
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'active' && game.status !== 'ending') return
    if (!game.playerOrder.includes(user.uid)) return

    const playerSnap = await tx.get(playerRef(gameId, user.uid))
    const pd = playerSnap.data() as PlayerDoc
    await tx.get(privateRef(gameId, user.uid)) // Read before write

    const newOrder = game.playerOrder.filter((pid) => pid !== user.uid)

    if (newOrder.length < 2) {
      // Not enough players — end the game
      txHistory(tx, gameId, `${pd.displayName} left. Not enough players — game over.`)
      tx.update(gameRef(gameId), {
        status: 'finished',
        currentTurnPlayerId: null,
        turnPhase: null,
        playerOrder: newOrder,
        actionVersion: game.actionVersion + 1,
        lastActionAt: Date.now(),
        log: arrayUnion(logEntry(`${pd.displayName} left. Not enough players — game over.`)),
      })
    } else {
      txHistory(tx, gameId, `${pd.displayName} left the game`)
      const updates: Record<string, unknown> = {
        playerOrder: newOrder,
        actionVersion: game.actionVersion + 1,
        lastActionAt: Date.now(),
        log: arrayUnion(logEntry(`${pd.displayName} left the game`)),
      }

      // If it was their turn, advance to next player
      if (game.currentTurnPlayerId === user.uid) {
        const idx = game.playerOrder.indexOf(user.uid)
        const nextIdx = idx % newOrder.length
        updates.currentTurnPlayerId = newOrder[nextIdx]
        updates.turnPhase = 'draw'
        updates.turnStartAt = Date.now()
      }

      // If host leaves, transfer
      if (game.hostId === user.uid) {
        updates.hostId = newOrder[0]
      }

      // Cancel active vote kick if the target or voter left
      if (game.voteKick?.active && (
        game.voteKick.targetId === user.uid ||
        game.voteKick.startedBy === user.uid
      )) {
        updates.voteKick = null
      }

      tx.update(gameRef(gameId), updates)
    }

    // Mark disconnected and clear any in-flight drawn card
    tx.update(playerRef(gameId, user.uid), { connected: false })
    tx.update(privateRef(gameId, user.uid), { drawnCard: null, drawnCardSource: null })
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

// ─── Skip Turn (timer expired — auto-skip) ─────────────────────────
export async function skipTurn(gameId: string, expectedActionVersion: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) return
    const game = gameSnap.data() as GameDoc

    // Guard: only skip if actionVersion still matches (prevents double-skip)
    if (game.actionVersion !== expectedActionVersion) return
    if (!game.currentTurnPlayerId) return
    if (game.status !== 'active' && game.status !== 'ending') return
    // Don't skip during an active vote kick — timer is paused
    if (game.voteKick?.active) return

    const currentPid = game.currentTurnPlayerId
    const playerSnap = await tx.get(playerRef(gameId, currentPid))
    const pd = playerSnap.data() as PlayerDoc
    const privSnap = await tx.get(privateRef(gameId, currentPid))
    const priv = privSnap.data() as PrivatePlayerDoc

    const { nextPlayerId, shouldFinish } = advanceTurn(game, currentPid)
    const now = Date.now()
    const currentStrikes = (pd.afkStrikes ?? 0) + 1

    // If they had a drawn card, discard it automatically
    const hasDrawnCard = !!priv.drawnCard
    const discardUpdates: Record<string, unknown> = {}
    if (hasDrawnCard && priv.drawnCard) {
      discardUpdates.discardTop = priv.drawnCard
      tx.update(privateRef(gameId, currentPid), { drawnCard: null, drawnCardSource: null })
    }

    // Check if this is 2nd consecutive AFK → kick
    if (currentStrikes >= 2) {
      // Kick the player
      const newOrder = game.playerOrder.filter((pid) => pid !== currentPid)
      if (newOrder.length < 2) {
        txHistory(tx, gameId, `${pd.displayName} was AFK-kicked. Not enough players — game over.`)
        tx.update(gameRef(gameId), {
          ...discardUpdates,
          status: 'finished',
          currentTurnPlayerId: null,
          turnPhase: null,
          playerOrder: newOrder,
          actionVersion: game.actionVersion + 1,
          lastActionAt: now,
          turnStartAt: 0,
          log: boundLog(game.log, logEntry(`${pd.displayName} was AFK-kicked. Not enough players — game over.`)),
        })
      } else {
        const idx = game.playerOrder.indexOf(currentPid)
        const nextIdx = idx % newOrder.length
        const nextPid = newOrder[nextIdx]
        txHistory(tx, gameId, `${pd.displayName} was AFK-kicked (2 timeouts).`)
        tx.update(gameRef(gameId), {
          ...discardUpdates,
          playerOrder: newOrder,
          currentTurnPlayerId: nextPid,
          turnPhase: 'draw',
          actionVersion: game.actionVersion + 1,
          lastActionAt: now,
          turnStartAt: now,
          log: boundLog(game.log, logEntry(`${pd.displayName} was AFK-kicked (2 timeouts).`)),
          ...(game.hostId === currentPid ? { hostId: newOrder[0] } : {}),
        })
      }
      tx.update(playerRef(gameId, currentPid), { connected: false, afkStrikes: 0 })
      tx.update(privateRef(gameId, currentPid), { drawnCard: null, drawnCardSource: null })
    } else {
      // First AFK strike — just skip the turn
      tx.update(playerRef(gameId, currentPid), { afkStrikes: currentStrikes })

      // Skip history for routine AFK skip — already in bounded game.log
      const updates: Record<string, unknown> = {
        ...discardUpdates,
        currentTurnPlayerId: shouldFinish ? null : nextPlayerId,
        turnPhase: shouldFinish ? null : 'draw',
        actionVersion: game.actionVersion + 1,
        lastActionAt: now,
        turnStartAt: shouldFinish ? 0 : now,
        log: boundLog(game.log, logEntry(`${pd.displayName}'s turn was skipped (AFK).`)),
      }
      if (shouldFinish) {
        updates.status = 'finished'
      }
      tx.update(gameRef(gameId), updates)
    }
  })
}

// ─── Vote-Kick: Initiate ───────────────────────────────────────────
export async function initiateVoteKick(gameId: string, targetPlayerId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.status !== 'active' && game.status !== 'ending') throw new Error('Game not active')
    if (game.playerOrder.length < 3) throw new Error('Vote kick requires at least 3 players')
    if (!game.playerOrder.includes(user.uid)) throw new Error('You are not in this game')
    if (!game.playerOrder.includes(targetPlayerId)) throw new Error('Target is not in this game')
    if (user.uid === targetPlayerId) throw new Error('Cannot vote to kick yourself')
    if (game.voteKick?.active) throw new Error('A vote is already in progress')

    const targetSnap = await tx.get(playerRef(gameId, targetPlayerId))
    const targetPd = targetSnap.data() as PlayerDoc

    // Majority = more than half of non-target players
    const voterCount = game.playerOrder.length - 1 // exclude target
    const requiredVotes = Math.ceil(voterCount / 2)

    const now = Date.now()
    txHistory(tx, gameId, `Vote to kick ${targetPd.displayName} started.`)
    tx.update(gameRef(gameId), {
      voteKick: {
        active: true,
        targetId: targetPlayerId,
        targetName: targetPd.displayName,
        startedBy: user.uid,
        createdAt: now,
        votes: [user.uid], // initiator auto-votes yes
        requiredVotes,
      },
      // Increment actionVersion so the running turn timer is invalidated during the vote
      actionVersion: game.actionVersion + 1,
      log: boundLog(game.log, logEntry(`Vote to kick ${targetPd.displayName} started.`)),
    })
  })
}

// ─── Vote-Kick: Cast Vote ──────────────────────────────────────────
export async function castVoteKick(gameId: string, voteYes: boolean): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (!game.voteKick?.active) throw new Error('No active vote')
    if (!game.playerOrder.includes(user.uid)) throw new Error('You are not in this game')
    if (user.uid === game.voteKick.targetId) throw new Error('Target cannot vote')
    if (game.voteKick.votes.includes(user.uid)) throw new Error('Already voted')

    const targetPid = game.voteKick.targetId

    if (!voteYes) {
      // Vote no — cancel the entire vote, restore turn timer
      const now = Date.now()
      const voteDuration = now - (game.voteKick.createdAt ?? now)
      txHistory(tx, gameId, `Vote to kick ${game.voteKick.targetName} failed.`)
      tx.update(gameRef(gameId), {
        voteKick: null,
        actionVersion: game.actionVersion + 1,
        // Give the active player back the time lost while the vote was running
        turnStartAt: (game.turnStartAt ?? 0) + voteDuration,
        log: boundLog(game.log, logEntry(`Vote to kick ${game.voteKick.targetName} failed.`)),
      })
      return
    }

    // Vote yes
    const newVotes = [...game.voteKick.votes, user.uid]

    if (newVotes.length >= game.voteKick.requiredVotes) {
      // Threshold met — kick the player
      const targetSnap = await tx.get(playerRef(gameId, targetPid))
      const targetPd = targetSnap.data() as PlayerDoc
      await tx.get(privateRef(gameId, targetPid)) // Read before write

      const newOrder = game.playerOrder.filter((pid) => pid !== targetPid)

      if (newOrder.length < 2) {
        txHistory(tx, gameId, `${targetPd.displayName} was kicked. Not enough players — game over.`)
        tx.update(gameRef(gameId), {
          status: 'finished',
          currentTurnPlayerId: null,
          turnPhase: null,
          playerOrder: newOrder,
          voteKick: null,
          actionVersion: game.actionVersion + 1,
          lastActionAt: Date.now(),
          turnStartAt: 0,
          log: arrayUnion(logEntry(`${targetPd.displayName} was kicked. Not enough players — game over.`)),
        })
      } else {
        txHistory(tx, gameId, `${targetPd.displayName} was kicked by vote.`)
        const updates: Record<string, unknown> = {
          playerOrder: newOrder,
          voteKick: null,
          actionVersion: game.actionVersion + 1,
          lastActionAt: Date.now(),
          log: arrayUnion(logEntry(`${targetPd.displayName} was kicked by vote.`)),
        }

        // If it was kicked player's turn, advance
        if (game.currentTurnPlayerId === targetPid) {
          const idx = game.playerOrder.indexOf(targetPid)
          const nextIdx = idx % newOrder.length
          updates.currentTurnPlayerId = newOrder[nextIdx]
          updates.turnPhase = 'draw'
          updates.turnStartAt = Date.now()
        }

        // If host was kicked, transfer
        if (game.hostId === targetPid) {
          updates.hostId = newOrder[0]
        }

        tx.update(gameRef(gameId), updates)
      }

      tx.update(playerRef(gameId, targetPid), { connected: false, afkStrikes: 0 })
      tx.update(privateRef(gameId, targetPid), { drawnCard: null, drawnCardSource: null })
    } else {
      // Not enough votes yet — update the vote list
      tx.update(gameRef(gameId), {
        'voteKick.votes': newVotes,
      })
    }
  })
}

// ─── Vote-Kick: Cancel (timeout or initiator cancels) ──────────────
export async function cancelVoteKick(gameId: string): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) return
    const game = gameSnap.data() as GameDoc

    if (!game.voteKick?.active) return
    // Only the initiator or host can cancel
    if (user.uid !== game.voteKick.startedBy && user.uid !== game.hostId) {
      throw new Error('Only the vote initiator or host can cancel')
    }

    const now = Date.now()
    const voteDuration = now - (game.voteKick.createdAt ?? now)
    txHistory(tx, gameId, `Vote to kick ${game.voteKick.targetName} was cancelled.`)
    tx.update(gameRef(gameId), {
      voteKick: null,
      actionVersion: game.actionVersion + 1,
      turnStartAt: (game.turnStartAt ?? 0) + voteDuration,
      log: boundLog(game.log, logEntry(`Vote to kick ${game.voteKick.targetName} was cancelled.`)),
    })
  })
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

// ─── Play Again (shared rematch lobby) ─────────────────────────
/**
 * Quota-safe "Play Again" that funnels all players from a finished game into
 * the SAME rematch lobby.
 *
 * Strategy (fully transactional — handles race conditions via Firestore's
 * automatic transaction retry):
 *   1. Read the finished game doc for rematchLobbyId.
 *   2a. rematchLobbyId exists AND lobby is still joinable → join it.
 *   2b. rematchLobbyId missing or lobby not joinable → create a new game
 *       and write rematchLobbyId on the finished game atomically.
 *
 * Pre-generates IDs outside the transaction because generateUniqueJoinCode
 * uses a getDocs query (not allowed inside transactions).
 * The candidate IDs are only used if we end up creating the new game.
 */
export async function playAgain(
  finishedGameId: string,
  displayName: string,
  maxPlayers: number,
  settings: Partial<GameSettings>,
  colorKey?: number,
): Promise<string> {
  const user = await ensureAuth()

  // Pre-generate everything needed for a potential new game
  const candidateGameId = nanoid(8)
  const candidateJoinCode = await generateUniqueJoinCode()
  const candidateSeed = nanoid(12)

  let result: string | null = null
  let historyGameId: string | null = null
  let historyMsg = ''

  try {
    await runTransaction(db, async (tx) => {
      const finishedSnap = await tx.get(gameRef(finishedGameId))
      if (!finishedSnap.exists()) {
        result = null
        return
      }
      const finished = finishedSnap.data() as GameDoc
      const existingRematchId = finished.rematchLobbyId ?? null

      if (existingRematchId) {
        const rematchSnap = await tx.get(gameRef(existingRematchId))
        if (rematchSnap.exists()) {
          const rematch = rematchSnap.data() as GameDoc
          const alreadyIn = rematch.playerOrder.includes(user.uid)

          if (alreadyIn) {
            result = existingRematchId
            return
          }

          const canJoin = rematch.status === 'lobby'
            && rematch.playerOrder.length < rematch.maxPlayers

          if (canJoin) {
            const seatIndex = rematch.playerOrder.length
            tx.update(gameRef(existingRematchId), {
              playerOrder: [...rematch.playerOrder, user.uid],
              log: boundLog(rematch.log, logEntry(`${displayName} joined`)),
            })
            tx.set(playerRef(existingRematchId, user.uid), {
              displayName,
              seatIndex,
              connected: true,
              locks: [false, false, false],
              lockedBy: [...EMPTY_LOCKED_BY],
              ...(colorKey != null ? { colorKey } : {}),
            } satisfies PlayerDoc)
            tx.set(privateRef(existingRematchId, user.uid), {
              hand: [],
              drawnCard: null,
              drawnCardSource: null,
              known: {},
            } satisfies PrivatePlayerDoc)
            historyGameId = existingRematchId
            historyMsg = `${displayName} joined`
            result = existingRematchId
            return
          }
          // Existing rematch started or is full — fall through to create new
        }
        // Existing rematch doc missing — fall through to create new
      }

      // Create new rematch lobby using pre-generated values
      const gameSettings: GameSettings = {
        powerAssignments: { ...DEFAULT_GAME_SETTINGS.powerAssignments, ...settings?.powerAssignments },
        jokerCount: settings?.jokerCount ?? DEFAULT_GAME_SETTINGS.jokerCount,
        deckSize: settings?.deckSize ?? DEFAULT_GAME_SETTINGS.deckSize,
        turnSeconds: settings?.turnSeconds ?? DEFAULT_GAME_SETTINGS.turnSeconds,
        peekAllowsOpponent: settings?.peekAllowsOpponent ?? DEFAULT_GAME_SETTINGS.peekAllowsOpponent,
      }
      const now = Date.now()
      tx.set(gameRef(candidateGameId), {
        status: 'lobby',
        hostId: user.uid,
        createdAt: now,
        maxPlayers,
        currentTurnPlayerId: null,
        drawPileCount: 0,
        discardTop: null,
        seed: candidateSeed,
        endCalledBy: null,
        endRoundStartSeatIndex: null,
        log: [logEntry(`Game created by ${displayName}`)],
        turnPhase: null,
        playerOrder: [user.uid],
        joinCode: candidateJoinCode,
        actionVersion: 0,
        lastActionAt: now,
        settings: gameSettings,
        spentPowerCardIds: {},
        turnStartAt: 0,
        voteKick: null,
        rematchLobbyId: null,
      } satisfies GameDoc)
      tx.set(playerRef(candidateGameId, user.uid), {
        displayName,
        seatIndex: 0,
        connected: true,
        locks: [false, false, false],
        lockedBy: [...EMPTY_LOCKED_BY],
        ...(colorKey != null ? { colorKey } : {}),
      } satisfies PlayerDoc)
      tx.set(privateRef(candidateGameId, user.uid), {
        hand: [],
        drawnCard: null,
        drawnCardSource: null,
        known: {},
      } satisfies PrivatePlayerDoc)

      // Atomically point the finished game to the new rematch lobby
      tx.update(gameRef(finishedGameId), { rematchLobbyId: candidateGameId })

      historyGameId = candidateGameId
      historyMsg = `Game created by ${displayName}`
      result = candidateGameId
    })
  } catch {
    // Permission denied (e.g. kicked player) or transient error — solo fallback
    result = null
  }

  if (historyGameId && historyMsg) addHistory(historyGameId, historyMsg)

  if (result === null) {
    // Fallback: create a standalone lobby (no rematch link)
    return createGame(displayName, maxPlayers, settings)
  }

  return result
}

// ─── Dev: Set Discard Top (owner-only reorder) ─────────────────
export async function devSetDiscardTop(gameId: string, card: Card): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    if (game.currentTurnPlayerId !== user.uid) throw new Error('Not your turn')
    if (game.turnPhase !== 'draw') throw new Error('Can only reorder during draw phase')
    if (game.status !== 'active' && game.status !== 'ending') throw new Error('Game not active')

    // Verify dev privilege
    const devSnap = await tx.get(doc(db, 'games', gameId, 'devAccess', user.uid))
    if (!devSnap.exists()) throw new Error('No dev access')
    const devDoc = devSnap.data() as DevAccessDoc
    if (!devDoc.privileges?.canReorderDiscardPile) throw new Error('No reorder privilege')

    // Set the chosen card as discardTop (the old discardTop returns to the virtual discard pool)
    tx.update(gameRef(gameId), { discardTop: card })
  })
}

// ─── History (paginated, desc) ──────────────────────────────────
export async function fetchHistoryPage(
  gameId: string,
  cursor: DocumentSnapshot | null,
  pageSize = 100,
): Promise<{ entries: LogEntry[]; lastDoc: DocumentSnapshot | null }> {
  const histCol = collection(db, 'games', gameId, 'history')
  const constraints = cursor
    ? [orderBy('ts', 'desc'), startAfter(cursor), firestoreLimit(pageSize)]
    : [orderBy('ts', 'desc'), firestoreLimit(pageSize)]
  const snap = await getDocs(query(histCol, ...constraints))
  const entries: LogEntry[] = snap.docs.map((d) => d.data() as LogEntry)
  const lastDoc = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null
  return { entries, lastDoc }
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

// ─── Update Player Profile (Lobby) — transaction-safe unique name + color ──
export async function updatePlayerProfile(
  gameId: string,
  updates: { displayName?: string; colorKey?: number },
): Promise<void> {
  const user = await ensureAuth()

  await runTransaction(db, async (tx) => {
    // Read all player docs to check for conflicts
    const gameSnap = await tx.get(gameRef(gameId))
    if (!gameSnap.exists()) throw new Error('Game not found')
    const game = gameSnap.data() as GameDoc

    const playerSnaps = await Promise.all(
      game.playerOrder.map((pid) => tx.get(playerRef(gameId, pid))),
    )
    const otherPlayers = playerSnaps
      .filter((s) => s.exists() && s.id !== user.uid)
      .map((s) => s.data() as PlayerDoc)

    const clean: Record<string, unknown> = {}

    // Validate display name uniqueness (case-insensitive)
    if (updates.displayName != null) {
      const name = updates.displayName.trim().slice(0, 12)
      if (name.length === 0) throw new Error('Name cannot be empty')
      const nameLower = name.toLowerCase()
      const conflict = otherPlayers.find(
        (p) => p.displayName.toLowerCase() === nameLower,
      )
      if (conflict) throw new Error('Name already taken in this lobby')
      clean.displayName = name
    }

    // Validate color uniqueness
    if (updates.colorKey != null) {
      const takenBy = otherPlayers.find((p) => p.colorKey === updates.colorKey)
      if (takenBy) throw new Error(`Color already taken by ${takenBy.displayName}`)
      clean.colorKey = updates.colorKey
    }

    if (Object.keys(clean).length > 0) {
      tx.update(playerRef(gameId, user.uid), clean)
    }
  })
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
  // Query newest 50 descending, then reverse client-side for chronological display.
  // Using snap.docs (guaranteed query order) instead of snap.forEach for safety.
  const chatQuery = query(
    collection(db, 'games', gameId, 'chat'),
    orderBy('ts', 'desc'),
    firestoreLimit(CHAT_MAX),
  )
  return onSnapshot(chatQuery, (snap) => {
    const msgs: ChatMessage[] = snap.docs.map((d) => d.data() as ChatMessage)
    msgs.reverse() // oldest-first for display
    cb(msgs)
  })
}
