import seedrandom from 'seedrandom'
import type { Card, Suit, Rank } from './types'

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/**
 * Build a deck with 52 standard cards + `jokerCount` jokers (1-4).
 * Default is 2 jokers to match the original deck.
 */
export function buildDeck(jokerCount: number = 2): Card[] {
  const cards: Card[] = []

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}_${suit}`, suit, rank })
    }
  }

  // Add jokers with unique IDs
  const clampedCount = Math.max(1, Math.min(4, jokerCount))
  for (let i = 1; i <= clampedCount; i++) {
    cards.push({ id: `Joker_${i}`, suit: 'hearts', rank: 'A', isJoker: true })
  }

  return cards
}

export function shuffleDeck(cards: Card[], seed: string): Card[] {
  const rng = seedrandom(seed)
  const shuffled = [...cards]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
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
