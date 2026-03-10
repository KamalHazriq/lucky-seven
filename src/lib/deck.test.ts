import { describe, it, expect } from 'vitest'
import { buildDeck, shuffleDeck, RANKS } from './deck'
import type { DeckSize } from './types'
import type { Card } from './types'

/* ─── Helpers ──────────────────────────────────────────────── */

/** Count non-joker cards grouped by rank */
function rankDistribution(cards: Card[]): Map<string, number> {
  const dist = new Map<string, number>()
  for (const c of cards) {
    if (c.isJoker) continue
    dist.set(c.rank, (dist.get(c.rank) ?? 0) + 1)
  }
  return dist
}

/** All unique card IDs in the deck */
function uniqueIds(cards: Card[]): Set<string> {
  return new Set(cards.map((c) => c.id))
}

function jokerCount(cards: Card[]): number {
  return cards.filter((c) => c.isJoker).length
}

function nonJokerCount(cards: Card[]): number {
  return cards.filter((c) => !c.isJoker).length
}

/* ─── 1 Deck ───────────────────────────────────────────────── */

describe('buildDeck — 1 deck', () => {
  const deck = buildDeck(2, 1, 'test-seed')

  it('has 52 non-joker cards + 2 jokers = 54 total', () => {
    expect(nonJokerCount(deck)).toBe(52)
    expect(jokerCount(deck)).toBe(2)
    expect(deck.length).toBe(54)
  })

  it('has no duplicate IDs', () => {
    expect(uniqueIds(deck).size).toBe(deck.length)
  })

  it('has 4 of each rank (non-joker)', () => {
    const dist = rankDistribution(deck)
    for (const rank of RANKS) {
      expect(dist.get(rank)).toBe(4)
    }
  })

  it('scales jokers: 1 joker', () => {
    const d = buildDeck(1, 1)
    expect(jokerCount(d)).toBe(1)
  })

  it('scales jokers: 4 jokers', () => {
    const d = buildDeck(4, 1)
    expect(jokerCount(d)).toBe(4)
  })

  it('clamps jokerCount to [1,4]', () => {
    expect(jokerCount(buildDeck(0, 1))).toBe(1)
    expect(jokerCount(buildDeck(10, 1))).toBe(4)
  })
})

/* ─── 2 Decks ──────────────────────────────────────────────── */

describe('buildDeck — 2 decks', () => {
  const deck = buildDeck(2, 2, 'test-seed')

  it('has 104 non-joker cards + 4 jokers = 108 total', () => {
    expect(nonJokerCount(deck)).toBe(104)
    expect(jokerCount(deck)).toBe(4)
    expect(deck.length).toBe(108)
  })

  it('has no duplicate IDs', () => {
    expect(uniqueIds(deck).size).toBe(deck.length)
  })

  it('has 8 of each rank (non-joker)', () => {
    const dist = rankDistribution(deck)
    for (const rank of RANKS) {
      expect(dist.get(rank)).toBe(8)
    }
  })

  it('scales jokers: 3 jokers config → 6 total', () => {
    const d = buildDeck(3, 2)
    expect(jokerCount(d)).toBe(6)
  })
})

/* ─── 1.5 Decks ────────────────────────────────────────────── */

describe('buildDeck — 1.5 decks', () => {
  const deck = buildDeck(2, 1.5, 'test-seed')

  it('has 79 non-joker cards (52 + 27) + 3 jokers = 82 total', () => {
    expect(nonJokerCount(deck)).toBe(79)
    expect(jokerCount(deck)).toBe(3) // round(2 × 1.5) = 3
    expect(deck.length).toBe(82)
  })

  it('has no duplicate IDs', () => {
    expect(uniqueIds(deck).size).toBe(deck.length)
  })

  it('has balanced rank distribution — each rank has 6 or 7 copies', () => {
    // 1 full deck = 4 per rank, half-deck adds 2 or 3 per rank
    // So total per rank = 6 or 7, sum of all = 79 non-joker cards
    const dist = rankDistribution(deck)
    for (const rank of RANKS) {
      const count = dist.get(rank) ?? 0
      expect(count).toBeGreaterThanOrEqual(6)
      expect(count).toBeLessThanOrEqual(7)
    }
  })

  it('half-deck portion contains exactly 27 non-joker cards', () => {
    // Cards from 2nd deck have 'd1_' prefix
    const secondDeckCards = deck.filter((c) => !c.isJoker && c.id.startsWith('d1_'))
    expect(secondDeckCards.length).toBe(27)
  })

  it('half-deck rank distribution: each rank has 2 or 3 cards', () => {
    const secondDeckCards = deck.filter((c) => !c.isJoker && c.id.startsWith('d1_'))
    const dist = rankDistribution(secondDeckCards)
    for (const rank of RANKS) {
      const count = dist.get(rank) ?? 0
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(3)
    }
    // Sum must be 27
    let sum = 0
    for (const count of dist.values()) sum += count
    expect(sum).toBe(27)
  })

  it('includes power ranks (10/J/Q/K) in the half-deck', () => {
    const secondDeckCards = deck.filter((c) => !c.isJoker && c.id.startsWith('d1_'))
    const powerCards = secondDeckCards.filter(
      (c) => c.rank === '10' || c.rank === 'J' || c.rank === 'Q' || c.rank === 'K',
    )
    // 4 power ranks × (2 or 3) = at least 8 power cards
    expect(powerCards.length).toBeGreaterThanOrEqual(8)
    expect(powerCards.length).toBeLessThanOrEqual(12)
  })

  it('joker scaling: 1 joker config → 2 total for 1.5x', () => {
    const d = buildDeck(1, 1.5)
    expect(jokerCount(d)).toBe(2) // round(1 × 1.5) = 2
  })

  it('joker scaling: 4 joker config → 6 total for 1.5x', () => {
    const d = buildDeck(4, 1.5)
    expect(jokerCount(d)).toBe(6) // round(4 × 1.5) = 6
  })
})

