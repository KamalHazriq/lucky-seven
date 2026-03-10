import seedrandom from 'seedrandom'
import type { Card, Suit, Rank, DeckSize } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** Ranks that carry a power effect — important for balanced 1.5-deck selection */
const POWER_RANKS: Set<Rank> = new Set(['10', 'J', 'Q', 'K'])

/**
 * Build a single standard deck of 52 cards (no jokers) with a deckIndex prefix
 * for globally unique IDs.
 */
function buildSingleDeck(deckIndex: number): Card[] {
  const prefix = deckIndex === 0 ? '' : `d${deckIndex}_`
  const cards: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${prefix}${rank}_${suit}`, suit, rank })
    }
  }
  return cards
}

/**
 * Fisher–Yates shuffle (in-place) using a seeded RNG.
 * Returns the same array reference for chaining convenience.
 */
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Select `count` cards from `pool` with balanced rank distribution.
 *
 * Strategy (deterministic via seeded RNG):
 * 1. Group the pool by rank (13 ranks).
 * 2. Calculate a base quota per rank = floor(count / 13).
 *    Remainder = count mod 13 → extra slots distributed to ranks chosen by RNG.
 * 3. For each rank, deterministically pick cards from that rank's bucket
 *    (shuffle bucket, take quota).
 * 4. Ensures rank counts differ by at most 1 across all 13 ranks.
 */
function balancedSelect(pool: Card[], count: number, rng: () => number): Card[] {
  // Group by rank
  const byRank = new Map<Rank, Card[]>()
  for (const rank of RANKS) byRank.set(rank, [])
  for (const card of pool) {
    byRank.get(card.rank)!.push(card)
  }

  const base = Math.floor(count / RANKS.length)
  const remainder = count % RANKS.length

  // Decide which ranks get +1 card: shuffle rank indices, take first `remainder`
  const rankOrder = RANKS.map((r, i) => ({ rank: r, i }))
  seededShuffle(rankOrder, rng)
  const bonusRanks = new Set(rankOrder.slice(0, remainder).map((r) => r.rank))

  const selected: Card[] = []
  for (const rank of RANKS) {
    const quota = base + (bonusRanks.has(rank) ? 1 : 0)
    const bucket = byRank.get(rank)!
    // Shuffle the bucket deterministically so which suits are picked varies by seed
    seededShuffle(bucket, rng)
    // Take up to quota (bucket may have fewer cards than quota in edge cases)
    selected.push(...bucket.slice(0, quota))
  }

  return selected
}

/**
 * Build a deck supporting multiplier sizes:
 *
 * - **1 deck**   = 52 cards + jokers
 * - **1.5 decks** = 1 full deck (52) + 27 balanced cards from a 2nd deck + scaled jokers
 * - **2 decks**  = 2 full decks (104) with unique IDs + scaled jokers
 *
 * ### 1.5-deck selection algorithm
 * Generates a full 2nd deck (52 cards), then selects exactly 27 cards such that
 * every rank has either 2 or 3 representatives (27 = 13 ranks × 2 + 1 remainder).
 * The selection is seeded and deterministic — same seed always produces same half-deck.
 * Power ranks (10/J/Q/K) participate in the same balanced distribution.
 *
 * ### Joker scaling
 * - 1 deck:   `jokerCount` jokers
 * - 1.5 decks: `round(jokerCount × 1.5)` jokers
 * - 2 decks:  `jokerCount × 2` jokers
 *
 * Each joker has a globally unique ID (`Joker_1`, `Joker_2`, etc.).
 */
export function buildDeck(jokerCount: number = 2, deckSize: DeckSize = 1, seed?: string): Card[] {
  const cards: Card[] = []
  const clamped = Math.max(1, Math.min(4, jokerCount))

  if (deckSize === 1) {
    // ─── Standard single deck ─────────────────────────────────
    cards.push(...buildSingleDeck(0))
  } else if (deckSize === 2) {
    // ─── Double deck ──────────────────────────────────────────
    cards.push(...buildSingleDeck(0))
    cards.push(...buildSingleDeck(1))
  } else {
    // ─── 1.5 decks ────────────────────────────────────────────
    // Full first deck
    cards.push(...buildSingleDeck(0))

    // Balanced 27-card selection from 2nd deck
    const secondDeck = buildSingleDeck(1)
    const rng = seedrandom(seed ?? 'half-deck')
    const halfCards = balancedSelect(secondDeck, 27, rng)
    cards.push(...halfCards)
  }

  // ─── Jokers (unique IDs, scaled by deck size) ──────────────
  const jokerTotal = deckSize === 2 ? clamped * 2
    : deckSize === 1.5 ? Math.round(clamped * 1.5)
    : clamped
  for (let i = 1; i <= jokerTotal; i++) {
    cards.push({ id: `Joker_${i}`, suit: 'hearts', rank: 'A', isJoker: true })
  }

  return cards
}

export function shuffleDeck(cards: Card[], seed: string): Card[] {
  const rng = seedrandom(seed)
  const shuffled = [...cards]
  return seededShuffle(shuffled, rng)
}

export function cardValue(card: Card): number {
  if (card.isJoker) return 10
  switch (card.rank) {
    case 'A': return 1
    case '7': return 0
    case 'J': case 'Q': case 'K': return 10
    default: return parseInt(card.rank, 10)
  }
}

export function scoreHand(hand: Card[]): { total: number; sevens: number } {
  let total = 0
  let sevens = 0
  for (const card of hand) {
    total += cardValue(card)
    if (card.rank === '7' && !card.isJoker) sevens++
  }
  return { total, sevens }
}

export function cardDisplay(card: Card): string {
  if (card.isJoker) return 'Joker'
  const suitSymbols: Record<Suit, string> = {
    hearts: '\u2665',
    diamonds: '\u2666',
    clubs: '\u2663',
    spades: '\u2660',
  }
  return `${card.rank}${suitSymbols[card.suit]}`
}

export function suitColor(card: Card): string {
  if (card.isJoker) return '#a855f7'
  return card.suit === 'hearts' || card.suit === 'diamonds' ? '#ef4444' : '#1e293b'
}

// Re-export for testing
export { POWER_RANKS, RANKS, SUITS }