/* ─── Determinism ──────────────────────────────────────────── */

describe('determinism — same seed produces identical decks', () => {
  const sizes: DeckSize[] = [1, 1.5, 2]
  for (const size of sizes) {
    it(`deckSize=${size}: identical with same seed`, () => {
      const a = buildDeck(2, size, 'my-game-seed-42')
      const b = buildDeck(2, size, 'my-game-seed-42')
      expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    })

    it(`deckSize=${size}: different with different seed`, () => {
      if (size === 1 || size === 2) {
        // For 1 and 2, buildDeck is deterministic regardless of seed (only shuffleDeck uses seed)
        // So this test only applies to shuffled decks
        const a = shuffleDeck(buildDeck(2, size, 'seed-A'), 'seed-A')
        const b = shuffleDeck(buildDeck(2, size, 'seed-B'), 'seed-B')
        expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id))
      } else {
        // 1.5 deck: selection itself is seeded
        const a = buildDeck(2, size, 'seed-A')
        const b = buildDeck(2, size, 'seed-B')
        expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id))
      }
    })
  }
})

/* ─── shuffleDeck determinism ─────────────────────────────── */

describe('shuffleDeck', () => {
  it('same seed produces same order', () => {
    const deck = buildDeck(2, 1)
    const a = shuffleDeck(deck, 'shuffle-seed')
    const b = shuffleDeck(deck, 'shuffle-seed')
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
  })

  it('different seed produces different order', () => {
    const deck = buildDeck(2, 1)
    const a = shuffleDeck(deck, 'seed-X')
    const b = shuffleDeck(deck, 'seed-Y')
    expect(a.map((c) => c.id)).not.toEqual(b.map((c) => c.id))
  })

  it('does not mutate the original array', () => {
    const deck = buildDeck(2, 1)
    const original = deck.map((c) => c.id)
    shuffleDeck(deck, 'any-seed')
    expect(deck.map((c) => c.id)).toEqual(original)
  })
})

/* ─── Expected deck lengths per config ────────────────────── */

describe('deck total lengths (comprehensive)', () => {
  const cases: { size: DeckSize; jokers: number; expectedTotal: number }[] = [
    // 1 deck
    { size: 1, jokers: 1, expectedTotal: 53 },
    { size: 1, jokers: 2, expectedTotal: 54 },
    { size: 1, jokers: 3, expectedTotal: 55 },
    { size: 1, jokers: 4, expectedTotal: 56 },
    // 1.5 decks (52 + 27 + jokers)
    { size: 1.5, jokers: 1, expectedTotal: 79 + 2 },  // round(1*1.5)=2
    { size: 1.5, jokers: 2, expectedTotal: 79 + 3 },  // round(2*1.5)=3
    { size: 1.5, jokers: 3, expectedTotal: 79 + 5 },  // round(3*1.5)=5 → actually 4.5→5
    { size: 1.5, jokers: 4, expectedTotal: 79 + 6 },  // round(4*1.5)=6
    // 2 decks (104 + jokers*2)
    { size: 2, jokers: 1, expectedTotal: 106 },
    { size: 2, jokers: 2, expectedTotal: 108 },
    { size: 2, jokers: 3, expectedTotal: 110 },
    { size: 2, jokers: 4, expectedTotal: 112 },
  ]

  for (const { size, jokers, expectedTotal } of cases) {
    it(`deckSize=${size}, jokers=${jokers} → ${expectedTotal} cards`, () => {
      const deck = buildDeck(jokers, size, 'test')
      expect(deck.length).toBe(expectedTotal)
    })
  }
})
